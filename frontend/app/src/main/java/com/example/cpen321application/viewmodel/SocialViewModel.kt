package com.example.cpen321application.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.cpen321application.data.ClothingRepositoryException
import com.example.cpen321application.data.SocialRepository
import com.example.cpen321application.model.SocialPost
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.io.IOException
import java.time.ZoneId
import java.time.Instant

data class SocialUiState(
    val currentUserId: String? = null,
    val posts: List<SocialPost> = emptyList(),
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val loadError: String? = null,
    /** Non-null while the user is writing a caption and previewing a chosen photo. */
    val pendingPhoto: ByteArray? = null,
    val captionDraft: String = "",
    val isPosting: Boolean = false,
    val postError: String? = null,
    val likingPostIds: Set<String> = emptySet(),
    val deletingPostId: String? = null,
    val actionError: String? = null,
)

class SocialViewModel(private val repository: SocialRepository) : ViewModel() {
    private val _uiState = MutableStateFlow(SocialUiState())
    val uiState: StateFlow<SocialUiState> = _uiState.asStateFlow()

    // Counts likes, unlikes, posts and deletes that have finished, so a background refresh that
    // started before one of them doesn't put the older posts back.
    private var finishedChanges = 0
    private var isPolling = false

    init {
        loadPosts()
    }

    /**
     * Quietly reloads the feed so like counts from friends show up without a manual refresh.
     * Skipped while another load is running, and a failure leaves the feed as it is.
     */
    fun pollPosts() {
        val state = _uiState.value
        if (isPolling || state.isLoading || state.isRefreshing || state.loadError != null) return
        isPolling = true
        val changesAtStart = finishedChanges
        viewModelScope.launch {
            try {
                val posts = repository.listPosts()
                if (finishedChanges == changesAtStart) {
                    _uiState.update { it.copy(posts = posts) }
                }
            } catch (e: ClothingRepositoryException) {
                // The next poll or a manual refresh tries again.
            } finally {
                isPolling = false
            }
        }
    }

    fun loadPosts() {
        _uiState.update { it.copy(isLoading = true, loadError = null) }
        fetchPosts()
    }

    fun refresh() {
        if (_uiState.value.isRefreshing) return
        _uiState.update { it.copy(isRefreshing = true, loadError = null) }
        fetchPosts()
    }

    private fun fetchPosts() {
        viewModelScope.launch {
            try {
                val userId = repository.currentUserId()
                val posts = repository.listPosts()
                _uiState.update {
                    it.copy(
                        currentUserId = userId,
                        posts = posts,
                        isLoading = false,
                        isRefreshing = false,
                    )
                }
            } catch (e: ClothingRepositoryException) {
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        isRefreshing = false,
                        loadError = e.message,
                    )
                }
            }
        }
    }

    fun preparePost(readPhoto: suspend () -> ByteArray) {
        if (_uiState.value.isPosting) return
        viewModelScope.launch {
            try {
                val bytes = readPhoto()
                _uiState.update {
                    it.copy(
                        pendingPhoto = bytes,
                        captionDraft = "",
                        postError = null,
                    )
                }
            } catch (e: IOException) {
                _uiState.update { it.copy(actionError = "Couldn't read that photo. Try again.") }
            }
        }
    }

    fun updateCaption(caption: String) {
        _uiState.update { it.copy(captionDraft = caption.take(MAX_CAPTION_LENGTH)) }
    }

    fun cancelComposing() {
        if (_uiState.value.isPosting) return
        _uiState.update { it.copy(pendingPhoto = null, captionDraft = "", postError = null) }
    }

    fun submitPost() {
        val state = _uiState.value
        val photo = state.pendingPhoto ?: return
        if (state.isPosting) return

        _uiState.update { it.copy(isPosting = true, postError = null) }
        // Backend expects JS-style Date.getTimezoneOffset() (minutes behind UTC, e.g. PST = +480).
        val tzOffsetMinutes = -ZoneId.systemDefault().rules.getOffset(Instant.now()).totalSeconds / 60

        viewModelScope.launch {
            try {
                val created = repository.createPost(photo, state.captionDraft.trim(), tzOffsetMinutes)
                finishedChanges++
                _uiState.update {
                    it.copy(
                        posts = listOf(created) + it.posts,
                        pendingPhoto = null,
                        captionDraft = "",
                        isPosting = false,
                    )
                }
            } catch (e: ClothingRepositoryException) {
                _uiState.update { it.copy(isPosting = false, postError = e.message) }
            }
        }
    }

    fun toggleLike(post: SocialPost) {
        if (post.id in _uiState.value.likingPostIds) return
        _uiState.update { it.copy(likingPostIds = it.likingPostIds + post.id, actionError = null) }
        viewModelScope.launch {
            try {
                val updated = if (post.likedByMe) {
                    repository.unlikePost(post.id)
                } else {
                    repository.likePost(post.id)
                }
                finishedChanges++
                _uiState.update { state ->
                    state.copy(
                        posts = state.posts.map { if (it.id == post.id) updated else it },
                        likingPostIds = state.likingPostIds - post.id,
                    )
                }
            } catch (e: ClothingRepositoryException) {
                _uiState.update { state ->
                    state.copy(
                        likingPostIds = state.likingPostIds - post.id,
                        actionError = e.message,
                    )
                }
            }
        }
    }

    fun deletePost(id: String) {
        if (_uiState.value.deletingPostId != null) return
        _uiState.update { it.copy(deletingPostId = id, actionError = null) }
        viewModelScope.launch {
            try {
                repository.deletePost(id)
                finishedChanges++
                _uiState.update { state ->
                    state.copy(
                        posts = state.posts.filterNot { it.id == id },
                        deletingPostId = null,
                    )
                }
            } catch (e: ClothingRepositoryException) {
                _uiState.update { it.copy(deletingPostId = null, actionError = e.message) }
            }
        }
    }

    fun showActionError(message: String) = _uiState.update { it.copy(actionError = message) }

    fun dismissActionError() = _uiState.update { it.copy(actionError = null) }

    private companion object {
        const val MAX_CAPTION_LENGTH = 280
    }
}