package com.example.cpen321application.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.example.cpen321application.model.ClothingItem
import com.example.cpen321application.model.GeneratedOutfit
import com.example.cpen321application.model.OutfitOccasion
import com.example.cpen321application.model.Weather
import com.example.cpen321application.viewmodel.OutfitGeneration

// Test tags for the Generate Daily Outfit end-to-end test.
const val GENERATING_OUTFIT_TAG = "generating_outfit"
const val GENERATED_OUTFIT_NAME_TAG = "generated_outfit_name"
const val GENERATED_OUTFIT_ITEM_TAG = "generated_outfit_item"
const val GENERATED_OUTFIT_WEATHER_TAG = "generated_outfit_weather"
const val GENERATED_OUTFIT_ERROR_TAG = "generated_outfit_error"
const val SAVE_GENERATED_OUTFIT_TAG = "save_generated_outfit"
const val REGENERATE_OUTFIT_TAG = "regenerate_outfit"

fun occasionOptionTag(occasion: OutfitOccasion) = "occasion_${occasion.apiValue}"

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun OccasionSheet(onSelect: (OutfitOccasion) -> Unit, onDismiss: () -> Unit) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
    ) {
        Column(modifier = Modifier.padding(bottom = 24.dp)) {
            Text(
                "What's the occasion?",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            )
            OutfitOccasion.entries.forEach { occasion ->
                ListItem(
                    headlineContent = { Text(occasion.label) },
                    modifier = Modifier
                        .clickable { onSelect(occasion) }
                        .testTag(occasionOptionTag(occasion)),
                )
            }
        }
    }
}

/**
 * The outfit generated for [generation]'s occasion, with the weather it was based on. The
 * outfit is only kept if the user saves it. [saveError] is why the last save failed, if it did.
 */
@Composable
internal fun GeneratedOutfitScreen(
    generation: OutfitGeneration,
    isSaving: Boolean,
    saveError: String?,
    onRegenerate: () -> Unit,
    onSave: () -> Unit,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier.fillMaxSize()) {
        Row(modifier = Modifier.padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onClose, enabled = !isSaving) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
            }
            Text("${generation.occasion.label} outfit", style = MaterialTheme.typography.headlineSmall)
        }
        val outfit = generation.outfit
        val contentModifier = Modifier
            .fillMaxWidth()
            .weight(1f)
        when {
            generation.isGenerating -> GeneratingIndicator(contentModifier)
            outfit != null -> GeneratedOutfitDetails(outfit, isSaving, saveError, onRegenerate, onSave, contentModifier)
            else -> Box(contentModifier) {
                EmptyState(
                    title = "Couldn't generate an outfit",
                    message = generation.error.orEmpty(),
                    modifier = Modifier.testTag(GENERATED_OUTFIT_ERROR_TAG),
                    action = if (generation.canRetry) {
                        { TextButton(onClick = onRegenerate) { Text("Try again") } }
                    } else {
                        null
                    },
                )
            }
        }
    }
}

@Composable
private fun GeneratingIndicator(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.testTag(GENERATING_OUTFIT_TAG),
        verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        CircularProgressIndicator()
        Text("Putting your outfit together…", style = MaterialTheme.typography.bodyMedium)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun GeneratedOutfitDetails(
    outfit: GeneratedOutfit,
    isSaving: Boolean,
    saveError: String?,
    onRegenerate: () -> Unit,
    onSave: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(
            outfit.name,
            style = MaterialTheme.typography.titleLarge,
            modifier = Modifier.testTag(GENERATED_OUTFIT_NAME_TAG),
        )
        Text(
            weatherSummary(outfit.weather),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.testTag(GENERATED_OUTFIT_WEATHER_TAG),
        )
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            outfit.items.forEach { item -> GeneratedItem(item) }
        }
        saveError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        GeneratedOutfitActions(isSaving, onRegenerate, onSave)
    }
}

@Composable
private fun GeneratedItem(item: ClothingItem) {
    Column(
        modifier = Modifier
            .width(ITEM_WIDTH)
            .testTag(GENERATED_OUTFIT_ITEM_TAG),
    ) {
        ClothingThumbnail(item, Modifier.fillMaxWidth())
        Text(
            item.name,
            style = MaterialTheme.typography.bodyMedium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(vertical = 6.dp, horizontal = 2.dp),
        )
    }
}

@Composable
private fun GeneratedOutfitActions(isSaving: Boolean, onRegenerate: () -> Unit, onSave: () -> Unit) {
    Button(
        onClick = onSave,
        enabled = !isSaving,
        modifier = Modifier
            .fillMaxWidth()
            .testTag(SAVE_GENERATED_OUTFIT_TAG),
    ) {
        if (isSaving) {
            CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
        } else {
            Text("Save")
        }
    }
    OutlinedButton(
        onClick = onRegenerate,
        enabled = !isSaving,
        modifier = Modifier
            .fillMaxWidth()
            .testTag(REGENERATE_OUTFIT_TAG),
    ) {
        Text("Regenerate")
    }
}

private val ITEM_WIDTH = 150.dp

private fun weatherSummary(weather: Weather?): String =
    if (weather == null) {
        "The weather wasn't considered for this outfit."
    } else {
        "Based on the weather: ${weather.temperatureC}°C, ${weather.description}"
    }
