package com.example.cpen321application.network

import com.example.cpen321application.data.ApiException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONException
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection

/** Signed-in JSON requests to the back-end. Every failure is thrown as an [ApiException]. */
internal class JsonApi(
    private val tokenProvider: suspend () -> String?,
    private val onUnauthorized: suspend () -> Unit,
    baseUrl: String,
    private val client: OkHttpClient = OkHttpClient(),
) {
    private val baseUrl = baseUrl.trimEnd('/')

    /** GETs [path], or sends [body] with [method] (POST by default). */
    suspend fun <T> send(path: String, body: JSONObject? = null, method: String = "POST", parse: (JSONObject) -> T): T =
        withContext(Dispatchers.IO) {
            val token = tokenProvider() ?: throw ApiException(NOT_SIGNED_IN)
            val request = Request.Builder().url("$baseUrl$path").header("Authorization", "Bearer $token")
            if (body != null) request.method(method, body.toString().toRequestBody(JSON))
            try {
                client.newCall(request.build()).execute().use { response ->
                    val text = response.body?.string().orEmpty()
                    if (response.code == HttpURLConnection.HTTP_UNAUTHORIZED) onUnauthorized()
                    if (!response.isSuccessful) {
                        throw ApiException(serverError(text) ?: "Something went wrong (error ${response.code}). Try again.")
                    }
                    parse(JSONObject(text))
                }
            } catch (e: IOException) {
                throw ApiException(NETWORK_ERROR, e)
            } catch (e: JSONException) {
                throw ApiException(UNEXPECTED_RESPONSE, e)
            }
        }

    private fun serverError(body: String): String? =
        runCatching { JSONObject(body).optString("error").ifBlank { null } }.getOrNull()

    private companion object {
        val JSON = "application/json".toMediaType()
    }
}
