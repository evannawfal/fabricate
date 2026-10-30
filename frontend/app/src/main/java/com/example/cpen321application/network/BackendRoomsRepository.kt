package com.example.cpen321application.network

import com.example.cpen321application.BuildConfig
import com.example.cpen321application.auth.SessionToken
import com.example.cpen321application.data.ApiException
import com.example.cpen321application.data.ChatMessage
import com.example.cpen321application.data.Friend
import com.example.cpen321application.data.Room
import com.example.cpen321application.data.RoomConnection
import com.example.cpen321application.data.RoomDetail
import com.example.cpen321application.data.RoomListener
import com.example.cpen321application.data.RoomMember
import com.example.cpen321application.data.RoomsRepository
import com.example.cpen321application.model.ClothingItem
import io.socket.client.Ack
import io.socket.client.IO
import io.socket.client.Socket
import io.socket.engineio.client.transports.WebSocket
import org.json.JSONArray
import org.json.JSONObject

/** Rooms and friends on the back-end (`/rooms`, `/friends`, and the room socket). */
class BackendRoomsRepository(
    private val tokenProvider: suspend () -> String?,
    onUnauthorized: suspend () -> Unit = {},
    baseUrl: String = BuildConfig.API_BASE_URL,
) : RoomsRepository {
    private val api = JsonApi(tokenProvider, onUnauthorized, baseUrl)
    private val baseUrl = baseUrl.trimEnd('/')

    override suspend fun currentUserId(): String? = tokenProvider()?.let(SessionToken::userId)

    override suspend fun listRooms(): List<Room> = api.send("/rooms") { it.getJSONArray("rooms").map(::parseRoom) }

    override suspend fun createRoom(name: String, friendIds: List<String>): Room {
        val body = JSONObject().put("name", name).put("friendIds", JSONArray(friendIds))
        return api.send("/rooms", body, parse = ::parseRoom)
    }

    override suspend fun getRoom(id: String): RoomDetail = api.send("/rooms/$id") { json ->
        RoomDetail(
            room = parseRoom(json),
            outfitItems = parseItems(json.getJSONArray("outfitItems")),
            messages = json.getJSONArray("messages").map(::parseMessage),
        )
    }

    override suspend fun saveOutfit(roomId: String) {
        api.send("/rooms/$roomId/save", JSONObject()) {}
    }

    override suspend fun listFriends(): List<Friend> =
        api.send("/friends") { it.getJSONArray("friends").map(::parseFriend) }

    override suspend fun addFriend(email: String): Friend =
        api.send("/friends", JSONObject().put("email", email), parse = ::parseFriend)

    override suspend fun connect(roomId: String, listener: RoomListener): RoomConnection {
        val token = tokenProvider() ?: throw ApiException(NOT_SIGNED_IN)
        return SocketRoomConnection(baseUrl, token, roomId, listener)
    }
}

private class SocketRoomConnection(
    baseUrl: String,
    token: String,
    roomId: String,
    private val listener: RoomListener,
) : RoomConnection {
    private val socket: Socket = IO.socket(
        baseUrl,
        IO.Options.builder()
            .setAuth(mapOf("token" to token, "roomId" to roomId))
            .setTransports(arrayOf(WebSocket.NAME))
            .build(),
    )

    init {
        socket.on(Socket.EVENT_CONNECT) { listener.onConnectionChanged(true) }
        socket.on(Socket.EVENT_DISCONNECT) { listener.onConnectionChanged(false) }
        socket.on(Socket.EVENT_CONNECT_ERROR) { args ->
            listener.onConnectionChanged(false)
            // The server refused the connection (e.g. not a member), so the client won't retry.
            (args.firstOrNull() as? JSONObject)?.optString("message")?.ifBlank { null }?.let(listener::onError)
        }
        socket.on("room:message") { args -> listener.onMessage(parseMessage(args[0] as JSONObject)) }
        socket.on("room:outfitUpdate") { args ->
            listener.onOutfitUpdate(parseItems((args[0] as JSONObject).getJSONArray("items")))
        }
        socket.on("room:memberLeft") { args -> listener.onMemberLeft((args[0] as JSONObject).getString("name")) }
        socket.connect()
    }

    override fun sendMessage(text: String) = emit("room:message", JSONObject().put("text", text))

    override fun updateOutfit(itemIds: List<String>) =
        emit("room:outfitUpdate", JSONObject().put("itemIds", JSONArray(itemIds)))

    override fun close() {
        socket.off()
        socket.disconnect()
    }

    private fun emit(event: String, payload: JSONObject) {
        socket.emit(event, payload, Ack { args ->
            (args.firstOrNull() as? JSONObject)?.optString("error")?.ifBlank { null }?.let(listener::onError)
        })
    }
}

private fun <T> JSONArray.map(transform: (JSONObject) -> T): List<T> = (0 until length()).map { transform(getJSONObject(it)) }

private fun parseItems(items: JSONArray): List<ClothingItem> = items.map(::parseClothingItem).filterNotNull()

private fun parseRoom(json: JSONObject) = Room(
    id = json.getString("id"),
    name = json.getString("name"),
    members = json.getJSONArray("members").map { RoomMember(it.getString("id"), it.getString("name")) },
)

private fun parseMessage(json: JSONObject) = ChatMessage(
    id = json.getString("id"),
    senderId = json.getString("senderId"),
    senderName = json.getString("senderName"),
    text = json.getString("text"),
)

private fun parseFriend(json: JSONObject) = Friend(json.getString("id"), json.getString("name"), json.getString("email"))
