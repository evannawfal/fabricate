package com.example.cpen321application.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.cpen321application.data.ApiException
import com.example.cpen321application.data.Profile
import com.example.cpen321application.data.ProfileRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class ProfileUiState(
    val profile: Profile? = null,
    val isSaving: Boolean = false,
    val error: String? = null,
    val saved: Boolean = false,
)

class ProfileViewModel(private val repository: ProfileRepository) : ViewModel() {
    private val _uiState = MutableStateFlow(ProfileUiState())
    val uiState: StateFlow<ProfileUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun load() = request { _uiState.update { it.copy(profile = repository.getProfile()) } }

    fun savePronouns(pronouns: String) = request {
        _uiState.update { it.copy(isSaving = true) }
        val profile = repository.updatePronouns(pronouns.trim())
        _uiState.update { it.copy(profile = profile, saved = true) }
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
