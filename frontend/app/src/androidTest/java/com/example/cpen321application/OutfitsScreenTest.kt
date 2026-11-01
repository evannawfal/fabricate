package com.example.cpen321application

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextReplacement
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.cpen321application.fakes.FakeOutfitRepository
import com.example.cpen321application.model.ClothingCategory
import com.example.cpen321application.model.ClothingItem
import com.example.cpen321application.model.Outfit
import com.example.cpen321application.screens.OUTFIT_NAME_FIELD_TAG
import com.example.cpen321application.screens.OutfitsScreen
import com.example.cpen321application.screens.SAVE_OUTFIT_BUTTON_TAG
import com.example.cpen321application.viewmodel.OutfitsViewModel
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class OutfitsScreenTest {
    @get:Rule
    val composeRule = createComposeRule()

    private val hoodie = ClothingItem("1", "Grey Hoodie", ClothingCategory.Top, "grey", "casual")
    private val jeans = ClothingItem("2", "Black Jeans", ClothingCategory.Bottom, "black", "casual")
    private val sneakers = ClothingItem("3", "White Sneakers", ClothingCategory.Shoes, "white", "casual")
    private val closet = listOf(hoodie, jeans, sneakers)

    private fun showOutfits(outfits: List<Outfit> = emptyList()): FakeOutfitRepository {
        val repository = FakeOutfitRepository(outfits, closet)
        val viewModel = OutfitsViewModel(repository)
        composeRule.setContent { OutfitsScreen(viewModel, closet) }
        return repository
    }

    @Test
    fun showsSavedOutfits() {
        showOutfits(listOf(Outfit("o1", "Weekend", listOf(hoodie, jeans))))

        composeRule.onNodeWithText("Weekend").assertIsDisplayed()
    }

    @Test
    fun showsEmptyStateWithoutOutfits() {
        showOutfits()

        composeRule.onNodeWithText("No outfits yet").assertIsDisplayed()
    }

    @Test
    fun createsOutfitFromClosetItems() {
        val repository = showOutfits()

        composeRule.onNodeWithText("Create outfit").performClick()
        composeRule.onNodeWithTag(SAVE_OUTFIT_BUTTON_TAG).assertIsNotEnabled()
        composeRule.onNodeWithTag(OUTFIT_NAME_FIELD_TAG).performTextReplacement("Weekend")
        composeRule.onNodeWithText("Black Jeans").performClick()
        composeRule.onNodeWithText("Grey Hoodie").performClick()
        composeRule.onNodeWithText("Grey Hoodie").assertIsSelected()
        composeRule.onNodeWithTag(SAVE_OUTFIT_BUTTON_TAG).assertIsEnabled().performClick()

        composeRule.onNodeWithText("My Outfits").assertIsDisplayed()
        composeRule.onNodeWithText("Weekend").assertIsDisplayed()
        // Saved in category order, whatever order they were picked in.
        assertEquals(listOf("1", "2"), repository.outfits.single().items.map { it.id })
    }

    @Test
    fun renamesAndChangesOutfit() {
        val repository = showOutfits(listOf(Outfit("o1", "Weekend", listOf(hoodie, jeans))))

        composeRule.onNodeWithText("Weekend").performClick()
        composeRule.onNodeWithText("Black Jeans").assertIsSelected().performClick()
        composeRule.onNodeWithText("Black Jeans").assertIsNotSelected()
        composeRule.onNodeWithText("White Sneakers").performClick()
        composeRule.onNodeWithTag(OUTFIT_NAME_FIELD_TAG).performTextReplacement("Gym")
        composeRule.onNodeWithText("Save changes").performClick()

        composeRule.onNodeWithText("Gym").assertIsDisplayed()
        composeRule.onNodeWithText("Weekend").assertDoesNotExist()
        assertEquals(listOf("1", "3"), repository.outfits.single().items.map { it.id })
    }

    @Test
    fun deletesOutfitAfterConfirming() {
        val repository = showOutfits(listOf(Outfit("o1", "Weekend", listOf(hoodie))))

        composeRule.onNodeWithText("Weekend").performClick()
        composeRule.onNodeWithText("Delete outfit").performClick()
        composeRule.onNodeWithText("Delete this outfit?").assertIsDisplayed()
        composeRule.onNodeWithText("Delete").performClick()

        composeRule.onNodeWithText("No outfits yet").assertIsDisplayed()
        assertEquals(0, repository.outfits.size)
    }

    @Test
    fun failedSaveKeepsTheEditorOpenWithTheReason() {
        val repository = showOutfits()
        repository.saveError = "Couldn't reach the server."

        composeRule.onNodeWithText("Create outfit").performClick()
        composeRule.onNodeWithTag(OUTFIT_NAME_FIELD_TAG).performTextReplacement("Weekend")
        composeRule.onNodeWithText("Grey Hoodie").performClick()
        composeRule.onNodeWithTag(SAVE_OUTFIT_BUTTON_TAG).performClick()

        composeRule.onNodeWithText("Couldn't reach the server.").assertIsDisplayed()
        composeRule.onNodeWithText("New outfit").assertIsDisplayed()
    }

    @Test
    fun backLeavesTheEditorWithoutSaving() {
        val repository = showOutfits()

        composeRule.onNodeWithText("Create outfit").performClick()
        composeRule.onNodeWithText("Grey Hoodie").performClick()
        composeRule.onNodeWithContentDescription("Back").performClick()

        composeRule.onNodeWithText("No outfits yet").assertIsDisplayed()
        assertEquals(0, repository.outfits.size)
    }
}
