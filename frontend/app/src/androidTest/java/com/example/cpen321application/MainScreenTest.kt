package com.example.cpen321application

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.isDialog
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.espresso.Espresso.pressBack
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.cpen321application.fakes.FakeClothingRepository
import com.example.cpen321application.screens.MainScreen
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class MainScreenTest {
    @get:Rule
    val composeRule = createComposeRule()

    private var signOutCalls = 0

    private fun showMainScreen() {
        composeRule.setContent {
            MainScreen(clothingRepository = FakeClothingRepository(emptyList()), onSignOut = { signOutCalls++ })
        }
    }

    @Test
    fun opensOnTheClosetTab() {
        showMainScreen()

        composeRule.onNodeWithText("My Closet").assertIsDisplayed()
    }

    @Test
    fun switchesToAvatarAndBackReturnsToCloset() {
        showMainScreen()

        composeRule.onNodeWithText("Avatar").performClick()
        // A fresh test install has no saved avatar yet.
        composeRule.onNodeWithText("Update avatar").assertIsDisplayed()

        pressBack()
        composeRule.onNodeWithText("My Closet").assertIsDisplayed()
    }

    @Test
    fun cancellingSignOutStaysSignedIn() {
        showMainScreen()

        composeRule.onNodeWithText("Sign out").performClick()
        composeRule.onNodeWithText("Sign out?").assertIsDisplayed()
        composeRule.onNodeWithText("Cancel").performClick()

        composeRule.onNodeWithText("Sign out?").assertDoesNotExist()
        composeRule.onNodeWithText("My Closet").assertIsDisplayed()
        assertEquals(0, signOutCalls)
    }

    @Test
    fun confirmingSignOutSignsOut() {
        showMainScreen()

        composeRule.onNodeWithText("Sign out").performClick()
        composeRule.onNode(hasText("Sign out") and hasAnyAncestor(isDialog())).performClick()

        composeRule.onNodeWithText("Sign out?").assertDoesNotExist()
        assertEquals(1, signOutCalls)
    }
}
