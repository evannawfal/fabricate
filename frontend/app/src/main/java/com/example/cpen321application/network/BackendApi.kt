package com.example.cpen321application.network

import com.example.cpen321application.BuildConfig
import com.example.cpen321application.model.AvatarMeasurements
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

/**
 * Talks to the back-end. Each call is a suspend function that runs off the
 * main thread and throws [HttpException] on a non-2xx response.
 */
object BackendApi {
    private val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()
    private val client = OkHttpClient()
    private val baseUrl: String = BuildConfig.API_BASE_URL.trimEnd('/')

    // Generating an avatar model on the server can take much longer than OkHttp's 10 s default.
    private const val AVATAR_TIMEOUT_SECONDS = 180L
    private val avatarClient = client.newBuilder()
        .readTimeout(AVATAR_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        .build()

    private suspend fun postJson(
        path: String,
        payload: JSONObject,
        sessionToken: String? = null,
        httpClient: OkHttpClient = client,
    ): JSONObject =
        withContext(Dispatchers.IO) {
            val request = Request.Builder()
                .url("$baseUrl$path")
                .post(payload.toString().toRequestBody(JSON_MEDIA_TYPE))
                .apply { if (sessionToken != null) header("Authorization", "Bearer $sessionToken") }
                .build()
            httpClient.newCall(request).execute().use { response ->
                val body = response.body?.string() ?: ""
                if (!response.isSuccessful) {
                    throw HttpException(response.code, path)
                }
                JSONObject(body)
            }
        }

    /** Exchanges a Google ID token for the back-end's session token (a JWT). */
    suspend fun signInWithGoogle(idToken: String): String =
        postJson("/auth/google", JSONObject().put("idToken", idToken)).getString("accessToken")

    /**
     * Generates the signed-in user's avatar model from [measurements] and saves it to
     * their profile. Returns a short-lived link to download the model (.glb).
     */
    suspend fun generateAvatar(sessionToken: String, measurements: AvatarMeasurements): String =
        postJson("/avatar", JSONObject(measurements.toApiFields()), sessionToken, avatarClient)
            .getString("downloadUrl")

    /** Downloads the file at [url], e.g. a model link from [generateAvatar]. */
    suspend fun download(url: String): ByteArray =
        withContext(Dispatchers.IO) {
            client.newCall(Request.Builder().url(url).get().build()).execute().use { response ->
                if (!response.isSuccessful) {
                    throw HttpException(response.code, "model download")
                }
                response.body?.bytes() ?: ByteArray(0)
            }
        }
}
