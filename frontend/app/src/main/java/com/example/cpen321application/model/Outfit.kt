package com.example.cpen321application.model

/** A saved outfit, mirrors OutfitResponse in backend. Items removed from the closet are still listed. */
data class Outfit(
    val id: String,
    val name: String,
    val items: List<ClothingItem>,
    val occasion: String = "",
)

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
