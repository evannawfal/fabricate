package com.example.cpen321application.screens.avatar

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.example.cpen321application.R
import com.example.cpen321application.model.ClothingCategory
import com.example.cpen321application.model.ClothingItem
import com.example.cpen321application.model.GarmentSizeRange
import com.example.cpen321application.viewmodel.AvatarUiState

private val GarmentSpinnerSize = 16.dp

@Composable
internal fun AvatarClothesTab(
    uiState: AvatarUiState,
    onToggleGarment: (ClothingItem) -> Unit,
    onGarmentSizeChange: (ClothingCategory, Float) -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(ScreenPadding),
        verticalArrangement = Arrangement.spacedBy(ControlSpacing),
    ) {
        Text(stringResource(R.string.avatar_try_on), style = MaterialTheme.typography.labelLarge)

        if (uiState.wardrobe.isEmpty()) {
            Text(
                stringResource(R.string.avatar_try_on_empty),
                style = MaterialTheme.typography.bodyMedium,
            )
        }

        LazyRow(horizontalArrangement = Arrangement.spacedBy(ControlSpacing)) {
            items(uiState.wardrobe, key = { it.id }) { item ->
                val loading = uiState.tryingOnId == item.id
                FilterChip(
                    selected = uiState.isWorn(item),
                    onClick = { onToggleGarment(item) },
                    enabled = uiState.tryingOnId == null,
                    label = {
                        Text(
                            if (loading && !item.hasModel) stringResource(R.string.avatar_creating_model)
                            else item.name
                        )
                    },
                    leadingIcon = if (loading) {
                        { CircularProgressIndicator(Modifier.size(GarmentSpinnerSize), strokeWidth = 2.dp) }
                    } else null,
                    modifier = Modifier.testTag("avatar_garment_${item.id}"),
                )
            }
        }

        uiState.worn.forEach { (category, garment) ->
            val name = uiState.wardrobe.firstOrNull { it.id == garment.itemId }?.name
            if (name != null) {
                Text(stringResource(R.string.avatar_garment_size, name), style = MaterialTheme.typography.labelMedium)
                Slider(
                    value = garment.size,
                    onValueChange = { onGarmentSizeChange(category, it) },
                    valueRange = GarmentSizeRange,
                    modifier = Modifier.testTag("avatar_garment_size_${garment.itemId}"),
                )
            }
        }

        uiState.tryOnError?.let {
            Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
        }
    }
}