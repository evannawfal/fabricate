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

/**
 * How wide the avatar's body is where a garment sits:
 * - Tops and Outerwear → shoulder width (from user measurements)
 * - Bottoms            → hip width (from user measurements)
 */
fun bodyWidth(category: ClothingCategory, measurements: AvatarMeasurements, avatar: Bounds): Float {
    val across = when (category) {
        ClothingCategory.Bottom -> BodyMeasurement.Hips
        else -> BodyMeasurement.Shoulders   // tops and outerwear scale to shoulder width
    }
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

/**
 * Sizes and positions a garment on the avatar using reference points from fitViewer.html.
 * Returns null if reference points are missing or invalid, so the caller can fall back to placeGarment.
 */
fun placeGarmentWithReferencePoints(
    category: ClothingCategory,
    referencePoints: GarmentReferencePoints,
    measurements: AvatarMeasurements,
    isPants: Boolean = false,
    size: Float = 1f,
): GarmentPlacement? {
    val h = measurements[BodyMeasurement.Height] / 100f
    val shoulderWidth = measurements[BodyMeasurement.Shoulders] / 100f
    val hipWidth = measurements[BodyMeasurement.Hips] / 100f

    if (category == ClothingCategory.Top || category == ClothingCategory.Outerwear) {
        val l = referencePoints.leftShoulder ?: return null
        val r = referencePoints.rightShoulder ?: return null
        val hem = referencePoints.bottomHem ?: return null

        val gDist = kotlin.math.abs(l.x - r.x)
        if (gDist < 1e-4f) return null

        val armRadius = 0.30f * h * 0.072f
        val shoulderY = (h * 0.80f * 0.99f) + armRadius
        val waistY = h * 0.65f
        val torsoBottomY = waistY - h * 0.125f
        val hemTargetY = torsoBottomY - 0.02f * h

        val ease = 1.05f
        val targetDist = shoulderWidth * ease * size
        val sx = targetDist / gDist
        val midY = (l.y + r.y) / 2f
        val span = midY - hem.y
        val sy = if (span > 1e-4f) ((shoulderY - hemTargetY) / span) * size else sx

        val refPoint = Float3((l.x + r.x) / 2f, midY, referencePoints.boundingBoxCenterZ)
        val targetPoint = Float3(0f, shoulderY, 0f)

        return GarmentPlacement(
            scale = Float3(sx, sy, sx),
            position = Float3(
                x = targetPoint.x - refPoint.x * sx,
                y = targetPoint.y - refPoint.y * sy,
                z = targetPoint.z - refPoint.z * sx,
            ),
        )
    } else if (category == ClothingCategory.Bottom) {
        val tl = referencePoints.topHemLeft ?: return null
        val tr = referencePoints.topHemRight ?: return null
        val hl = referencePoints.bottomHemLeft ?: return null
        val hr = referencePoints.bottomHemRight ?: return null

        val gTopW = kotlin.math.abs(tl.x - tr.x)
        if (gTopW < 1e-4f) return null

        val ease = 0.90f
        val targetW = hipWidth * ease * size
        val sx = targetW / gTopW

        val topY = (tl.y + tr.y) / 2f
        val hemMidY = (hl.y + hr.y) / 2f
        val span = topY - hemMidY

        val pantsLift = 0.05f
        val hipY = (h * 0.65f - h * 0.125f * 0.80f) + pantsLift
        val legLength = 0.48f * h
        val upperLegLength = legLength * 0.53f
        val lowerLegLength = legLength - upperLegLength
        val kneeY = (hipY - pantsLift) - upperLegLength * 0.979386f
        val ankleY = kneeY - lowerLegLength * 0.979386f
        val hemTargetY = if (isPants) ankleY else kneeY
        val sy = if (span > 1e-4f) ((hipY - hemTargetY) / span) * size else sx

        val refPoint = Float3((tl.x + tr.x) / 2f, topY, referencePoints.boundingBoxCenterZ)
        val targetPoint = Float3(0f, hipY, 0f)

        return GarmentPlacement(
            scale = Float3(sx, sy, sx),
            position = Float3(
                x = targetPoint.x - refPoint.x * sx,
                y = targetPoint.y - refPoint.y * sy,
                z = targetPoint.z - refPoint.z * sx,
            ),
        )
    }
    return null
}


