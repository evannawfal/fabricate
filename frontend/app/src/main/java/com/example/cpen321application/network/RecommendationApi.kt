package com.example.cpen321application.network

import com.example.cpen321application.BuildConfig
import com.example.cpen321application.data.RecommendationRepository
import com.example.cpen321application.model.Recommendations
import com.example.cpen321application.model.ShopDepartment
import com.example.cpen321application.model.StoreItem
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/** Recommendations from the back-end (`/recommendations`) for the signed-in user. */
class BackendRecommendationRepository(
    tokenProvider: suspend () -> String?,
    onUnauthorized: suspend () -> Unit = {},
    baseUrl: String = BuildConfig.API_BASE_URL,
    client: OkHttpClient = defaultClient,
) : RecommendationRepository {
    private val http = AuthorizedClient(tokenProvider, onUnauthorized, client)
    private val recommendationsUrl = "${baseUrl.trimEnd('/')}/recommendations".toHttpUrl()

    override suspend fun getRecommendations(department: ShopDepartment, country: String?): Recommendations {
        val url = recommendationsUrl.newBuilder()
            .apply { country?.let { addQueryParameter("country", it) } }
            .apply { department.apiValue?.let { addQueryParameter("department", it) } }
            .build()
        val body = http.send(Request.Builder().url(url).get(), ::recommendationErrorMessageFor)
        return parseResponse { parseRecommendations(JSONObject(body)) }
    }

    private companion object {
        val defaultClient: OkHttpClient = OkHttpClient.Builder()
            .readTimeout(30, TimeUnit.SECONDS)
            .build()
    }
}

internal const val RECOMMENDATIONS_UNAVAILABLE = "Recommendations aren't available right now. Try again."

internal fun recommendationErrorMessageFor(status: Int, serverError: String?): String = when (status) {
    400, 401 -> errorMessageFor(status, serverError)
    else -> RECOMMENDATIONS_UNAVAILABLE
}

private fun parseRecommendations(json: JSONObject): Recommendations {
    val gaps = json.getJSONArray("gaps")
    val items = json.getJSONArray("items")
    return Recommendations(
        gaps = (0 until gaps.length()).map { gaps.getString(it) },
        items = (0 until items.length()).map { parseStoreItem(items.getJSONObject(it)) },
    )
}

private fun parseStoreItem(json: JSONObject): StoreItem {
    val pairsWith = json.getJSONArray("pairsWith")
    return StoreItem(
        name = json.getString("name"),
        price = json.getString("price"),
        imageUrl = json.getString("imageUrl"),
        link = json.getString("link"),
        store = json.getString("store"),
        reason = json.getString("reason"),
        pairsWith = (0 until pairsWith.length()).mapNotNull { parseClothingItem(pairsWith.getJSONObject(it)) },
    )
}
