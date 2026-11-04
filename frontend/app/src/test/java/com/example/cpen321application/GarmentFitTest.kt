package com.example.cpen321application

import com.example.cpen321application.model.Bounds
import com.example.cpen321application.model.ClothingCategory
import com.example.cpen321application.model.placeGarment
import dev.romainguy.kotlin.math.Float3
import org.junit.Assert.assertEquals
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

    private fun placedTop(category: ClothingCategory, garment: Bounds): Float {
        val placement = placeGarment(category, garment, avatar)
        return placement.position.y + garment.top * placement.scale
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

        val hem = placement.position.y + pantsMillimetres.bottom * placement.scale
        assertEquals(true, hem > avatar.bottom && hem < waist)
    }

    @Test
    fun garmentsAreCentredOnTheBody() {
        val placement = placeGarment(ClothingCategory.Top, tShirtMetres, avatar)

        assertEquals(avatar.center.x, placement.position.x + tShirtMetres.center.x * placement.scale, 0.001f)
        assertEquals(avatar.center.z, placement.position.z + tShirtMetres.center.z * placement.scale, 0.001f)
    }
}
