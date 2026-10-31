package com.example.cpen321application.network

import com.example.cpen321application.data.ClothingRepositoryException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONException
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection

/**
 * Sends requests to the back-end with the access token from [tokenProvider], which
 * returns null while the user isn't signed in. [onUnauthorized] runs when the
 * back-end rejects the token, e.g. after it expired.
 */
internal class AuthorizedClient(
    private val tokenProvider: suspend () -> String?,
    private val onUnauthorized: suspend () -> Unit,
    private val client: OkHttpClient,
) {
    suspend fun send(request: Request.Builder, errorMessage: (Int, String?) -> String): String =
        withContext(Dispatchers.IO) {
            val token = tokenProvider() ?: throw ClothingRepositoryException(NOT_SIGNED_IN)
            try {
                client.newCall(request.header("Authorization", "Bearer $token").build()).execute().use { response ->
                    val body = response.body?.string().orEmpty()
                    if (response.code == HttpURLConnection.HTTP_UNAUTHORIZED) {
                        onUnauthorized()
                    }
                    if (!response.isSuccessful) {
                        throw ClothingRepositoryException(
                            errorMessage(response.code, serverError(body)),
                            canRetry = response.code >= 500,
                        )
                    }
                    body
                }
            } catch (e: IOException) {
                throw ClothingRepositoryException(NETWORK_ERROR, e, canRetry = true)
            }
        }
}

internal fun <T> parseResponse(block: () -> T): T =
    try {
        block()
    } catch (e: JSONException) {
        throw ClothingRepositoryException(UNEXPECTED_RESPONSE, e)
    }

private fun serverError(body: String): String? =
    try {
        JSONObject(body).optString("error").ifBlank { null }
    } catch (e: JSONException) {
        null
    }
