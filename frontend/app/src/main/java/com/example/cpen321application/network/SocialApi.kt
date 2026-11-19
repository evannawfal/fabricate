package com.example.cpen321application.network

import com.example.cpen321application.BuildConfig
import com.example.cpen321application.auth.SessionToken
import com.example.cpen321application.data.SocialRepository
import com.example.cpen321application.model.SocialPost
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.time.Instant
import java.util.concurrent.TimeUnit

/** Daily OOTD feed on the back-end (`/posts`). */
class BackendSocialRepository(
    private val tokenProvider: suspend () -> String?,
    onUnauthorized: suspend () -> Unit = {},
    baseUrl: String = BuildConfig.API_BASE_URL,
    client: OkHttpClient = defaultClient,
) : SocialRepository {
    private val http = AuthorizedClient(tokenProvider, onUnauthorized, client)
    private val postsUrl = "${baseUrl.trimEnd('/')}/posts"

    override suspend fun currentUserId(): String? = tokenProvider()?.let(SessionToken::userId)

    override suspend fun listPosts(): List<SocialPost> {
        val body = send(Request.Builder().url(postsUrl).get())
        val posts = parseResponse { JSONObject(body).getJSONArray("posts") }
        return (0 until posts.length()).map { parseResponse { parseSocialPost(posts.getJSONObject(it)) } }
    }

    override suspend fun createPost(photo: ByteArray, caption: String, tzOffsetMinutes: Int): SocialPost {
        val form = MultipartBody.Builder()
            .setType(MultipartBody.FORM)
            .addFormDataPart("photo", "ootd.jpg", photo.toRequestBody(JPEG))
            .addFormDataPart("caption", caption)
            .addFormDataPart("tzOffsetMinutes", tzOffsetMinutes.toString())
            .build()
        return parsePostBody(send(Request.Builder().url(postsUrl).post(form)))
    }

    override suspend fun likePost(id: String): SocialPost =
        parsePostBody(send(Request.Builder().url("$postsUrl/$id/like").post(ByteArray(0).toRequestBody())))

    override suspend fun unlikePost(id: String): SocialPost =
        parsePostBody(send(Request.Builder().url("$postsUrl/$id/like").delete()))

    override suspend fun deletePost(id: String) {
        send(Request.Builder().url("$postsUrl/$id").delete())
    }

    private suspend fun send(request: Request.Builder): String = http.send(request, ::socialErrorMessageFor)

    private fun parsePostBody(body: String): SocialPost = parseResponse { parseSocialPost(JSONObject(body)) }

    private companion object {
        val JPEG = "image/jpeg".toMediaType()
        val defaultClient: OkHttpClient = OkHttpClient.Builder()
            .readTimeout(1, TimeUnit.MINUTES)
            .build()
    }
}

internal fun socialErrorMessageFor(status: Int, serverError: String?): String = when (status) {
    400 -> serverError ?: "That post request wasn't valid."
    401 -> "Your session has expired. Sign in again."
    403 -> serverError ?: "You can only interact with posts from your friends."
    404 -> "This post is no longer available or has expired."
    413 -> "This photo is too large. Try another photo."
    503 -> "Posting isn't available right now. Try again later."
    else -> "Something went wrong (error $status). Try again."
}

internal fun parseSocialPost(json: JSONObject): SocialPost = SocialPost(
    id = json.getString("id"),
    authorId = json.getString("authorId"),
    authorName = json.getString("authorName"),
    imageUrl = if (json.isNull("imageUrl")) null else json.getString("imageUrl"),
    caption = json.optString("caption", ""),
    likeCount = json.optInt("likeCount", 0),
    likedByMe = json.optBoolean("likedByMe", false),
    createdAt = Instant.parse(json.getString("createdAt")),
    expiresAt = Instant.parse(json.getString("expiresAt")),
)