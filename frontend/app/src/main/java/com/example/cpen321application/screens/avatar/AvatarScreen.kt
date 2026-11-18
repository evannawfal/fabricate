package com.example.cpen321application.screens.avatar

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.cpen321application.R
import com.example.cpen321application.auth.SessionStore
import com.example.cpen321application.data.AvatarStore
import com.example.cpen321application.data.ClothingRepository
import com.example.cpen321application.model.BodyMeasurement
import com.example.cpen321application.model.ClothingCategory
import com.example.cpen321application.model.ClothingItem
import com.example.cpen321application.ui.theme.CPEN321ApplicationTheme
import com.example.cpen321application.viewmodel.AvatarSaveState
import com.example.cpen321application.viewmodel.AvatarUiState
import com.example.cpen321application.viewmodel.AvatarViewModel

internal val ScreenPadding = 16.dp
internal val ControlSpacing = 8.dp
private const val SCRIM_ALPHA = 0.4f

/** The Avatar tab: wires [AvatarScreen] to an [AvatarViewModel]. */
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

/**
 * Avatar screen with:
 *  - Top half: 3-D SceneView of the avatar + worn garments with automatic body-part hiding & relocation.
 *  - Bottom half: TabRow with "Clothes" and "Measurements" tabs.
 */
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
        // ── 3-D view (top half) ──────────────────────────────────────────
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
            if (saving) SavingOverlay()
        }

        // ── Bottom panel: tab bar + content ─────────────────────────────
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
                    onGarmentSizeChange = onGarmentSizeChange,
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

@Preview(showBackground = true, name = "No avatar yet")
@Composable
private fun AvatarScreenPreview() {
    CPEN321ApplicationTheme {
        AvatarScreen(uiState = AvatarUiState(), onMeasurementChange = { _, _ -> }, onSave = {})
    }
}

@Preview(showBackground = true, name = "Error")
@Composable
private fun AvatarScreenErrorPreview() {
    CPEN321ApplicationTheme {
        AvatarScreen(
            uiState = AvatarUiState(saveState = AvatarSaveState.Error(R.string.avatar_error_generic)),
            onMeasurementChange = { _, _ -> },
            onSave = {},
        )
    }
}