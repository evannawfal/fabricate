package com.example.cpen321application.data

import com.example.cpen321application.model.Coordinates
import com.example.cpen321application.model.GeneratedOutfit
import com.example.cpen321application.model.Outfit
import com.example.cpen321application.model.OutfitOccasion

data class OutfitChanges(
    val name: String,
    val itemIds: List<String>,
    val occasion: OutfitOccasion? = null,
)

/** The user's saved outfits. Failed requests throw [ClothingRepositoryException]. */
interface OutfitRepository {
    suspend fun listOutfits(): List<Outfit>

    suspend fun generateOutfit(occasion: OutfitOccasion, coordinates: Coordinates): GeneratedOutfit

    suspend fun createOutfit(changes: OutfitChanges): Outfit

    suspend fun updateOutfit(id: String, changes: OutfitChanges): Outfit

    suspend fun deleteOutfit(id: String)
}
