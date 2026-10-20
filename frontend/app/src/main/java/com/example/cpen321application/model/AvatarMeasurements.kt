package com.example.cpen321application.model

import androidx.annotation.StringRes
import com.example.cpen321application.R

// Slider ranges in centimetres. They stay inside the ranges POST /avatar accepts,
// and the defaults are the generator's example body.
private const val HEIGHT_MIN_CM = 140
private const val HEIGHT_MAX_CM = 210
private const val HEIGHT_DEFAULT_CM = 175
private const val SHOULDERS_MIN_CM = 30
private const val SHOULDERS_MAX_CM = 55
private const val SHOULDERS_DEFAULT_CM = 40
private const val CHEST_MIN_CM = 25
private const val CHEST_MAX_CM = 50
private const val CHEST_DEFAULT_CM = 35
private const val WAIST_MIN_CM = 20
private const val WAIST_MAX_CM = 50
private const val WAIST_DEFAULT_CM = 30
private const val HIPS_MIN_CM = 25
private const val HIPS_MAX_CM = 50
private const val HIPS_DEFAULT_CM = 32

private const val CM_PER_METER = 100.0

/** A body measurement the avatar generator takes. [apiName] is its field in POST /avatar. */
enum class BodyMeasurement(
    @StringRes val labelRes: Int,
    val apiName: String,
    val minCm: Int,
    val maxCm: Int,
    val defaultCm: Int,
) {
    Height(R.string.avatar_height, "height", HEIGHT_MIN_CM, HEIGHT_MAX_CM, HEIGHT_DEFAULT_CM),
    Shoulders(R.string.avatar_shoulders, "shoulderWidth", SHOULDERS_MIN_CM, SHOULDERS_MAX_CM, SHOULDERS_DEFAULT_CM),
    Chest(R.string.avatar_chest, "chestWidth", CHEST_MIN_CM, CHEST_MAX_CM, CHEST_DEFAULT_CM),
    Waist(R.string.avatar_waist, "waistWidth", WAIST_MIN_CM, WAIST_MAX_CM, WAIST_DEFAULT_CM),
    Hips(R.string.avatar_hips, "hipWidth", HIPS_MIN_CM, HIPS_MAX_CM, HIPS_DEFAULT_CM),
}

/** The avatar's body measurements in whole centimetres, one per [BodyMeasurement]. */
data class AvatarMeasurements(
    val centimeters: Map<BodyMeasurement, Int> = BodyMeasurement.entries.associateWith { it.defaultCm },
) {
    operator fun get(measurement: BodyMeasurement): Int = centimeters[measurement] ?: measurement.defaultCm

    /** A copy with [measurement] set to [cm], kept inside its range. */
    fun with(measurement: BodyMeasurement, cm: Int): AvatarMeasurements =
        AvatarMeasurements(centimeters + (measurement to cm.coerceIn(measurement.minCm, measurement.maxCm)))

    /** The request body for POST /avatar: each measurement in metres, keyed by its API name. */
    fun toApiFields(): Map<String, Double> =
        BodyMeasurement.entries.associate { it.apiName to get(it) / CM_PER_METER }
}
