package com.example.cpen321application.data

import com.example.cpen321application.model.ClothingCategory
import com.example.cpen321application.model.ClothingItem

/** The details a user can change on an item. */
data class ClothingItemChanges(
    val name: String,
    val category: ClothingCategory,
    val color: String,
    val style: String,
)

/** A failed closet operation. [message] is written for the user and can be shown as is. */
class ClothingRepositoryException(
    override val message: String,
    cause: Throwable? = null,
) : Exception(message, cause)

/**
 * Where the closet's items come from. Every call throws [ClothingRepositoryException]
 * when it fails.
 */
interface ClothingRepository {
    suspend fun listItems(): List<ClothingItem>

    /** Adds an item from a JPEG photo; the back-end detects its name, category, colour and style. */
    suspend fun uploadPhoto(jpeg: ByteArray): ClothingItem

    suspend fun updateItem(id: String, changes: ClothingItemChanges): ClothingItem

    suspend fun deleteItem(id: String)
}

/**
 * Keeps items in memory, starting from [initialItems]. Used until the app can sign in
 * to the back-end; photos can't be classified without it, so uploads always fail.
 */
class InMemoryClothingRepository(initialItems: List<ClothingItem>) : ClothingRepository {
    private val items = initialItems.toMutableList()

    override suspend fun listItems(): List<ClothingItem> = items.toList()

    override suspend fun uploadPhoto(jpeg: ByteArray): ClothingItem =
        throw ClothingRepositoryException("Sign in to add clothing to your closet.")

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
