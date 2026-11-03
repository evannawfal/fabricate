package com.example.cpen321application.data

import com.example.cpen321application.model.Recommendations
import com.example.cpen321application.model.ShopDepartment
import java.util.Locale

/** Store items that fill the gaps in the user's closet. Failed requests throw [ClothingRepositoryException]. */
interface RecommendationRepository {
    /** A null [country] leaves the choice of stores to the back-end. */
    suspend fun getRecommendations(department: ShopDepartment, country: String?): Recommendations
}

private val COUNTRY_CODE = Regex("[a-z]{2}")

// Some regions aren't countries, e.g. "419" for Latin America.
fun deviceCountryCode(): String? = Locale.getDefault().country.lowercase(Locale.ROOT).takeIf(COUNTRY_CODE::matches)
