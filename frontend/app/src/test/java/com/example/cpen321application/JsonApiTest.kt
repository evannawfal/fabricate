package com.example.cpen321application

import com.example.cpen321application.data.ApiException
import com.example.cpen321application.network.JsonApi
import com.example.cpen321application.network.NETWORK_ERROR
import com.example.cpen321application.network.NOT_SIGNED_IN
import com.example.cpen321application.network.UNEXPECTED_RESPONSE
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class JsonApiTest {
    private lateinit var server: MockWebServer
    private var token: String? = "test-token"
    private var unauthorizedCalls = 0

    private val api by lazy {
        JsonApi({ token }, { unauthorizedCalls++ }, server.url("/").toString())
    }

    @Before
    fun setUp() {
        server = MockWebServer().apply { start() }
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    private fun respond(status: Int, body: String) = server.enqueue(MockResponse().setResponseCode(status).setBody(body))

    private fun failure(block: suspend () -> Unit): ApiException = runBlocking {
        try {
            block()
            throw AssertionError("Expected an ApiException")
        } catch (e: ApiException) {
            e
        }
    }

    @Test
    fun get_sendsTheTokenAndParsesTheBody() = runBlocking {
        respond(200, """{"name":"Sam"}""")

        val name = api.send("/users/me") { it.getString("name") }

        assertEquals("Sam", name)
        val request = server.takeRequest()
        assertEquals("GET", request.method)
        assertEquals("Bearer test-token", request.getHeader("Authorization"))
    }

    @Test
    fun patch_sendsTheJsonBody() = runBlocking {
        respond(200, "{}")

        api.send("/users/me", JSONObject().put("pronouns", "they/them"), "PATCH") {}

        val request = server.takeRequest()
        assertEquals("PATCH", request.method)
        assertEquals("they/them", JSONObject(request.body.readUtf8()).getString("pronouns"))
    }

    @Test
    fun errorResponse_usesTheServerMessage() {
        respond(400, """{"error":"pronouns must be a string"}""")

        assertEquals("pronouns must be a string", failure { api.send("/users/me") {} }.message)
    }

    @Test
    fun errorResponseWithoutMessage_mentionsTheStatus() {
        respond(500, "oops")

        assertTrue(failure { api.send("/users/me") {} }.message.contains("500"))
    }

    @Test
    fun unauthorized_endsTheSession() {
        respond(401, """{"error":"Invalid or expired token"}""")

        failure { api.send("/users/me") {} }

        assertEquals(1, unauthorizedCalls)
    }

    @Test
    fun malformedBody_isAnUnexpectedResponse() {
        respond(200, "not json")

        assertEquals(UNEXPECTED_RESPONSE, failure { api.send("/users/me") {} }.message)
    }

    @Test
    fun unreachableServer_isANetworkError() {
        server.shutdown()

        assertEquals(NETWORK_ERROR, failure { api.send("/users/me") {} }.message)
    }

    @Test
    fun signedOut_failsWithoutARequest() {
        token = null

        assertEquals(NOT_SIGNED_IN, failure { api.send("/users/me") {} }.message)
        assertEquals(0, server.requestCount)
    }
}
