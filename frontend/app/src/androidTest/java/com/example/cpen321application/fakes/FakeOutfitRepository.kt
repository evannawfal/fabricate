package com.example.cpen321application.fakes

import com.example.cpen321application.data.ClothingRepositoryException
import com.example.cpen321application.data.OutfitChanges
import com.example.cpen321application.data.OutfitRepository
import com.example.cpen321application.model.ClothingItem
import com.example.cpen321application.model.Coordinates
import com.example.cpen321application.model.GeneratedOutfit
import com.example.cpen321application.model.Outfit
import com.example.cpen321application.model.OutfitOccasion
import kotlinx.coroutines.CompletableDeferred

/**
 * Outfits held in memory, standing in for the back-end in UI tests. Outfits are built from
 * [closet]. Set [listError], [saveError] or [deleteError] to make those requests fail, and hold
 * saves, deletes or generation back with [saveGate], [deleteGate] or [generateGate] to see their
 * in-progress state. Generation returns [generateResult] (or throws what it throws).
 */
class FakeOutfitRepository(
    initialOutfits: List<Outfit> = emptyList(),
    private val closet: List<ClothingItem> = emptyList(),
) : OutfitRepository {
    val outfits = initialOutfits.toMutableList()
    var saveCalls = 0
    var deleteCalls = 0
    val generateRequests = mutableListOf<Pair<OutfitOccasion, Coordinates>>()

    var listError: String? = null
    var saveError: String? = null
    var deleteError: String? = null
    var saveGate: CompletableDeferred<Unit>? = null
    var deleteGate: CompletableDeferred<Unit>? = null
    var generateGate: CompletableDeferred<Unit>? = null
    var generateResult: () -> GeneratedOutfit = { throw ClothingRepositoryException("No generation expected") }
    private var nextId = 1

    override suspend fun listOutfits(): List<Outfit> {
        listError?.let { throw ClothingRepositoryException(it) }
        return outfits.toList()
    }

    override suspend fun generateOutfit(occasion: OutfitOccasion, coordinates: Coordinates): GeneratedOutfit {
        generateRequests += occasion to coordinates
        generateGate?.await()
        return generateResult()
    }

    override suspend fun createOutfit(changes: OutfitChanges): Outfit {
        saveCalls++
        saveGate?.await()
        saveError?.let { throw ClothingRepositoryException(it) }
        val occasion = changes.occasion?.apiValue.orEmpty()
        return Outfit("new-${nextId++}", changes.name, itemsFor(changes), occasion).also { outfits.add(0, it) }
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
