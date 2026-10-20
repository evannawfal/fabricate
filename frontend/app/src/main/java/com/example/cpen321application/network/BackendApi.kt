package com.example.cpen321application.network

import android.text.Html
import com.example.cpen321application.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject

/** A single multiple-choice trivia question with its answers shuffled. */
data class TriviaQuestion(
    val question: String,
    val correctAnswer: String,
    val answers: List<String>,
)

/**
 * Talks to the M1 back-end. Each call is a suspend function that runs off the
 * main thread and throws on a non-2xx response.
 */
object BackendApi {
    private val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()
    private val client = OkHttpClient()
    private val baseUrl: String = BuildConfig.API_BASE_URL.trimEnd('/')

    // Same host as baseUrl, but ws:// (or wss:// if https).
    private val wsBaseUrl: String = baseUrl.replaceFirst("http", "ws")

    private suspend fun getJson(path: String): JSONObject = withContext(Dispatchers.IO) {
        val request = Request.Builder().url("$baseUrl$path").get().build()
        client.newCall(request).execute().use { response ->
            val body = response.body?.string() ?: ""
            if (!response.isSuccessful) {
                throw RuntimeException("HTTP ${response.code} for $path")
            }
            JSONObject(body)
        }
    }

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

    suspend fun getServerIp(): String = getJson("/api/server-ip").getString("ip")

    suspend fun getServerTime(): String = getJson("/api/server-time").getString("time")

    suspend fun getClientIp(): String = getJson("/api/client-ip").getString("ip")

    /** The app owner's name, as (first, last). */
    suspend fun getOwnerName(): Pair<String, String> {
        val obj = getJson("/api/name")
        return obj.getString("first") to obj.getString("last")
    }

    /**
     * Button 2: opens the pixel stream relayed by the back-end. [onPixel] is
     * called for each update with its grid coordinates and hex colour.
     * Returns the socket so the caller can close it.
     */
    fun openPixelSocket(onPixel: (x: Int, y: Int, colorHex: String) -> Unit): WebSocket {
        val request = Request.Builder().url("$wsBaseUrl/ws/pixels").build()
        return client.newWebSocket(request, object : WebSocketListener() {
            override fun onMessage(webSocket: WebSocket, text: String) {
                val obj = JSONObject(text)
                onPixel(obj.getInt("x"), obj.getInt("y"), obj.getString("color"))
            }
        })
    }

    /**
     * Button 3: fetches one multiple-choice question from the Open Trivia DB
     * (an external API). Answers are HTML-decoded and shuffled.
     */
    suspend fun fetchTrivia(): TriviaQuestion = withContext(Dispatchers.IO) {
        val url = "https://opentdb.com/api.php?amount=1&type=multiple"
        val request = Request.Builder().url(url).get().build()
        client.newCall(request).execute().use { response ->
            val body = response.body?.string() ?: ""
            if (!response.isSuccessful) {
                throw RuntimeException("HTTP ${response.code} from trivia API")
            }
            val result = JSONObject(body).getJSONArray("results").getJSONObject(0)
            val correct = decodeHtml(result.getString("correct_answer"))
            val incorrect = result.getJSONArray("incorrect_answers")
            val answers = mutableListOf(correct)
            for (i in 0 until incorrect.length()) {
                answers.add(decodeHtml(incorrect.getString(i)))
            }
            answers.shuffle()
            TriviaQuestion(decodeHtml(result.getString("question")), correct, answers)
        }
    }

    // Trivia text arrives HTML-encoded (e.g. &quot;), so decode it for display.
    private fun decodeHtml(text: String): String =
        Html.fromHtml(text, Html.FROM_HTML_MODE_LEGACY).toString()
}
