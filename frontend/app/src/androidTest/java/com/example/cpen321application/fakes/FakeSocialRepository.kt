package com.example.cpen321application.fakes

import com.example.cpen321application.data.SocialRepository
import com.example.cpen321application.model.SocialPost
import java.time.Instant
import java.time.temporal.ChronoUnit

class FakeSocialRepository(
    private val userId: String = "me",
    var posts: List<SocialPost> = emptyList(),
) : SocialRepository {
    override suspend fun currentUserId() = userId

    override suspend fun listPosts() = posts

    override suspend fun createPost(photo: ByteArray, caption: String, tzOffsetMinutes: Int): SocialPost {
        val now = Instant.now()
        val post = SocialPost(
            id = "post-${posts.size + 1}",
            authorId = userId,
            authorName = "Sam Lee",
            imageUrl = null,
            caption = caption,
            likeCount = 0,
            likedByMe = false,
            createdAt = now,
            expiresAt = now.plus(1, ChronoUnit.DAYS),
        )
        posts = listOf(post) + posts
        return post
    }

    override suspend fun likePost(id: String) = updatePost(id) { it.copy(likeCount = it.likeCount + 1, likedByMe = true) }

    override suspend fun unlikePost(id: String) = updatePost(id) { it.copy(likeCount = it.likeCount - 1, likedByMe = false) }

    override suspend fun deletePost(id: String) {
        posts = posts.filterNot { it.id == id }
    }

    private fun updatePost(id: String, change: (SocialPost) -> SocialPost): SocialPost {
        val updated = change(posts.first { it.id == id })
        posts = posts.map { if (it.id == id) updated else it }
        return updated
    }
}
