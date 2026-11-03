package com.example.cpen321application.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.cpen321application.data.ClothingRepositoryException
import com.example.cpen321application.data.RecommendationRepository
import com.example.cpen321application.data.deviceCountryCode
import com.example.cpen321application.model.ClothingCategory
import com.example.cpen321application.model.ClothingItem
import com.example.cpen321application.model.Recommendations
import com.example.cpen321application.model.ShopDepartment
import com.example.cpen321application.model.StoreItem
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class ShopUiState(
    val department: ShopDepartment = ShopDepartment.All,
    val recommendations: Recommendations? = null,
    val isLoading: Boolean = true,
    val error: String? = null,
    val canRetry: Boolean = false,
    val openItem: StoreItem? = null,
)

class ShopViewModel(
    private val repository: RecommendationRepository,
    private val country: String? = deviceCountryCode(),
) : ViewModel() {
    private val _uiState = MutableStateFlow(ShopUiState())
    val uiState: StateFlow<ShopUiState> = _uiState.asStateFlow()

    private data class GapAnalysisInput(
        val id: String,
        val category: ClothingCategory,
        val color: String,
        val style: String,
    )

    private var analyzedCloset: List<GapAnalysisInput>? = null
    private var loadJob: Job? = null

    /**
     * Loads recommendations if [closet] differs from the one they're for. Called when the Shop
     * tab opens rather than at startup, because store searches use up paid credits.
     */
    fun refreshFor(closet: List<ClothingItem>) {
        val inputs = closet.map { GapAnalysisInput(it.id, it.category, it.color, it.style) }
        if (inputs != analyzedCloset) {
            analyzedCloset = inputs
            load()
        }
    }

    fun load() {
        loadJob?.cancel()
        _uiState.update {
            it.copy(recommendations = null, isLoading = true, error = null, canRetry = false, openItem = null)
        }
        val department = _uiState.value.department
        loadJob = viewModelScope.launch {
            try {
                val recommendations = repository.getRecommendations(department, country)
                _uiState.update { it.copy(recommendations = recommendations, isLoading = false) }
            } catch (e: ClothingRepositoryException) {
                _uiState.update { it.copy(isLoading = false, error = e.message, canRetry = e.canRetry) }
            }
        }
    }

    fun selectDepartment(department: ShopDepartment) {
        if (department != _uiState.value.department) {
            _uiState.update { it.copy(department = department) }
            load()
        }
    }

    fun openItem(item: StoreItem) = _uiState.update { it.copy(openItem = item) }

    fun closeItem() = _uiState.update { it.copy(openItem = null) }
}
