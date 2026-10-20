package com.example.cpen321application.data

import com.example.cpen321application.model.ClothingCategory
import com.example.cpen321application.model.ClothingItem

data class ClothingItemChanges(
    val name: String,
    val category: ClothingCategory,
    val color: String,
    val style: String,
)

class ClothingRepositoryException(
    override val message: String,
    cause: Throwable? = null,
    val canRetry: Boolean = false,
) : Exception(message, cause)

interface ClothingRepository {
    suspend fun listItems(): List<ClothingItem>

    suspend fun uploadPhoto(jpeg: ByteArray): ClothingItem

    suspend fun updateItem(id: String, changes: ClothingItemChanges): ClothingItem

    suspend fun deleteItem(id: String)
}

class InMemoryClothingRepository(initialItems: List<ClothingItem>) : ClothingRepository {
    private val items = initialItems.toMutableList()

    override suspend fun listItems(): List<ClothingItem> = items.toList()

    override suspend fun uploadPhoto(jpeg: ByteArray): ClothingItem =
        throw ClothingRepositoryException("Adding clothing isn't connected to the server yet.")

    override suspend fun updateItem(id: String, changes: ClothingItemChanges): ClothingItem {
        val index = items.indexOfFirst { it.id == id }
        if (index < 0) throw ClothingRepositoryException(ITEM_NOT_FOUND)
        val updated = items[index].copy(
            name = changes.name,
            category = changes.category,
            color = changes.color,
            style = changes.style,
        )
        items[index] = updated
        return updated
    }

    override suspend fun deleteItem(id: String) {
        if (!items.removeAll { it.id == id }) throw ClothingRepositoryException(ITEM_NOT_FOUND)
    }

    private companion object {
        const val ITEM_NOT_FOUND = "This item is no longer in your closet."
    }
}
