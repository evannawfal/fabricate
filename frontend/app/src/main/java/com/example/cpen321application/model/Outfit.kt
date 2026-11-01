package com.example.cpen321application.model

/** A saved outfit, mirrors OutfitResponse in backend. Items removed from the closet are still listed. */
data class Outfit(
    val id: String,
    val name: String,
    val items: List<ClothingItem>,
    val occasion: String = "",
)
