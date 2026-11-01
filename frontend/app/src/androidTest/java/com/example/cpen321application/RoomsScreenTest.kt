package com.example.cpen321application

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.test.espresso.Espresso.pressBack
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.cpen321application.data.Friend
import com.example.cpen321application.data.Room
import com.example.cpen321application.data.RoomMember
import com.example.cpen321application.fakes.FakeClothingRepository
import com.example.cpen321application.fakes.FakeRoomsRepository
import com.example.cpen321application.screens.CREATE_ROOM_TAG
import com.example.cpen321application.screens.FRIEND_CHECKBOX_TAG
import com.example.cpen321application.screens.FRIEND_EMAIL_FIELD_TAG
import com.example.cpen321application.screens.ROOM_NAME_FIELD_TAG
import com.example.cpen321application.screens.RoomsRoute
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class RoomsScreenTest {
    @get:Rule
    val composeRule = createComposeRule()

    private fun showRooms(repository: FakeRoomsRepository) {
        composeRule.setContent { RoomsRoute(repository, FakeClothingRepository(emptyList())) }
    }

    @Test
    fun withoutFriendsAsksToAddOneFirst() {
        showRooms(FakeRoomsRepository())

        composeRule.onNodeWithTag(CREATE_ROOM_TAG).performClick()
        composeRule.onNodeWithText("Add a friend by email first", substring = true).assertIsDisplayed()
        composeRule.onNodeWithText("Create").assertIsNotEnabled()

        composeRule.onNodeWithTag(FRIEND_EMAIL_FIELD_TAG).performTextInput("sam@example.com")
        composeRule.onNodeWithText("Add").performClick()

        composeRule.onNodeWithTag(FRIEND_CHECKBOX_TAG).assertIsDisplayed()
    }

    @Test
    fun createsARoomAndOpensIt() {
        showRooms(FakeRoomsRepository(friends = listOf(Friend("f1", "Sam", "sam@example.com"))))

        composeRule.onNodeWithTag(CREATE_ROOM_TAG).performClick()
        composeRule.onNodeWithTag(ROOM_NAME_FIELD_TAG).performTextInput("Party fits")
        composeRule.onNodeWithTag(FRIEND_CHECKBOX_TAG).performClick()
        composeRule.onNodeWithText("Create").assertIsEnabled().performClick()

        composeRule.onNodeWithText("Party fits").assertIsDisplayed()
        composeRule.onNodeWithText("Shared outfit").assertIsDisplayed()
    }

    @Test
    fun opensARoomFromTheListAndBackReturns() {
        val room = Room("r1", "Brunch", listOf(RoomMember("me", "Me"), RoomMember("f1", "Sam")))
        showRooms(FakeRoomsRepository(rooms = listOf(room)))

        composeRule.onNodeWithText("Me, Sam").assertIsDisplayed()
        composeRule.onNodeWithText("Brunch").performClick()
        composeRule.onNodeWithText("Shared outfit").assertIsDisplayed()

        pressBack()
        composeRule.onNodeWithText("Me, Sam").assertIsDisplayed()
    }
}
