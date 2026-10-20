package com.example.cpen321application

import com.example.cpen321application.data.MockCloset
import com.example.cpen321application.model.ClothingCategory
import com.example.cpen321application.model.filterByCategory
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class ClothingItemTest {
    @Test
    fun filterByCategory_nullReturnsEveryItem() {
        assertEquals(MockCloset.items, MockCloset.items.filterByCategory(null))
    }

    @Test
    fun filterByCategory_keepsOnlyMatchingItems() {
        val shoes = MockCloset.items.filterByCategory(ClothingCategory.Shoes)
        assertTrue(shoes.isNotEmpty())
        assertTrue(shoes.all { it.category == ClothingCategory.Shoes })
    }

    @Test
    fun mockItems_allHaveBundledPhotos() {
        val assetPrefix = "file:///android_asset/"
        MockCloset.items.forEach { item ->
            val url = item.imageUrl
            assertTrue("${item.name} has no photo", url != null && url.startsWith(assetPrefix))
            val file = File("src/main/assets", url!!.removePrefix(assetPrefix))
            assertTrue("Missing photo for ${item.name}: $file", file.isFile)
        }
    }

    @Test
    fun fromApiValue_matchesBackendCategories() {
        val backend = listOf("top", "bottom", "outerwear", "dress", "shoes", "accessory")
        assertEquals(backend, ClothingCategory.entries.map { it.apiValue })
        assertEquals(ClothingCategory.Dress, ClothingCategory.fromApiValue("dress"))
        assertNull(ClothingCategory.fromApiValue("hat"))
    }
}
