package com.example.cpen321application.model

/** A saved outfit, mirrors OutfitResponse in backend. Items removed from the closet are still listed. */
data class Outfit(
    val id: String,
    val name: String,
    val items: List<ClothingItem>,
    val occasion: String = "",
)

/** Most items of this category one outfit can have. Mirrors OUTFIT_CATEGORY_LIMITS in the back-end. */
val ClothingCategory.outfitLimit: Int
    get() = when (this) {
        ClothingCategory.Top -> 2
        ClothingCategory.Accessory -> 3
        else -> 1
    }

/** [outfitLimit] in words, e.g. "2 tops", to finish "An outfit can have at most ...". */
val ClothingCategory.outfitLimitPhrase: String
    get() = when (this) {
        ClothingCategory.Top -> "2 tops"
        ClothingCategory.Bottom -> "1 bottom"
        ClothingCategory.Outerwear -> "1 outerwear piece"
        ClothingCategory.Dress -> "1 dress"
        ClothingCategory.Shoes -> "1 pair of shoes"
        ClothingCategory.Accessory -> "3 accessories"
    }

enum class OutfitOccasion(val apiValue: String, val label: String) {
    Casual("casual", "Casual"),
    Work("work", "Work"),
    Formal("formal", "Formal"),
    Workout("workout", "Workout"),
}

data class Coordinates(val latitude: Double, val longitude: Double)

data class Weather(val temperatureC: Int, val condition: String, val description: String)

/** An outfit picked by the back-end. It isn't saved until the user saves it. */
data class GeneratedOutfit(
    val name: String,
    val occasion: OutfitOccasion,
    val items: List<ClothingItem>,
    val weather: Weather?,
)
