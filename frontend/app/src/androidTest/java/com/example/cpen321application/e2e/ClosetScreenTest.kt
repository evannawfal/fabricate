package com.example.cpen321application.e2e

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.cpen321application.fakes.FakeClothingRepository
import com.example.cpen321application.model.ClothingCategory
import com.example.cpen321application.model.ClothingItem
import com.example.cpen321application.screens.ClosetScreen
import com.example.cpen321application.viewmodel.ClosetViewModel
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

    private fun showCloset(closet: List<ClothingItem> = items) {
        val viewModel = ClosetViewModel(FakeClothingRepository(closet))
        composeRule.setContent { ClosetScreen(viewModel) }
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
        composeRule.onNodeWithText("Delete item").assertIsDisplayed()

        composeRule.onNodeWithContentDescription("Back").performClick()
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
    fun emptyClosetShowsEmptyState() {
        showCloset(emptyList())

        composeRule.onNodeWithText("Your closet is empty").assertIsDisplayed()
    }
}
