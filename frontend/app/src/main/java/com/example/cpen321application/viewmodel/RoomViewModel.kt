package com.example.cpen321application.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.cpen321application.data.ChatMessage
import com.example.cpen321application.data.ClothingRepository
import com.example.cpen321application.data.ClothingRepositoryException
import com.example.cpen321application.data.Room
import com.example.cpen321application.data.RoomConnection
import com.example.cpen321application.data.RoomListener
import com.example.cpen321application.data.ApiException
import com.example.cpen321application.data.RoomsRepository
import com.example.cpen321application.model.ClothingItem
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class RoomUiState(
    val room: Room? = null,
    val currentUserId: String? = null,
    val messages: List<ChatMessage> = emptyList(),
    val board: List<ClothingItem> = emptyList(),
    val closet: List<ClothingItem> = emptyList(),
    val isConnected: Boolean = false,
    val hasConnected: Boolean = false,
    val loadError: String? = null,
    val isSaving: Boolean = false,
    val notice: String? = null,
)

class RoomViewModel(
    private val roomId: String,
    private val rooms: RoomsRepository,
    private val clothing: ClothingRepository,
) : ViewModel(), RoomListener {
    private val _uiState = MutableStateFlow(RoomUiState())
    val uiState: StateFlow<RoomUiState> = _uiState.asStateFlow()
    private var connection: RoomConnection? = null
    private var hasLeft = false

    init {
        load()
    }

    fun load() {
        _uiState.update { it.copy(loadError = null) }
        viewModelScope.launch {
            try {
                val detail = rooms.getRoom(roomId)
                val closet = clothing.listItems()
                _uiState.update {
                    it.copy(
                        room = detail.room,
                        currentUserId = rooms.currentUserId(),
                        messages = detail.messages,
                        board = detail.outfitItems,
                        closet = closet,
                    )
                }
                connection?.close()
                connection = rooms.connect(roomId, this@RoomViewModel)
                // The screen may have closed while the room was loading.
                if (hasLeft) leave()
            } catch (e: ApiException) {
                _uiState.update { it.copy(loadError = e.message) }
            } catch (e: ClothingRepositoryException) {
                _uiState.update { it.copy(loadError = e.message) }
            }
        }
    }

    fun sendMessage(text: String) {
        if (text.isNotBlank() && _uiState.value.isConnected) connection?.sendMessage(text.trim())
    }

    fun addItem(item: ClothingItem) = updateBoard(_uiState.value.board.map { it.id } + item.id)

    fun removeItem(id: String) = updateBoard(_uiState.value.board.map { it.id } - id)

    // The board changes when the server broadcasts the update back, so every member sees the same order.
    private fun updateBoard(itemIds: List<String>) {
        if (_uiState.value.isConnected) connection?.updateOutfit(itemIds.distinct())
    }

    fun saveOutfit() {
        if (_uiState.value.isSaving) return
        _uiState.update { it.copy(isSaving = true) }
        viewModelScope.launch {
            val notice = try {
                rooms.saveOutfit(roomId)
                "Outfit saved to your outfits."
            } catch (e: ApiException) {
                e.message
            }
            _uiState.update { it.copy(isSaving = false, notice = notice) }
        }
    }

    fun dismissNotice() = _uiState.update { it.copy(notice = null) }

    override fun onConnectionChanged(connected: Boolean) =
        _uiState.update { it.copy(isConnected = connected, hasConnected = it.hasConnected || connected) }

    override fun onMessage(message: ChatMessage) = _uiState.update { it.copy(messages = it.messages + message) }

    override fun onOutfitUpdate(items: List<ClothingItem>) = _uiState.update { it.copy(board = items) }

    override fun onMemberLeft(name: String) = _uiState.update { it.copy(notice = "$name left the room.") }

    override fun onError(message: String) = _uiState.update { it.copy(notice = message) }

    /** Leaves the room; the screen calls this when it closes. */
    fun leave() {
        hasLeft = true
        connection?.close()
        connection = null
    }

    override fun onCleared() = leave()
}
