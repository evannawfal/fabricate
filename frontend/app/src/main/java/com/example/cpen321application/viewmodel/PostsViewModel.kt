package com.example.cpen321application.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.cpen321application.data.ApiException
import com.example.cpen321application.data.Post
import com.example.cpen321application.data.PostsRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class PostsUiState(
    val posts: List<Post> = emptyList(),
    val isLoading: Boolean = false,
    val loadError: String? = null,
    val deletingId: String? = null,
    val deleteError: String? = null,
)

/** The feed of the user's and their friends' posts. It loads when the feed is opened, not on creation. */
class PostsViewModel(private val repository: PostsRepository) : ViewModel() {
    private val _uiState = MutableStateFlow(PostsUiState())
    val uiState: StateFlow<PostsUiState> = _uiState.asStateFlow()

    fun load() {
        if (_uiState.value.isLoading) return
        _uiState.update { it.copy(isLoading = true, loadError = null) }
        viewModelScope.launch {
            try {
                val posts = repository.listPosts()
                _uiState.update { it.copy(posts = posts, isLoading = false) }
            } catch (e: ApiException) {
                _uiState.update { it.copy(isLoading = false, loadError = e.message) }
            }
        }
    }

    fun deletePost(id: String) {
        if (_uiState.value.deletingId != null) return
        _uiState.update { it.copy(deletingId = id, deleteError = null) }
        viewModelScope.launch {
            try {
                repository.deletePost(id)
                _uiState.update { state -> state.copy(posts = state.posts.filterNot { it.id == id }, deletingId = null) }
            } catch (e: ApiException) {
                _uiState.update { it.copy(deletingId = null, deleteError = e.message) }
            }
        }
    }

    fun dismissDeleteError() = _uiState.update { it.copy(deleteError = null) }
}
