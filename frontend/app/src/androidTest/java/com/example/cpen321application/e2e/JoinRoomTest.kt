package com.example.cpen321application.e2e

import android.util.Log
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.hasAnyDescendant
import androidx.compose.ui.test.hasAnySibling
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.example.cpen321application.BuildConfig
import com.example.cpen321application.MainActivity
import com.example.cpen321application.auth.SessionStore
import com.example.cpen321application.data.ClothingItemChanges
import com.example.cpen321application.data.Friend
import com.example.cpen321application.model.ClothingCategory
import com.example.cpen321application.model.ClothingItem
import com.example.cpen321application.model.Outfit
import com.example.cpen321application.network.BackendClothingRepository
import com.example.cpen321application.network.BackendOutfitRepository
import com.example.cpen321application.network.BackendRoomsRepository
import com.example.cpen321application.screens.ADD_BOARD_ITEM_TAG
import com.example.cpen321application.screens.BOARD_ITEM_TAG
import com.example.cpen321application.screens.CHAT_INPUT_TAG
import com.example.cpen321application.screens.CHAT_MESSAGE_TAG
import com.example.cpen321application.screens.CLOSET_PICKER_ITEM_TAG
import com.example.cpen321application.screens.CREATE_ROOM_TAG
import com.example.cpen321application.screens.FRIEND_CHECKBOX_TAG
import com.example.cpen321application.screens.FRIEND_EMAIL_FIELD_TAG
import com.example.cpen321application.screens.RECONNECTING_BANNER_TAG
import com.example.cpen321application.screens.ROOM_NAME_FIELD_TAG
import com.example.cpen321application.screens.SAVE_ROOM_OUTFIT_TAG
import com.example.cpen321application.screens.SEND_MESSAGE_TAG
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The Create Outfits in a Room use case end to end (documentation/Testing.md, section 4). Rooms
 * need two people: this test is User A, signed in on the emulator, and a team member is User B on
 * another device, following the steps in Testing.md. User B's account email is passed as the
 * `friendEmail` instrumentation argument; without it the test is skipped, so the other
 * end-to-end tests can run on their own. Each step that waits for User B logs what User B should do.
 */
@RunWith(AndroidJUnit4::class)
class JoinRoomTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context = instrumentation.targetContext
    private val sessionStore = SessionStore(context)
    private val token = suspend { sessionStore.token.first() }
    private val rooms = BackendRoomsRepository(tokenProvider = token)
    private val closet = BackendClothingRepository(tokenProvider = token)
    private val outfits = BackendOutfitRepository(tokenProvider = token)
    private val friendEmail: String? = InstrumentationRegistry.getArguments().getString("friendEmail")

    private val addedItems = mutableListOf<ClothingItem>()
    private val removedFriends = mutableListOf<Friend>()
    private var outfitsBefore: List<Outfit>? = null

    @Before
    fun setUp() = runBlocking {
        assumeTrue("Pass User B's email as the friendEmail argument to run the room test", friendEmail != null)
        assertNotNull("Sign in to the app before running the end-to-end tests", token())
        outfitsBefore = outfits.listOutfits()
    }

    @After
    fun cleanUp() = runBlocking {
        if (friendEmail == null) return@runBlocking
        setNetwork(enabled = true)
        val friendEmails = rooms.listFriends().map { it.email.lowercase() }.toSet()
        removedFriends.filterNot { it.email.lowercase() in friendEmails }.forEach { rooms.addFriend(it.email) }
        addedItems.forEach { closet.deleteItem(it.id) }
        val idsBefore = requireNotNull(outfitsBefore).map { it.id }.toSet()
        outfits.listOutfits().filterNot { it.id in idsBefore }.forEach { outfits.deleteOutfit(it.id) }
    }

    private fun userB(step: String) = Log.i(TAG, "User B: $step")

    private fun shell(command: String) {
        instrumentation.uiAutomation.executeShellCommand(command).close()
    }

    private fun setNetwork(enabled: Boolean) {
        val state = if (enabled) "enable" else "disable"
        shell("svc wifi $state")
        shell("svc data $state")
    }

    // The app has no way to remove a friend yet, so this goes through the back-end, as it would.
    private suspend fun removeFriend(friend: Friend) = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url("${BuildConfig.API_BASE_URL.trimEnd('/')}/friends/${friend.id}")
            .header("Authorization", "Bearer ${token()}")
            .delete()
            .build()
        OkHttpClient().newCall(request).execute().use { response ->
            check(response.isSuccessful) { "DELETE /friends/${friend.id} returned ${response.code}" }
        }
        removedFriends += friend
    }

    private suspend fun friendB(): Friend {
        val email = requireNotNull(friendEmail)
        return rooms.listFriends().firstOrNull { it.email.equals(email, ignoreCase = true) } ?: rooms.addFriend(email)
    }

    private suspend fun addTestItem(): ClothingItem {
        val photo = instrumentation.context.assets.open(SHIRT_PHOTO).use { it.readBytes() }
        val uploaded = closet.uploadPhotos(photo, photo)
        addedItems += uploaded
        return closet.updateItem(uploaded.id, ClothingItemChanges(TEST_ITEM, ClothingCategory.Top, "black", "casual"))
    }

    private fun waitFor(timeoutMillis: Long, condition: () -> Boolean) = composeRule.waitUntil(timeoutMillis, condition)

    private fun waitForText(text: String, timeoutMillis: Long) = waitFor(timeoutMillis) {
        composeRule.onAllNodesWithText(text).fetchSemanticsNodes().isNotEmpty()
    }

    private fun countOf(tag: String) = composeRule.onAllNodesWithTag(tag).fetchSemanticsNodes().size

    private fun openCreateRoom() {
        composeRule.onNodeWithText("Rooms").performClick()
        waitFor(UI_TIMEOUT_MS) { countOf(CREATE_ROOM_TAG) == 1 }
        composeRule.onNodeWithTag(CREATE_ROOM_TAG).performClick()
    }

    // Failure 1a
    @Test
    fun noFriends_explainsAndLetsTheUserAddOneByEmail() {
        runBlocking { rooms.listFriends().forEach { removeFriend(it) } }

        openCreateRoom()
        composeRule.onNodeWithText("Rooms are for styling with friends. Add a friend by email first.").assertIsDisplayed()
        composeRule.onNodeWithTag(ROOM_NAME_FIELD_TAG).assertDoesNotExist()
        composeRule.onNodeWithText("Create").assertIsNotEnabled()

        composeRule.onNodeWithTag(FRIEND_EMAIL_FIELD_TAG).performTextInput(requireNotNull(friendEmail))
        composeRule.onNodeWithText("Add").performClick()

        waitFor(UI_TIMEOUT_MS) { countOf(FRIEND_CHECKBOX_TAG) == 1 }
        composeRule.onNodeWithTag(ROOM_NAME_FIELD_TAG).assertIsDisplayed()
        composeRule.onNodeWithText("Cancel").performClick()
        assertEquals(listOf(friendEmail.lowercase()), runBlocking { rooms.listFriends() }.map { it.email.lowercase() })
    }

    // Main success scenario, with failures 3a and 4a
    @Test
    fun roomWithAFriend_sharesMessagesAndOutfitChangesLive() {
        val (friend, item) = runBlocking { friendB() to addTestItem() }

        // Step 1: create a room and invite User B.
        openCreateRoom()
        composeRule.onNodeWithTag(ROOM_NAME_FIELD_TAG).performTextInput(ROOM_NAME)
        composeRule.onNode(hasTestTag(FRIEND_CHECKBOX_TAG) and hasAnySibling(hasText(friend.name))).performClick()
        composeRule.onNodeWithText("Create").performClick()

        // Step 2: the room's shared outfit board and chat.
        waitFor(UI_TIMEOUT_MS) { countOf(RECONNECTING_BANNER_TAG) == 0 && countOf(CHAT_INPUT_TAG) == 1 }
        composeRule.onNodeWithText(ROOM_NAME).assertIsDisplayed()
        composeRule.onNodeWithText("Shared outfit").assertIsDisplayed()
        composeRule.onNodeWithTag(ADD_BOARD_ITEM_TAG).assertIsDisplayed()

        // Steps 3-4: User B's message reaches User A.
        userB("open the Rooms tab, open \"$ROOM_NAME\" (the first room) and send \"$MESSAGE_FROM_B\".")
        waitForText(MESSAGE_FROM_B, USER_B_TIMEOUT_MS)
        composeRule.onNode(
            hasTestTag(CHAT_MESSAGE_TAG) and hasAnyDescendant(hasText(friend.name)) and hasAnyDescendant(hasText(MESSAGE_FROM_B)),
        ).assertExists()

        // Steps 3-4: User A's message, shown on User A's screen; User B checks theirs.
        composeRule.onNodeWithTag(CHAT_INPUT_TAG).performTextInput(MESSAGE_FROM_A)
        composeRule.onNodeWithTag(SEND_MESSAGE_TAG).performClick()
        waitForText(MESSAGE_FROM_A, UI_TIMEOUT_MS)
        userB("check that \"$MESSAGE_FROM_A\" appears in the chat.")

        // Steps 3-4: User A adds an item to the board; User B checks it appears.
        composeRule.onNodeWithTag(ADD_BOARD_ITEM_TAG).performClick()
        composeRule.onNode(hasTestTag(CLOSET_PICKER_ITEM_TAG) and hasText(TEST_ITEM, substring = true)).performClick()
        waitFor(UI_TIMEOUT_MS) { countOf(BOARD_ITEM_TAG) == 1 }
        userB("check that \"$TEST_ITEM\" appears on the shared outfit, then add any item from your closet to it.")

        // Steps 3-4: User B's item reaches User A's board.
        waitFor(USER_B_TIMEOUT_MS) { countOf(BOARD_ITEM_TAG) == 2 }

        // Step 5: saving keeps only User A's own item.
        composeRule.onNodeWithTag(SAVE_ROOM_OUTFIT_TAG).performClick()
        waitForText("Outfit saved to your outfits.", UI_TIMEOUT_MS)
        val saved = runBlocking {
            val idsBefore = requireNotNull(outfitsBefore).map { it.id }.toSet()
            outfits.listOutfits().single { it.id !in idsBefore }
        }
        assertEquals(listOf(item.id), saved.items.map { it.id })

        // Steps 3-4: User A removes their item; User B checks it's gone.
        composeRule.onNodeWithContentDescription("Remove $TEST_ITEM").performClick()
        waitFor(UI_TIMEOUT_MS) { countOf(BOARD_ITEM_TAG) == 1 }
        userB("check that \"$TEST_ITEM\" is no longer on the shared outfit.")

        // Failure 3a: the connection is lost, then restored.
        setNetwork(enabled = false)
        waitFor(RECONNECT_TIMEOUT_MS) { countOf(RECONNECTING_BANNER_TAG) == 1 }
        composeRule.onNodeWithText("Reconnecting…").assertIsDisplayed()
        composeRule.onNodeWithTag(CHAT_INPUT_TAG).performTextInput(MESSAGE_OFFLINE)
        composeRule.onNodeWithTag(SEND_MESSAGE_TAG).assertIsNotEnabled()
        composeRule.onNodeWithTag(ADD_BOARD_ITEM_TAG).assertIsNotEnabled()
        setNetwork(enabled = true)
        waitFor(RECONNECT_TIMEOUT_MS) { countOf(RECONNECTING_BANNER_TAG) == 0 }
        composeRule.onNodeWithTag(SEND_MESSAGE_TAG).assertIsEnabled().performClick()
        waitForText(MESSAGE_OFFLINE, UI_TIMEOUT_MS)
        userB("check that \"$MESSAGE_OFFLINE\" appears in the chat, then leave the room with the Back button.")

        // Failure 4a: User B leaves, and the room carries on for User A.
        waitForText("${friend.name} left the room.", USER_B_TIMEOUT_MS)
        composeRule.onNodeWithTag(CHAT_INPUT_TAG).performTextInput(MESSAGE_AFTER_LEAVE)
        composeRule.onNodeWithTag(SEND_MESSAGE_TAG).performClick()
        waitForText(MESSAGE_AFTER_LEAVE, UI_TIMEOUT_MS)
        userB("done.")
    }

    private companion object {
        const val TAG = "JoinRoomTest"
        const val SHIRT_PHOTO = "shirt.jpg"
        const val TEST_ITEM = "E2E Room Tee"
        const val ROOM_NAME = "E2E Test Room"
        const val MESSAGE_FROM_A = "Hi from User A"
        const val MESSAGE_FROM_B = "Hi from User B"
        const val MESSAGE_OFFLINE = "Back online"
        const val MESSAGE_AFTER_LEAVE = "Still here"
        const val UI_TIMEOUT_MS = 10_000L

        // Socket.IO waits up to 5 s between reconnection attempts.
        const val RECONNECT_TIMEOUT_MS = 30_000L

        // Time for User B to read the step and do it.
        const val USER_B_TIMEOUT_MS = 180_000L
    }
}
