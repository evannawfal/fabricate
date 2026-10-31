package com.example.cpen321application.fakes

import com.example.cpen321application.data.Friend
import com.example.cpen321application.data.Room
import com.example.cpen321application.data.RoomConnection
import com.example.cpen321application.data.RoomDetail
import com.example.cpen321application.data.RoomListener
import com.example.cpen321application.data.RoomMember
import com.example.cpen321application.data.RoomsRepository

/** In-memory rooms for UI tests; [connect] reports connected right away and drops sent events. */
class FakeRoomsRepository(
    rooms: List<Room> = emptyList(),
    friends: List<Friend> = emptyList(),
) : RoomsRepository {
    val rooms = rooms.toMutableList()
    val friends = friends.toMutableList()

    override suspend fun currentUserId() = "me"

    override suspend fun listRooms() = rooms.toList()

    override suspend fun createRoom(name: String, friendIds: List<String>): Room {
        val members = listOf(RoomMember("me", "Me")) + friends.filter { it.id in friendIds }.map { RoomMember(it.id, it.name) }
        return Room("room-${rooms.size + 1}", name, members).also { rooms.add(0, it) }
    }

    override suspend fun getRoom(id: String) = RoomDetail(rooms.first { it.id == id }, emptyList(), emptyList())

    override suspend fun saveOutfit(roomId: String) = Unit

    override suspend fun listFriends() = friends.toList()

    override suspend fun addFriend(email: String) = Friend("friend-${friends.size + 1}", email, email).also(friends::add)

    override suspend fun connect(roomId: String, listener: RoomListener): RoomConnection {
        listener.onConnectionChanged(true)
        return object : RoomConnection {
            override fun sendMessage(text: String) = Unit
            override fun updateOutfit(itemIds: List<String>) = Unit
            override fun close() = Unit
        }
    }
}
