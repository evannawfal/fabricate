package com.example.cpen321application.data

import com.example.cpen321application.model.ClothingItem
import java.time.Instant

data class Friend(val id: String, val name: String, val email: String)

// [user] is the other person: who sent an incoming request, or who an outgoing one was sent to.
data class FriendRequest(val id: String, val user: Friend)

data class FriendRequests(
    val incoming: List<FriendRequest> = emptyList(),
    val outgoing: List<FriendRequest> = emptyList(),
)

/** Sending a request either sends it, or makes the users friends if the other user had already asked. */
sealed interface FriendRequestResult {
    data class Sent(val request: FriendRequest) : FriendRequestResult

    data class BecameFriends(val friend: Friend) : FriendRequestResult
}

data class RoomMember(val id: String, val name: String)

data class Room(
    val id: String,
    val name: String,
    val members: List<RoomMember>,
    val hostId: String,
    val expiresAt: Instant,
) {
    val hostName: String? get() = members.firstOrNull { it.id == hostId }?.name
}

data class ChatMessage(val id: String, val senderId: String, val senderName: String, val text: String)

/** [closet] is the host's: everyone in the room styles with the host's clothes. */
data class RoomDetail(
    val room: Room,
    val outfitItems: List<ClothingItem>,
    val closet: List<ClothingItem>,
    val messages: List<ChatMessage>,
)

/** Events from an open room. Called on a background thread. */
interface RoomListener {
    fun onConnectionChanged(connected: Boolean)
    fun onMessage(message: ChatMessage)
    fun onOutfitUpdate(items: List<ClothingItem>)
    fun onMemberLeft(name: String)
    fun onError(message: String)
}

/** The live connection to one room; [close] it when the room screen closes. */
interface RoomConnection {
    fun sendMessage(text: String)
    fun updateOutfit(itemIds: List<String>)
    fun close()
}

interface RoomsRepository {
    suspend fun currentUserId(): String?

    suspend fun listRooms(): List<Room>

    suspend fun createRoom(name: String, friendIds: List<String>): Room

    suspend fun getRoom(id: String): RoomDetail

    suspend fun saveOutfit(roomId: String)

    suspend fun listFriends(): List<Friend>

    /** Ends the friendship for both users. */
    suspend fun removeFriend(id: String)

    suspend fun listFriendRequests(): FriendRequests

    suspend fun sendFriendRequest(email: String): FriendRequestResult

    suspend fun acceptFriendRequest(id: String): Friend

    /** Declines a request sent to the user, or cancels one they sent. */
    suspend fun deleteFriendRequest(id: String)

    suspend fun connect(roomId: String, listener: RoomListener): RoomConnection
}
