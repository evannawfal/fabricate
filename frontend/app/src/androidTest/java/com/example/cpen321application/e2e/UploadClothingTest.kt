package com.example.cpen321application.e2e

import android.content.ContentValues
import android.net.Uri
import android.provider.MediaStore
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasAnyDescendant
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import com.example.cpen321application.MainActivity
import com.example.cpen321application.auth.SessionStore
import com.example.cpen321application.model.ClothingCategory
import com.example.cpen321application.model.ClothingItem
import com.example.cpen321application.network.BackendClothingRepository
import com.example.cpen321application.screens.CLOSET_ITEM_IMAGE_TAG
import com.example.cpen321application.screens.CLOSET_ITEM_TAG
import com.example.cpen321application.screens.UPLOAD_PROGRESS_TAG
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The Upload Clothing Item use case end to end (documentation/Testing.md, section 4): the app
 * signed in as the tester, the system photo picker driven with UI Automator, and the real
 * back-end with its photo classifier. Each test adds the photo it picks to the device's gallery
 * and, when it finishes, removes that photo and any item it added to the tester's closet.
 */
@RunWith(AndroidJUnit4::class)
class UploadClothingTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context = instrumentation.targetContext
    private val device = UiDevice.getInstance(instrumentation)
    private val sessionStore = SessionStore(context)
    private val closet = BackendClothingRepository(tokenProvider = { sessionStore.token.first() })
    private val galleryPhotos = mutableListOf<Uri>()

    /**
     * The tester's closet before the test, so [cleanUp] removes only the items the test added and
     * never the tester's own. Null if it couldn't be read, in which case nothing is removed.
     */
    private var itemsBefore: List<ClothingItem>? = null

    @Before
    fun readClosetBefore() = runBlocking {
        assertNotNull("Sign in to the app before running the end-to-end tests", sessionStore.token.first())
        itemsBefore = closet.listItems()
    }

    @After
    fun cleanUp() = runBlocking {
        galleryPhotos.forEach { context.contentResolver.delete(it, null, null) }
        if (itemsBefore != null) {
            addedItems().forEach { closet.deleteItem(it.id) }
        }
    }

    /**
     * Reads the tester's closet from the back-end.
     * @return the items that weren't there before the test
     * @throws IllegalArgumentException if the closet couldn't be read before the test
     */
    private suspend fun addedItems(): List<ClothingItem> {
        val idsBefore = requireNotNull(itemsBefore).map { it.id }.toSet()
        return closet.listItems().filterNot { it.id in idsBefore }
    }

    /**
     * Copies [assetName] from the test assets into the device's gallery, since the system photo
     * picker only shows gallery photos. It is dated now, so it is the newest photo and the first
     * one [PICKER_PHOTO] matches. [cleanUp] deletes it after the test.
     */
    private fun addToGallery(assetName: String) {
        val values = ContentValues().apply {
            put(MediaStore.Images.Media.DISPLAY_NAME, assetName)
            put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg")
            put(MediaStore.Images.Media.DATE_TAKEN, System.currentTimeMillis())
        }
        val resolver = context.contentResolver
        val photo = requireNotNull(resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values))
        galleryPhotos += photo
        instrumentation.context.assets.open(assetName).use { input ->
            resolver.openOutputStream(photo).use { output -> input.copyTo(requireNotNull(output)) }
        }
    }

    /** Use case steps 1-2: open the Closet tab, tap "Add clothing" and choose the gallery. */
    private fun chooseFromGallery() {
        composeRule.onNodeWithText("Closet").performClick()
        composeRule.onNodeWithText("My Closet").assertIsDisplayed()
        composeRule.onNodeWithText("Add clothing").performClick()
        composeRule.onNodeWithText("Take photo").assertIsDisplayed()
        composeRule.onNodeWithText("Choose from gallery").assertIsDisplayed()
        composeRule.onNodeWithText("Choose from gallery").performClick()
    }

    /**
     * The photo picker is a separate system app that the Compose test rule can't see, so it is
     * found with UI Automator.
     */
    private fun waitForPhotoPicker() {
        assertTrue(
            "The photo picker didn't show the test photo",
            device.wait(Until.hasObject(PICKER_PHOTO), PICKER_TIMEOUT_MS),
        )
    }

    private fun pickNewestPhoto() {
        waitForPhotoPicker()
        device.findObject(PICKER_PHOTO).click()
    }

    /**
     * Waits for a node tagged [tag]. The Compose test rule waits for the UI to settle but not for
     * the back-end's response, so screens that depend on it have to be waited for.
     */
    private fun waitForTag(tag: String, timeoutMillis: Long) {
        composeRule.waitUntil(timeoutMillis) {
            composeRule.onAllNodesWithTag(tag).fetchSemanticsNodes().isNotEmpty()
        }
    }

    /** Like [waitForTag], for a node showing [text]. */
    private fun waitForText(text: String, timeoutMillis: Long) {
        composeRule.waitUntil(timeoutMillis) {
            composeRule.onAllNodesWithText(text).fetchSemanticsNodes().isNotEmpty()
        }
    }

    /**
     * Checks that the closet is back on screen and unchanged: the back-end has no new items, and
     * the first card is still the item that was first before the test.
     */
    private fun assertClosetUnchanged() {
        composeRule.onNodeWithText("My Closet").assertIsDisplayed()
        composeRule.onNodeWithText("Add clothing").assertIsDisplayed()
        assertEquals(emptyList<ClothingItem>(), runBlocking { addedItems() })
        val firstItem = requireNotNull(itemsBefore).firstOrNull()
        if (firstItem == null) {
            composeRule.onNodeWithText("Your closet is empty").assertIsDisplayed()
        } else {
            composeRule.onAllNodesWithTag(CLOSET_ITEM_TAG).onFirst().assert(hasText(firstItem.name))
        }
    }

    /** Main success scenario: the user picks a photo of a shirt from the gallery. */
    @Test
    fun choosingAClothingPhoto_addsTheItemFirstWithItsDetectedDetails() {
        addToGallery(SHIRT_PHOTO)

        // Steps 1-3
        chooseFromGallery()
        pickNewestPhoto()

        // Step 4: a loading indicator shows while the photo is classified.
        waitForTag(UPLOAD_PROGRESS_TAG, PICKER_TIMEOUT_MS)
        composeRule.onNodeWithTag(UPLOAD_PROGRESS_TAG).assertIsDisplayed()
        composeRule.waitUntil(CLASSIFY_TIMEOUT_MS) {
            composeRule.onAllNodesWithTag(UPLOAD_PROGRESS_TAG).fetchSemanticsNodes().isEmpty()
        }

        // Step 5: the new item is the first card, with its photo and name.
        val added = runBlocking { addedItems() }.single()
        assertEquals(ClothingCategory.Top, added.category)
        assertNotNull(added.imageUrl)
        composeRule.onAllNodesWithTag(CLOSET_ITEM_TAG).onFirst().assert(hasText(added.name))
        // The photo is merged into the card's semantics, so it's only visible in the unmerged tree.
        composeRule.onAllNodesWithTag(CLOSET_ITEM_TAG, useUnmergedTree = true).onFirst()
            .assert(hasAnyDescendant(hasTestTag(CLOSET_ITEM_IMAGE_TAG)))

        // Its details show what was detected.
        composeRule.onAllNodesWithTag(CLOSET_ITEM_TAG).onFirst().performClick()
        composeRule.onNodeWithText("Added to your closet", substring = true).assertIsDisplayed()
        composeRule.onNodeWithText(ClothingCategory.Top.label).assertIsDisplayed()
        // The details screen shows the detected color and style capitalized.
        composeRule.onNodeWithText(added.color.replaceFirstChar(Char::uppercase)).assertIsDisplayed()
        composeRule.onNodeWithText(added.style.replaceFirstChar(Char::uppercase)).assertIsDisplayed()
        composeRule.onNodeWithContentDescription("Back").performClick()
        composeRule.onNodeWithText("My Closet").assertIsDisplayed()
    }

    /** Failure 3a: the user closes the photo picker without choosing a photo. */
    @Test
    fun closingThePhotoPicker_leavesTheClosetUnchanged() {
        addToGallery(SHIRT_PHOTO)

        chooseFromGallery()
        waitForPhotoPicker()
        device.pressBack()

        assertTrue(
            "The app didn't return after closing the photo picker",
            device.wait(Until.hasObject(By.pkg(context.packageName)), PICKER_TIMEOUT_MS),
        )
        composeRule.onNodeWithTag(UPLOAD_PROGRESS_TAG).assertDoesNotExist()
        assertClosetUnchanged()
    }

    /** Failure 4a: the photo doesn't show a clothing item. */
    @Test
    fun photoThatIsNotClothing_showsAMessageAndAddsNothing() {
        addToGallery(MUG_PHOTO)

        chooseFromGallery()
        pickNewestPhoto()

        waitForText(NOT_CLOTHING_MESSAGE, CLASSIFY_TIMEOUT_MS)
        // Retrying is only offered for network and server errors; the same photo would be rejected again.
        composeRule.onNodeWithText("Try again").assertDoesNotExist()
        composeRule.onNodeWithText("OK").performClick()
        assertClosetUnchanged()
    }

    private companion object {
        const val SHIRT_PHOTO = "shirt.jpg"
        const val MUG_PHOTO = "mug.jpg"
        const val NOT_CLOTHING_MESSAGE = "This photo doesn't show a clothing item. Try another photo."
        const val PICKER_TIMEOUT_MS = 10_000L

        // Classifying a photo calls the back-end's AI service, which can take a while.
        const val CLASSIFY_TIMEOUT_MS = 30_000L

        // A photo in the system photo picker's grid; the first match is the newest photo.
        val PICKER_PHOTO = By.descStartsWith("Photo taken on")
    }
}
