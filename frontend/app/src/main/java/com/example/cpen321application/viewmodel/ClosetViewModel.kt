package com.example.cpen321application.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.cpen321application.data.ClothingItemChanges
import com.example.cpen321application.data.ClothingRepository
import com.example.cpen321application.data.ClothingRepositoryException
import com.example.cpen321application.model.ClothingCategory
import com.example.cpen321application.model.ClothingItem
import com.example.cpen321application.model.PhotoSide
import com.example.cpen321application.model.filterByCategory
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
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
    val washBinOnly: Boolean = false,
    /** Items picked to move in or out of the wash bin together; null when not selecting. */
    val selectedIds: Set<String>? = null,
    val updatingCleanIds: Set<String> = emptySet(),
    val openItemId: String? = null,
    val newItemId: String? = null,
    val isUploading: Boolean = false,
    /** Which photo is being asked for while adding clothing; null when not adding. */
    val captureSide: PhotoSide? = null,
    val editingItemId: String? = null,
    val isSaving: Boolean = false,
    val editError: String? = null,
    val generatingModelId: String? = null,
    val modelError: String? = null,
    val error: ClosetError? = null,
) {
    val openItem: ClothingItem? get() = items.firstOrNull { it.id == openItemId }
    val editingItem: ClothingItem? get() = items.firstOrNull { it.id == editingItemId }
    val visibleItems: List<ClothingItem>
        get() = items.filterByCategory(selectedCategory).filter { !washBinOnly || !it.isClean }
    val selectedItems: List<ClothingItem> get() = items.filter { it.id in selectedIds.orEmpty() }
}

class ClosetViewModel(private val repository: ClothingRepository) : ViewModel() {
    private val _uiState = MutableStateFlow(ClosetUiState())
    val uiState: StateFlow<ClosetUiState> = _uiState.asStateFlow()

    // The front photo, held while the user takes the back photo.
    private var frontPhoto: ByteArray? = null

    // Both photos of the last upload that failed in a way worth retrying.
    private var failedPhotos: Pair<ByteArray, ByteArray>? = null

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

    fun setFilter(category: ClothingCategory?, washBinOnly: Boolean) =
        _uiState.update { it.copy(selectedCategory = category, washBinOnly = washBinOnly) }

    fun openItem(id: String) = _uiState.update { it.copy(openItemId = id) }

    fun closeItem() = _uiState.update { it.copy(openItemId = null, newItemId = null, modelError = null) }

    /** Starts adding an item: the front photo is asked for first, then the back. */
    fun startAddingClothing() {
        if (_uiState.value.isUploading) return
        frontPhoto = null
        _uiState.update { it.copy(captureSide = PhotoSide.Front, error = null) }
    }

    /** Abandons adding an item, discarding any photo already taken. */
    fun cancelAddingClothing() {
        frontPhoto = null
        _uiState.update { it.copy(captureSide = null) }
    }

    /**
     * Called with each photo the user takes or picks: the front first, then the back.
     * The item is uploaded once both photos are in.
     */
    fun addPhoto(readPhoto: suspend () -> ByteArray) {
        val state = _uiState.value
        val side = state.captureSide ?: return
        if (state.isUploading) return
        if (side == PhotoSide.Back) _uiState.update { it.copy(isUploading = true, error = null) }
        viewModelScope.launch {
            try {
                val photo = readPhoto()
                when (side) {
                    PhotoSide.Front -> {
                        frontPhoto = photo
                        _uiState.update { it.copy(captureSide = PhotoSide.Back) }
                    }
                    PhotoSide.Back -> {
                        val front = frontPhoto
                        if (front == null) {
                            // Shouldn't happen; start over.
                            _uiState.update { it.copy(captureSide = PhotoSide.Front) }
                            finishUpload(null)
                        } else {
                            _uiState.update { it.copy(captureSide = null) }
                            upload(front, photo)
                        }
                    }
                }
            } catch (e: IOException) {
                frontPhoto = null
                _uiState.update { it.copy(captureSide = null) }
                finishUpload(ClosetError("Couldn't read that photo. Try again."))
            }
        }
    }

    fun retryUpload() {
        val (front, back) = failedPhotos ?: return
        if (_uiState.value.isUploading) return
        _uiState.update { it.copy(isUploading = true, error = null) }
        viewModelScope.launch { upload(front, back) }
    }

    private suspend fun upload(front: ByteArray, back: ByteArray) {
        try {
            val item = repository.uploadPhotos(front, back)
            failedPhotos = null
            frontPhoto = null
            _uiState.update {
                it.copy(items = listOf(item) + it.items, newItemId = item.id, selectedCategory = null)
            }
            finishUpload(null)
        } catch (e: ClothingRepositoryException) {
            failedPhotos = (front to back).takeIf { e.canRetry }
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

    fun generateModel(id: String) {
        if (_uiState.value.generatingModelId != null) return
        _uiState.update { it.copy(generatingModelId = id, modelError = null) }
        viewModelScope.launch {
            try {
                repository.generateModel(id)
                _uiState.update { state ->
                    state.copy(
                        items = state.items.map { if (it.id == id) it.copy(hasModel = true) else it },
                        generatingModelId = null,
                    )
                }
            } catch (e: ClothingRepositoryException) {
                _uiState.update { it.copy(generatingModelId = null, modelError = e.message) }
            }
        }
    }

    fun setSelection(ids: Set<String>?) = _uiState.update { it.copy(selectedIds = ids) }

    /**
     * Moves the items out of the wash bin when [isClean], or into it. Each item is its own request, so
     * some can fail while others succeed; when selecting, the ones that failed stay selected to retry.
     */
    fun setClean(ids: Collection<String>, isClean: Boolean) {
        val state = _uiState.value
        if (state.updatingCleanIds.isNotEmpty()) return
        val changing = state.items.filter { it.id in ids && it.isClean != isClean }.map { it.id }.toSet()
        if (changing.isEmpty()) return
        _uiState.update { it.copy(updatingCleanIds = changing) }
        viewModelScope.launch {
            val results = repository.setCleanEach(changing, isClean)
            val updated = results.values.mapNotNull { it.getOrNull() }.associateBy { it.id }
            val failedIds = results.filterValues { it.isFailure }.keys
            val firstError = results.values.firstNotNullOfOrNull { it.exceptionOrNull()?.message }
            _uiState.update { current ->
                current.copy(
                    items = current.items.map { updated[it.id] ?: it },
                    updatingCleanIds = emptySet(),
                    selectedIds = failedIds.takeIf { current.selectedIds != null && it.isNotEmpty() },
                    error = firstError?.let { ClosetError(it, title = cleanErrorTitle(failedIds.size, isClean)) },
                )
            }
        }
    }

    fun showError(error: ClosetError) = _uiState.update { it.copy(error = error) }

    fun dismissError() {
        failedPhotos = null
        _uiState.update { it.copy(error = null) }
    }

    private companion object {
        const val UPLOAD_FAILED = "Couldn't add the item. Please try again."

        fun cleanErrorTitle(failed: Int, isClean: Boolean): String {
            val items = if (failed == 1) "1 item" else "$failed items"
            return if (isClean) "Couldn't mark $items clean" else "Couldn't move $items to the wash bin"
        }
    }
}

private suspend fun ClothingRepository.setCleanEach(
    ids: Set<String>,
    isClean: Boolean,
): Map<String, Result<ClothingItem>> = coroutineScope {
    ids.map { id -> async { id to trySetClean(id, isClean) } }.awaitAll().toMap()
}

private suspend fun ClothingRepository.trySetClean(id: String, isClean: Boolean): Result<ClothingItem> = try {
    Result.success(setClean(id, isClean))
} catch (e: ClothingRepositoryException) {
    Result.failure(e)
}
