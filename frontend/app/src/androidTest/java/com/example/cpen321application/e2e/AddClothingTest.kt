package com.example.cpen321application.e2e

import android.app.Activity
import android.app.Instrumentation
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.provider.MediaStore
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
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
import com.example.cpen321application.screens.ClosetScreen
import com.example.cpen321application.viewmodel.ClosetViewModel
import kotlinx.coroutines.CompletableDeferred
import org.hamcrest.Matchers.anyOf
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.io.OutputStream

/**
 * Adding clothing from a photo (#23). The camera and the photo picker are replaced
 * with stubs that return a test photo, and the back-end with [FakeClothingRepository].
 */
@RunWith(AndroidJUnit4::class)
class AddClothingTest {
    @get:Rule
    val composeRule = createComposeRule()

    private val context = InstrumentationRegistry.getInstrumentation().targetContext
    private val hoodie = ClothingItem("1", "Grey Hoodie", ClothingCategory.Top, "grey", "casual")
    private val detectedCoat = ClothingItem("2", "Navy Wool Coat", ClothingCategory.Outerwear, "navy", "formal")
    private lateinit var repository: FakeClothingRepository

    @Before
    fun setUp() {
        Intents.init()
        repository = FakeClothingRepository(listOf(hoodie))
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

    private fun stubGallery() {
        val photo = File(context.cacheDir, "test-gallery-photo.png")
        photo.outputStream().use(::writeTestPhoto)
        val result = Instrumentation.ActivityResult(Activity.RESULT_OK, Intent().setData(Uri.fromFile(photo)))
        intending(anyOf(hasAction(MediaStore.ACTION_PICK_IMAGES), hasAction(Intent.ACTION_OPEN_DOCUMENT)))
            .respondWith(result)
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
        // The button's label is only in the unmerged tree; clicking it clicks the button.
        composeRule.onNodeWithText("Add", useUnmergedTree = true).performClick()
        composeRule.onNodeWithText(option).performClick()
    }

    private fun waitForText(text: String) {
        composeRule.waitUntil(timeoutMillis = 5_000) {
            composeRule.onAllNodesWithText(text).fetchSemanticsNodes().isNotEmpty()
        }
    }

    private fun waitForTextToDisappear(text: String) {
        composeRule.waitUntil(timeoutMillis = 5_000) {
            composeRule.onAllNodesWithText(text).fetchSemanticsNodes().isEmpty()
        }
    }

    private fun assertShowsDetectedCoat() {
        waitForText("Navy Wool Coat")
        composeRule.onNodeWithText("Added to your closet", substring = true).assertIsDisplayed()
        composeRule.onNodeWithText("Outerwear").assertIsDisplayed()
        composeRule.onNodeWithText("Navy").assertIsDisplayed()
        composeRule.onNodeWithText("Formal").assertIsDisplayed()
        composeRule.onNodeWithText("Edit details").assertIsDisplayed()

        // The photo was uploaded as a JPEG.
        val photo = repository.uploadedPhotos.single()
        assertEquals(0xFF.toByte(), photo[0])
        assertEquals(0xD8.toByte(), photo[1])

        composeRule.onNodeWithContentDescription("Back").performClick()
        composeRule.onNodeWithText("Navy Wool Coat").assertIsDisplayed()
        composeRule.onNodeWithText("Grey Hoodie").assertIsDisplayed()
    }

    @Test
    fun addFromGallery_showsTheNewItemWithItsDetectedDetails() {
        repository.uploadResult = { detectedCoat }
        stubGallery()
        showCloset()

        addFrom("Choose from gallery")

        assertShowsDetectedCoat()
    }

    @Test
    fun addFromCamera_showsTheNewItemWithItsDetectedDetails() {
        repository.uploadResult = { detectedCoat }
        stubCamera()
        showCloset()

        addFrom("Take photo")

        assertShowsDetectedCoat()
    }

    @Test
    fun showsLoadingWhileThePhotoIsClassified() {
        val gate = CompletableDeferred<Unit>()
        repository.uploadGate = gate
        repository.uploadResult = { detectedCoat }
        stubGallery()
        showCloset()

        addFrom("Choose from gallery")

        waitForText("Classifying your photo…")
        gate.complete(Unit)
        waitForText("Navy Wool Coat")
        composeRule.onNodeWithText("Classifying your photo…").assertDoesNotExist()
    }

    @Test
    fun failedUpload_showsAnErrorAndAddsNothing() {
        val reason = "That photo doesn't look like a clothing item."
        repository.uploadResult = { throw ClothingRepositoryException(reason) }
        stubGallery()
        showCloset()

        addFrom("Choose from gallery")

        waitForText("Couldn't add item")
        composeRule.onNodeWithText(reason).assertIsDisplayed()
        composeRule.onNodeWithText("OK").performClick()
        composeRule.onNodeWithText("My Closet").assertIsDisplayed()
        composeRule.onNodeWithText("Grey Hoodie").assertIsDisplayed()
        composeRule.onNodeWithText("Navy Wool Coat").assertDoesNotExist()
        assertEquals(listOf(hoodie), repository.items)
    }

    @Test
    fun editingAnItem_savesTheChanges() {
        showCloset()
        composeRule.onNodeWithText("Grey Hoodie").performClick()

        composeRule.onNodeWithText("Edit details").performClick()
        composeRule.onNodeWithText("Outerwear").performClick()
        composeRule.onNodeWithTag("edit-color").performTextReplacement("red")
        composeRule.onNodeWithText("Save").performClick()

        waitForTextToDisappear("Edit item")
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
