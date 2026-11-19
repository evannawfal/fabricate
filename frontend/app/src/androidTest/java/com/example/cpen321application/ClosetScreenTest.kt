package com.example.cpen321application

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTouchInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.cpen321application.fakes.FakeClothingRepository
import com.example.cpen321application.model.ClothingCategory
import com.example.cpen321application.model.ClothingItem
import com.example.cpen321application.screens.ClosetScreen
import com.example.cpen321application.viewmodel.ClosetViewModel
import kotlinx.coroutines.CompletableDeferred
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ClosetScreenTest {
    @get:Rule
    val composeRule = createComposeRule()

    private val items = listOf(
        ClothingItem("1", "Grey Hoodie", ClothingCategory.Top, "grey", "casual", listOf("comfy")),
        ClothingItem("2", "Black Jeans", ClothingCategory.Bottom, "black", "casual", listOf("denim")),
        ClothingItem("3", "White Sneakers", ClothingCategory.Shoes, "white", "casual"),
    )

    private val washBinBadges get() = composeRule.onAllNodesWithContentDescription("In the wash bin")

    private fun FakeClothingRepository.isClean(id: String) = items.first { it.id == id }.isClean

    private fun showCloset(closet: List<ClothingItem> = items): FakeClothingRepository {
        val repository = FakeClothingRepository(closet)
        val viewModel = ClosetViewModel(repository)
        composeRule.setContent { ClosetScreen(viewModel) }
        return repository
    }

    @Test
    fun rendersItemsFromList() {
        showCloset()

        items.forEach { composeRule.onNodeWithText(it.name).assertIsDisplayed() }
    }

    @Test
    fun categoryFilterShowsOnlyThatCategory() {
        showCloset()

        composeRule.onNodeWithText("Bottoms").performClick()
        composeRule.onNodeWithText("Black Jeans").assertIsDisplayed()
        composeRule.onNodeWithText("Grey Hoodie").assertDoesNotExist()

        composeRule.onNodeWithText("Dresses").performClick()
        composeRule.onNodeWithText("No dresses yet").assertIsDisplayed()

        composeRule.onNodeWithText("All").performClick()
        composeRule.onNodeWithText("Grey Hoodie").assertIsDisplayed()
    }

    @Test
    fun tappingItemOpensDetailsAndBackReturns() {
        showCloset()

        composeRule.onNodeWithText("Grey Hoodie").performClick()
        composeRule.onNodeWithText("Tops").assertIsDisplayed()
        composeRule.onNodeWithText("comfy").assertIsDisplayed()
        composeRule.onNodeWithText("Delete item").performScrollTo().assertIsDisplayed()

        composeRule.onNodeWithContentDescription("Back").performScrollTo().performClick()
        composeRule.onNodeWithText("My Closet").assertIsDisplayed()
    }

    @Test
    fun deletingItemRemovesItFromCloset() {
        showCloset()

        composeRule.onNodeWithText("White Sneakers").performClick()
        composeRule.onNodeWithText("Delete item").performClick()
        composeRule.onNodeWithText("Delete").performClick()

        composeRule.onNodeWithText("My Closet").assertIsDisplayed()
        composeRule.onNodeWithText("White Sneakers").assertDoesNotExist()
    }

    @Test
    fun itemDetails_createAThreeDModel() {
        val repository = showCloset()
        val gate = CompletableDeferred<Unit>().also { repository.modelGate = it }

        composeRule.onNodeWithText("Grey Hoodie").performClick()
        composeRule.onNodeWithText("Create 3D model").performScrollTo().performClick()
        composeRule.onNodeWithText("Creating 3D model…").assertIsNotEnabled()
        gate.complete(Unit)

        composeRule.onNodeWithText("Recreate 3D model").performScrollTo().assertIsEnabled()
        assertEquals(listOf("1"), repository.generatedModels)
    }

    @Test
    fun itemDetails_showWhyAModelCouldNotBeCreated() {
        val repository = showCloset()
        repository.modelError = "3D models aren't available right now. Try again later."

        composeRule.onNodeWithText("Black Jeans").performClick()
        composeRule.onNodeWithText("Create 3D model").performScrollTo().performClick()

        composeRule.onNodeWithText("3D models aren't available right now. Try again later.").performScrollTo().assertIsDisplayed()
        composeRule.onNodeWithText("Create 3D model").assertIsEnabled()
    }

    @Test
    fun itemDetails_offerNoModelForUnsupportedCategories() {
        showCloset()

        composeRule.onNodeWithText("White Sneakers").performClick()

        composeRule.onNodeWithText("Delete item").assertIsDisplayed()
        composeRule.onNodeWithText("Create 3D model").assertDoesNotExist()
    }

    @Test
    fun emptyClosetShowsEmptyState() {
        showCloset(emptyList())

        composeRule.onNodeWithText("Your closet is empty").assertIsDisplayed()
    }

    @Test
    fun onlyItemsInTheWashBinShowABadge() {
        showCloset(listOf(items[0].copy(isClean = false), items[1], items[2]))

        washBinBadges.assertCountEquals(1)
    }

    @Test
    fun washBinFilterShowsOnlyItemsInTheWashBin() {
        showCloset(listOf(items[0].copy(isClean = false), items[1], items[2]))

        composeRule.onNodeWithText("Wash bin (1)").performClick()
        composeRule.onNodeWithText("Grey Hoodie").assertIsDisplayed()
        composeRule.onNodeWithText("Black Jeans").assertDoesNotExist()

        composeRule.onNodeWithText("Bottoms").performClick()
        composeRule.onNodeWithText("No bottoms in the wash bin").assertIsDisplayed()

        composeRule.onNodeWithText("Wash bin (1)").performClick()
        composeRule.onNodeWithText("Black Jeans").assertIsDisplayed()
    }

    @Test
    fun emptyWashBinShowsEmptyState() {
        showCloset()

        composeRule.onNodeWithText("Wash bin").performClick()

        composeRule.onNodeWithText("Your wash bin is empty").assertIsDisplayed()
    }

    @Test
    fun itemDetails_moveTheItemToTheWashBinAndBack() {
        val repository = showCloset()
        val gate = CompletableDeferred<Unit>().also { repository.cleanGate = it }

        composeRule.onNodeWithText("Grey Hoodie").performClick()
        composeRule.onNodeWithText("Move to wash bin").performScrollTo().performClick()
        composeRule.onNodeWithText("Move to wash bin").assertIsNotEnabled()
        gate.complete(Unit)

        composeRule.onNodeWithText("In the wash bin").performScrollTo().assertIsDisplayed()
        composeRule.onNodeWithText("Left out of generated outfits until it's clean.").assertExists()
        assertFalse(repository.isClean("1"))

        composeRule.onNodeWithText("Mark clean").performScrollTo().performClick()
        composeRule.onNodeWithText("Clean").performScrollTo().assertIsDisplayed()
        assertTrue(repository.isClean("1"))

        composeRule.onNodeWithContentDescription("Back").performClick()
        washBinBadges.assertCountEquals(0)
    }

    @Test
    fun selectingSeveralItems_movesThemToTheWashBin() {
        val repository = showCloset()

        composeRule.onNodeWithText("Select").performClick()
        composeRule.onNodeWithText("Grey Hoodie").performClick()
        composeRule.onNodeWithText("Black Jeans").performClick()
        composeRule.onNodeWithText("2 selected").assertIsDisplayed()
        composeRule.onNodeWithText("Mark clean").assertIsNotEnabled()
        composeRule.onNodeWithText("Move to wash bin").performClick()

        composeRule.onNodeWithText("Add clothing").assertIsDisplayed()
        washBinBadges.assertCountEquals(2)
        assertFalse(repository.isClean("1"))
        assertFalse(repository.isClean("2"))
        assertTrue(repository.isClean("3"))
    }

    @Test
    fun longPressingAnItem_startsSelectingWithIt() {
        showCloset()

        composeRule.onNodeWithText("Black Jeans").performTouchInput { longClick() }

        composeRule.onNodeWithText("1 selected").assertIsDisplayed()
        composeRule.onNodeWithText("Black Jeans").assertIsSelected()
        composeRule.onNodeWithText("Grey Hoodie").assertIsNotSelected()

        composeRule.onNodeWithContentDescription("Stop selecting").performClick()
        composeRule.onNodeWithText("Add clothing").assertIsDisplayed()
    }

    @Test
    fun emptyingTheWashBin_withSelectAll() {
        val repository = showCloset(items.map { it.copy(isClean = false) })

        composeRule.onNodeWithText("Wash bin (3)").performClick()
        composeRule.onNodeWithText("Select").performClick()
        composeRule.onNodeWithText("Select all").performClick()
        composeRule.onNodeWithText("3 selected").assertIsDisplayed()
        composeRule.onNodeWithText("Move to wash bin").assertIsNotEnabled()
        composeRule.onNodeWithText("Mark clean").performClick()

        composeRule.onNodeWithText("Your wash bin is empty").assertIsDisplayed()
        assertTrue(repository.items.all { it.isClean })
    }

    @Test
    fun itemsThatFailToMove_stayInTheSelection() {
        val repository = showCloset()
        repository.cleanErrors["2"] = "Couldn't reach the server. Check your connection and try again."

        composeRule.onNodeWithText("Select").performClick()
        composeRule.onNodeWithText("Grey Hoodie").performClick()
        composeRule.onNodeWithText("Black Jeans").performClick()
        composeRule.onNodeWithText("Move to wash bin").performClick()

        composeRule.onNodeWithText("Couldn't move 1 item to the wash bin").assertIsDisplayed()
        composeRule.onNodeWithText("OK").performClick()
        composeRule.onNodeWithText("1 selected").assertIsDisplayed()
        composeRule.onNodeWithText("Black Jeans").assertIsSelected()
        washBinBadges.assertCountEquals(1)
        assertFalse(repository.isClean("1"))
        assertTrue(repository.isClean("2"))
    }
}
