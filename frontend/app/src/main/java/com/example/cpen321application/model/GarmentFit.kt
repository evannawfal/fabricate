package com.example.cpen321application.model

import dev.romainguy.kotlin.math.Float3
import kotlin.math.abs

// Fallback bounding-box constants
private const val TOP_EDGE_HEIGHT = 0.95f
private const val BOTTOM_EDGE_HEIGHT = 0.62f
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

data class GarmentPlacement(
    val scale: Float3,
    val position: Float3,
    val hemY: Float? = null,
    val hemTargetY: Float? = null,
) {
    /** Transforms a garment-local reference point into avatar world coordinates (matches JS worldPoint). */
    fun worldPoint(p: Point3D): Float3 = Float3(
        x = position.x + p.x * scale.x,
        y = position.y + p.y * scale.y,
        z = position.z + p.z * scale.z,
    )
}

/**
 * How wide the avatar's body is where a garment sits:
 * - Tops and Outerwear: shoulder width (from user measurements)
 * - Bottoms           : hip width (from user measurements)
 */
fun bodyWidth(category: ClothingCategory, measurements: AvatarMeasurements, avatar: Bounds): Float {
    val across = when (category) {
        ClothingCategory.Bottom -> BodyMeasurement.Hips
        else -> BodyMeasurement.Shoulders
    }
    return measurements[across].toFloat() / measurements[BodyMeasurement.Height] * avatar.height
}

/**
 * Fallback placement using bounding boxes when reference points are unavailable.
 */
fun placeGarment(
    category: ClothingCategory,
    garment: Bounds,
    avatar: Bounds,
    bodyWidth: Float = 0f,
    size: Float = 1f,
): GarmentPlacement {
    val edge = avatar.bottom + avatar.height * (if (category == ClothingCategory.Bottom) BOTTOM_EDGE_HEIGHT else TOP_EDGE_HEIGHT)
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

// Avatar SDF proportions & garment fitting constants (matching TS fitSlot)
private const val ARM_RADIUS_RATIO = 0.30f * 0.072f
private const val SHOULDER_Y_RATIO = 0.80f * 0.99f
private const val WAIST_Y_RATIO = 0.65f
private const val WAIST_HALF_HEIGHT_RATIO = 0.125f
private const val HIP_JOINT_DROP_FACTOR = 0.80f
private const val HEM_DROP_RATIO = 0.02f
private const val TOP_EASE = 1.05f
private const val BOTTOM_EASE = 0.95f
private const val PANTS_LIFT = 0.05f
private const val LEG_LENGTH_RATIO = 0.48f
private const val UPPER_LEG_FRACTION = 0.53f
private const val LEG_COS = 0.979386f
private const val MIN_SPAN = 1e-6f
private const val CM_PER_M = 100f

// Fallback arm & leg ratios (only used if sub-mesh bounds aren't available)
private const val UPPER_ARM_LENGTH_RATIO = 0.17f
private const val LOWER_ARM_LENGTH_RATIO = 0.15f
private const val ARM_DROP_COS = 0.965926f
private const val ARM_OUT_SIN = 0.258819f
private const val HIP_OFFSET_X_RATIO = 0.28f
private const val LEG_SIN = 0.202000f

// Exact constants from TS updateBodyAdjustments
private const val SLEEVE_INSET = -0.05f
private const val FEET_INSET = -0.05f
private const val DEFAULT_FOOT_DROP = 0.02f

private val PANTS_REGEX = Regex("(pant|jean|trouser|legging)", RegexOption.IGNORE_CASE)
private val SHORT_SLEEVE_REGEX = Regex("(t[-_ ]?shirt|tee|tank)", RegexOption.IGNORE_CASE)

fun isPantsItem(item: ClothingItem?): Boolean =
    item?.name?.contains(PANTS_REGEX) == true

fun isShortSleeveItem(item: ClothingItem?): Boolean {
    val explicit = item?.referencePoints?.sleeve
    if (explicit != null) return explicit.equals("short", ignoreCase = true)
    return item?.name?.contains(SHORT_SLEEVE_REGEX) == true
}

fun placeGarmentWithReferencePoints(
    category: ClothingCategory,
    referencePoints: GarmentReferencePoints,
    measurements: AvatarMeasurements,
    isPants: Boolean = false,
    size: Float = 1f,
): GarmentPlacement? = when (category) {
    ClothingCategory.Top, ClothingCategory.Outerwear ->
        placeTop(referencePoints, measurements, size)
    ClothingCategory.Bottom ->
        placeBottom(referencePoints, measurements, isPants, size)
    else -> null
}

private fun placeTop(
    referencePoints: GarmentReferencePoints,
    measurements: AvatarMeasurements,
    size: Float,
): GarmentPlacement? {
    val l = referencePoints.leftShoulder ?: return null
    val r = referencePoints.rightShoulder ?: return null
    val hem = referencePoints.bottomHem ?: return null
    val gDist = abs(l.x - r.x)
    if (gDist < MIN_SPAN) return null

    val h = measurements[BodyMeasurement.Height] / CM_PER_M
    val shoulderWidth = measurements[BodyMeasurement.Shoulders] / CM_PER_M
    val shoulderY = h * SHOULDER_Y_RATIO + h * ARM_RADIUS_RATIO
    val torsoBottomY = h * WAIST_Y_RATIO - h * WAIST_HALF_HEIGHT_RATIO
    val hemTargetY = torsoBottomY - HEM_DROP_RATIO * h

    val sx = shoulderWidth * TOP_EASE * size / gDist
    val midY = (l.y + r.y) / 2f
    val span = midY - hem.y
    val sy = if (span > MIN_SPAN) ((shoulderY - hemTargetY) / span) * size else sx
    val actualHemY = shoulderY - sy * span

    return buildPlacement(
        scale = Float3(sx, sy, sx),
        ref = Float3((l.x + r.x) / 2f, midY, referencePoints.boundingBoxCenterZ),
        target = Float3(0f, shoulderY, 0f),
        hemY = actualHemY,
        hemTargetY = hemTargetY,
    )
}

private fun placeBottom(
    referencePoints: GarmentReferencePoints,
    measurements: AvatarMeasurements,
    isPants: Boolean,
    size: Float,
): GarmentPlacement? {
    val tl = referencePoints.topHemLeft ?: return null
    val tr = referencePoints.topHemRight ?: return null
    val hl = referencePoints.bottomHemLeft ?: return null
    val hr = referencePoints.bottomHemRight ?: return null
    val gTopW = abs(tl.x - tr.x)
    if (gTopW < MIN_SPAN) return null

    val h = measurements[BodyMeasurement.Height] / CM_PER_M
    val hipWidth = measurements[BodyMeasurement.Hips] / CM_PER_M
    val hipJointY = hipJointY(h)
    val hipY = hipJointY + PANTS_LIFT
    val hemTargetY = legHemTargetY(h, hipJointY, isPants)

    val sx = hipWidth * BOTTOM_EASE * size / gTopW
    val topY = (tl.y + tr.y) / 2f
    val span = topY - (hl.y + hr.y) / 2f
    val sy = if (span > MIN_SPAN) ((hipY - hemTargetY) / span) * size else sx
    val actualHemY = hipY - sy * span

    return buildPlacement(
        scale = Float3(sx, sy, sx),
        ref = Float3((tl.x + tr.x) / 2f, topY, referencePoints.boundingBoxCenterZ),
        target = Float3(0f, hipY, 0f),
        hemY = actualHemY,
        hemTargetY = hemTargetY,
    )
}

private fun hipJointY(h: Float): Float =
    h * WAIST_Y_RATIO - h * WAIST_HALF_HEIGHT_RATIO * HIP_JOINT_DROP_FACTOR

private fun legHemTargetY(h: Float, hipJointY: Float, isPants: Boolean): Float {
    val legLength = LEG_LENGTH_RATIO * h
    val upperLegLength = legLength * UPPER_LEG_FRACTION
    val lowerLegLength = legLength - upperLegLength
    val kneeY = hipJointY - upperLegLength * LEG_COS
    return if (isPants) kneeY - lowerLegLength * LEG_COS else kneeY
}

private fun buildPlacement(
    scale: Float3,
    ref: Float3,
    target: Float3,
    hemY: Float? = null,
    hemTargetY: Float? = null,
) = GarmentPlacement(
    scale = scale,
    position = Float3(
        x = target.x - ref.x * scale.x,
        y = target.y - ref.y * scale.y,
        z = target.z - ref.z * scale.z,
    ),
    hemY = hemY,
    hemTargetY = hemTargetY,
)

// Automatic Body Part Hiding & Relocation

val MOVABLE_BODY_PARTS = listOf(
    "leftUpperArm", "leftForeArm", "leftHand",
    "rightUpperArm", "rightForeArm", "rightHand",
    "leftLowerLeg", "rightLowerLeg",
    "leftFoot", "rightFoot",
)

data class SideJoints(
    val elbow: Float3,
    val wrist: Float3,
    val ankle: Float3,
    val footCenter: Float3,
)

data class AvatarJoints(
    val left: SideJoints,
    val right: SideJoints,
)

data class BodyAdjustmentResult(
    val offsets: Map<String, Float3>,
    val autoHiddenParts: Set<String>,
)

/**
 * Extracts exact joint coordinates from the loaded avatar's sub-mesh bounding boxes
 * (`partBounds`, keyed by mesh name like `"leftForeArm"`, `"leftHand"`, `"leftFoot"`),
 * falling back to analytic proportions from [measurements] if any sub-mesh is absent.
 */
fun extractAvatarJoints(
    measurements: AvatarMeasurements,
    partBounds: Map<String, Bounds>,
): AvatarJoints {
    val fallback = computeAnalyticJoints(measurements)

    fun extractSide(side: String, fb: SideJoints): SideJoints {
        val upperArm = partBounds["${side}UpperArm"]
        val foreArm = partBounds["${side}ForeArm"]
        val hand = partBounds["${side}Hand"]
        val lowerLeg = partBounds["${side}LowerLeg"]
        val foot = partBounds["${side}Foot"]

        // Elbow is the junction between upperArm and foreArm
        val elbowX = foreArm?.center?.x ?: upperArm?.center?.x ?: fb.elbow.x
        val elbowY = when {
            upperArm != null && foreArm != null -> (upperArm.bottom + foreArm.top) / 2f
            foreArm != null -> foreArm.top
            upperArm != null -> upperArm.bottom
            else -> fb.elbow.y
        }

        // Wrist is the junction between foreArm and hand
        val wristX = hand?.center?.x ?: foreArm?.center?.x ?: fb.wrist.x
        val wristY = when {
            foreArm != null && hand != null -> (foreArm.bottom + hand.top) / 2f
            hand != null -> hand.top
            foreArm != null -> foreArm.bottom
            else -> fb.wrist.y
        }

        // Ankle is the top of the foot / bottom of the lower leg; footCenter is the X center of the foot
        val footCenterX = foot?.center?.x ?: lowerLeg?.center?.x ?: fb.footCenter.x
        val ankleY = when {
            lowerLeg != null && foot != null -> (lowerLeg.bottom + foot.top) / 2f
            foot != null -> foot.top
            lowerLeg != null -> lowerLeg.bottom
            else -> fb.ankle.y
        }

        return SideJoints(
            elbow = Float3(elbowX, elbowY, 0f),
            wrist = Float3(wristX, wristY, 0f),
            ankle = Float3(footCenterX, ankleY, 0f),
            footCenter = Float3(footCenterX, ankleY, 0f),
        )
    }

    return AvatarJoints(
        left = extractSide("left", fallback.left),
        right = extractSide("right", fallback.right),
    )
}

private fun computeAnalyticJoints(measurements: AvatarMeasurements): AvatarJoints {
    val h = measurements[BodyMeasurement.Height] / CM_PER_M
    val shoulderHalfW = (measurements[BodyMeasurement.Shoulders] / CM_PER_M) / 2f
    val hipHalfW = (measurements[BodyMeasurement.Hips] / CM_PER_M) * HIP_OFFSET_X_RATIO

    val shoulderJointY = h * SHOULDER_Y_RATIO
    val upperArmLen = h * UPPER_ARM_LENGTH_RATIO
    val lowerArmLen = h * LOWER_ARM_LENGTH_RATIO

    val hipY = hipJointY(h)
    val legLen = LEG_LENGTH_RATIO * h
    val ankleY = hipY - legLen * LEG_COS
    val ankleX = hipHalfW + legLen * LEG_SIN

    fun sideJoints(sign: Float): SideJoints {
        val elbowX = sign * (shoulderHalfW + upperArmLen * ARM_OUT_SIN)
        val elbowY = shoulderJointY - upperArmLen * ARM_DROP_COS
        val wristX = elbowX + sign * (lowerArmLen * ARM_OUT_SIN)
        val wristY = elbowY - lowerArmLen * ARM_DROP_COS
        val footX = sign * ankleX
        return SideJoints(
            elbow = Float3(elbowX, elbowY, 0f),
            wrist = Float3(wristX, wristY, 0f),
            ankle = Float3(footX, ankleY, 0f),
            footCenter = Float3(footX, ankleY, 0f),
        )
    }

    return AvatarJoints(
        left = sideJoints(-1f),
        right = sideJoints(1f),
    )
}

// Matches JS: const bySide = (a, b) => (a.x <= b.x ? { left: a, right: b } : { left: b, right: a });
private fun bySide(a: Float3, b: Float3): Pair<Float3, Float3> =
    if (a.x <= b.x) a to b else b to a

/**
 * Automatically hides body parts covered by [topItem] / [bottomItem] and relocates
 * exposed extremities (hands, forearms, lower legs, feet) to the garment openings.
 * Matches JS `updateBodyAdjustments()`.
 */
fun computeBodyAdjustments(
    measurements: AvatarMeasurements,
    partBounds: Map<String, Bounds>,
    topItem: ClothingItem?,
    topPlacement: GarmentPlacement?,
    bottomItem: ClothingItem?,
    bottomPlacement: GarmentPlacement?,
    footDrop: Float = DEFAULT_FOOT_DROP,
): BodyAdjustmentResult {
    val joints = extractAvatarJoints(measurements, partBounds)
    val offsets = mutableMapOf<String, Float3>()
    val autoHidden = mutableSetOf<String>()

    applyBottomAdjustments(bottomItem, bottomPlacement, joints, footDrop, offsets, autoHidden)
    applyTopAdjustments(topItem, topPlacement, joints, offsets, autoHidden)

    return BodyAdjustmentResult(offsets = offsets, autoHiddenParts = autoHidden)
}

private fun applyBottomAdjustments(
    bottomItem: ClothingItem?,
    bottomPlacement: GarmentPlacement?,
    joints: AvatarJoints,
    footDrop: Float,
    offsets: MutableMap<String, Float3>,
    autoHidden: MutableSet<String>,
) {
    val bottomRef = bottomItem?.referencePoints
    if (bottomItem == null || bottomPlacement?.hemY == null) return

    if (isPantsItem(bottomItem) && bottomRef?.bottomHemLeft != null && bottomRef.bottomHemRight != null) {
        val (leftHem, rightHem) = bySide(
            bottomPlacement.worldPoint(bottomRef.bottomHemLeft!!),
            bottomPlacement.worldPoint(bottomRef.bottomHemRight!!),
        )
        listOf("left" to (joints.left to leftHem), "right" to (joints.right to rightHem))
            .forEach { (side, pair) ->
                val (j, hem) = pair
                offsets["${side}Foot"] = Float3(
                    x = hem.x - j.footCenter.x,
                    y = (hem.y - footDrop) - j.ankle.y,
                    z = FEET_INSET,
                )
                autoHidden.add("${side}UpperLeg")
                autoHidden.add("${side}LowerLeg")
            }
    } else if (bottomPlacement.hemTargetY != null) {
        val dy = bottomPlacement.hemY - bottomPlacement.hemTargetY
        for (side in listOf("left", "right")) {
            offsets["${side}LowerLeg"] = Float3(0f, dy, 0f)
            offsets["${side}Foot"] = Float3(0f, dy, 0f)
        }
    }
}

private fun applyTopAdjustments(
    topItem: ClothingItem?,
    topPlacement: GarmentPlacement?,
    joints: AvatarJoints,
    offsets: MutableMap<String, Float3>,
    autoHidden: MutableSet<String>,
) {
    if (topItem == null || topPlacement == null) return
    autoHidden.add("torso")

    val topRef = topItem.referencePoints
    val openLeft = topRef?.sleeveOpeningLeft ?: return
    val openRight = topRef.sleeveOpeningRight ?: return
    val (leftOpen, rightOpen) = bySide(
        topPlacement.worldPoint(openLeft),
        topPlacement.worldPoint(openRight),
    )

    val isShort = isShortSleeveItem(topItem)
    listOf("left" to (joints.left to leftOpen), "right" to (joints.right to rightOpen))
        .forEach { (side, pair) ->
            applySleeveSideAdjustment(side, pair.first, pair.second, isShort, offsets, autoHidden)
        }
}

private fun applySleeveSideAdjustment(
    side: String,
    joint: SideJoints,
    opening: Float3,
    isShort: Boolean,
    offsets: MutableMap<String, Float3>,
    autoHidden: MutableSet<String>,
) {
    autoHidden.add("${side}UpperArm")
    if (isShort) {
        val dx = (opening.x - joint.elbow.x) + if (side == "right") -SLEEVE_INSET else SLEEVE_INSET
        val offset = Float3(dx, opening.y - joint.elbow.y, opening.z)
        offsets["${side}UpperArm"] = offset
        offsets["${side}ForeArm"] = offset
        offsets["${side}Hand"] = offset
    } else {
        autoHidden.add("${side}ForeArm")
        offsets["${side}Hand"] = Float3(
            x = opening.x - joint.wrist.x,
            y = opening.y - joint.wrist.y,
            z = opening.z,
        )
    }
}
