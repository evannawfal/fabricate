package com.example.cpen321application.screens.avatar

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.cpen321application.R
import com.example.cpen321application.auth.SessionStore
import com.example.cpen321application.data.AvatarStore
import com.example.cpen321application.data.ClothingRepository
import com.example.cpen321application.model.BodyMeasurement
import com.example.cpen321application.model.ClothingCategory
import com.example.cpen321application.model.ClothingItem
import com.example.cpen321application.model.GarmentSizeRange
import com.example.cpen321application.viewmodel.AvatarSaveState
import com.example.cpen321application.viewmodel.AvatarUiState
import com.example.cpen321application.viewmodel.AvatarViewModel
import com.example.cpen321application.viewmodel.WornGarment

internal val ScreenPadding = 16.dp
internal val ControlSpacing = 8.dp
private const val SCRIM_ALPHA = 0.4f

@Composable
fun AvatarRoute(clothingRepository: ClothingRepository, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val avatarViewModel: AvatarViewModel = viewModel {
        AvatarViewModel(SessionStore(context), AvatarStore(context), clothingRepository)
    }
    val uiState by avatarViewModel.uiState.collectAsState()
    LaunchedEffect(avatarViewModel) { avatarViewModel.loadWardrobe() }

    AvatarScreen(
        uiState = uiState,
        onMeasurementChange = avatarViewModel::setMeasurement,
        onSave = avatarViewModel::save,
        onToggleGarment = avatarViewModel::toggleGarment,
        onGarmentSizeChange = avatarViewModel::setGarmentSize,
        modifier = modifier,
    )
}

@Composable
fun AvatarScreen(
    uiState: AvatarUiState,
    onMeasurementChange: (BodyMeasurement, Int) -> Unit,
    onSave: () -> Unit,
    modifier: Modifier = Modifier,
    onToggleGarment: (ClothingItem) -> Unit = {},
    onGarmentSizeChange: (ClothingCategory, Float) -> Unit = { _, _ -> },
) {
    val saving = uiState.saveState is AvatarSaveState.Saving
    var selectedTab by remember { mutableIntStateOf(0) }
    val tabs = listOf("Clothes", "Measurements")

    Column(modifier.fillMaxSize()) {
        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
            contentAlignment = Alignment.Center,
        ) {
            val modelFile = uiState.modelFile
            if (modelFile != null) {
                key(uiState.modelVersion, uiState.garmentModels) {
                    AvatarViewer(
                        modelFile = modelFile,
                        garments = uiState.garmentModels,
                        garmentItems = uiState.garmentItems,
                        sizes = uiState.garmentSizes,
                        measurements = uiState.measurements,
                    )
                }
            } else {
                Text(
                    text = stringResource(R.string.avatar_not_created),
                    style = MaterialTheme.typography.bodyLarge,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(ScreenPadding),
                )
            }

            if (uiState.worn.isNotEmpty() && selectedTab == 0) {
                GarmentSizeOverlay(
                    worn = uiState.worn,
                    onGarmentSizeChange = onGarmentSizeChange,
                    modifier = Modifier
                        .align(Alignment.CenterEnd)
                        .padding(end = 8.dp),
                )
            }

            if (saving) SavingOverlay()
        }

        Column(Modifier.weight(1f)) {
            TabRow(selectedTabIndex = selectedTab) {
                tabs.forEachIndexed { index, title ->
                    Tab(
                        selected = selectedTab == index,
                        onClick = { selectedTab = index },
                        text = { Text(title) },
                    )
                }
            }

            when (selectedTab) {
                0 -> AvatarClothesTab(
                    uiState = uiState,
                    onToggleGarment = onToggleGarment,
                )
                1 -> AvatarMeasurementsTab(
                    uiState = uiState,
                    enabled = !saving,
                    onMeasurementChange = onMeasurementChange,
                    onSave = onSave,
                )
            }
        }
    }
}

@Composable
private fun GarmentSizeOverlay(
    worn: Map<ClothingCategory, WornGarment>,
    onGarmentSizeChange: (ClothingCategory, Float) -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surface.copy(alpha = 0.85f),
        tonalElevation = 2.dp,
        modifier = modifier,
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            worn.forEach { (category, garment) ->
                val label = when (category) {
                    ClothingCategory.Top -> "Top size"
                    ClothingCategory.Bottom -> "Bottom size"
                    ClothingCategory.Outerwear -> "Outerwear size"
                    else -> "${category.name} size"
                }
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Text(
                        text = label,
                        style = MaterialTheme.typography.labelSmall,
                        textAlign = TextAlign.Center,
                    )
                    VerticalSlider(
                        value = garment.size,
                        onValueChange = { onGarmentSizeChange(category, it) },
                        modifier = Modifier
                            .height(140.dp)
                            .width(32.dp)
                            .testTag("avatar_garment_size_${garment.itemId}"),
                    )
                }
            }
        }
    }
}

@Composable
private fun VerticalSlider(
    value: Float,
    onValueChange: (Float) -> Unit,
    modifier: Modifier = Modifier,
) {
    Slider(
        value = value,
        onValueChange = onValueChange,
        valueRange = GarmentSizeRange,
        modifier = modifier
            .graphicsLayer {
                rotationZ = 270f
                transformOrigin = TransformOrigin(0f, 0f)
            }
            .layout { measurable, constraints ->
                val placeable = measurable.measure(
                    Constraints(
                        minWidth = constraints.minHeight,
                        maxWidth = constraints.maxHeight,
                        minHeight = constraints.minWidth,
                        maxHeight = constraints.maxHeight,
                    )
                )
                layout(placeable.height, placeable.width) {
                    placeable.place(-placeable.width, 0)
                }
            },
    )
}

@Composable
private fun SavingOverlay() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.scrim.copy(alpha = SCRIM_ALPHA)),
        verticalArrangement = Arrangement.spacedBy(ScreenPadding, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        CircularProgressIndicator(Modifier.testTag("avatar_saving"))
        Text(
            text = stringResource(R.string.avatar_saving),
            color = MaterialTheme.colorScheme.inverseOnSurface,
        )
    }
}
