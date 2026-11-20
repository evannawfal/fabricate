package com.example.cpen321application.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.cpen321application.data.ApiException
import com.example.cpen321application.data.Friend
import com.example.cpen321application.data.FriendRequest
import com.example.cpen321application.data.FriendRequestResult
import com.example.cpen321application.data.Profile
import com.example.cpen321application.data.ProfileRepository
import com.example.cpen321application.data.RoomsRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class ProfileUiState(
    val profile: Profile? = null,
    val friends: List<Friend> = emptyList(),
    val incomingRequests: List<FriendRequest> = emptyList(),
    val outgoingRequests: List<FriendRequest> = emptyList(),
    val isSaving: Boolean = false,
    val error: String? = null,
    val saved: Boolean = false,
    val isUpdatingFriends: Boolean = false,
    val friendError: String? = null,
    val friendMessage: String? = null,
    /** Counts the requests sent, so the screen can clear the email it was sent to. */
    val requestsSent: Int = 0,
)

class ProfileViewModel(
    private val repository: ProfileRepository,
    private val roomsRepository: RoomsRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(ProfileUiState())
    val uiState: StateFlow<ProfileUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun load() = request {
        val profile = repository.getProfile()
        val friends = roomsRepository.listFriends()
        val requests = roomsRepository.listFriendRequests()
        _uiState.update {
            it.copy(
                profile = profile,
                friends = friends,
                incomingRequests = requests.incoming,
                outgoingRequests = requests.outgoing,
            )
        }
    }

    fun savePronouns(pronouns: String) = request {
        _uiState.update { it.copy(isSaving = true) }
        val profile = repository.updatePronouns(pronouns.trim())
        _uiState.update { it.copy(profile = profile, saved = true) }
    }

    fun sendFriendRequest(email: String) {
        val trimmed = email.trim()
        if (trimmed.isEmpty()) return
        updateFriends(
            action = { roomsRepository.sendFriendRequest(trimmed) },
            apply = { state, result ->
                val updated = when (result) {
                    is FriendRequestResult.Sent -> state.copy(
                        outgoingRequests = listOf(result.request) + state.outgoingRequests,
                        friendMessage = "Friend request sent to ${result.request.user.name}.",
                    )
                    is FriendRequestResult.BecameFriends -> state.withFriend(result.friend)
                }
                updated.copy(requestsSent = state.requestsSent + 1)
            },
        )
    }

    fun acceptFriendRequest(request: FriendRequest) = updateFriends(
        action = { roomsRepository.acceptFriendRequest(request.id) },
        apply = { state, friend -> state.withFriend(friend) },
    )

    /** Declines a request sent to the user, or cancels one they sent. */
    fun removeFriendRequest(request: FriendRequest) = updateFriends(
        action = { roomsRepository.deleteFriendRequest(request.id) },
        apply = { state, _ ->
            state.copy(
                incomingRequests = state.incomingRequests.filterNot { it.id == request.id },
                outgoingRequests = state.outgoingRequests.filterNot { it.id == request.id },
            )
        },
    )

    fun removeFriend(friend: Friend) = updateFriends(
        action = { roomsRepository.removeFriend(friend.id) },
        apply = { state, _ ->
            state.copy(
                friends = state.friends.filterNot { it.id == friend.id },
                friendMessage = "Removed ${friend.name} from your friends.",
            )
        },
    )

    fun clearFriendMessages() = _uiState.update { it.copy(friendError = null, friendMessage = null) }

    // One friend change at a time; [apply] updates the latest state with what [action] returned.
    private fun <T> updateFriends(action: suspend () -> T, apply: (ProfileUiState, T) -> ProfileUiState) {
        if (_uiState.value.isUpdatingFriends) return
        _uiState.update { it.copy(isUpdatingFriends = true, friendError = null, friendMessage = null) }
        viewModelScope.launch {
            try {
                val result = action()
                _uiState.update { apply(it, result).copy(isUpdatingFriends = false) }
            } catch (e: ApiException) {
                _uiState.update { it.copy(isUpdatingFriends = false, friendError = e.message) }
            }
        }
    }

    private fun request(action: suspend () -> Unit) {
        _uiState.update { it.copy(error = null, saved = false) }
        viewModelScope.launch {
            try {
                action()
            } catch (e: ApiException) {
                _uiState.update { it.copy(error = e.message) }
            } finally {
                _uiState.update { it.copy(isSaving = false) }
            }
        }
    }
}

// Their request, if any, is accepted along with the friendship, so it leaves the incoming list.
private fun ProfileUiState.withFriend(friend: Friend) = copy(
    friends = (friends.filterNot { it.id == friend.id } + friend).sortedBy(Friend::name),
    incomingRequests = incomingRequests.filterNot { it.user.id == friend.id },
    friendMessage = "You and ${friend.name} are now friends.",
)
