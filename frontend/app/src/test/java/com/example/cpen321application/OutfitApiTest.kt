package com.example.cpen321application

import com.example.cpen321application.data.ClothingRepositoryException
import com.example.cpen321application.data.OutfitChanges
import com.example.cpen321application.model.ClothingCategory
import com.example.cpen321application.model.Coordinates
import com.example.cpen321application.model.OutfitOccasion
import com.example.cpen321application.model.Weather
import com.example.cpen321application.network.BackendOutfitRepository
import com.example.cpen321application.network.OUTFITS_UNAVAILABLE
import com.example.cpen321application.network.OUTFIT_NOT_FOUND
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
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test

class OutfitApiTest {
    private lateinit var server: MockWebServer

    private val repository by lazy {
        BackendOutfitRepository(tokenProvider = { "test-token" }, baseUrl = server.url("/").toString())
    }

    private fun itemJson(id: String, category: String) =
        JSONObject()
            .put("id", id)
            .put("name", "Item $id")
            .put("category", category)
            .put("color", "black")
            .put("style", "casual")
            .put("imageUrl", JSONObject.NULL)

    private fun outfitJson(id: String = "o1", name: String = "Weekend") =
        JSONObject()
            .put("id", id)
            .put("name", name)
            .put("occasion", "casual")
            .put("source", "manual")
            .put("items", JSONArray().put(itemJson("1", "top")).put(itemJson("2", "bottom")))

    private fun respond(status: Int, body: String = "") =
        server.enqueue(MockResponse().setResponseCode(status).setBody(body))

    private fun assertFailsWith(message: String, block: suspend () -> Unit) {
        try {
            runBlocking { block() }
        } catch (e: ClothingRepositoryException) {
            assertEquals(message, e.message)
            return
        }
        fail("Expected ClothingRepositoryException")
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
    fun listOutfits_sendsTokenAndParsesOutfits() {
        val outfit = outfitJson()
        outfit.getJSONArray("items").put(itemJson("3", "hat"))
        respond(200, JSONObject().put("outfits", JSONArray().put(outfit)).toString())

        val result = runBlocking { repository.listOutfits() }

        val request = server.takeRequest()
        assertEquals("GET", request.method)
        assertEquals("/outfits", request.path)
        assertEquals("Bearer test-token", request.getHeader("Authorization"))
        val parsed = result.single()
        assertEquals("Weekend", parsed.name)
        assertEquals("casual", parsed.occasion)
        // The item in an unknown category is left out.
        assertEquals(listOf("1", "2"), parsed.items.map { it.id })
        assertEquals(listOf(ClothingCategory.Top, ClothingCategory.Bottom), parsed.items.map { it.category })
    }

    @Test
    fun createOutfit_sendsNameAndItemIds() {
        respond(201, outfitJson().toString())

        val outfit = runBlocking { repository.createOutfit(OutfitChanges("Weekend", listOf("1", "2"))) }

        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/outfits", request.path)
        val body = JSONObject(request.body.readUtf8())
        assertEquals("Weekend", body.getString("name"))
        assertEquals(JSONArray(listOf("1", "2")).toString(), body.getJSONArray("items").toString())
        assertEquals("o1", outfit.id)
    }

    @Test
    fun updateOutfit_patchesTheOutfit() {
        respond(200, outfitJson(name = "Office").toString())

        val outfit = runBlocking { repository.updateOutfit("o1", OutfitChanges("Office", listOf("1"))) }

        val request = server.takeRequest()
        assertEquals("PATCH", request.method)
        assertEquals("/outfits/o1", request.path)
        assertEquals("Office", JSONObject(request.body.readUtf8()).getString("name"))
        assertEquals("Office", outfit.name)
    }

    @Test
    fun deleteOutfit_sendsDelete() {
        respond(204)

        runBlocking { repository.deleteOutfit("o1") }

        val request = server.takeRequest()
        assertEquals("DELETE", request.method)
        assertEquals("/outfits/o1", request.path)
    }

    private fun generatedJson(weather: Any): String =
        JSONObject()
            .put(
                "outfit",
                JSONObject()
                    .put("name", "Rainy day layers")
                    .put("occasion", "work")
                    .put("items", JSONArray().put(itemJson("1", "top")).put(itemJson("2", "bottom"))),
            )
            .put("weather", weather)
            .toString()

    @Test
    fun generateOutfit_sendsOccasionAndCoordinatesAndParsesTheResult() {
        val weather = JSONObject().put("temperatureC", 9).put("condition", "Rain").put("description", "light rain")
        respond(200, generatedJson(weather))

        val outfit = runBlocking { repository.generateOutfit(OutfitOccasion.Work, Coordinates(49.26, -123.25)) }

        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/outfits/generate", request.path)
        val body = JSONObject(request.body.readUtf8())
        assertEquals("work", body.getString("occasion"))
        assertEquals(49.26, body.getDouble("latitude"), 0.0)
        assertEquals(-123.25, body.getDouble("longitude"), 0.0)
        assertEquals("Rainy day layers", outfit.name)
        assertEquals(OutfitOccasion.Work, outfit.occasion)
        assertEquals(listOf("1", "2"), outfit.items.map { it.id })
        assertEquals(Weather(9, "Rain", "light rain"), outfit.weather)
    }

    @Test
    fun generateOutfit_acceptsMissingWeather() {
        respond(200, generatedJson(JSONObject.NULL))

        val outfit = runBlocking { repository.generateOutfit(OutfitOccasion.Casual, Coordinates(0.0, 0.0)) }

        assertNull(outfit.weather)
    }

    @Test
    fun generateOutfit_showsTheServersListOfMissingClothes() {
        val message = "Your clean clothes don't include a bottom. Add one to your closet or empty your wash bin."
        respond(400, JSONObject().put("error", message).put("missing", JSONArray().put("bottom")).toString())

        assertFailsWith(message) { repository.generateOutfit(OutfitOccasion.Casual, Coordinates(0.0, 0.0)) }
    }

    @Test
    fun createOutfit_sendsTheOccasionOfAGeneratedOutfit() {
        respond(201, outfitJson().toString())

        runBlocking { repository.createOutfit(OutfitChanges("Weekend", listOf("1"), OutfitOccasion.Casual)) }

        assertEquals("casual", JSONObject(server.takeRequest().body.readUtf8()).getString("occasion"))
    }

    @Test
    fun updateOutfit_leavesTheOccasionAlone() {
        respond(200, outfitJson().toString())

        runBlocking { repository.updateOutfit("o1", OutfitChanges("Office", listOf("1"))) }

        assertFalse(JSONObject(server.takeRequest().body.readUtf8()).has("occasion"))
    }

    @Test
    fun missingOutfit_saysItNoLongerExists() {
        respond(404, """{"error":"Outfit not found"}""")

        assertFailsWith(OUTFIT_NOT_FOUND) { repository.deleteOutfit("o1") }
    }

    @Test
    fun unavailableServer_saysOutfitsAreUnavailable() {
        respond(503, """{"error":"Outfit generation is not available right now"}""")

        assertFailsWith(OUTFITS_UNAVAILABLE) { repository.listOutfits() }
    }

    @Test
    fun invalidOutfit_showsTheServersValidationMessage() {
        respond(400, """{"error":"All items must be clothing items in your closet"}""")

        assertFailsWith("All items must be clothing items in your closet") {
            repository.createOutfit(OutfitChanges("Weekend", listOf("1")))
        }
    }

    @Test
    fun malformedResponse_reportsAnUnexpectedResponse() {
        respond(200, """{"outfits":"nope"}""")

        assertFailsWith(UNEXPECTED_RESPONSE) { repository.listOutfits() }
    }
}
