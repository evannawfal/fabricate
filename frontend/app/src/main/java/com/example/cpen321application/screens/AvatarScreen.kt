package com.example.cpen321application.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
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
import com.example.cpen321application.model.BodyMeasurement
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
private val ControlSpacing = 4.dp
private const val SCRIM_ALPHA = 0.4f
private const val CAMERA_DISTANCE = 4.0f
private const val AVATAR_HEIGHT_UNITS = 1.7f

/** The Avatar tab: wires [AvatarScreen] to an [AvatarViewModel]. */
@Composable
fun AvatarRoute(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val avatarViewModel: AvatarViewModel = viewModel {
        AvatarViewModel(SessionStore(context), AvatarStore(context))
    }
    val uiState by avatarViewModel.uiState.collectAsState()

    AvatarScreen(
        uiState = uiState,
        onMeasurementChange = avatarViewModel::setMeasurement,
        onSave = avatarViewModel::save,
        modifier = modifier,
    )
}

/**
 * Avatar customization: a 3D preview of the user's saved avatar, sliders for
 * their body measurements, and a button that creates a new avatar from them.
 */
@Composable
fun AvatarScreen(
    uiState: AvatarUiState,
    onMeasurementChange: (BodyMeasurement, Int) -> Unit,
    onSave: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val saving = uiState.saveState is AvatarSaveState.Saving

    Column(modifier.fillMaxSize()) {
        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
            contentAlignment = Alignment.Center,
        ) {
            val modelFile = uiState.modelFile
            if (modelFile != null) {
                // A new model replaces the whole scene, so the viewer reloads it.
                key(uiState.modelVersion) { AvatarViewer(modelFile) }
            } else {
                Text(
                    text = stringResource(R.string.avatar_not_created),
                    style = MaterialTheme.typography.bodyLarge,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(ScreenPadding),
                )
            }
            if (saving) {
                SavingOverlay()
            }
        }
        AvatarControls(
            uiState = uiState,
            enabled = !saving,
            onMeasurementChange = onMeasurementChange,
            onSave = onSave,
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun AvatarControls(
    uiState: AvatarUiState,
    enabled: Boolean,
    onMeasurementChange: (BodyMeasurement, Int) -> Unit,
    onSave: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(ScreenPadding),
        verticalArrangement = Arrangement.spacedBy(ControlSpacing),
    ) {
        BodyMeasurement.entries.forEach { measurement ->
            MeasurementSlider(
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
        Button(onClick = onSave, enabled = enabled, modifier = Modifier.fillMaxWidth()) {
            Text(stringResource(R.string.avatar_save))
        }
    }
}

@Composable
private fun MeasurementSlider(
    measurement: BodyMeasurement,
    cm: Int,
    enabled: Boolean,
    onChange: (Int) -> Unit,
) {
    val label = stringResource(measurement.labelRes)
    Column {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(label, style = MaterialTheme.typography.labelLarge)
            Text(stringResource(R.string.avatar_cm, cm), style = MaterialTheme.typography.labelLarge)
        }
        Slider(
            value = cm.toFloat(),
            onValueChange = { onChange(it.roundToInt()) },
            // A smooth slider (no tick marks) that snaps to whole centimetres.
            valueRange = measurement.minCm.toFloat()..measurement.maxCm.toFloat(),
            enabled = enabled,
            modifier = Modifier.testTag("avatar_slider_${measurement.apiName}"),
        )
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

@Composable
private fun AvatarViewer(modelFile: File) {
    // Shows the model in 3D; the user can drag to rotate it.
    val engine = rememberEngine()
    val modelLoader = rememberModelLoader(engine)

    val cameraNode = rememberCameraNode(engine) {
        position = Position(z = CAMERA_DISTANCE)
    }

    val childNodes = rememberNodes {
        add(
            ModelNode(
                modelInstance = modelLoader.createModelInstance(modelFile),
                scaleToUnits = AVATAR_HEIGHT_UNITS,
            ).apply {
                // The generated model's origin is at its feet; move its center to the
                // origin, where the camera looks (centerOrigin has no effect here).
                position = Position(
                    x = -center.x * scale.x,
                    y = -center.y * scale.y,
                    z = -center.z * scale.z,
                )
            },
        )
    }

    Scene(
        modifier = Modifier.fillMaxSize(),
        engine = engine,
        modelLoader = modelLoader,
        cameraNode = cameraNode,
        childNodes = childNodes,
        // Orbit around the centered model from the starting camera position.
        cameraManipulator = rememberCameraManipulator(
            orbitHomePosition = cameraNode.worldPosition,
            targetPosition = Position(0f, 0f, 0f),
        ),
    )
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
