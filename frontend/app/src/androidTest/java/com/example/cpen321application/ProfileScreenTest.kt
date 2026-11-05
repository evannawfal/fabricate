package com.example.cpen321application

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.cpen321application.fakes.FakeProfileRepository
import com.example.cpen321application.screens.PRONOUNS_FIELD_TAG
import com.example.cpen321application.screens.ProfileScreen
import com.example.cpen321application.screens.SAVE_PROFILE_TAG
import com.example.cpen321application.viewmodel.ProfileViewModel
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ProfileScreenTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun showsTheProfileAndSavesPronouns() {
        val repository = FakeProfileRepository()
        composeRule.setContent { ProfileScreen(ProfileViewModel(repository)) }

        composeRule.onNodeWithText("Sam Lee").assertIsDisplayed()
        composeRule.onNodeWithText("sam@example.com").assertIsDisplayed()
        composeRule.onNodeWithTag(SAVE_PROFILE_TAG).assertIsNotEnabled()

        composeRule.onNodeWithTag(PRONOUNS_FIELD_TAG).performTextInput("they/them")
        composeRule.onNodeWithTag(SAVE_PROFILE_TAG).performClick()

        composeRule.onNodeWithText("Saved.").assertIsDisplayed()
        assertEquals("they/them", repository.profile.pronouns)
    }
}
