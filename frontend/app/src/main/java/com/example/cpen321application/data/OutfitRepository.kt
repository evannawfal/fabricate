package com.example.cpen321application.data

import com.example.cpen321application.model.Outfit

data class OutfitChanges(
    val name: String,
    val itemIds: List<String>,
)

/** The user's saved outfits. Failed requests throw [ClothingRepositoryException]. */
interface OutfitRepository {
    suspend fun listOutfits(): List<Outfit>

    suspend fun createOutfit(changes: OutfitChanges): Outfit

    suspend fun updateOutfit(id: String, changes: OutfitChanges): Outfit

    suspend fun deleteOutfit(id: String)
}
