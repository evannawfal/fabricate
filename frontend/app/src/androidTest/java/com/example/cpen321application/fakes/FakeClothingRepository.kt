package com.example.cpen321application.fakes

import com.example.cpen321application.data.ClothingItemChanges
import com.example.cpen321application.data.ClothingRepository
import com.example.cpen321application.data.ClothingRepositoryException
import com.example.cpen321application.model.ClothingItem
import kotlinx.coroutines.CompletableDeferred

/**
 * A closet held in memory, standing in for the back-end in UI tests. Uploads return
 * [uploadResult] (or throw what it throws) and can be held back with [uploadGate] to
 * see the loading state; everything uploaded or changed is recorded for assertions.
 */
class FakeClothingRepository(initialItems: List<ClothingItem>) : ClothingRepository {
    val items = initialItems.toMutableList()
    val uploadedPhotos = mutableListOf<ByteArray>()
    val savedChanges = mutableListOf<Pair<String, ClothingItemChanges>>()

    var uploadResult: () -> ClothingItem = { throw ClothingRepositoryException("No upload expected") }
    var uploadGate: CompletableDeferred<Unit>? = null
    var updateError: String? = null

    override suspend fun listItems(): List<ClothingItem> = items.toList()

    override suspend fun uploadPhoto(jpeg: ByteArray): ClothingItem {
        uploadedPhotos += jpeg
        uploadGate?.await()
        return uploadResult().also { items.add(0, it) }
    }

    override suspend fun updateItem(id: String, changes: ClothingItemChanges): ClothingItem {
        updateError?.let { throw ClothingRepositoryException(it) }
        savedChanges += id to changes
        val index = items.indexOfFirst { it.id == id }
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
        items.removeAll { it.id == id }
    }
}
