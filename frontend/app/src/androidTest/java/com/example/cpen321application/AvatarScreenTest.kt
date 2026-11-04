package com.example.cpen321application

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.cpen321application.model.AvatarMeasurements
import com.example.cpen321application.model.BodyMeasurement
import com.example.cpen321application.model.ClothingCategory
import com.example.cpen321application.model.ClothingItem
import com.example.cpen321application.screens.AvatarScreen
import com.example.cpen321application.screens.TryOnRow
import com.example.cpen321application.viewmodel.AvatarSaveState
import com.example.cpen321application.viewmodel.AvatarUiState
import com.example.cpen321application.viewmodel.WornGarment
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class AvatarScreenTest {
    @get:Rule
    val composeRule = createComposeRule()

    private var saveCalls = 0

    private fun showAvatarScreen(uiState: AvatarUiState) {
        composeRule.setContent {
            AvatarScreen(uiState = uiState, onMeasurementChange = { _, _ -> }, onSave = { saveCalls++ })
        }
    }

    @Test
    fun withoutAnAvatar_explainsHowToCreateOne() {
        showAvatarScreen(AvatarUiState())

        composeRule.onNodeWithText("Set your measurements and tap Update avatar to create your avatar.")
            .assertIsDisplayed()
    }

    @Test
    fun showsEveryMeasurementWithItsValue() {
        showAvatarScreen(AvatarUiState(measurements = AvatarMeasurements().with(BodyMeasurement.Height, 182)))

        listOf("Height", "Shoulder width", "Chest width", "Waist width", "Hip width").forEach {
            composeRule.onNodeWithText(it).performScrollTo().assertIsDisplayed()
        }
        composeRule.onNodeWithText("182 cm").performScrollTo().assertIsDisplayed()
        BodyMeasurement.entries.forEach {
            composeRule.onNodeWithTag("avatar_slider_${it.apiName}").performScrollTo().assertIsEnabled()
        }
    }

    @Test
    fun updateAvatarSaves() {
        showAvatarScreen(AvatarUiState())

        composeRule.onNodeWithText("Update avatar").performScrollTo().performClick()

        assertEquals(1, saveCalls)
    }

    @Test
    fun whileSaving_showsProgressAndDisablesControls() {
        showAvatarScreen(AvatarUiState(saveState = AvatarSaveState.Saving))

        composeRule.onNodeWithText("Creating your avatar…").assertIsDisplayed()
        composeRule.onNodeWithText("Update avatar").performScrollTo().assertIsNotEnabled()
        composeRule.onNodeWithTag("avatar_slider_height").assertIsNotEnabled()
    }

    private val shirt = ClothingItem("1", "Blue Shirt", ClothingCategory.Top, "blue", "casual", hasModel = true)
    private val jeans = ClothingItem("2", "Black Jeans", ClothingCategory.Bottom, "black", "casual")

    private fun showTryOn(uiState: AvatarUiState): MutableList<ClothingItem> {
        val toggled = mutableListOf<ClothingItem>()
        composeRule.setContent { TryOnRow(uiState) { toggled += it } }
        return toggled
    }

    @Test
    fun tryOn_tappingAnItemTogglesIt() {
        val toggled = showTryOn(
            AvatarUiState(
                wardrobe = listOf(shirt, jeans),
                worn = mapOf(ClothingCategory.Top to WornGarment(shirt.id, File("shirt.glb"))),
            ),
        )

        composeRule.onNodeWithText("Blue Shirt").assertIsSelected()
        composeRule.onNodeWithText("Black Jeans").assertIsNotSelected().performClick()

        assertEquals(listOf(jeans), toggled)
    }

    @Test
    fun tryOn_showsWhileAModelIsBeingCreated() {
        showTryOn(AvatarUiState(wardrobe = listOf(shirt, jeans), tryingOnId = jeans.id))

        composeRule.onNodeWithText("Creating 3D model…").assertIsDisplayed()
        // Only one item is put on at a time.
        composeRule.onNodeWithText("Blue Shirt").assertIsNotEnabled()
    }

    @Test
    fun tryOn_explainsAnEmptyWardrobeAndErrors() {
        showTryOn(AvatarUiState(tryOnError = "Couldn't reach the server. Check your connection and try again."))

        composeRule.onNodeWithText("Add tops, bottoms or outerwear to your closet to try them on.").assertIsDisplayed()
        composeRule.onNodeWithText("Couldn't reach the server. Check your connection and try again.").assertIsDisplayed()
    }

    @Test
    fun showsTheSaveError() {
        showAvatarScreen(AvatarUiState(saveState = AvatarSaveState.Error(R.string.avatar_error_generic)))

        composeRule.onNodeWithText("Couldn't update your avatar. Please try again.").performScrollTo().assertIsDisplayed()
        composeRule.onNodeWithText("Update avatar").performScrollTo().assertIsEnabled()
    }
}
