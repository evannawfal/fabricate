package com.example.cpen321application.network

import com.example.cpen321application.BuildConfig
import com.example.cpen321application.data.Post
import com.example.cpen321application.data.PostsRepository
import org.json.JSONObject

/** Outfit-of-the-day posts on the back-end (`/posts`). */
class BackendPostsRepository(
    tokenProvider: suspend () -> String?,
    onUnauthorized: suspend () -> Unit = {},
    baseUrl: String = BuildConfig.API_BASE_URL,
) : PostsRepository {
    private val api = JsonApi(tokenProvider, onUnauthorized, baseUrl)

    override suspend fun listPosts(): List<Post> = api.send("/posts") { json ->
        val posts = json.getJSONArray("posts")
        (0 until posts.length()).map { parsePost(posts.getJSONObject(it)) }
    }

    override suspend fun postOutfit(outfitId: String): Post =
        api.send("/posts", JSONObject().put("outfitId", outfitId), parse = ::parsePost)

    override suspend fun deletePost(id: String) {
        api.send("/posts/$id", JSONObject(), "DELETE") {}
    }
}

private fun parsePost(json: JSONObject): Post {
    val items = json.getJSONArray("items")
    return Post(
        id = json.getString("id"),
        authorName = json.getJSONObject("author").getString("name"),
        isOwn = json.getBoolean("isOwn"),
        outfitName = json.getString("name"),
        items = (0 until items.length()).mapNotNull { parseClothingItem(items.getJSONObject(it)) },
    )
}
