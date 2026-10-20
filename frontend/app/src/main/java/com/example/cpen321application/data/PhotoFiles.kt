package com.example.cpen321application.data

import android.content.ContentResolver
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.net.Uri
import android.os.Build
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException
import kotlin.math.max
import kotlin.math.roundToInt

// Longest side of an uploaded photo. The classifier scales larger images down to about
// this size anyway, so sending more detail only makes the upload slower.
internal const val MAX_PHOTO_SIDE = 1568
private const val JPEG_QUALITY = 85

/**
 * Where the camera saves a new photo: one reused file in the app's cache, shared with
 * the camera app through the FileProvider declared in AndroidManifest.xml.
 */
fun cameraPhotoUri(context: Context): Uri {
    val dir = File(context.cacheDir, "camera").apply { mkdirs() }
    return FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", File(dir, "photo.jpg"))
}

/**
 * Reads the photo at [uri] and re-encodes it as a JPEG no larger than [MAX_PHOTO_SIDE],
 * which every gallery format (e.g. HEIC) can be turned into and keeps uploads small.
 * Throws [IOException] if the photo can't be read.
 */
suspend fun readPhotoForUpload(context: Context, uri: Uri): ByteArray = withContext(Dispatchers.IO) {
    val bitmap = decodeScaled(context.contentResolver, uri)
    ByteArrayOutputStream().use { out ->
        bitmap.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, out)
        bitmap.recycle()
        out.toByteArray()
    }
}

/** [width] x [height] scaled down to fit within [maxSide], keeping the aspect ratio. */
internal fun scaledSize(width: Int, height: Int, maxSide: Int): Pair<Int, Int> {
    val longest = max(width, height)
    if (longest <= maxSide) return width to height
    val scale = maxSide.toDouble() / longest
    return max(1, (width * scale).roundToInt()) to max(1, (height * scale).roundToInt())
}

private fun decodeScaled(resolver: ContentResolver, uri: Uri): Bitmap =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        // ImageDecoder also turns camera photos the right way up.
        ImageDecoder.decodeBitmap(ImageDecoder.createSource(resolver, uri)) { decoder, info, _ ->
            val (width, height) = scaledSize(info.size.width, info.size.height, MAX_PHOTO_SIDE)
            decoder.setTargetSize(width, height)
            decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
        }
    } else {
        decodeScaledLegacy(resolver, uri)
    }

// Android 8 has no ImageDecoder: decode at a reduced sample size, then scale to fit.
private fun decodeScaledLegacy(resolver: ContentResolver, uri: Uri): Bitmap {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    openPhoto(resolver, uri).use { BitmapFactory.decodeStream(it, null, bounds) }
    var sampleSize = 1
    while (max(bounds.outWidth, bounds.outHeight) / (sampleSize * 2) >= MAX_PHOTO_SIDE) {
        sampleSize *= 2
    }
    val options = BitmapFactory.Options().apply { inSampleSize = sampleSize }
    val bitmap = openPhoto(resolver, uri).use { BitmapFactory.decodeStream(it, null, options) }
        ?: throw IOException("Unsupported image format")
    val (width, height) = scaledSize(bitmap.width, bitmap.height, MAX_PHOTO_SIDE)
    return Bitmap.createScaledBitmap(bitmap, width, height, true)
}

private fun openPhoto(resolver: ContentResolver, uri: Uri) =
    resolver.openInputStream(uri) ?: throw IOException("Could not open $uri")
