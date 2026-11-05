package com.example.cpen321application.model

/**
 * Clothing categories. Follows clothingItem model in backend.
 */
enum class ClothingCategory(val apiValue: String, val label: String) {
    Top("top", "Tops"),
    Bottom("bottom", "Bottoms"),
    Outerwear("outerwear", "Outerwear"),
    Dress("dress", "Dresses"),
    Shoes("shoes", "Shoes"),
    Accessory("accessory", "Accessories");

    companion object {
        fun fromApiValue(value: String): ClothingCategory? = entries.firstOrNull { it.apiValue == value }
    }
}

/** Which side of a clothing item a photo shows. */
enum class PhotoSide(val label: String) {
    Front("front"),
    Back("back"),
}

data class ClothingItem(
    val id: String,
    val name: String,
    val category: ClothingCategory,
    val color: String,
    val style: String,
    val tags: List<String> = emptyList(),
    val isClean: Boolean = true,
    val imageUrl: String? = null,
    val backImageUrl: String? = null,   // new
)

/** Items in [category], defaults to every item when [category] is null. */
fun List<ClothingItem>.filterByCategory(category: ClothingCategory?): List<ClothingItem> =
    if (category == null) this else filter { it.category == category }

