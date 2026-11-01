package com.example.cpen321application.fakes

import com.example.cpen321application.data.ClothingRepositoryException
import com.example.cpen321application.data.OutfitChanges
import com.example.cpen321application.data.OutfitRepository
import com.example.cpen321application.model.ClothingItem
import com.example.cpen321application.model.Outfit

/**
 * Outfits held in memory, standing in for the back-end in UI tests. Outfits are built
 * from [closet]; set [saveError] or [deleteError] to make those requests fail.
 */
class FakeOutfitRepository(
    initialOutfits: List<Outfit> = emptyList(),
    private val closet: List<ClothingItem> = emptyList(),
) : OutfitRepository {
    val outfits = initialOutfits.toMutableList()

    var saveError: String? = null
    var deleteError: String? = null
    private var nextId = 1

    override suspend fun listOutfits(): List<Outfit> = outfits.toList()

    override suspend fun createOutfit(changes: OutfitChanges): Outfit {
        saveError?.let { throw ClothingRepositoryException(it) }
        return Outfit("new-${nextId++}", changes.name, itemsFor(changes)).also { outfits.add(0, it) }
    }

    override suspend fun updateOutfit(id: String, changes: OutfitChanges): Outfit {
        saveError?.let { throw ClothingRepositoryException(it) }
        val index = outfits.indexOfFirst { it.id == id }
        val updated = outfits[index].copy(name = changes.name, items = itemsFor(changes))
        outfits[index] = updated
        return updated
    }

    override suspend fun deleteOutfit(id: String) {
        deleteError?.let { throw ClothingRepositoryException(it) }
        outfits.removeAll { it.id == id }
    }

    private fun itemsFor(changes: OutfitChanges): List<ClothingItem> =
        changes.itemIds.map { id -> closet.first { it.id == id } }
}
