package com.example.cpen321application.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.cpen321application.data.ClothingRepositoryException
import com.example.cpen321application.data.OutfitChanges
import com.example.cpen321application.data.OutfitRepository
import com.example.cpen321application.model.ClothingItem
import com.example.cpen321application.model.Outfit
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** An outfit being created (no [outfitId]) or edited. */
data class OutfitDraft(
    val outfitId: String? = null,
    val name: String = "",
    val items: List<ClothingItem> = emptyList(),
) {
    val canSave: Boolean get() = name.isNotBlank() && items.isNotEmpty()

    fun contains(item: ClothingItem): Boolean = items.any { it.id == item.id }
}

data class OutfitsUiState(
    val outfits: List<Outfit> = emptyList(),
    val isLoading: Boolean = true,
    val loadError: String? = null,
    val draft: OutfitDraft? = null,
    val isSaving: Boolean = false,
    val saveError: String? = null,
    val isDeleting: Boolean = false,
    val deleteError: String? = null,
) {
    val isBusy: Boolean get() = isSaving || isDeleting
}

class OutfitsViewModel(private val repository: OutfitRepository) : ViewModel() {
    private val _uiState = MutableStateFlow(OutfitsUiState())
    val uiState: StateFlow<OutfitsUiState> = _uiState.asStateFlow()

    init {
        loadOutfits()
    }

    fun loadOutfits() {
        _uiState.update { it.copy(isLoading = true, loadError = null) }
        viewModelScope.launch {
            try {
                val outfits = repository.listOutfits()
                _uiState.update { it.copy(outfits = outfits, isLoading = false) }
            } catch (e: ClothingRepositoryException) {
                _uiState.update { it.copy(isLoading = false, loadError = e.message) }
            }
        }
    }

    fun startCreating() = _uiState.update { it.copy(draft = OutfitDraft(), saveError = null) }

    fun startEditing(outfit: Outfit) =
        _uiState.update { it.copy(draft = OutfitDraft(outfit.id, outfit.name, outfit.items), saveError = null) }

    fun closeDraft() = _uiState.update { if (it.isBusy) it else it.copy(draft = null, saveError = null) }

    fun rename(name: String) = updateDraft { it.copy(name = name.take(NAME_MAX_LENGTH)) }

    fun toggleItem(item: ClothingItem) = updateDraft { draft ->
        when {
            draft.contains(item) -> draft.copy(items = draft.items.filterNot { it.id == item.id })
            draft.items.size < MAX_ITEMS -> draft.copy(items = draft.items + item)
            else -> draft
        }
    }

    private fun updateDraft(change: (OutfitDraft) -> OutfitDraft) =
        _uiState.update { state -> if (state.isBusy) state else state.copy(draft = state.draft?.let(change)) }

    fun saveDraft() {
        val state = _uiState.value
        val draft = state.draft ?: return
        if (state.isBusy || !draft.canSave) return
        _uiState.update { it.copy(isSaving = true, saveError = null) }
        viewModelScope.launch {
            try {
                // All outfits list clothing items in same order (E.g. tops, bottoms, shoes)
                val changes = OutfitChanges(draft.name.trim(), draft.items.sortedBy { it.category }.map { it.id })
                val saved = draft.outfitId?.let { repository.updateOutfit(it, changes) }
                    ?: repository.createOutfit(changes)
                _uiState.update { it.copy(outfits = it.outfits.upsert(saved), draft = null, isSaving = false) }
            } catch (e: ClothingRepositoryException) {
                _uiState.update { it.copy(isSaving = false, saveError = e.message) }
            }
        }
    }

    fun deleteOutfit(id: String) {
        if (_uiState.value.isBusy) return
        _uiState.update { it.copy(isDeleting = true) }
        viewModelScope.launch {
            try {
                repository.deleteOutfit(id)
                _uiState.update { state ->
                    state.copy(outfits = state.outfits.filterNot { it.id == id }, draft = null, isDeleting = false)
                }
            } catch (e: ClothingRepositoryException) {
                _uiState.update { it.copy(isDeleting = false, deleteError = e.message) }
            }
        }
    }

    fun dismissDeleteError() = _uiState.update { it.copy(deleteError = null) }

    private companion object {
        // Limits from the back-end's outfit model.
        const val NAME_MAX_LENGTH = 100
        const val MAX_ITEMS = 20
    }
}

// New outfits appear at the top of the list
private fun List<Outfit>.upsert(outfit: Outfit): List<Outfit> =
    if (any { it.id == outfit.id }) map { if (it.id == outfit.id) outfit else it } else listOf(outfit) + this
