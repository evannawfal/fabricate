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

/** A failed action, shown to the user in a dialog. */
data class ClosetError(val title: String, val message: String)

data class ClosetUiState(
    val items: List<ClothingItem> = emptyList(),
    val isLoading: Boolean = true,
    val loadError: String? = null,
    val selectedCategory: ClothingCategory? = null,
    val openItemId: String? = null,
    // The item that was just uploaded, so its details can point out the detected values.
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

/**
 * State of the Closet screen. It lives above the bottom navigation, so the closet
 * isn't reloaded (or its filter reset) when the user switches tabs.
 */
class ClosetViewModel(private val repository: ClothingRepository) : ViewModel() {
    private val _uiState = MutableStateFlow(ClosetUiState())
    val uiState: StateFlow<ClosetUiState> = _uiState.asStateFlow()

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

    /**
     * Uploads the photo returned by [readPhoto] and opens the new item's details.
     * If anything fails, an error is shown and nothing is added.
     */
    fun addPhoto(readPhoto: suspend () -> ByteArray) {
        if (_uiState.value.isUploading) return
        _uiState.update { it.copy(isUploading = true) }
        viewModelScope.launch {
            val error = try {
                val item = repository.uploadPhoto(readPhoto())
                _uiState.update {
                    it.copy(items = listOf(item) + it.items, openItemId = item.id, newItemId = item.id)
                }
                null
            } catch (e: ClothingRepositoryException) {
                e.message
            } catch (e: IOException) {
                "Couldn't read that photo. Try another one."
            }
            _uiState.update {
                it.copy(isUploading = false, error = error?.let { message -> ClosetError(ADD_FAILED, message) })
            }
        }
    }

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
                _uiState.update { it.copy(error = ClosetError("Couldn't delete item", e.message)) }
            }
        }
    }

    fun showError(error: ClosetError) = _uiState.update { it.copy(error = error) }

    fun dismissError() = _uiState.update { it.copy(error = null) }

    private companion object {
        const val ADD_FAILED = "Couldn't add item"
    }
}
