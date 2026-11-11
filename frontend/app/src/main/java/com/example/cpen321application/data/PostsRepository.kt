package com.example.cpen321application.data

import com.example.cpen321application.model.ClothingItem

/** An outfit someone posted as their outfit of the day; [isOwn] marks the user's own post. */
data class Post(
    val id: String,
    val authorName: String,
    val isOwn: Boolean,
    val outfitName: String,
    val items: List<ClothingItem>,
)

/** Outfit-of-the-day posts. Failed requests throw [ApiException]. */
interface PostsRepository {
    /** The user's own post and their friends' posts from the last day, newest first. */
    suspend fun listPosts(): List<Post>

    /** Posts one of the user's saved outfits, replacing their previous post. */
    suspend fun postOutfit(outfitId: String): Post

    suspend fun deletePost(id: String)
}
