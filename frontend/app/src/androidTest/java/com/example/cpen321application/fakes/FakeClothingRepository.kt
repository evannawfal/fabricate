package com.example.cpen321application.fakes

import com.example.cpen321application.data.ClothingItemChanges
import com.example.cpen321application.data.ClothingRepository
import com.example.cpen321application.data.ClothingRepositoryException
import com.example.cpen321application.model.ClothingItem
import kotlinx.coroutines.CompletableDeferred
import java.io.File

/**
 * A closet held in memory, standing in for the back-end in UI tests. Uploads return
 * [uploadResult] (or throw what it throws) and can be held back with [uploadGate] to
 * see the loading state; everything uploaded or changed is recorded for assertions.
 * 3D models are empty files, and [modelGate] holds back building one.
 */
class FakeClothingRepository(initialItems: List<ClothingItem>) : ClothingRepository {
    val items = initialItems.toMutableList()
    val uploadedPhotos = mutableListOf<ByteArray>()
    val savedChanges = mutableListOf<Pair<String, ClothingItemChanges>>()
    val generatedModels = mutableListOf<String>()

    var uploadResult: () -> ClothingItem = { throw ClothingRepositoryException("No upload expected") }
    var uploadGate: CompletableDeferred<Unit>? = null
    var updateError: String? = null
    var modelGate: CompletableDeferred<Unit>? = null
    var modelError: String? = null

    override suspend fun listItems(): List<ClothingItem> = items.toList()

    override suspend fun uploadPhotos(front: ByteArray, back: ByteArray): ClothingItem {
        uploadedPhotos += front
        uploadedPhotos += back
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

    override suspend fun generateModel(id: String): File {
        modelGate?.await()
        modelError?.let { throw ClothingRepositoryException(it) }
        generatedModels += id
        return modelFile(id)
    }

    override suspend fun modelFile(id: String): File = File.createTempFile("model_$id", ".glb")
}
