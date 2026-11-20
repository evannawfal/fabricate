package com.example.cpen321application.nfr

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.example.cpen321application.auth.SessionStore
import com.example.cpen321application.data.readPhotoForUpload
import com.example.cpen321application.network.BackendClothingRepository
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.io.ByteArrayOutputStream
import java.io.File
import kotlin.random.Random
import kotlin.system.measureTimeMillis

/**
 * Clothing upload time (documentation/Requirements_and_Design.md, NFR 2): a clothing photo is
 * classified and the new item is added to the closet within 10 seconds, for photos up to the 5 MB
 * upload limit. Each upload is timed from when the user has picked the front and back photos:
 * the app prepares both for upload, then the deployed back-end stores them and classifies the
 * item with its real AI service. Items the test adds are removed afterwards.
 */
@RunWith(AndroidJUnit4::class)
class ClothingUploadTimeTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context = instrumentation.targetContext
    private val sessionStore = SessionStore(context)
    private val closet = BackendClothingRepository(tokenProvider = { sessionStore.token.first() })
    private val addedIds = mutableListOf<String>()

    @Before
    fun requireSignIn() = runBlocking {
        assertNotNull("Sign in to the app before running the NFR tests", sessionStore.token.first())
    }

    @After
    fun cleanUp() = runBlocking {
        addedIds.forEach { closet.deleteItem(it) }
    }

    // A 12-megapixel photo of the test shirt, as a phone camera takes it. Faint noise stands in
    // for real camera detail, so the JPEG reaches the target size instead of compressing to almost nothing.
    private fun shirtPhoto(): Bitmap {
        val shirt = instrumentation.context.assets.open(SHIRT_PHOTO).use(BitmapFactory::decodeStream)
        val photo = Bitmap.createScaledBitmap(shirt, PHOTO_WIDTH, PHOTO_HEIGHT, true)
        val random = Random(0)
        val row = IntArray(PHOTO_WIDTH)
        for (y in 0 until PHOTO_HEIGHT) {
            photo.getPixels(row, 0, PHOTO_WIDTH, 0, y, PHOTO_WIDTH, 1)
            for (x in row.indices) {
                val noise = random.nextInt(-NOISE, NOISE + 1)
                val r = ((row[x] shr 16 and 0xFF) + noise).coerceIn(0, 255)
                val g = ((row[x] shr 8 and 0xFF) + noise).coerceIn(0, 255)
                val b = ((row[x] and 0xFF) + noise).coerceIn(0, 255)
                row[x] = (0xFF shl 24) or (r shl 16) or (g shl 8) or b
            }
            photo.setPixels(row, 0, PHOTO_WIDTH, 0, y, PHOTO_WIDTH, 1)
        }
        return photo
    }

    // The highest JPEG quality whose file fits in maxBytes.
    private fun saveJpegUpTo(photo: Bitmap, maxBytes: Int, name: String): File {
        var low = 1
        var high = 100
        var best: ByteArray? = null
        while (low <= high) {
            val quality = (low + high) / 2
            val bytes = ByteArrayOutputStream().use { photo.compress(Bitmap.CompressFormat.JPEG, quality, it); it.toByteArray() }
            if (bytes.size <= maxBytes) {
                best = bytes
                low = quality + 1
            } else {
                high = quality - 1
            }
        }
        return File(context.cacheDir, name).apply { writeBytes(requireNotNull(best)) }
    }

    // What the app does once both photos are picked, until the new item is in the closet.
    private fun timeUpload(photo: File): Long = runBlocking {
        val uri = Uri.fromFile(photo)
        measureTimeMillis {
            val front = readPhotoForUpload(context, uri)
            val back = readPhotoForUpload(context, uri)
            addedIds += closet.uploadPhotos(front, back).id
        }
    }

    @Test
    fun uploadsFinishWithinTenSeconds() {
        val shirt = shirtPhoto()
        val photos = PHOTO_SIZES_MB.map { saveJpegUpTo(shirt, (it * MB).toInt(), "upload-time-$it-mb.jpg") }
        shirt.recycle()

        val report = StringBuilder("Clothing upload time, $RUNS uploads per photo size (limit $LIMIT_MS ms):\n")
        val slowest = photos.maxOf { photo ->
            val times = List(RUNS) { timeUpload(photo) }
            report.append(
                "%.1f MB photo: max %d ms, mean %d ms, runs %s ms\n"
                    .format(photo.length() / MB, times.max(), times.average().toLong(), times),
            )
            photo.delete()
            times.max()
        }
        Log.i(TAG, report.toString().trimEnd())

        assertTrue("An upload took $slowest ms, over the $LIMIT_MS ms limit:\n$report", slowest <= LIMIT_MS)
    }

    private companion object {
        const val TAG = "ClothingUploadTime"
        const val SHIRT_PHOTO = "shirt.jpg"
        const val LIMIT_MS = 10_000L
        const val RUNS = 5
        const val MB = 1024.0 * 1024.0
        const val PHOTO_WIDTH = 3024
        const val PHOTO_HEIGHT = 4032
        const val NOISE = 12

        // The largest is just under the back-end's 5 MB limit for each photo.
        val PHOTO_SIZES_MB = listOf(0.5, 2.0, 4.9)
    }
}
