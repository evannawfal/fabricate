package com.example.cpen321application.network

import com.example.cpen321application.BuildConfig
import com.example.cpen321application.data.ClothingItemChanges
import com.example.cpen321application.data.ClothingRepository
import com.example.cpen321application.data.ClothingRepositoryException
import com.example.cpen321application.model.ClothingCategory
import com.example.cpen321application.model.ClothingItem
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * The closet on the back-end (`/clothing`). Requests are sent as the signed-in user;
 * see [AuthorizedClient] for [tokenProvider] and [onUnauthorized].
 */
class BackendClothingRepository(
    tokenProvider: suspend () -> String?,
    onUnauthorized: suspend () -> Unit = {},
    baseUrl: String = BuildConfig.API_BASE_URL,
    client: OkHttpClient = defaultClient,
) : ClothingRepository {
    private val http = AuthorizedClient(tokenProvider, onUnauthorized, client)
    private val clothingUrl = "${baseUrl.trimEnd('/')}/clothing"

    override suspend fun listItems(): List<ClothingItem> {
        val body = send(Request.Builder().url(clothingUrl).get())
        val items = parseResponse { JSONObject(body).getJSONArray("items") }
        return (0 until items.length()).mapNotNull { parseResponse { parseClothingItem(items.getJSONObject(it)) } }
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

    private suspend fun send(request: Request.Builder): String = http.send(request, ::errorMessageFor)

    private fun parseItem(body: String): ClothingItem =
        parseResponse { parseClothingItem(JSONObject(body)) } ?: throw ClothingRepositoryException(UNEXPECTED_RESPONSE)

    private companion object {
        val JPEG = "image/jpeg".toMediaType()
        val JSON = "application/json".toMediaType()

        val defaultClient: OkHttpClient = OkHttpClient.Builder()
            .readTimeout(2, TimeUnit.MINUTES)
            .build()
    }
}

internal const val NOT_SIGNED_IN = "Sign in to see your closet."
internal const val NETWORK_ERROR = "Couldn't reach the server. Check your connection and try again."
internal const val UNEXPECTED_RESPONSE = "Something went wrong on our end. Try again."
internal const val NOT_CLOTHING = "This photo doesn't show a clothing item. Try another photo."

/** A message for the user explaining a failed `/clothing` request. */
internal fun errorMessageFor(status: Int, serverError: String?): String = when (status) {
    400 -> serverError ?: "That request wasn't valid."
    401 -> "Your session has expired. Sign in again."
    404 -> "This item is no longer in your closet."
    409 -> "This item was removed and can no longer be edited."
    413 -> "This photo is too large. Try another photo."
    422 -> NOT_CLOTHING
    503 -> "Adding clothing isn't available right now. Try again later."
    else -> "Something went wrong (error $status). Try again."
}

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
