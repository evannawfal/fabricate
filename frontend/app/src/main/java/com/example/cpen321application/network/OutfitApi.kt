package com.example.cpen321application.network

import com.example.cpen321application.BuildConfig
import com.example.cpen321application.data.OutfitChanges
import com.example.cpen321application.data.OutfitRepository
import com.example.cpen321application.model.Coordinates
import com.example.cpen321application.model.GeneratedOutfit
import com.example.cpen321application.model.Outfit
import com.example.cpen321application.model.OutfitOccasion
import com.example.cpen321application.model.Weather
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * The user's outfits on the back-end (`/outfits`). Requests are sent as the signed-in
 * user
 */
class BackendOutfitRepository(
    tokenProvider: suspend () -> String?,
    onUnauthorized: suspend () -> Unit = {},
    baseUrl: String = BuildConfig.API_BASE_URL,
    client: OkHttpClient = defaultClient,
) : OutfitRepository {
    private val http = AuthorizedClient(tokenProvider, onUnauthorized, client)
    private val outfitsUrl = "${baseUrl.trimEnd('/')}/outfits"

    override suspend fun listOutfits(): List<Outfit> {
        val body = send(Request.Builder().url(outfitsUrl).get())
        val outfits = parseResponse { JSONObject(body).getJSONArray("outfits") }
        return (0 until outfits.length()).map { parseResponse { parseOutfit(outfits.getJSONObject(it)) } }
    }

    override suspend fun generateOutfit(occasion: OutfitOccasion, coordinates: Coordinates): GeneratedOutfit {
        val body = JSONObject()
            .put("occasion", occasion.apiValue)
            .put("latitude", coordinates.latitude)
            .put("longitude", coordinates.longitude)
            .toString()
            .toRequestBody(JSON)
        val response = send(Request.Builder().url("$outfitsUrl/generate").post(body))
        return parseResponse { parseGeneratedOutfit(JSONObject(response), occasion) }
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
            .putOpt("occasion", occasion?.apiValue)
            .toString()
            .toRequestBody(JSON)

    private companion object {
        val JSON = "application/json".toMediaType()

        // The back-end can spend over 90 s on generation: Claude's timeout, retried twice.
        val defaultClient: OkHttpClient = OkHttpClient.Builder()
            .readTimeout(2, TimeUnit.MINUTES)
            .build()
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

internal fun parseGeneratedOutfit(json: JSONObject, occasion: OutfitOccasion): GeneratedOutfit {
    val outfit = json.getJSONObject("outfit")
    val items = outfit.getJSONArray("items")
    return GeneratedOutfit(
        name = outfit.getString("name"),
        occasion = occasion,
        items = (0 until items.length()).mapNotNull { parseClothingItem(items.getJSONObject(it)) },
        weather = if (json.isNull("weather")) null else parseWeather(json.getJSONObject("weather")),
    )
}

private fun parseWeather(json: JSONObject): Weather =
    Weather(
        temperatureC = json.getInt("temperatureC"),
        condition = json.getString("condition"),
        description = json.getString("description"),
    )
