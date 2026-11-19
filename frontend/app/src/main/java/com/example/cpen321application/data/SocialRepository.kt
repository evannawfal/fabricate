package com.example.cpen321application.data

import com.example.cpen321application.model.SocialPost

/** Daily OOTD posts feed and interactions. Failed requests throw [ClothingRepositoryException]. */
interface SocialRepository {
    suspend fun currentUserId(): String?

    suspend fun listPosts(): List<SocialPost>

    suspend fun createPost(photo: ByteArray, caption: String, tzOffsetMinutes: Int): SocialPost

    suspend fun likePost(id: String): SocialPost

    suspend fun unlikePost(id: String): SocialPost

    suspend fun deletePost(id: String)
}