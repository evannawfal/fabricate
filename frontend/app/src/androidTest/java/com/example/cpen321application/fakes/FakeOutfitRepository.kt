package com.example.cpen321application.fakes

import com.example.cpen321application.data.ClothingRepositoryException
import com.example.cpen321application.data.OutfitChanges
import com.example.cpen321application.data.OutfitRepository
import com.example.cpen321application.model.ClothingItem
import com.example.cpen321application.model.Outfit
import kotlinx.coroutines.CompletableDeferred

/**
 * Outfits held in memory, standing in for the back-end in UI tests. Outfits are built from
 * [closet]. Set [listError], [saveError] or [deleteError] to make those requests fail, and hold
 * saves or deletes back with [saveGate] or [deleteGate] to see their in-progress state.
 */
class FakeOutfitRepository(
    initialOutfits: List<Outfit> = emptyList(),
    private val closet: List<ClothingItem> = emptyList(),
) : OutfitRepository {
    val outfits = initialOutfits.toMutableList()
    var saveCalls = 0
    var deleteCalls = 0

    var listError: String? = null
    var saveError: String? = null
    var deleteError: String? = null
    var saveGate: CompletableDeferred<Unit>? = null
    var deleteGate: CompletableDeferred<Unit>? = null
    private var nextId = 1

    override suspend fun listOutfits(): List<Outfit> {
        listError?.let { throw ClothingRepositoryException(it) }
        return outfits.toList()
    }

    override suspend fun createOutfit(changes: OutfitChanges): Outfit {
        saveCalls++
        saveGate?.await()
        saveError?.let { throw ClothingRepositoryException(it) }
        return Outfit("new-${nextId++}", changes.name, itemsFor(changes)).also { outfits.add(0, it) }
    }

    override suspend fun updateOutfit(id: String, changes: OutfitChanges): Outfit {
        saveCalls++
        saveGate?.await()
        saveError?.let { throw ClothingRepositoryException(it) }
        val index = outfits.indexOfFirst { it.id == id }
        val updated = outfits[index].copy(name = changes.name, items = itemsFor(changes))
        outfits[index] = updated
        return updated
    }

    override suspend fun deleteOutfit(id: String) {
        deleteCalls++
        deleteGate?.await()
        deleteError?.let { throw ClothingRepositoryException(it) }
        outfits.removeAll { it.id == id }
    }

    private fun itemsFor(changes: OutfitChanges): List<ClothingItem> =
        changes.itemIds.map { id -> closet.first { it.id == id } }
}
