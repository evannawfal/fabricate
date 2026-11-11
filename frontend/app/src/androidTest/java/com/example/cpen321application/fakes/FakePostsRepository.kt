package com.example.cpen321application.fakes

import com.example.cpen321application.data.ApiException
import com.example.cpen321application.data.Post
import com.example.cpen321application.data.PostsRepository

/** Posts held in memory, standing in for the back-end in UI tests. Each error, when set, is thrown by its call. */
class FakePostsRepository(initialPosts: List<Post> = emptyList()) : PostsRepository {
    val posts = initialPosts.toMutableList()
    val postedOutfitIds = mutableListOf<String>()

    var listError: String? = null
    var postError: String? = null
    var deleteError: String? = null

    override suspend fun listPosts(): List<Post> {
        listError?.let { throw ApiException(it) }
        return posts.toList()
    }

    override suspend fun postOutfit(outfitId: String): Post {
        postError?.let { throw ApiException(it) }
        postedOutfitIds += outfitId
        val post = Post("post-$outfitId", "You", isOwn = true, outfitName = outfitId, items = emptyList())
        posts.removeAll { it.isOwn }
        posts.add(0, post)
        return post
    }

    override suspend fun deletePost(id: String) {
        deleteError?.let { throw ApiException(it) }
        posts.removeAll { it.id == id }
    }
}
