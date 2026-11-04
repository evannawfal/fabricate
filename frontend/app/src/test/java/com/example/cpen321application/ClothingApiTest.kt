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
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class ClothingApiTest {
    @get:Rule
    val modelDir = TemporaryFolder()

    private lateinit var server: MockWebServer
    private var token: String? = "test-token"

    private val repository by lazy {
        BackendClothingRepository(
            tokenProvider = { token },
            baseUrl = server.url("/").toString(),
            modelDir = modelDir.root,
        )
    }

    private fun respondWithModelLink() =
        respond(200, JSONObject().put("downloadUrl", server.url("/files/model.glb").toString()).toString())

    private val front = byteArrayOf(1, 2, 3)
    private val back = byteArrayOf(4, 5, 6)

    private fun itemJson(
        id: String = "abc123",
        category: String = "outerwear",
        imageUrl: String? = null,
        backImageUrl: String? = null,
    ) =
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
            .put("backImageUrl", backImageUrl ?: JSONObject.NULL)

    private fun respond(status: Int, body: String = "") =
        server.enqueue(MockResponse().setResponseCode(status).setBody(body))

    private fun assertFailsWith(message: String, block: suspend () -> Unit): ClothingRepositoryException {
        try {
            runBlocking { block() }
        } catch (e: ClothingRepositoryException) {
            assertEquals(message, e.message)
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
    fun listItems_sendsTokenAndParsesItems() {
        val items = JSONArray()
            .put(
                itemJson(
                    id = "1",
                    imageUrl = "https://storage.example/photo.jpg?sig=x",
                    backImageUrl = "https://storage.example/back.jpg?sig=y",
                ),
            )
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
        assertEquals("https://storage.example/back.jpg?sig=y", item.backImageUrl)
    }

    @Test
    fun listItems_acceptsItemsWithoutABackPhoto() {
        // Items added before back photos existed have a null or missing backImageUrl.
        val withoutKey = itemJson(id = "1", imageUrl = "https://storage.example/photo.jpg").also { it.remove("backImageUrl") }
        val withNull = itemJson(id = "2", imageUrl = "https://storage.example/photo2.jpg")
        respond(200, JSONObject().put("items", JSONArray().put(withoutKey).put(withNull)).toString())

        val result = runBlocking { repository.listItems() }

        assertEquals(listOf("1", "2"), result.map { it.id })
        result.forEach { assertNull(it.backImageUrl) }
    }

    @Test
    fun uploadPhotos_sendsFrontAndBackAsMultipartFields() {
        respond(201, itemJson(backImageUrl = "https://storage.example/back.jpg").toString())

        val item = runBlocking { repository.uploadPhotos(front, back) }

        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/clothing", request.path)
        assertTrue(request.getHeader("Content-Type").orEmpty().startsWith("multipart/form-data"))
        val body = request.body.readUtf8()
        assertTrue(body.contains("name=\"photo\""))
        assertTrue(body.contains("name=\"backPhoto\""))
        // One JPEG part for each photo.
        assertEquals(2, body.split("Content-Type: image/jpeg").size - 1)
        assertEquals("Navy Wool Coat", item.name)
        assertNull(item.imageUrl)
        assertEquals("https://storage.example/back.jpg", item.backImageUrl)
    }

    @Test
    fun uploadPhotos_reportsWhyItFailed() {
        respond(422, """{"error":"The photo does not show a clothing item"}""")
        assertFailsWith(errorMessageFor(422, null)) { repository.uploadPhotos(front, back) }

        respond(413, """{"error":"The photo must be at most 5 MB"}""")
        assertFailsWith(errorMessageFor(413, null)) { repository.uploadPhotos(front, back) }

        respond(503, """{"error":"Photo classification is not available right now"}""")
        assertFailsWith(errorMessageFor(503, null)) { repository.uploadPhotos(front, back) }
    }

    @Test
    fun uploadPhotos_onlyServerAndConnectionProblemsCanBeRetried() {
        respond(422, """{"error":"The photo does not show a clothing item"}""")
        val notClothing = assertFailsWith("This photo doesn't show a clothing item. Try another photo.") {
            repository.uploadPhotos(front, back)
        }
        assertFalse(notClothing.canRetry)

        respond(503)
        assertTrue(assertFailsWith(errorMessageFor(503, null)) { repository.uploadPhotos(front, back) }.canRetry)

        server.shutdown()
        assertTrue(assertFailsWith(NETWORK_ERROR) { repository.uploadPhotos(front, back) }.canRetry)
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
    fun generateModel_buildsTheModelAndSavesItOnTheDevice() {
        respondWithModelLink()
        respond(200, "glb-bytes")

        val file = runBlocking { repository.generateModel("abc123") }

        val generate = server.takeRequest()
        assertEquals("POST", generate.method)
        assertEquals("/clothing/abc123/generate", generate.path)
        assertEquals("Bearer test-token", generate.getHeader("Authorization"))
        val download = server.takeRequest()
        assertEquals("/files/model.glb", download.path)
        // The link is already signed, so the session token isn't sent to file storage.
        assertNull(download.getHeader("Authorization"))
        assertEquals("glb-bytes", file.readText())
    }

    @Test
    fun generateModel_replacesTheSavedModel() {
        respondWithModelLink()
        respond(200, "old")
        runBlocking { repository.modelFile("abc123") }
        respondWithModelLink()
        respond(200, "new")

        val file = runBlocking { repository.generateModel("abc123") }

        assertEquals("new", file.readText())
    }

    @Test
    fun modelFile_downloadsOnceThenUsesTheSavedCopy() {
        respondWithModelLink()
        respond(200, "glb-bytes")

        val first = runBlocking { repository.modelFile("abc123") }
        val second = runBlocking { repository.modelFile("abc123") }

        assertEquals("/clothing/abc123/model", server.takeRequest().path)
        assertEquals(2, server.requestCount)
        assertEquals(first, second)
        assertEquals("glb-bytes", second.readText())
    }

    @Test
    fun generateModel_explainsWhyItFailed() {
        respond(422, """{"error":"3D models aren't available for shoes items yet"}""")
        assertFailsWith("3D models aren't available for shoes items yet") { repository.generateModel("abc123") }

        respond(503)
        assertFailsWith("3D models aren't available right now. Try again later.") { repository.generateModel("abc123") }
    }

    @Test
    fun failedModelDownload_leavesNoModelBehind() {
        respondWithModelLink()
        respond(403)

        assertFailsWith(errorMessageFor(403, null)) { repository.modelFile("abc123") }
        assertTrue(modelDir.root.listFiles().orEmpty().none { it.name == "abc123.glb" })
    }

    @Test
    fun rejectedToken_endsTheSession() {
        var sessionEnded = false
        val repository = BackendClothingRepository(
            tokenProvider = { token },
            onUnauthorized = { sessionEnded = true },
            baseUrl = server.url("/").toString(),
        )
        respond(401, """{"error":"Invalid or expired token"}""")

        assertFailsWith(errorMessageFor(401, null)) { repository.listItems() }
        assertTrue(sessionEnded)
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