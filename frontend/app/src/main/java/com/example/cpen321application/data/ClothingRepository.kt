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
