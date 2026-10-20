package com.example.cpen321application

import com.example.cpen321application.data.ClothingItemChanges
import com.example.cpen321application.data.ClothingRepositoryException
import com.example.cpen321application.model.ClothingCategory
import com.example.cpen321application.network.BackendClothingRepository
import com.example.cpen321application.network.NETWORK_ERROR
import com.example.cpen321application.network.NOT_SIGNED_IN
import com.example.cpen321application.network.UNEXPECTED_RESPONSE
import com.example.cpen321application.network.errorMessageFor
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test

class ClothingApiTest {
    private lateinit var server: MockWebServer
    private var token: String? = "test-token"

    private val repository by lazy {
        BackendClothingRepository(tokenProvider = { token }, baseUrl = server.url("/").toString())
    }

    private fun itemJson(id: String = "abc123", category: String = "outerwear", imageUrl: String? = null) =
        JSONObject()
            .put("id", id)
            .put("name", "Navy Wool Coat")
            .put("category", category)
            .put("color", "navy")
            .put("style", "formal")
            .put("tags", JSONArray().put("winter"))
            .put("isClean", true)
            .put("isArchived", false)
            .put("imageUrl", imageUrl ?: JSONObject.NULL)

    private fun respond(status: Int, body: String = "") =
        server.enqueue(MockResponse().setResponseCode(status).setBody(body))

    private fun assertFailsWith(message: String, block: suspend () -> Unit) {
        try {
            runBlocking { block() }
            fail("Expected ClothingRepositoryException")
        } catch (e: ClothingRepositoryException) {
            assertEquals(message, e.message)
        }
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
    fun listItems_sendsTokenAndParsesItems() {
        val items = JSONArray()
            .put(itemJson(id = "1", imageUrl = "https://storage.example/photo.jpg?sig=x"))
            .put(itemJson(id = "2", category = "hat"))
        respond(200, JSONObject().put("items", items).toString())

        val result = runBlocking { repository.listItems() }

        val request = server.takeRequest()
        assertEquals("GET", request.method)
        assertEquals("/clothing", request.path)
        assertEquals("Bearer test-token", request.getHeader("Authorization"))
        // The item in an unknown category is left out.
        assertEquals(listOf("1"), result.map { it.id })
        val item = result.single()
        assertEquals(ClothingCategory.Outerwear, item.category)
        assertEquals(listOf("winter"), item.tags)
        assertEquals("https://storage.example/photo.jpg?sig=x", item.imageUrl)
    }

    @Test
    fun uploadPhoto_sendsPhotoAsMultipartField() {
        respond(201, itemJson().toString())

        val item = runBlocking { repository.uploadPhoto(byteArrayOf(1, 2, 3)) }

        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/clothing", request.path)
        assertTrue(request.getHeader("Content-Type").orEmpty().startsWith("multipart/form-data"))
        val body = request.body.readUtf8()
        assertTrue(body.contains("name=\"photo\""))
        assertTrue(body.contains("Content-Type: image/jpeg"))
        assertEquals("Navy Wool Coat", item.name)
        assertNull(item.imageUrl)
    }

    @Test
    fun uploadPhoto_reportsWhyItFailed() {
        respond(422, """{"error":"The photo does not show a clothing item"}""")
        assertFailsWith(errorMessageFor(422, null)) { repository.uploadPhoto(byteArrayOf(1)) }

        respond(413, """{"error":"The photo must be at most 5 MB"}""")
        assertFailsWith(errorMessageFor(413, null)) { repository.uploadPhoto(byteArrayOf(1)) }

        respond(503, """{"error":"Photo classification is not available right now"}""")
        assertFailsWith(errorMessageFor(503, null)) { repository.uploadPhoto(byteArrayOf(1)) }
    }

    @Test
    fun updateItem_sendsChangesAsJson() {
        respond(200, itemJson(category = "dress").toString())
        val changes = ClothingItemChanges("Navy Dress", ClothingCategory.Dress, "navy", "formal")

        val item = runBlocking { repository.updateItem("abc123", changes) }

        val request = server.takeRequest()
        assertEquals("PATCH", request.method)
        assertEquals("/clothing/abc123", request.path)
        val body = JSONObject(request.body.readUtf8())
        assertEquals("Navy Dress", body.getString("name"))
        assertEquals("dress", body.getString("category"))
        assertEquals("navy", body.getString("color"))
        assertEquals("formal", body.getString("style"))
        assertEquals(ClothingCategory.Dress, item.category)
    }

    @Test
    fun updateItem_showsTheServersValidationMessage() {
        respond(400, """{"error":"color must not be empty"}""")
        val changes = ClothingItemChanges("Coat", ClothingCategory.Outerwear, " ", "formal")

        assertFailsWith("color must not be empty") { repository.updateItem("abc123", changes) }
    }

    @Test
    fun deleteItem_sendsDelete() {
        respond(204)

        runBlocking { repository.deleteItem("abc123") }

        val request = server.takeRequest()
        assertEquals("DELETE", request.method)
        assertEquals("/clothing/abc123", request.path)
    }

    @Test
    fun notSignedIn_failsWithoutSendingARequest() {
        token = null

        assertFailsWith(NOT_SIGNED_IN) { repository.listItems() }
        assertEquals(0, server.requestCount)
    }

    @Test
    fun unreachableServer_reportsAConnectionProblem() {
        server.shutdown()

        assertFailsWith(NETWORK_ERROR) { repository.listItems() }
    }

    @Test
    fun malformedResponse_isReportedAsAnError() {
        respond(200, "<html>Bad gateway</html>")

        assertFailsWith(UNEXPECTED_RESPONSE) { repository.listItems() }
    }
}
