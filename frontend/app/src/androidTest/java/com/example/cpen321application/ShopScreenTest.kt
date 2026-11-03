package com.example.cpen321application

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.UriHandler
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.espresso.Espresso.pressBack
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.cpen321application.data.ClothingRepositoryException
import com.example.cpen321application.fakes.FakeRecommendationRepository
import com.example.cpen321application.model.ClothingCategory
import com.example.cpen321application.model.ClothingItem
import com.example.cpen321application.model.Recommendations
import com.example.cpen321application.model.ShopDepartment
import com.example.cpen321application.model.StoreItem
import com.example.cpen321application.screens.PAIRED_ITEM_TAG
import com.example.cpen321application.screens.SHOP_LOADING_TAG
import com.example.cpen321application.screens.STORE_ITEM_CARD_TAG
import com.example.cpen321application.screens.ShopScreen
import com.example.cpen321application.screens.VIEW_IN_STORE_TAG
import com.example.cpen321application.viewmodel.ShopViewModel
import kotlinx.coroutines.CompletableDeferred
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ShopScreenTest {
    @get:Rule
    val composeRule = createComposeRule()

    private val hoodie = ClothingItem("1", "Grey Hoodie", ClothingCategory.Top, "grey", "casual")
    private val jeans = ClothingItem("2", "Black Jeans", ClothingCategory.Bottom, "black", "casual")
    private val boots = StoreItem(
        name = "Leather Boots",
        price = "$120.00",
        imageUrl = "https://images.example/boots.webp",
        link = "https://stores.example/boots",
        store = "Boot Shop",
        reason = "No shoes in your closet",
        pairsWith = listOf(hoodie, jeans),
    )
    private val openedLinks = mutableListOf<String>()
    private val repository = FakeRecommendationRepository(Recommendations(listOf(boots.reason), listOf(boots)))
    private var closet by mutableStateOf(listOf(hoodie, jeans))

    private fun showShop() {
        val viewModel = ShopViewModel(repository, country = "ca")
        val uriHandler = object : UriHandler {
            override fun openUri(uri: String) {
                openedLinks += uri
            }
        }
        composeRule.setContent {
            CompositionLocalProvider(LocalUriHandler provides uriHandler) {
                ShopScreen(viewModel, closet)
            }
        }
    }

    @Test
    fun showsALoadingIndicatorThenRecommendedItems() {
        val gate = CompletableDeferred<Unit>()
        repository.gate = gate
        showShop()

        composeRule.onNodeWithTag(SHOP_LOADING_TAG).assertIsDisplayed()

        gate.complete(Unit)
        composeRule.onNodeWithText("Leather Boots").assertIsDisplayed()
        composeRule.onNodeWithText("$120.00").assertIsDisplayed()
        composeRule.onNodeWithText("No shoes in your closet").assertIsDisplayed()
        composeRule.onNodeWithTag(SHOP_LOADING_TAG).assertDoesNotExist()
    }

    @Test
    fun tappingAnItemShowsWhatItPairsWithAndLinksToTheStore() {
        showShop()

        composeRule.onNodeWithTag(STORE_ITEM_CARD_TAG).performClick()

        composeRule.onNodeWithText("Boot Shop").assertIsDisplayed()
        composeRule.onNodeWithText("Grey Hoodie").performScrollTo().assertIsDisplayed()
        composeRule.onNodeWithText("Black Jeans").performScrollTo().assertIsDisplayed()
        composeRule.onAllNodesWithTag(PAIRED_ITEM_TAG).assertCountEquals(2)

        composeRule.onNodeWithTag(VIEW_IN_STORE_TAG).performScrollTo().performClick()
        assertEquals(listOf(boots.link), openedLinks)
    }

    @Test
    fun backButtonReturnsToTheListWithoutReloading() {
        showShop()

        composeRule.onNodeWithTag(STORE_ITEM_CARD_TAG).performClick()
        composeRule.onNodeWithContentDescription("Back").performClick()

        composeRule.onNodeWithText("Recommended for you").assertIsDisplayed()
        assertEquals(1, repository.requests.size)
    }

    @Test
    fun systemBackReturnsToTheList() {
        showShop()

        composeRule.onNodeWithTag(STORE_ITEM_CARD_TAG).performClick()
        pressBack()

        composeRule.onNodeWithText("Recommended for you").assertIsDisplayed()
    }

    @Test
    fun missingBasicsPromptsTheUserToAddThemWithoutARetry() {
        val message = "Add at least one top and one bottom to your closet to get recommendations"
        repository.error = ClothingRepositoryException(message)
        showShop()

        composeRule.onNodeWithText(message).assertIsDisplayed()
        composeRule.onNodeWithText("Try again").assertDoesNotExist()
    }

    @Test
    fun noMatchingItemsShowsTheGaps() {
        repository.result = Recommendations(listOf("No shoes in your closet"), emptyList())
        showShop()

        composeRule.onNodeWithText("No matching items are available right now").assertIsDisplayed()
        composeRule.onNodeWithText("No shoes in your closet").assertIsDisplayed()
    }

    @Test
    fun noGapsSaysTheClosetIsCovered() {
        repository.result = Recommendations(emptyList(), emptyList())
        showShop()

        composeRule.onNodeWithText("Your closet has you covered").assertIsDisplayed()
    }

    @Test
    fun failureOffersARetryThatLoadsTheItems() {
        repository.error = ClothingRepositoryException("Couldn't reach the server.", canRetry = true)
        showShop()

        composeRule.onNodeWithText("Couldn't load recommendations").assertIsDisplayed()
        composeRule.onNodeWithText("Couldn't reach the server.").assertIsDisplayed()

        repository.error = null
        composeRule.onNodeWithText("Try again").performClick()

        composeRule.onNodeWithText("Leather Boots").assertIsDisplayed()
    }

    @Test
    fun searchesAllDepartmentsInTheDeviceCountryByDefault() {
        showShop()

        composeRule.onNodeWithText("All").assertIsSelected()
        composeRule.waitForIdle()
        assertEquals(listOf(ShopDepartment.All to "ca"), repository.requests)
    }

    @Test
    fun choosingADepartmentSearchesItOnce() {
        showShop()

        composeRule.onNodeWithText("Men's").performClick()
        composeRule.onNodeWithText("Men's").performClick()
        composeRule.onNodeWithText("Men's").assertIsSelected()

        composeRule.waitForIdle()
        assertEquals(
            listOf(ShopDepartment.All to "ca", ShopDepartment.Mens to "ca"),
            repository.requests,
        )
    }

    @Test
    fun addingClothingRefreshesTheRecommendations() {
        showShop()
        composeRule.waitForIdle()

        closet = closet + ClothingItem("3", "White Sneakers", ClothingCategory.Shoes, "white", "casual")

        composeRule.waitForIdle()
        assertEquals(2, repository.requests.size)
    }

    @Test
    fun editingAnItemsColorRefreshesTheRecommendations() {
        showShop()
        composeRule.waitForIdle()

        closet = closet.map { it.copy(color = "red") }

        composeRule.waitForIdle()
        assertEquals(2, repository.requests.size)
    }

    @Test
    fun washingClothesDoesNotRefreshTheRecommendations() {
        showShop()
        composeRule.waitForIdle()

        closet = closet.map { it.copy(isClean = false) }

        composeRule.waitForIdle()
        assertEquals(1, repository.requests.size)
    }
}
