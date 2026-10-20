package com.example.cpen321application.network

import com.example.cpen321application.BuildConfig
import com.example.cpen321application.data.ClothingItemChanges
import com.example.cpen321application.data.ClothingRepository
import com.example.cpen321application.data.ClothingRepositoryException
import com.example.cpen321application.model.ClothingCategory
import com.example.cpen321application.model.ClothingItem
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONException
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * The closet on the back-end (`/clothing`). Every request is sent with the access
 * token from [tokenProvider], which returns null while the user isn't signed in.
 */
class BackendClothingRepository(
    private val tokenProvider: () -> String?,
    baseUrl: String = BuildConfig.API_BASE_URL,
    private val client: OkHttpClient = defaultClient,
) : ClothingRepository {
    private val clothingUrl = "${baseUrl.trimEnd('/')}/clothing"

    override suspend fun listItems(): List<ClothingItem> {
        val body = send(Request.Builder().url(clothingUrl).get())
        val items = parse { JSONObject(body).getJSONArray("items") }
        // Items in a category this version of the app doesn't know are left out.
        return (0 until items.length()).mapNotNull { parse { parseClothingItem(items.getJSONObject(it)) } }
    }

    override suspend fun uploadPhoto(jpeg: ByteArray): ClothingItem {
        val form = MultipartBody.Builder()
            .setType(MultipartBody.FORM)
            .addFormDataPart("photo", "photo.jpg", jpeg.toRequestBody(JPEG))
            .build()
        return parseItem(send(Request.Builder().url(clothingUrl).post(form)))
    }

    override suspend fun updateItem(id: String, changes: ClothingItemChanges): ClothingItem {
        val json = JSONObject()
            .put("name", changes.name)
            .put("category", changes.category.apiValue)
            .put("color", changes.color)
            .put("style", changes.style)
        val request = Request.Builder().url("$clothingUrl/$id").patch(json.toString().toRequestBody(JSON))
        return parseItem(send(request))
    }

    override suspend fun deleteItem(id: String) {
        send(Request.Builder().url("$clothingUrl/$id").delete())
    }

    // Sends the request with the user's token and returns the response body,
    // turning every kind of failure into a message for the user.
    private suspend fun send(request: Request.Builder): String = withContext(Dispatchers.IO) {
        val token = tokenProvider() ?: throw ClothingRepositoryException(NOT_SIGNED_IN)
        try {
            client.newCall(request.header("Authorization", "Bearer $token").build()).execute().use { response ->
                val body = response.body?.string().orEmpty()
                if (!response.isSuccessful) {
                    throw ClothingRepositoryException(errorMessageFor(response.code, serverError(body)))
                }
                body
            }
        } catch (e: IOException) {
            throw ClothingRepositoryException(NETWORK_ERROR, e)
        }
    }

    private fun parseItem(body: String): ClothingItem =
        parse { parseClothingItem(JSONObject(body)) } ?: throw ClothingRepositoryException(UNEXPECTED_RESPONSE)

    private fun <T> parse(block: () -> T): T =
        try {
            block()
        } catch (e: JSONException) {
            throw ClothingRepositoryException(UNEXPECTED_RESPONSE, e)
        }

    private companion object {
        val JPEG = "image/jpeg".toMediaType()
        val JSON = "application/json".toMediaType()

        // Uploads wait for the back-end to classify the photo, which retries a slow
        // classifier for up to about 90 seconds before giving up.
        val defaultClient: OkHttpClient = OkHttpClient.Builder()
            .readTimeout(2, TimeUnit.MINUTES)
            .build()
    }
}

internal const val NOT_SIGNED_IN = "Sign in to see your closet."
internal const val NETWORK_ERROR = "Couldn't reach the server. Check your connection and try again."
internal const val UNEXPECTED_RESPONSE = "Something went wrong on our end. Try again."

/** A message for the user explaining a failed `/clothing` request. */
internal fun errorMessageFor(status: Int, serverError: String?): String = when (status) {
    // The back-end's validation messages (e.g. "color must not be empty") are written for people.
    400 -> serverError ?: "That request wasn't valid."
    401 -> "Your session has expired. Sign in again."
    404 -> "This item is no longer in your closet."
    409 -> "This item was removed and can no longer be edited."
    413 -> "That photo is too large. Try a smaller one."
    422 -> "That photo doesn't look like a clothing item. Try a clear photo of a single item."
    503 -> "Adding clothing isn't available right now. Try again later."
    else -> "Something went wrong (error $status). Try again."
}

// The back-end reports errors as {"error": "..."}.
private fun serverError(body: String): String? =
    try {
        JSONObject(body).optString("error").ifBlank { null }
    } catch (e: JSONException) {
        null
    }

/** The app's item for one entry of a `/clothing` response, or null if its category is unknown. */
internal fun parseClothingItem(json: JSONObject): ClothingItem? {
    val category = ClothingCategory.fromApiValue(json.getString("category")) ?: return null
    val tags = json.optJSONArray("tags")
    return ClothingItem(
        id = json.getString("id"),
        name = json.getString("name"),
        category = category,
        color = json.getString("color"),
        style = json.getString("style"),
        tags = if (tags == null) emptyList() else (0 until tags.length()).map { tags.getString(it) },
        isClean = json.optBoolean("isClean", true),
        imageUrl = if (json.isNull("imageUrl")) null else json.getString("imageUrl"),
    )
}
