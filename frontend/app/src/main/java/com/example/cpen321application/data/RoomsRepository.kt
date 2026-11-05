package com.example.cpen321application.data

import com.example.cpen321application.model.ClothingItem

data class Friend(val id: String, val name: String, val email: String)

data class RoomMember(val id: String, val name: String)

data class Room(val id: String, val name: String, val members: List<RoomMember>)

data class ChatMessage(val id: String, val senderId: String, val senderName: String, val text: String)

data class RoomDetail(val room: Room, val outfitItems: List<ClothingItem>, val messages: List<ChatMessage>)

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

    suspend fun addFriend(email: String): Friend

    suspend fun connect(roomId: String, listener: RoomListener): RoomConnection
}
