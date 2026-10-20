package com.example.cpen321application.e2e

import android.app.Activity
import android.app.Instrumentation
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.provider.MediaStore
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextReplacement
import androidx.core.content.IntentCompat
import androidx.test.espresso.intent.Intents
import androidx.test.espresso.intent.Intents.intending
import androidx.test.espresso.intent.matcher.IntentMatchers.hasAction
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.example.cpen321application.data.ClothingItemChanges
import com.example.cpen321application.data.ClothingRepositoryException
import com.example.cpen321application.fakes.FakeClothingRepository
import com.example.cpen321application.model.ClothingCategory
import com.example.cpen321application.model.ClothingItem
import com.example.cpen321application.screens.CLOSET_ITEM_TAG
import com.example.cpen321application.screens.ClosetScreen
import com.example.cpen321application.screens.UPLOAD_PROGRESS_TAG
import com.example.cpen321application.viewmodel.ClosetViewModel
import kotlinx.coroutines.CompletableDeferred
import org.hamcrest.Matchers.anyOf
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.io.OutputStream

/**
 * Adding clothing from a photo, following the Upload Clothing Item scenarios in
 * documentation/Testing.md. The camera and the photo picker are replaced with stubs that
 * return a test photo, and the back-end with [FakeClothingRepository].
 */
@RunWith(AndroidJUnit4::class)
class AddClothingTest {
    @get:Rule
    val composeRule = createComposeRule()

    private val context = InstrumentationRegistry.getInstrumentation().targetContext
    private val hoodie = ClothingItem("1", "Grey Hoodie", ClothingCategory.Top, "grey", "casual")
    private val jeans = ClothingItem("2", "Black Jeans", ClothingCategory.Bottom, "black", "casual")
    private val detectedCoat = ClothingItem("3", "Navy Wool Coat", ClothingCategory.Outerwear, "navy", "formal")
    private lateinit var repository: FakeClothingRepository

    @Before
    fun setUp() {
        Intents.init()
        repository = FakeClothingRepository(listOf(hoodie, jeans))
    }

    @After
    fun tearDown() {
        Intents.release()
    }

    private fun showCloset() {
        val viewModel = ClosetViewModel(repository)
        composeRule.setContent { ClosetScreen(viewModel) }
    }

    // A small PNG; the app should re-encode whatever it gets as a JPEG before uploading.
    private fun writeTestPhoto(out: OutputStream) {
        val bitmap = Bitmap.createBitmap(64, 48, Bitmap.Config.ARGB_8888)
        bitmap.eraseColor(android.graphics.Color.BLUE)
        bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
    }

    private fun stubGallery(resultCode: Int = Activity.RESULT_OK) {
        val photo = File(context.cacheDir, "test-gallery-photo.png")
        photo.outputStream().use(::writeTestPhoto)
        val data = Intent().setData(Uri.fromFile(photo)).takeIf { resultCode == Activity.RESULT_OK }
        intending(anyOf(hasAction(MediaStore.ACTION_PICK_IMAGES), hasAction(Intent.ACTION_OPEN_DOCUMENT)))
            .respondWith(Instrumentation.ActivityResult(resultCode, data))
    }

    // Writes the test photo where the app asked the camera to save it.
    private fun stubCamera() {
        intending(hasAction(MediaStore.ACTION_IMAGE_CAPTURE)).respondWithFunction { intent ->
            val output = requireNotNull(IntentCompat.getParcelableExtra(intent, MediaStore.EXTRA_OUTPUT, Uri::class.java))
            context.contentResolver.openOutputStream(output).use { writeTestPhoto(requireNotNull(it)) }
            Instrumentation.ActivityResult(Activity.RESULT_OK, null)
        }
    }

    private fun addFrom(option: String) {
        composeRule.onNodeWithText("Add clothing").performClick()
        composeRule.onNodeWithText("Take photo").assertIsDisplayed()
        composeRule.onNodeWithText("Choose from gallery").assertIsDisplayed()
        composeRule.onNodeWithText(option).performClick()
    }

    private fun waitForText(text: String) {
        composeRule.waitUntil(timeoutMillis = 5_000) {
            composeRule.onAllNodesWithText(text).fetchSemanticsNodes().isNotEmpty()
        }
    }

    private fun waitUntilGone(tag: String) {
        composeRule.waitUntil(timeoutMillis = 5_000) {
            composeRule.onAllNodesWithTag(tag).fetchSemanticsNodes().isEmpty()
        }
    }

    private fun assertItemCards(count: Int) {
        composeRule.onAllNodesWithTag(CLOSET_ITEM_TAG).assertCountEquals(count)
    }

    // Testing.md step 5: the new item is the first card, and its details show what was detected.
    private fun assertDetectedCoatAddedFirst() {
        waitUntilGone(UPLOAD_PROGRESS_TAG)
        assertItemCards(3)
        composeRule.onAllNodesWithTag(CLOSET_ITEM_TAG).onFirst().assert(hasText("Navy Wool Coat"))

        composeRule.onAllNodesWithTag(CLOSET_ITEM_TAG).onFirst().performClick()
        composeRule.onNodeWithText("Added to your closet", substring = true).assertIsDisplayed()
        composeRule.onNodeWithText("Outerwear").assertIsDisplayed()
        composeRule.onNodeWithText("Navy").assertIsDisplayed()
        composeRule.onNodeWithText("Formal").assertIsDisplayed()
        composeRule.onNodeWithText("Edit details").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("Back").performClick()
        composeRule.onNodeWithText("My Closet").assertIsDisplayed()

        // The photo was uploaded as a JPEG.
        val photo = repository.uploadedPhotos.single()
        assertEquals(0xFF.toByte(), photo[0])
        assertEquals(0xD8.toByte(), photo[1])
    }

    @Test
    fun addFromGallery_addsTheItemFirstWithItsDetectedDetails() {
        repository.uploadResult = { detectedCoat }
        stubGallery()
        showCloset()
        assertItemCards(2)

        addFrom("Choose from gallery")

        assertDetectedCoatAddedFirst()
    }

    @Test
    fun addFromCamera_addsTheItemFirstWithItsDetectedDetails() {
        repository.uploadResult = { detectedCoat }
        stubCamera()
        showCloset()

        addFrom("Take photo")

        assertDetectedCoatAddedFirst()
    }

    @Test
    fun showsLoadingWhileThePhotoIsClassified() {
        val gate = CompletableDeferred<Unit>()
        repository.uploadGate = gate
        repository.uploadResult = { detectedCoat }
        stubGallery()
        showCloset()

        addFrom("Choose from gallery")

        composeRule.waitUntil(timeoutMillis = 5_000) {
            composeRule.onAllNodesWithTag(UPLOAD_PROGRESS_TAG).fetchSemanticsNodes().isNotEmpty()
        }
        composeRule.onNodeWithTag(UPLOAD_PROGRESS_TAG).assertIsDisplayed()
        gate.complete(Unit)
        waitUntilGone(UPLOAD_PROGRESS_TAG)
        assertItemCards(3)
    }

    @Test
    fun closingThePickerWithoutAPhoto_leavesTheClosetUnchanged() {
        stubGallery(resultCode = Activity.RESULT_CANCELED)
        showCloset()

        addFrom("Choose from gallery")

        composeRule.onNodeWithText("My Closet").assertIsDisplayed()
        composeRule.onNodeWithText("Add clothing").assertIsDisplayed()
        assertItemCards(2)
        assertEquals(0, repository.uploadedPhotos.size)
    }

    @Test
    fun photoThatIsNotClothing_showsAMessageAndAddsNothing() {
        val message = "This photo doesn't show a clothing item. Try another photo."
        repository.uploadResult = { throw ClothingRepositoryException(message) }
        stubGallery()
        showCloset()

        addFrom("Choose from gallery")

        waitForText(message)
        composeRule.onNodeWithText("Try again").assertDoesNotExist()
        composeRule.onNodeWithText("OK").performClick()
        assertItemCards(2)
        assertEquals(listOf(hoodie, jeans), repository.items)
    }

    @Test
    fun failedUpload_canBeTriedAgainWithTheSamePhoto() {
        var attempts = 0
        repository.uploadResult = {
            attempts++
            if (attempts == 1) {
                throw ClothingRepositoryException("Couldn't reach the server.", canRetry = true)
            }
            detectedCoat
        }
        stubGallery()
        showCloset()

        addFrom("Choose from gallery")

        waitForText("Couldn't add the item. Please try again.")
        assertItemCards(2)
        composeRule.onNodeWithText("Try again").performClick()

        waitUntilGone(UPLOAD_PROGRESS_TAG)
        waitForText("Navy Wool Coat")
        assertItemCards(3)
        val (first, second) = repository.uploadedPhotos
        assertArrayEquals(first, second)
    }

    @Test
    fun uploadWhileFilteringACategory_showsTheNewItem() {
        repository.uploadResult = { detectedCoat }
        stubGallery()
        showCloset()
        composeRule.onNodeWithText("Bottoms").performClick()
        assertItemCards(1)

        addFrom("Choose from gallery")

        waitUntilGone(UPLOAD_PROGRESS_TAG)
        assertItemCards(3)
        composeRule.onAllNodesWithTag(CLOSET_ITEM_TAG).onFirst().assert(hasText("Navy Wool Coat"))
    }

    @Test
    fun editingAnItem_savesTheChanges() {
        showCloset()
        composeRule.onNodeWithText("Grey Hoodie").performClick()

        composeRule.onNodeWithText("Edit details").performClick()
        composeRule.onNodeWithText("Outerwear").performClick()
        composeRule.onNodeWithTag("edit-color").performTextReplacement("red")
        composeRule.onNodeWithText("Save").performClick()

        composeRule.waitUntil(timeoutMillis = 5_000) {
            composeRule.onAllNodesWithText("Edit item").fetchSemanticsNodes().isEmpty()
        }
        composeRule.onNodeWithText("Outerwear").assertIsDisplayed()
        composeRule.onNodeWithText("Red").assertIsDisplayed()
        assertEquals(
            listOf("1" to ClothingItemChanges("Grey Hoodie", ClothingCategory.Outerwear, "red", "casual")),
            repository.savedChanges,
        )
    }

    @Test
    fun failedSave_keepsTheDialogOpenWithTheReason() {
        repository.updateError = "color must not be empty"
        showCloset()
        composeRule.onNodeWithText("Grey Hoodie").performClick()

        composeRule.onNodeWithText("Edit details").performClick()
        composeRule.onNodeWithTag("edit-color").performTextReplacement("red")
        composeRule.onNodeWithText("Save").performClick()

        waitForText("color must not be empty")
        composeRule.onNodeWithText("Edit item").assertIsDisplayed()
        composeRule.onNodeWithText("Grey").assertIsDisplayed()
    }
}
