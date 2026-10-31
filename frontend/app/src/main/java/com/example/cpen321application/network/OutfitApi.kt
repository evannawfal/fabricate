package com.example.cpen321application.network

import com.example.cpen321application.BuildConfig
import com.example.cpen321application.data.OutfitChanges
import com.example.cpen321application.data.OutfitRepository
import com.example.cpen321application.model.Outfit
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject

/**
 * The user's outfits on the back-end (`/outfits`). Requests are sent as the signed-in
 * user
 */
class BackendOutfitRepository(
    tokenProvider: suspend () -> String?,
    onUnauthorized: suspend () -> Unit = {},
    baseUrl: String = BuildConfig.API_BASE_URL,
    client: OkHttpClient = OkHttpClient(),
) : OutfitRepository {
    private val http = AuthorizedClient(tokenProvider, onUnauthorized, client)
    private val outfitsUrl = "${baseUrl.trimEnd('/')}/outfits"

    override suspend fun listOutfits(): List<Outfit> {
        val body = send(Request.Builder().url(outfitsUrl).get())
        val outfits = parseResponse { JSONObject(body).getJSONArray("outfits") }
        return (0 until outfits.length()).map { parseResponse { parseOutfit(outfits.getJSONObject(it)) } }
    }

    override suspend fun createOutfit(changes: OutfitChanges): Outfit =
        parseOutfitBody(send(Request.Builder().url(outfitsUrl).post(changes.toRequestBody())))

    override suspend fun updateOutfit(id: String, changes: OutfitChanges): Outfit =
        parseOutfitBody(send(Request.Builder().url("$outfitsUrl/$id").patch(changes.toRequestBody())))

    override suspend fun deleteOutfit(id: String) {
        send(Request.Builder().url("$outfitsUrl/$id").delete())
    }

    private suspend fun send(request: Request.Builder): String = http.send(request, ::outfitErrorMessageFor)

    private fun parseOutfitBody(body: String): Outfit = parseResponse { parseOutfit(JSONObject(body)) }

    private fun OutfitChanges.toRequestBody(): RequestBody =
        JSONObject()
            .put("name", name)
            .put("items", JSONArray(itemIds))
            .toString()
            .toRequestBody(JSON)

    private companion object {
        val JSON = "application/json".toMediaType()
    }
}

internal const val OUTFIT_NOT_FOUND = "This outfit no longer exists."
internal const val OUTFITS_UNAVAILABLE = "Outfits aren't available right now. Try again later."

internal fun outfitErrorMessageFor(status: Int, serverError: String?): String = when (status) {
    404 -> OUTFIT_NOT_FOUND
    503 -> OUTFITS_UNAVAILABLE
    else -> errorMessageFor(status, serverError)
}

// Items in a category this app doesn't know are left out, same as in the closet.
internal fun parseOutfit(json: JSONObject): Outfit {
    val items = json.getJSONArray("items")
    return Outfit(
        id = json.getString("id"),
        name = json.getString("name"),
        items = (0 until items.length()).mapNotNull { parseClothingItem(items.getJSONObject(it)) },
        occasion = json.optString("occasion"),
    )
}
