package com.example.cpen321application.model

import dev.romainguy.kotlin.math.Float3

// How high a garment's top edge sits, as a fraction of the avatar's height: the base of the neck for tops
// and outerwear, the waist for bottoms.
private const val TOP_EDGE_HEIGHT = 0.95f
private const val BOTTOM_EDGE_HEIGHT = 0.62f

// How much wider than the body a garment is made, so the avatar doesn't show through it.
private const val GARMENT_EASE = 1.15f

/** How much the user can shrink or enlarge a garment on the avatar. */
val GarmentSizeRange = 0.7f..1.3f

/** A model's bounding box, as the 3D viewer reports it. */
data class Bounds(val center: Float3, val halfExtent: Float3) {
    val top get() = center.y + halfExtent.y
    val bottom get() = center.y - halfExtent.y
    val height get() = halfExtent.y * 2
    val width get() = halfExtent.x * 2
}

data class GarmentPlacement(val scale: Float3, val position: Float3)

/** How wide the avatar's body is where a garment sits: the hips for bottoms, the chest otherwise. */
fun bodyWidth(category: ClothingCategory, measurements: AvatarMeasurements, avatar: Bounds): Float {
    val across = if (category == ClothingCategory.Bottom) BodyMeasurement.Hips else BodyMeasurement.Chest
    return measurements[across].toFloat() / measurements[BodyMeasurement.Height] * avatar.height
}

/**
 * Where to put a garment on the avatar. Garment models come in different units, sizes and origins, so the
 * garment is scaled for the avatar's height, then moved so its top edge is at the neck or waist and it is
 * centred on the body. A garment narrower than [bodyWidth] is widened to fit around it. [size] is the
 * user's adjustment; the top edge stays put as it changes.
 */
fun placeGarment(
    category: ClothingCategory,
    garment: Bounds,
    avatar: Bounds,
    bodyWidth: Float = 0f,
    size: Float = 1f,
): GarmentPlacement {
    val edge = avatar.bottom + avatar.height * (if (category == ClothingCategory.Bottom) BOTTOM_EDGE_HEIGHT else TOP_EDGE_HEIGHT)
    // Scaled about the garment's own origin, which sits at the feet of the body it was modelled on.
    val scale = (edge - avatar.bottom) / garment.top * size
    val across = scale * maxOf(1f, bodyWidth * GARMENT_EASE * size / (garment.width * scale))
    return GarmentPlacement(
        scale = Float3(across, scale, across),
        position = Float3(
            x = avatar.center.x - garment.center.x * across,
            y = edge - garment.top * scale,
            z = avatar.center.z - garment.center.z * across,
        ),
    )
}
