package com.example.cpen321application.data

import com.example.cpen321application.model.ClothingCategory
import com.example.cpen321application.model.ClothingItem

// Photos are found in assets/closet/ and free to use. Temporary and will be replaced once DB can support integration.
private fun photo(name: String) = "file:///android_asset/closet/$name.jpg"

object MockCloset {
    val items: List<ClothingItem> = listOf(
        ClothingItem(
            "1", "White Crew Tee", ClothingCategory.Top, "white", "casual",
            tags = listOf("cotton", "basics"),
            imageUrl = photo("white_tee"),
        ),
        ClothingItem(
            "2", "Black Tee", ClothingCategory.Top, "black", "casual",
            tags = listOf("cotton", "basics"),
            isClean = false,
            imageUrl = photo("black_tee"),
        ),
        ClothingItem(
            "3", "Cable-Knit Sweater", ClothingCategory.Top, "beige", "cozy",
            tags = listOf("knit", "winter"),
            imageUrl = photo("knit_sweater"),
        ),
        ClothingItem(
            "4", "Light Wash Jeans", ClothingCategory.Bottom, "blue", "casual",
            tags = listOf("denim", "everyday"),
            imageUrl = photo("light_jeans"),
        ),
        ClothingItem(
            "5", "Ripped Denim Shorts", ClothingCategory.Bottom, "blue", "casual",
            tags = listOf("denim", "summer"),
            imageUrl = photo("denim_shorts"),
        ),
        ClothingItem(
            "6", "Dark Denim Jacket", ClothingCategory.Outerwear, "navy", "casual",
            tags = listOf("denim", "spring"),
            imageUrl = photo("denim_jacket"),
        ),
        ClothingItem(
            "7", "Black Puffer Coat", ClothingCategory.Outerwear, "black", "streetwear",
            tags = listOf("winter", "warm"),
            imageUrl = photo("black_puffer"),
        ),
        ClothingItem(
            "8", "White Maxi Dress", ClothingCategory.Dress, "white", "formal",
            tags = listOf("special occasion"),
            imageUrl = photo("white_dress"),
        ),
        ClothingItem(
            "9", "Running Sneakers", ClothingCategory.Shoes, "grey", "sporty",
            tags = listOf("gym", "everyday"),
            imageUrl = photo("running_sneakers"),
        ),
        ClothingItem(
            "10", "Suede Boots", ClothingCategory.Shoes, "brown", "cozy",
            tags = listOf("winter"),
            imageUrl = photo("suede_boots"),
        ),
        ClothingItem(
            "11", "Brown Brogues", ClothingCategory.Shoes, "brown", "smart casual",
            tags = listOf("work", "leather"),
            imageUrl = photo("brown_brogues"),
        ),
        ClothingItem(
            "12", "White Handbag", ClothingCategory.Accessory, "white", "elegant",
            tags = listOf("everyday"),
            imageUrl = photo("white_handbag"),
        ),
    )
}
