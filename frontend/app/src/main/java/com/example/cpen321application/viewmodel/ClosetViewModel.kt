package com.example.cpen321application.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.cpen321application.data.ClothingItemChanges
import com.example.cpen321application.data.ClothingRepository
import com.example.cpen321application.data.ClothingRepositoryException
import com.example.cpen321application.model.ClothingCategory
import com.example.cpen321application.model.ClothingItem
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.io.IOException

data class ClosetError(val message: String, val title: String? = null, val canRetry: Boolean = false)

data class ClosetUiState(
    val items: List<ClothingItem> = emptyList(),
    val isLoading: Boolean = true,
    val loadError: String? = null,
    val selectedCategory: ClothingCategory? = null,
    val openItemId: String? = null,
    val newItemId: String? = null,
    val isUploading: Boolean = false,
    val editingItemId: String? = null,
    val isSaving: Boolean = false,
    val editError: String? = null,
    val error: ClosetError? = null,
) {
    val openItem: ClothingItem? get() = items.firstOrNull { it.id == openItemId }
    val editingItem: ClothingItem? get() = items.firstOrNull { it.id == editingItemId }
}

class ClosetViewModel(private val repository: ClothingRepository) : ViewModel() {
    private val _uiState = MutableStateFlow(ClosetUiState())
    val uiState: StateFlow<ClosetUiState> = _uiState.asStateFlow()

    private var failedPhoto: ByteArray? = null

    init {
        loadItems()
    }

    fun loadItems() {
        _uiState.update { it.copy(isLoading = true, loadError = null) }
        viewModelScope.launch {
            try {
                val items = repository.listItems()
                _uiState.update { it.copy(items = items, isLoading = false) }
            } catch (e: ClothingRepositoryException) {
                _uiState.update { it.copy(isLoading = false, loadError = e.message) }
            }
        }
    }

    fun selectCategory(category: ClothingCategory?) = _uiState.update { it.copy(selectedCategory = category) }

    fun openItem(id: String) = _uiState.update { it.copy(openItemId = id) }

    fun closeItem() = _uiState.update { it.copy(openItemId = null, newItemId = null) }

    fun addPhoto(readPhoto: suspend () -> ByteArray) {
        if (_uiState.value.isUploading) return
        _uiState.update { it.copy(isUploading = true, error = null) }
        viewModelScope.launch {
            try {
                upload(readPhoto())
            } catch (e: IOException) {
                finishUpload(ClosetError("Couldn't read that photo. Try another photo."))
            }
        }
    }

    fun retryUpload() {
        val photo = failedPhoto ?: return
        if (_uiState.value.isUploading) return
        _uiState.update { it.copy(isUploading = true, error = null) }
        viewModelScope.launch { upload(photo) }
    }

    private suspend fun upload(photo: ByteArray) {
        try {
            val item = repository.uploadPhoto(photo)
            failedPhoto = null
            _uiState.update {
                it.copy(items = listOf(item) + it.items, newItemId = item.id, selectedCategory = null)
            }
            finishUpload(null)
        } catch (e: ClothingRepositoryException) {
            failedPhoto = photo.takeIf { e.canRetry }
            finishUpload(
                if (e.canRetry) ClosetError(UPLOAD_FAILED, canRetry = true) else ClosetError(e.message),
            )
        }
    }

    private fun finishUpload(error: ClosetError?) = _uiState.update { it.copy(isUploading = false, error = error) }

    fun startEditing(id: String) = _uiState.update { it.copy(editingItemId = id, editError = null) }

    fun cancelEditing() = _uiState.update { it.copy(editingItemId = null, editError = null) }

    fun saveChanges(id: String, changes: ClothingItemChanges) {
        if (_uiState.value.isSaving) return
        _uiState.update { it.copy(isSaving = true, editError = null) }
        viewModelScope.launch {
            try {
                val updated = repository.updateItem(id, changes)
                _uiState.update { state ->
                    state.copy(
                        items = state.items.map { if (it.id == id) updated else it },
                        isSaving = false,
                        editingItemId = null,
                    )
                }
            } catch (e: ClothingRepositoryException) {
                _uiState.update { it.copy(isSaving = false, editError = e.message) }
            }
        }
    }

    fun deleteItem(id: String) {
        viewModelScope.launch {
            try {
                repository.deleteItem(id)
                _uiState.update { state ->
                    state.copy(items = state.items.filterNot { it.id == id }, openItemId = null, newItemId = null)
                }
            } catch (e: ClothingRepositoryException) {
                _uiState.update { it.copy(error = ClosetError(e.message, title = "Couldn't delete item")) }
            }
        }
    }

    fun showError(error: ClosetError) = _uiState.update { it.copy(error = error) }

    fun dismissError() {
        failedPhoto = null
        _uiState.update { it.copy(error = null) }
    }

    private companion object {
        const val UPLOAD_FAILED = "Couldn't add the item. Please try again."
    }
}
