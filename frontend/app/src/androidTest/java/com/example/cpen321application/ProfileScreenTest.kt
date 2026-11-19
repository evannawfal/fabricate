package com.example.cpen321application

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.cpen321application.data.Friend
import com.example.cpen321application.data.FriendRequest
import com.example.cpen321application.fakes.FakeProfileRepository
import com.example.cpen321application.fakes.FakeRoomsRepository
import com.example.cpen321application.screens.ADD_FRIEND_EMAIL_TAG
import com.example.cpen321application.screens.CONFIRM_REMOVE_FRIEND_TAG
import com.example.cpen321application.screens.FRIENDS_CARD_TAG
import com.example.cpen321application.screens.INCOMING_REQUEST_TAG
import com.example.cpen321application.screens.OUTGOING_REQUEST_TAG
import com.example.cpen321application.screens.PRONOUNS_FIELD_TAG
import com.example.cpen321application.screens.ProfileScreen
import com.example.cpen321application.screens.SAVE_PROFILE_TAG
import com.example.cpen321application.viewmodel.ProfileViewModel
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ProfileScreenTest {
    @get:Rule
    val composeRule = createComposeRule()

    private val alex = Friend("f1", "Alex Kim", "alex@example.com")
    private val jo = Friend("u2", "Jo Park", "jo@example.com")
    private val profiles = FakeProfileRepository()

    private fun showProfile(rooms: FakeRoomsRepository = FakeRoomsRepository(friends = listOf(alex))): FakeRoomsRepository {
        composeRule.setContent { ProfileScreen(ProfileViewModel(profiles, rooms)) }
        return rooms
    }

    private fun openFriends() = composeRule.onNodeWithTag(FRIENDS_CARD_TAG).performClick()

    private fun sendRequestTo(email: String) {
        composeRule.onNodeWithTag(ADD_FRIEND_EMAIL_TAG).performScrollTo().performTextInput(email)
        composeRule.onNodeWithText("Send").performClick()
    }

    @Test
    fun showsTheProfileAndSavesPronouns() {
        showProfile()

        composeRule.onNodeWithText("Sam Lee", substring = true).assertIsDisplayed()
        composeRule.onNodeWithText("sam@example.com", substring = true).assertIsDisplayed()
        composeRule.onNodeWithTag(SAVE_PROFILE_TAG).assertIsNotEnabled()

        composeRule.onNodeWithTag(PRONOUNS_FIELD_TAG).performTextInput("they/them")
        composeRule.onNodeWithTag(SAVE_PROFILE_TAG).performClick()

        composeRule.onNodeWithTag(SAVE_PROFILE_TAG).assertIsNotEnabled()
        assertEquals("they/them", profiles.profile.pronouns)
    }

    @Test
    fun listsFriends() {
        showProfile()

        openFriends()

        composeRule.onNodeWithText("Friends (1)").assertIsDisplayed()
        composeRule.onNodeWithText("Alex Kim").assertIsDisplayed()
        composeRule.onNodeWithText("alex@example.com").assertIsDisplayed()
    }

    @Test
    fun removesAFriendAfterConfirming() {
        val rooms = showProfile()

        openFriends()
        composeRule.onNodeWithText("Remove").performClick()
        composeRule.onNodeWithText("Remove Alex Kim?").assertIsDisplayed()
        composeRule.onNodeWithTag(CONFIRM_REMOVE_FRIEND_TAG).performClick()

        composeRule.onNodeWithText("Removed Alex Kim from your friends.").assertIsDisplayed()
        composeRule.onNodeWithText("Friends (0)").assertIsDisplayed()
        assertTrue(rooms.friends.isEmpty())
    }

    @Test
    fun keepingAFriendLeavesThemInTheList() {
        val rooms = showProfile()

        openFriends()
        composeRule.onNodeWithText("Remove").performClick()
        composeRule.onNodeWithText("Keep").performClick()

        composeRule.onNodeWithText("Remove Alex Kim?").assertDoesNotExist()
        composeRule.onNodeWithText("Friends (1)").assertIsDisplayed()
        assertEquals(listOf(alex), rooms.friends)
    }

    @Test
    fun aFriendThatCantBeRemovedShowsWhy() {
        val rooms = FakeRoomsRepository(friends = listOf(alex))
        rooms.friendRequestError = "Couldn't reach the server."
        showProfile(rooms)

        openFriends()
        composeRule.onNodeWithText("Remove").performClick()
        composeRule.onNodeWithTag(CONFIRM_REMOVE_FRIEND_TAG).performClick()

        composeRule.onNodeWithText("Couldn't reach the server.").assertIsDisplayed()
        composeRule.onNodeWithText("Alex Kim").assertIsDisplayed()
    }

    @Test
    fun sendsAFriendRequestByEmail() {
        val rooms = showProfile()

        openFriends()
        sendRequestTo(" jo@example.com ")

        composeRule.onNodeWithText("Friend request sent to jo@example.com.").assertIsDisplayed()
        composeRule.onNodeWithTag(OUTGOING_REQUEST_TAG).performScrollTo().assertIsDisplayed()
        composeRule.onNodeWithTag(ADD_FRIEND_EMAIL_TAG).assertTextContains("Their email")
        assertEquals(listOf("jo@example.com"), rooms.outgoing.map { it.user.email })
        composeRule.onNodeWithText("Friends (1)").assertIsDisplayed()
    }

    @Test
    fun sendingToSomeoneWhoAlreadyAsked_makesYouFriends() {
        showProfile(FakeRoomsRepository(friends = listOf(alex), incoming = listOf(FriendRequest("r1", jo))))

        openFriends()
        sendRequestTo("jo@example.com")

        composeRule.onNodeWithText("You and Jo Park are now friends.").assertIsDisplayed()
        composeRule.onNodeWithText("Friends (2)").assertIsDisplayed()
        composeRule.onNodeWithTag(INCOMING_REQUEST_TAG).assertDoesNotExist()
    }

    @Test
    fun requestsForYouCanBeAccepted() {
        val rooms = showProfile(FakeRoomsRepository(friends = listOf(alex), incoming = listOf(FriendRequest("r1", jo))))

        composeRule.onNodeWithText("1 friend request").assertIsDisplayed()
        openFriends()
        composeRule.onNodeWithText("Requests for you").assertIsDisplayed()
        composeRule.onNodeWithText("Accept").performClick()

        composeRule.onNodeWithText("You and Jo Park are now friends.").assertIsDisplayed()
        composeRule.onNodeWithText("Friends (2)").assertIsDisplayed()
        composeRule.onNodeWithText("Requests for you").assertDoesNotExist()
        assertTrue(jo in rooms.friends)

        composeRule.onNodeWithText("Close").performClick()
        composeRule.onNodeWithText("Tap to see or add friends").assertIsDisplayed()
    }

    @Test
    fun requestsForYouCanBeDeclined() {
        val rooms = showProfile(FakeRoomsRepository(friends = listOf(alex), incoming = listOf(FriendRequest("r1", jo))))

        openFriends()
        composeRule.onNodeWithText("Decline").performClick()

        composeRule.onNodeWithText("Requests for you").assertDoesNotExist()
        composeRule.onNodeWithText("Friends (1)").assertIsDisplayed()
        assertTrue(rooms.incoming.isEmpty())
    }

    @Test
    fun sentRequestsCanBeCancelled() {
        val rooms = showProfile(FakeRoomsRepository(friends = listOf(alex), outgoing = listOf(FriendRequest("r2", jo))))

        openFriends()
        composeRule.onNodeWithText("Jo Park").performScrollTo().assertIsDisplayed()
        composeRule.onNodeWithText("Cancel").performScrollTo().performClick()

        composeRule.onNodeWithTag(OUTGOING_REQUEST_TAG).assertDoesNotExist()
        assertTrue(rooms.outgoing.isEmpty())
    }

    @Test
    fun aRequestThatCantBeSentShowsWhyAndKeepsTheEmail() {
        val rooms = FakeRoomsRepository(friends = listOf(alex))
        rooms.friendRequestError = "No user has that email"
        showProfile(rooms)

        openFriends()
        sendRequestTo("nobody@example.com")

        composeRule.onNodeWithText("No user has that email").assertIsDisplayed()
        composeRule.onNodeWithTag(ADD_FRIEND_EMAIL_TAG).assertTextContains("nobody@example.com")
    }

    @Test
    fun sendNeedsAnEmail() {
        showProfile()

        openFriends()
        composeRule.onNodeWithText("Send").assertIsNotEnabled()
        composeRule.onNodeWithTag(ADD_FRIEND_EMAIL_TAG).performTextInput("jo@example.com")
        composeRule.onNodeWithText("Send").assertIsEnabled()
    }
}
