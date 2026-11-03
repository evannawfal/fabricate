package com.example.cpen321application.model

enum class ShopDepartment(val apiValue: String?, val label: String) {
    All(null, "All"),
    Mens("mens", "Men's"),
    Womens("womens", "Women's"),
}

/** An item from an online store, mirrors StoreItem in backend. */
data class StoreItem(
    val name: String,
    val price: String,
    val imageUrl: String,
    val link: String,
    val store: String,
    val reason: String,
    val pairsWith: List<ClothingItem>,
)

data class Recommendations(val gaps: List<String>, val items: List<StoreItem>)
