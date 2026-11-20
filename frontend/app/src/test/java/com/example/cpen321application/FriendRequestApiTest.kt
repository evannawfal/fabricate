package com.example.cpen321application

import com.example.cpen321application.data.Friend
import com.example.cpen321application.data.FriendRequest
import com.example.cpen321application.data.FriendRequestResult
import com.example.cpen321application.network.BackendRoomsRepository
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test

class FriendRequestApiTest {
    private lateinit var server: MockWebServer

    private val repository by lazy { BackendRoomsRepository({ "test-token" }, baseUrl = server.url("/").toString()) }

    private val kim = """{"id":"u2","name":"Kim","email":"kim@example.com"}"""
    private val kimFriend = Friend("u2", "Kim", "kim@example.com")

    @Before
    fun setUp() {
        server = MockWebServer().apply { start() }
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    private fun respond(status: Int, body: String = "") =
        server.enqueue(MockResponse().setResponseCode(status).setBody(body))

    @Test
    fun listsIncomingAndOutgoingRequests() = runBlocking {
        respond(200, """{"incoming":[{"id":"r1","user":$kim,"sentAt":"2026-11-19T10:00:00Z"}],"outgoing":[]}""")

        val requests = repository.listFriendRequests()

        assertEquals(listOf(FriendRequest("r1", kimFriend)), requests.incoming)
        assertEquals(emptyList<FriendRequest>(), requests.outgoing)
        assertEquals("/friends/requests", server.takeRequest().path)
    }

    @Test
    fun sendingARequest_postsTheEmail() = runBlocking {
        respond(201, """{"status":"sent","request":{"id":"r2","user":$kim,"sentAt":"2026-11-19T10:00:00Z"}}""")

        val result = repository.sendFriendRequest("kim@example.com")

        assertEquals(FriendRequestResult.Sent(FriendRequest("r2", kimFriend)), result)
        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/friends/requests", request.path)
        assertEquals("kim@example.com", JSONObject(request.body.readUtf8()).getString("email"))
    }

    @Test
    fun sendingToSomeoneWhoAskedFirst_makesFriends() = runBlocking {
        respond(200, """{"status":"friends","friend":$kim}""")

        assertEquals(FriendRequestResult.BecameFriends(kimFriend), repository.sendFriendRequest("kim@example.com"))
    }

    @Test
    fun removingAFriendSendsDelete() = runBlocking {
        respond(204)

        repository.removeFriend("u2")

        assertEquals("DELETE /friends/u2", server.takeRequest().let { "${it.method} ${it.path}" })
    }

    @Test
    fun acceptingAndRemovingUseTheRequestId() = runBlocking {
        respond(200, kim)
        respond(204)

        assertEquals(kimFriend, repository.acceptFriendRequest("r1"))
        repository.deleteFriendRequest("r1")

        assertEquals("POST /friends/requests/r1/accept", server.takeRequest().let { "${it.method} ${it.path}" })
        assertEquals("DELETE /friends/requests/r1", server.takeRequest().let { "${it.method} ${it.path}" })
    }
}
