package com.example.cpen321application.model

import dev.romainguy.kotlin.math.Float3

// How high a garment's top edge sits, as a fraction of the avatar's height: the base of the neck for tops
// and outerwear, the waist for bottoms.
private const val TOP_EDGE_HEIGHT = 0.95f
private const val BOTTOM_EDGE_HEIGHT = 0.62f

/** A model's bounding box, as the 3D viewer reports it. */
data class Bounds(val center: Float3, val halfExtent: Float3) {
    val top get() = center.y + halfExtent.y
    val bottom get() = center.y - halfExtent.y
    val height get() = halfExtent.y * 2
}

data class GarmentPlacement(val scale: Float, val position: Float3)

/**
 * Where to put a garment on the avatar. Garment models come in different units, sizes and origins, so the
 * garment is scaled for the avatar's height, then moved so its top edge is at the neck or waist and it is
 * centred on the body.
 */
fun placeGarment(category: ClothingCategory, garment: Bounds, avatar: Bounds): GarmentPlacement {
    val edge = avatar.bottom + avatar.height * (if (category == ClothingCategory.Bottom) BOTTOM_EDGE_HEIGHT else TOP_EDGE_HEIGHT)
    // Scaled about the garment's own origin, which sits at the feet of the body it was modelled on.
    val scale = (edge - avatar.bottom) / garment.top
    return GarmentPlacement(
        scale = scale,
        position = Float3(
            x = avatar.center.x - garment.center.x * scale,
            y = edge - garment.top * scale,
            z = avatar.center.z - garment.center.z * scale,
        ),
    )
}
