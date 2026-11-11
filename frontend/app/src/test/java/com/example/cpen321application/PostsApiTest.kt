package com.example.cpen321application

import com.example.cpen321application.data.ApiException
import com.example.cpen321application.network.BackendPostsRepository
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test

class PostsApiTest {
    private lateinit var server: MockWebServer

    private val repository by lazy {
        BackendPostsRepository(tokenProvider = { "test-token" }, baseUrl = server.url("/").toString())
    }

    @Before
    fun setUp() {
        server = MockWebServer().apply { start() }
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    private fun itemJson(id: String, category: String) =
        JSONObject()
            .put("id", id)
            .put("name", "Item $id")
            .put("category", category)
            .put("color", "black")
            .put("style", "casual")
            .put("imageUrl", JSONObject.NULL)
            .put("backImageUrl", JSONObject.NULL)

    private fun postJson(id: String, author: String, isOwn: Boolean, items: JSONArray) =
        JSONObject()
            .put("id", id)
            .put("author", JSONObject().put("id", "u-$id").put("name", author))
            .put("isOwn", isOwn)
            .put("outfitId", "o-$id")
            .put("name", "Outfit $id")
            .put("items", items)
            .put("postedAt", "2026-11-11T18:00:00.000Z")

    private fun respond(status: Int, body: String = "") =
        server.enqueue(MockResponse().setResponseCode(status).setBody(body))

    @Test
    fun listPosts_parsesPostsAndSkipsItemsOfUnknownCategories() = runBlocking {
        val items = JSONArray().put(itemJson("1", "top")).put(itemJson("2", "hat"))
        val posts = JSONArray().put(postJson("p1", "Sam Lee", false, items)).put(postJson("p2", "Test User", true, JSONArray()))
        respond(200, JSONObject().put("posts", posts).toString())

        val result = repository.listPosts()

        assertEquals(listOf("p1", "p2"), result.map { it.id })
        assertEquals("Sam Lee", result[0].authorName)
        assertEquals("Outfit p1", result[0].outfitName)
        assertFalse(result[0].isOwn)
        assertTrue(result[1].isOwn)
        assertEquals(listOf("1"), result[0].items.map { it.id })
        val request = server.takeRequest()
        assertEquals("GET", request.method)
        assertEquals("/posts", request.path)
        assertEquals("Bearer test-token", request.getHeader("Authorization"))
    }

    @Test
    fun postOutfit_sendsTheOutfitIdAndParsesThePost() = runBlocking {
        respond(201, postJson("p1", "Test User", true, JSONArray().put(itemJson("1", "top"))).toString())

        val post = repository.postOutfit("o1")

        assertEquals("p1", post.id)
        assertTrue(post.isOwn)
        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/posts", request.path)
        assertEquals("o1", JSONObject(request.body.readUtf8()).getString("outfitId"))
    }

    @Test
    fun deletePost_sendsADeleteAndAcceptsAnEmptyResponse() = runBlocking {
        respond(204)

        repository.deletePost("p1")

        val request = server.takeRequest()
        assertEquals("DELETE", request.method)
        assertEquals("/posts/p1", request.path)
    }

    @Test
    fun serverError_usesTheServerMessage() {
        respond(403, """{"error":"You can only delete your own post"}""")

        try {
            runBlocking { repository.deletePost("p1") }
            fail("Expected ApiException")
        } catch (e: ApiException) {
            assertEquals("You can only delete your own post", e.message)
        }
    }
}
