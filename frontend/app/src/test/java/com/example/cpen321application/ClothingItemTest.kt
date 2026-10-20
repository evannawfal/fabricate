package com.example.cpen321application

import com.example.cpen321application.model.ClothingCategory
import com.example.cpen321application.model.ClothingItem
import com.example.cpen321application.model.filterByCategory
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ClothingItemTest {
    private val items = listOf(
        ClothingItem("1", "White Tee", ClothingCategory.Top, "white", "casual"),
        ClothingItem("2", "Running Sneakers", ClothingCategory.Shoes, "grey", "sporty"),
        ClothingItem("3", "Brown Brogues", ClothingCategory.Shoes, "brown", "smart casual"),
    )

    @Test
    fun filterByCategory_nullReturnsEveryItem() {
        assertEquals(items, items.filterByCategory(null))
    }

    @Test
    fun filterByCategory_keepsOnlyMatchingItems() {
        assertEquals(listOf("2", "3"), items.filterByCategory(ClothingCategory.Shoes).map { it.id })
        assertEquals(emptyList<ClothingItem>(), items.filterByCategory(ClothingCategory.Dress))
    }

    @Test
    fun fromApiValue_matchesBackendCategories() {
        val backend = listOf("top", "bottom", "outerwear", "dress", "shoes", "accessory")
        assertEquals(backend, ClothingCategory.entries.map { it.apiValue })
        assertEquals(ClothingCategory.Dress, ClothingCategory.fromApiValue("dress"))
        assertNull(ClothingCategory.fromApiValue("hat"))
    }
}
