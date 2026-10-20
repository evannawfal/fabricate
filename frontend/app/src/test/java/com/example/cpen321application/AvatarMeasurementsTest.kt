package com.example.cpen321application

import com.example.cpen321application.model.AvatarMeasurements
import com.example.cpen321application.model.BodyMeasurement
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AvatarMeasurementsTest {
    // The ranges POST /avatar accepts, in metres (backend/src/validation/avatar.ts).
    private val backendRanges = mapOf(
        "height" to 1.0..3.0,
        "shoulderWidth" to 0.25..0.60,
        "chestWidth" to 0.10..1.00,
        "waistWidth" to 0.10..2.00,
        "hipWidth" to 0.10..1.50,
    )

    @Test
    fun defaults_useEachMeasurementsDefault() {
        val measurements = AvatarMeasurements()
        BodyMeasurement.entries.forEach { assertEquals(it.defaultCm, measurements[it]) }
    }

    @Test
    fun with_changesOnlyThatMeasurement() {
        val measurements = AvatarMeasurements().with(BodyMeasurement.Height, 180)
        assertEquals(180, measurements[BodyMeasurement.Height])
        assertEquals(BodyMeasurement.Waist.defaultCm, measurements[BodyMeasurement.Waist])
    }

    @Test
    fun with_keepsValuesInsideTheRange() {
        val tooTall = AvatarMeasurements().with(BodyMeasurement.Height, 500)
        val tooShort = AvatarMeasurements().with(BodyMeasurement.Height, 10)
        assertEquals(BodyMeasurement.Height.maxCm, tooTall[BodyMeasurement.Height])
        assertEquals(BodyMeasurement.Height.minCm, tooShort[BodyMeasurement.Height])
    }

    @Test
    fun toApiFields_sendsEveryMeasurementInMetres() {
        val fields = AvatarMeasurements().with(BodyMeasurement.Height, 182).toApiFields()
        assertEquals(backendRanges.keys, fields.keys)
        assertEquals(1.82, fields.getValue("height"), 1e-9)
    }

    @Test
    fun sliderRanges_stayInsideWhatTheBackendAccepts() {
        BodyMeasurement.entries.forEach { m ->
            val range = backendRanges.getValue(m.apiName)
            listOf(m.minCm, m.defaultCm, m.maxCm).forEach { cm ->
                assertTrue("${m.apiName} $cm cm", cm / 100.0 in range)
            }
            assertTrue(m.defaultCm in m.minCm..m.maxCm)
        }
    }
}
