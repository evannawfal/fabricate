package com.example.cpen321application.model

import java.time.Instant

/** A daily Outfit of the Day (OOTD) post, mirrors PostResponse in backend. */
data class SocialPost(
    val id: String,
    val authorId: String,
    val authorName: String,
    val imageUrl: String?,
    val caption: String,
    val likeCount: Int,
    val likedByMe: Boolean,
    val createdAt: Instant,
    val expiresAt: Instant,
)