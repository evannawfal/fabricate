package com.example.cpen321application.network

import com.example.cpen321application.BuildConfig
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

    private suspend fun postJson(path: String, payload: JSONObject): JSONObject =
        withContext(Dispatchers.IO) {
            val request = Request.Builder()
                .url("$baseUrl$path")
                .post(payload.toString().toRequestBody(JSON_MEDIA_TYPE))
                .build()
            client.newCall(request).execute().use { response ->
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
}
