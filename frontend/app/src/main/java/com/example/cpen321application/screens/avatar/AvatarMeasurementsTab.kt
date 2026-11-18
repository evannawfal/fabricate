package com.example.cpen321application.screens.avatar

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import com.example.cpen321application.R
import com.example.cpen321application.model.BodyMeasurement
import com.example.cpen321application.viewmodel.AvatarSaveState
import com.example.cpen321application.viewmodel.AvatarUiState

private val UserMeasurements = listOf(
    BodyMeasurement.Height,
    BodyMeasurement.Shoulders,
    BodyMeasurement.Hips,
)

@Composable
internal fun AvatarMeasurementsTab(
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