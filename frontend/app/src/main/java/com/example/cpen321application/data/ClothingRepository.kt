package com.example.cpen321application.data

import com.example.cpen321application.model.ClothingCategory
import com.example.cpen321application.model.ClothingItem
import java.io.File

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

    suspend fun uploadPhotos(front: ByteArray, back: ByteArray): ClothingItem

    suspend fun updateItem(id: String, changes: ClothingItemChanges): ClothingItem

    suspend fun deleteItem(id: String)

    /** Has the back-end build the item's 3D model, replacing any earlier one, and returns it. */
    suspend fun generateModel(id: String): File

    /** The item's 3D model, downloaded once and then kept on the device. */
    suspend fun modelFile(id: String): File
}