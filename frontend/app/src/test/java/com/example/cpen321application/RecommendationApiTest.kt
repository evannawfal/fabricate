package com.example.cpen321application

import com.example.cpen321application.data.ClothingRepositoryException
import com.example.cpen321application.data.deviceCountryCode
import com.example.cpen321application.model.ClothingCategory
import com.example.cpen321application.model.ShopDepartment
import com.example.cpen321application.network.BackendRecommendationRepository
import com.example.cpen321application.network.RECOMMENDATIONS_UNAVAILABLE
import com.example.cpen321application.network.UNEXPECTED_RESPONSE
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test
import java.util.Locale

class RecommendationApiTest {
    private lateinit var server: MockWebServer

    private val repository by lazy {
        BackendRecommendationRepository(tokenProvider = { "test-token" }, baseUrl = server.url("/").toString())
    }

    private fun closetItemJson(id: String, category: String) =
        JSONObject()
            .put("id", id)
            .put("name", "Item $id")
            .put("category", category)
            .put("color", "black")
            .put("style", "casual")
            .put("imageUrl", JSONObject.NULL)

    private fun storeItemJson() =
        JSONObject()
            .put("name", "Leather Boots")
            .put("price", "$120.00")
            .put("imageUrl", "https://images.example/boots.webp")
            .put("link", "https://stores.example/boots")
            .put("store", "Boot Shop")
            .put("reason", "No shoes in your closet")
            .put("pairsWith", JSONArray().put(closetItemJson("1", "top")).put(closetItemJson("2", "hat")))

    private fun recommendationsJson(items: JSONArray = JSONArray().put(storeItemJson())) =
        JSONObject().put("gaps", JSONArray().put("No shoes in your closet")).put("items", items).toString()

    private fun respond(status: Int, body: String = "") =
        server.enqueue(MockResponse().setResponseCode(status).setBody(body))

    private fun failureFrom(block: suspend () -> Unit): ClothingRepositoryException {
        try {
            runBlocking { block() }
        } catch (e: ClothingRepositoryException) {
            return e
        }
        fail("Expected ClothingRepositoryException")
        throw AssertionError()
    }

    @Before
    fun startServer() {
        server = MockWebServer()
        server.start()
    }

    @After
    fun stopServer() {
        server.shutdown()
    }

    @Test
    fun getRecommendations_sendsTokenCountryAndDepartmentAndParsesTheResult() {
        respond(200, recommendationsJson())

        val result = runBlocking { repository.getRecommendations(ShopDepartment.Mens, "ca") }

        val request = server.takeRequest()
        assertEquals("GET", request.method)
        assertEquals("/recommendations?country=ca&department=mens", request.path)
        assertEquals("Bearer test-token", request.getHeader("Authorization"))
        assertEquals(listOf("No shoes in your closet"), result.gaps)
        val item = result.items.single()
        assertEquals("Leather Boots", item.name)
        assertEquals("$120.00", item.price)
        assertEquals("https://images.example/boots.webp", item.imageUrl)
        assertEquals("https://stores.example/boots", item.link)
        assertEquals("Boot Shop", item.store)
        assertEquals("No shoes in your closet", item.reason)
        // The closet item in an unknown category is left out.
        assertEquals(listOf(ClothingCategory.Top), item.pairsWith.map { it.category })
    }

    @Test
    fun getRecommendations_leavesOutACountryAndDepartmentThatWerentChosen() {
        respond(200, recommendationsJson())

        runBlocking { repository.getRecommendations(ShopDepartment.All, null) }

        assertEquals("/recommendations", server.takeRequest().path)
    }

    @Test
    fun getRecommendations_acceptsNoItems() {
        respond(200, recommendationsJson(JSONArray()))

        val result = runBlocking { repository.getRecommendations(ShopDepartment.All, "ca") }

        assertEquals(listOf("No shoes in your closet"), result.gaps)
        assertTrue(result.items.isEmpty())
    }

    @Test
    fun missingBasics_showsTheServersMessageWithoutARetry() {
        val message = "Add at least one top and one bottom to your closet to get recommendations"
        respond(400, JSONObject().put("error", message).put("missing", JSONArray().put("top")).toString())

        val failure = failureFrom { repository.getRecommendations(ShopDepartment.All, "ca") }

        assertEquals(message, failure.message)
        assertFalse(failure.canRetry)
    }

    @Test
    fun unavailableStoreSearch_saysToTryAgain() {
        respond(503, """{"error":"Store search is not available right now"}""")

        val failure = failureFrom { repository.getRecommendations(ShopDepartment.All, "ca") }

        assertEquals(RECOMMENDATIONS_UNAVAILABLE, failure.message)
        assertTrue(failure.canRetry)
    }

    @Test
    fun missingRoute_saysRecommendationsAreUnavailable() {
        respond(404, """{"error":"Not found"}""")

        val failure = failureFrom { repository.getRecommendations(ShopDepartment.All, "ca") }

        assertEquals(RECOMMENDATIONS_UNAVAILABLE, failure.message)
    }

    @Test
    fun deviceCountryCode_isTheLowercaseRegionOnlyForACountry() {
        val original = Locale.getDefault()
        try {
            Locale.setDefault(Locale.Builder().setLanguage("en").setRegion("CA").build())
            assertEquals("ca", deviceCountryCode())
            Locale.setDefault(Locale.Builder().setLanguage("es").setRegion("419").build())
            assertNull(deviceCountryCode())
            Locale.setDefault(Locale.Builder().setLanguage("en").build())
            assertNull(deviceCountryCode())
        } finally {
            Locale.setDefault(original)
        }
    }

    @Test
    fun malformedResponse_reportsAnUnexpectedResponse() {
        respond(200, """{"gaps":"nope"}""")

        val failure = failureFrom { repository.getRecommendations(ShopDepartment.All, "ca") }

        assertEquals(UNEXPECTED_RESPONSE, failure.message)
    }
}
