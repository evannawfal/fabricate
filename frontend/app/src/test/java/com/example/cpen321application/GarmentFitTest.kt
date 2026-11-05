package com.example.cpen321application

import com.example.cpen321application.model.AvatarMeasurements
import com.example.cpen321application.model.BodyMeasurement
import com.example.cpen321application.model.Bounds
import com.example.cpen321application.model.ClothingCategory
import com.example.cpen321application.model.bodyWidth
import com.example.cpen321application.model.placeGarment
import dev.romainguy.kotlin.math.Float3
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

// Bounds are as the 3D viewer reported them for the default avatar and the base meshes in
// backend/src/garment/baseMeshes/.
class GarmentFitTest {
    private val avatar = Bounds(center = Float3(0f, 0.2f, 0f), halfExtent = Float3(0.4f, 0.7f, 0.15f))
    private val neck = avatar.bottom + avatar.height * 0.95f
    private val waist = avatar.bottom + avatar.height * 0.62f

    private val tShirtMetres = Bounds(Float3(0.02f, 1.277f, -0.123f), Float3(0.324f, 0.365f, 0.276f))
    private val shirtCentimetres = Bounds(Float3(-0.01f, 129.43f, -0.03f), Float3(57.35f, 38.87f, 15.6f))
    private val pantsMillimetres = Bounds(Float3(-4.87f, 1099.8f, 7.74f), Float3(373.9f, 904.3f, 206f))

    private val wideHips = AvatarMeasurements().with(BodyMeasurement.Hips, 45)

    private fun placedTop(category: ClothingCategory, garment: Bounds): Float {
        val placement = placeGarment(category, garment, avatar)
        return placement.position.y + garment.top * placement.scale.y
    }

    @Test
    fun topsReachTheBaseOfTheNeckWhateverTheirUnits() {
        assertEquals(neck, placedTop(ClothingCategory.Top, tShirtMetres), 0.001f)
        assertEquals(neck, placedTop(ClothingCategory.Outerwear, shirtCentimetres), 0.001f)
    }

    @Test
    fun bottomsReachTheWaistWhateverTheirUnits() {
        assertEquals(waist, placedTop(ClothingCategory.Bottom, pantsMillimetres), 0.001f)
    }

    @Test
    fun pantsEndAboveTheFeet() {
        val placement = placeGarment(ClothingCategory.Bottom, pantsMillimetres, avatar)

        val hem = placement.position.y + pantsMillimetres.bottom * placement.scale.y
        assertTrue(hem > avatar.bottom && hem < waist)
    }

    @Test
    fun aGarmentNarrowerThanTheBodyIsWidenedAroundIt() {
        val hips = bodyWidth(ClothingCategory.Bottom, wideHips, avatar)

        val placement = placeGarment(ClothingCategory.Bottom, pantsMillimetres, avatar, bodyWidth = hips)

        assertEquals(hips * 1.15f, pantsMillimetres.width * placement.scale.x, 0.001f)
        assertEquals(placement.scale.x, placement.scale.z, 0.0001f)
        // Only the width changes, so the pants still reach the waist.
        assertEquals(waist, placement.position.y + pantsMillimetres.top * placement.scale.y, 0.001f)
    }

    @Test
    fun aGarmentWiderThanTheBodyKeepsItsShape() {
        val chest = bodyWidth(ClothingCategory.Top, AvatarMeasurements(), avatar)

        val placement = placeGarment(ClothingCategory.Top, tShirtMetres, avatar, bodyWidth = chest)

        assertEquals(placement.scale.y, placement.scale.x, 0.0001f)
    }

    @Test
    fun resizingAGarmentKeepsItsTopEdgeInPlace() {
        val hips = bodyWidth(ClothingCategory.Bottom, wideHips, avatar)
        val normal = placeGarment(ClothingCategory.Bottom, pantsMillimetres, avatar, bodyWidth = hips)
        val larger = placeGarment(ClothingCategory.Bottom, pantsMillimetres, avatar, bodyWidth = hips, size = 1.2f)

        assertEquals(normal.scale.y * 1.2f, larger.scale.y, 0.0001f)
        assertEquals(normal.scale.x * 1.2f, larger.scale.x, 0.0001f)
        assertEquals(waist, larger.position.y + pantsMillimetres.top * larger.scale.y, 0.001f)
    }

    @Test
    fun garmentsAreCentredOnTheBody() {
        val placement = placeGarment(ClothingCategory.Top, tShirtMetres, avatar)

        assertEquals(avatar.center.x, placement.position.x + tShirtMetres.center.x * placement.scale.x, 0.001f)
        assertEquals(avatar.center.z, placement.position.z + tShirtMetres.center.z * placement.scale.z, 0.001f)
    }
}
