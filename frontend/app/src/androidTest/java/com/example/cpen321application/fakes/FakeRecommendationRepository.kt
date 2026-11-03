package com.example.cpen321application.fakes

import com.example.cpen321application.data.ClothingRepositoryException
import com.example.cpen321application.data.RecommendationRepository
import com.example.cpen321application.model.Recommendations
import com.example.cpen321application.model.ShopDepartment
import kotlinx.coroutines.CompletableDeferred

/**
 * Recommendations held in memory, standing in for the back-end in UI tests. Requests return
 * [result], or throw [error] if it's set. Hold them back with [gate] to see the loading state.
 */
class FakeRecommendationRepository(
    var result: Recommendations = Recommendations(emptyList(), emptyList()),
) : RecommendationRepository {
    val requests = mutableListOf<Pair<ShopDepartment, String?>>()
    var error: ClothingRepositoryException? = null
    var gate: CompletableDeferred<Unit>? = null

    override suspend fun getRecommendations(department: ShopDepartment, country: String?): Recommendations {
        requests += department to country
        gate?.await()
        error?.let { throw it }
        return result
    }
}
