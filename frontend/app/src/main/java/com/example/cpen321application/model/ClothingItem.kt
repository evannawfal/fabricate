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

/** Whether the back-end can build 3D models for items in this category. */
val ClothingCategory.supportsModel: Boolean
    get() = this == ClothingCategory.Top || this == ClothingCategory.Bottom || this == ClothingCategory.Outerwear

/** Which side of a clothing item a photo shows. */
enum class PhotoSide(val label: String) {
    Front("front"),
    Back("back"),
}

data class Point3D(val x: Float, val y: Float, val z: Float)

data class GarmentReferencePoints(
    val type: String,
    val points: Map<String, Point3D> = emptyMap(),
    val boundingBoxCenterZ: Float = 0f,
) {
    val leftShoulder: Point3D? get() = points["leftShoulder"]
    val rightShoulder: Point3D? get() = points["rightShoulder"]
    val bottomHem: Point3D? get() = points["bottomHem"]

    val topHemLeft: Point3D? get() = points["topHemLeft"]
    val topHemRight: Point3D? get() = points["topHemRight"]
    val bottomHemLeft: Point3D? get() = points["bottomHemLeft"]
    val bottomHemRight: Point3D? get() = points["bottomHemRight"]
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
    val hasModel: Boolean = false,
    val referencePoints: GarmentReferencePoints? = null,
)

/** Items in [category], defaults to every item when [category] is null. */
fun List<ClothingItem>.filterByCategory(category: ClothingCategory?): List<ClothingItem> =
    if (category == null) this else filter { it.category == category }

