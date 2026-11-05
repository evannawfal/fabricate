package com.example.cpen321application.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.cpen321application.data.Friend
import com.example.cpen321application.data.Room
import com.example.cpen321application.data.ApiException
import com.example.cpen321application.data.RoomsRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class RoomsUiState(
    val rooms: List<Room> = emptyList(),
    val friends: List<Friend> = emptyList(),
    val isLoading: Boolean = true,
    val isBusy: Boolean = false,
    val error: String? = null,
    val isCreating: Boolean = false,
    val openRoomId: String? = null,
)

class RoomsViewModel(private val repository: RoomsRepository) : ViewModel() {
    private val _uiState = MutableStateFlow(RoomsUiState())
    val uiState: StateFlow<RoomsUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun load() {
        _uiState.update { it.copy(isLoading = true, error = null) }
        perform {
            val rooms = repository.listRooms()
            val friends = repository.listFriends()
            _uiState.update { it.copy(rooms = rooms, friends = friends, isLoading = false) }
        }
    }

    fun startCreating() = _uiState.update { it.copy(isCreating = true, error = null) }

    fun cancelCreating() = _uiState.update { it.copy(isCreating = false) }

    fun createRoom(name: String, friendIds: List<String>) = perform {
        val room = repository.createRoom(name, friendIds)
        _uiState.update { it.copy(rooms = listOf(room) + it.rooms, isCreating = false, openRoomId = room.id) }
    }

    fun addFriend(email: String) = perform {
        val friend = repository.addFriend(email)
        _uiState.update { it.copy(friends = (it.friends + friend).sortedBy(Friend::name)) }
    }

    fun openRoom(id: String) = _uiState.update { it.copy(openRoomId = id) }

    fun closeRoom() = _uiState.update { it.copy(openRoomId = null) }

    fun dismissError() = _uiState.update { it.copy(error = null) }

    private fun perform(action: suspend () -> Unit) {
        if (_uiState.value.isBusy) return
        _uiState.update { it.copy(isBusy = true, error = null) }
        viewModelScope.launch {
            try {
                action()
            } catch (e: ApiException) {
                _uiState.update { it.copy(error = e.message, isLoading = false) }
            } finally {
                _uiState.update { it.copy(isBusy = false) }
            }
        }
    }
}
