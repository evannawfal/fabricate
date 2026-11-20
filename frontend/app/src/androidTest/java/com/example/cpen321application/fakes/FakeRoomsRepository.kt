package com.example.cpen321application.fakes

import com.example.cpen321application.data.ApiException
import com.example.cpen321application.data.Friend
import com.example.cpen321application.data.FriendRequest
import com.example.cpen321application.data.FriendRequestResult
import com.example.cpen321application.data.FriendRequests
import com.example.cpen321application.data.Room
import com.example.cpen321application.data.RoomConnection
import com.example.cpen321application.data.RoomDetail
import com.example.cpen321application.data.RoomListener
import com.example.cpen321application.data.RoomMember
import com.example.cpen321application.data.RoomsRepository
import com.example.cpen321application.model.ClothingItem
import java.time.Duration
import java.time.Instant

/**
 * In-memory rooms and friends for UI tests; [connect] reports connected right away and drops
 * sent events. Friend and friend request changes fail with [friendRequestError] when it's set.
 */
class FakeRoomsRepository(
    rooms: List<Room> = emptyList(),
    friends: List<Friend> = emptyList(),
    private val closet: List<ClothingItem> = emptyList(),
    incoming: List<FriendRequest> = emptyList(),
    outgoing: List<FriendRequest> = emptyList(),
) : RoomsRepository {
    val rooms = rooms.toMutableList()
    val friends = friends.toMutableList()
    val incoming = incoming.toMutableList()
    val outgoing = outgoing.toMutableList()
    var friendRequestError: String? = null

    override suspend fun currentUserId() = "me"

    override suspend fun listRooms() = rooms.toList()

    override suspend fun createRoom(name: String, friendIds: List<String>): Room {
        val members = listOf(RoomMember("me", "Me")) + friends.filter { it.id in friendIds }.map { RoomMember(it.id, it.name) }
        val room = Room("room-${rooms.size + 1}", name, members, hostId = "me", expiresAt = Instant.now() + Duration.ofDays(2))
        return room.also { rooms.add(0, it) }
    }

    override suspend fun getRoom(id: String) = RoomDetail(rooms.first { it.id == id }, emptyList(), closet, emptyList())

    override suspend fun saveOutfit(roomId: String) = Unit

    override suspend fun listFriends() = friends.toList()

    override suspend fun removeFriend(id: String) {
        friendRequestError?.let { throw ApiException(it) }
        friends.removeAll { it.id == id }
    }

    override suspend fun listFriendRequests() = FriendRequests(incoming.toList(), outgoing.toList())

    // Like the back-end, a request to someone who already asked accepts theirs.
    override suspend fun sendFriendRequest(email: String): FriendRequestResult {
        friendRequestError?.let { throw ApiException(it) }
        val theirs = incoming.firstOrNull { it.user.email == email }
        if (theirs != null) return FriendRequestResult.BecameFriends(acceptFriendRequest(theirs.id))
        val request = FriendRequest("request-${outgoing.size + 1}", Friend("user-$email", email, email))
        outgoing.add(0, request)
        return FriendRequestResult.Sent(request)
    }

    override suspend fun acceptFriendRequest(id: String): Friend {
        friendRequestError?.let { throw ApiException(it) }
        val request = incoming.first { it.id == id }
        incoming.remove(request)
        return request.user.also(friends::add)
    }

    override suspend fun deleteFriendRequest(id: String) {
        friendRequestError?.let { throw ApiException(it) }
        incoming.removeAll { it.id == id }
        outgoing.removeAll { it.id == id }
    }

    override suspend fun connect(roomId: String, listener: RoomListener): RoomConnection {
        listener.onConnectionChanged(true)
        return object : RoomConnection {
            override fun sendMessage(text: String) = Unit
            override fun updateOutfit(itemIds: List<String>) = Unit
            override fun close() = Unit
        }
    }
}
