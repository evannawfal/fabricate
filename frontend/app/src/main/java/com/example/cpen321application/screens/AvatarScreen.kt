package com.example.cpen321application.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
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
import com.example.cpen321application.model.AvatarMeasurements
import com.example.cpen321application.model.Bounds
import com.example.cpen321application.model.GarmentSizeRange
import com.example.cpen321application.model.bodyWidth
import com.example.cpen321application.model.placeGarment
import com.example.cpen321application.model.placeGarmentWithReferencePoints
import com.example.cpen321application.ui.theme.CPEN321ApplicationTheme
import com.example.cpen321application.viewmodel.AvatarSaveState
import com.example.cpen321application.viewmodel.AvatarUiState
import com.example.cpen321application.viewmodel.AvatarViewModel
import io.github.sceneview.Scene
import io.github.sceneview.math.Position
import io.github.sceneview.node.ModelNode
import io.github.sceneview.rememberCameraManipulator
import io.github.sceneview.rememberCameraNode
import io.github.sceneview.rememberEngine
import io.github.sceneview.rememberModelLoader
import io.github.sceneview.rememberNodes
import java.io.File
import kotlin.math.roundToInt

private val ScreenPadding = 16.dp
private val ControlSpacing = 8.dp
private const val SCRIM_ALPHA = 0.4f
private const val CAMERA_DISTANCE = 4.0f
private const val AVATAR_HEIGHT_UNITS = 1.7f
private val GarmentSpinnerSize = 16.dp

data class AvatarBodyPart(val id: String, val displayName: String, val color: Color)

val AVATAR_BODY_PARTS = listOf(
    AvatarBodyPart("head", "Head & Neck", Color(0xFF9B5DE5)),
    AvatarBodyPart("torso", "Torso", Color(0xFFF15BB5)),
    AvatarBodyPart("leftArm", "Left Arm", Color(0xFF00BBF9)),
    AvatarBodyPart("rightArm", "Right Arm", Color(0xFF00F5D4)),
    AvatarBodyPart("upperLegs", "Upper Legs", Color(0xFFFEE440)),
    AvatarBodyPart("lowerLegs", "Lower Legs", Color(0xFFFF9F1C)),
)

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
 *  - Top half: 3-D SceneView of the avatar + worn garments.
 *  - Bottom half: TabRow with "Clothes", "Body Parts", and "Measurements" tabs.
 *
 *  Measurements tab uses text input fields (not sliders).
 *  Only Height, Shoulder Width, and Hip Width are user-editable;
 *  Chest Width and Waist Width are defaulted to 35 cm and 30 cm.
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
    var hiddenParts by remember { mutableStateOf(setOf<String>()) }
    val tabs = listOf("Clothes", "Body Parts", "Measurements")

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
                        hiddenParts = hiddenParts,
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
                0 -> ClothesTab(
                    uiState = uiState,
                    onToggleGarment = onToggleGarment,
                    onGarmentSizeChange = onGarmentSizeChange,
                )
                1 -> BodyPartsTab(
                    hiddenParts = hiddenParts,
                    onTogglePart = { partId ->
                        hiddenParts = if (hiddenParts.contains(partId)) {
                            hiddenParts - partId
                        } else {
                            hiddenParts + partId
                        }
                    },
                )
                2 -> MeasurementsTab(
                    uiState = uiState,
                    enabled = !saving,
                    onMeasurementChange = onMeasurementChange,
                    onSave = onSave,
                )
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Clothes tab (Main Tab)
// ─────────────────────────────────────────────────────────────────────────────

@Composable
private fun ClothesTab(
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

// ─────────────────────────────────────────────────────────────────────────────
// Body Parts tab (View & Toggle avatar segments)
// ─────────────────────────────────────────────────────────────────────────────

@Composable
private fun BodyPartsTab(
    hiddenParts: Set<String>,
    onTogglePart: (String) -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(ScreenPadding),
        verticalArrangement = Arrangement.spacedBy(ControlSpacing),
    ) {
        Text(
            "Toggle body part visibility to see individual segments:",
            style = MaterialTheme.typography.bodyMedium,
        )

        AVATAR_BODY_PARTS.forEach { part ->
            val isVisible = !hiddenParts.contains(part.id)
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 2.dp),
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Box(
                        modifier = Modifier
                            .size(16.dp)
                            .background(part.color, RoundedCornerShape(4.dp)),
                    )
                    Text(part.displayName, style = MaterialTheme.typography.bodyLarge)
                }
                Checkbox(
                    checked = isVisible,
                    onCheckedChange = { onTogglePart(part.id) },
                )
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Measurements tab (Height, Shoulder Width, Hip Width as text inputs)
// ─────────────────────────────────────────────────────────────────────────────

/** Only these three measurements are shown to the user; the rest are fixed defaults. */
private val UserMeasurements = listOf(
    BodyMeasurement.Height,
    BodyMeasurement.Shoulders,
    BodyMeasurement.Hips,
)

@Composable
private fun MeasurementsTab(
    uiState: AvatarUiState,
    enabled: Boolean,
    onMeasurementChange: (BodyMeasurement, Int) -> Unit,
    onSave: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(ScreenPadding),
        verticalArrangement = Arrangement.spacedBy(ControlSpacing),
    ) {
        Text(
            "Enter your measurements to customise the avatar.",
            style = MaterialTheme.typography.bodyMedium,
        )

        UserMeasurements.forEach { measurement ->
            MeasurementInputField(
                measurement = measurement,
                cm = uiState.measurements[measurement],
                enabled = enabled,
                onChange = { onMeasurementChange(measurement, it) },
            )
        }

        val saveState = uiState.saveState
        if (saveState is AvatarSaveState.Error) {
            Text(
                text = stringResource(saveState.messageRes),
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodyMedium,
            )
        }

        Button(
            onClick = onSave,
            enabled = enabled,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(stringResource(R.string.avatar_save))
        }
    }
}

@Composable
private fun MeasurementInputField(
    measurement: BodyMeasurement,
    cm: Int,
    enabled: Boolean,
    onChange: (Int) -> Unit,
) {
    val label = stringResource(measurement.labelRes)
    var text by remember(cm) { mutableStateOf(cm.toString()) }

    OutlinedTextField(
        value = text,
        onValueChange = { raw ->
            text = raw
            raw.toIntOrNull()?.let { v -> onChange(v) }
        },
        label = { Text("$label (cm)") },
        singleLine = true,
        enabled = enabled,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        modifier = Modifier
            .fillMaxWidth()
            .testTag("avatar_input_${measurement.apiName}"),
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Saving overlay
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// 3-D viewer
// ─────────────────────────────────────────────────────────────────────────────

@Composable
private fun AvatarViewer(
    modelFile: File,
    garments: Map<ClothingCategory, File>,
    garmentItems: Map<ClothingCategory, ClothingItem?>,
    sizes: Map<ClothingCategory, Float>,
    measurements: AvatarMeasurements,
    hiddenParts: Set<String> = emptySet(),
) {
    val engine = rememberEngine()
    val modelLoader = rememberModelLoader(engine)

    val cameraNode = rememberCameraNode(engine) {
        position = Position(z = CAMERA_DISTANCE)
    }

    val garmentNodes = remember { mutableMapOf<ClothingCategory, ModelNode>() }
    val childNodes = rememberNodes {
        add(
            ModelNode(
                modelInstance = modelLoader.createModelInstance(modelFile),
                scaleToUnits = AVATAR_HEIGHT_UNITS,
            ).apply {
                position = Position(
                    x = -center.x * scale.x,
                    y = -center.y * scale.y,
                    z = -center.z * scale.z,
                )
                garments.forEach { (category, file) ->
                    garmentNodes[category] =
                        ModelNode(modelInstance = modelLoader.createModelInstance(file))
                            .also(::addChildNode)
                }
            },
        )
    }

    val avatar = childNodes.first() as ModelNode
    SideEffect {
        // Toggle individual body parts visibility
        avatar.renderableNodes.forEach { node ->
            val partName = node.name
            if (!partName.isNullOrEmpty()) {
                node.isVisible = !hiddenParts.contains(partName)
            }
        }

        // Place and scale garments using reference points or fallback bounds
        val avatarBounds = Bounds(avatar.center, avatar.halfExtent)
        garmentNodes.forEach { (category, node) ->
            val item = garmentItems[category]
            val refPoints = item?.referencePoints
            val isPants = item?.name?.contains(Regex("(pant|jean|trouser|legging)", RegexOption.IGNORE_CASE)) == true

            val refPlacement = if (refPoints != null) {
                placeGarmentWithReferencePoints(
                    category = category,
                    referencePoints = refPoints,
                    measurements = measurements,
                    isPants = isPants,
                    size = sizes[category] ?: 1f,
                )
            } else null

            val placement = refPlacement ?: placeGarment(
                category = category,
                garment = Bounds(node.center, node.halfExtent),
                avatar = avatarBounds,
                bodyWidth = bodyWidth(category, measurements, avatarBounds),
                size = sizes[category] ?: 1f,
            )
            node.scale = placement.scale
            node.position = placement.position
        }
    }

    Scene(
        modifier = Modifier.fillMaxSize(),
        engine = engine,
        modelLoader = modelLoader,
        cameraNode = cameraNode,
        childNodes = childNodes,
        cameraManipulator = rememberCameraManipulator(
            orbitHomePosition = cameraNode.worldPosition,
            targetPosition = Position(0f, 0f, 0f),
        ),
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Previews
// ─────────────────────────────────────────────────────────────────────────────

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

