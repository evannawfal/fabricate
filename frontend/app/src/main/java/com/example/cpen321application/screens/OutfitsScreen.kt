package com.example.cpen321application.screens

import android.Manifest
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.FloatingActionButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.example.cpen321application.data.hasLocationPermission
import com.example.cpen321application.model.ClothingItem
import com.example.cpen321application.model.Outfit
import com.example.cpen321application.model.OutfitOccasion
import com.example.cpen321application.viewmodel.OutfitsUiState
import com.example.cpen321application.viewmodel.OutfitsViewModel

// Test tags for the Create Outfit end-to-end test.
const val OUTFIT_CARD_TAG = "outfit_card"
const val CREATE_OUTFIT_BUTTON_TAG = "create_outfit_button"
const val GENERATE_OUTFIT_BUTTON_TAG = "generate_outfit_button"

private const val PREVIEW_ITEM_COUNT = 4

/**
 * Displays the user's saved outfits. Create outfit opens an editor to name an outfit and pick
 * its items from [closetItems]; tapping an outfit opens it to rename, change or delete it.
 * Generate outfit asks for an occasion, then shows an outfit picked for it and the weather.
 */
@Composable
fun OutfitsScreen(viewModel: OutfitsViewModel, closetItems: List<ClothingItem>, modifier: Modifier = Modifier) {
    val state by viewModel.uiState.collectAsState()
    var choosingOccasion by rememberSaveable { mutableStateOf(false) }
    val generate = rememberGenerateWithLocation(viewModel)

    val draft = state.draft
    val generation = state.generation
    when {
        generation != null -> {
            BackHandler { viewModel.closeGeneration() }
            GeneratedOutfitScreen(
                generation = generation,
                isSaving = state.isSaving,
                saveError = state.saveError,
                onRegenerate = { generate(generation.occasion) },
                onSave = viewModel::saveGenerated,
                onClose = viewModel::closeGeneration,
                modifier = modifier,
            )
        }
        draft != null -> {
            BackHandler { viewModel.closeDraft() }
            OutfitEditor(state, draft, closetItems, viewModel, modifier)
        }
        else -> Box(modifier = modifier.fillMaxSize()) {
            OutfitList(state, onOpenOutfit = viewModel::startEditing, onRetry = viewModel::loadOutfits)
            OutfitActions(
                onGenerate = { choosingOccasion = true },
                onCreate = viewModel::startCreating,
                modifier = Modifier.align(Alignment.BottomEnd),
            )
        }
    }

    if (choosingOccasion) {
        OccasionSheet(
            onSelect = { occasion ->
                choosingOccasion = false
                generate(occasion)
            },
            onDismiss = { choosingOccasion = false },
        )
    }

    state.deleteError?.let { error ->
        AlertDialog(
            onDismissRequest = viewModel::dismissDeleteError,
            title = { Text("Couldn't delete outfit") },
            text = { Text(error) },
            confirmButton = { TextButton(onClick = viewModel::dismissDeleteError) { Text("OK") } },
        )
    }
}

// Generates an outfit, asking for location access first if needed. A refusal is handled by
// the view model, which explains why the location is needed.
@Composable
private fun rememberGenerateWithLocation(viewModel: OutfitsViewModel): (OutfitOccasion) -> Unit {
    val context = LocalContext.current
    var requestedOccasion by rememberSaveable { mutableStateOf<OutfitOccasion?>(null) }
    val locationPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        requestedOccasion?.let(viewModel::generate)
    }
    return { occasion ->
        if (hasLocationPermission(context)) {
            viewModel.generate(occasion)
        } else {
            requestedOccasion = occasion
            locationPermission.launch(Manifest.permission.ACCESS_COARSE_LOCATION)
        }
    }
}

@Composable
private fun OutfitActions(onGenerate: () -> Unit, onCreate: () -> Unit, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        horizontalAlignment = Alignment.End,
    ) {
        ExtendedFloatingActionButton(
            onClick = onCreate,
            containerColor = MaterialTheme.colorScheme.secondaryContainer,
            elevation = FloatingActionButtonDefaults.loweredElevation(),
            modifier = Modifier.testTag(CREATE_OUTFIT_BUTTON_TAG),
        ) {
            Icon(Icons.Filled.Add, contentDescription = null)
            Text("Create outfit", modifier = Modifier.padding(start = 12.dp))
        }
        ExtendedFloatingActionButton(
            onClick = onGenerate,
            modifier = Modifier.testTag(GENERATE_OUTFIT_BUTTON_TAG),
        ) {
            Icon(Icons.Filled.Star, contentDescription = null)
            Text("Generate outfit", modifier = Modifier.padding(start = 12.dp))
        }
    }
}

@Composable
private fun OutfitList(state: OutfitsUiState, onOpenOutfit: (Outfit) -> Unit, onRetry: () -> Unit) {
    Column(modifier = Modifier.fillMaxSize()) {
        Text(
            "My Outfits",
            style = MaterialTheme.typography.headlineSmall,
            modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 24.dp, bottom = 8.dp),
        )
        when {
            state.isLoading && state.outfits.isEmpty() -> Box(Modifier.fillMaxSize(), Alignment.Center) {
                CircularProgressIndicator()
            }
            state.loadError != null -> EmptyState(
                title = "Couldn't load your outfits",
                message = state.loadError,
                action = { TextButton(onClick = onRetry) { Text("Try again") } },
            )
            state.outfits.isEmpty() -> EmptyState(
                title = "No outfits yet",
                message = "Generate one for today, or create your own from your closet.",
            )
            else -> LazyColumn(
                contentPadding = PaddingValues(start = 16.dp, top = 8.dp, end = 16.dp, bottom = 160.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.fillMaxSize(),
            ) {
                items(state.outfits, key = { it.id }) { outfit ->
                    OutfitCard(outfit, onClick = { onOpenOutfit(outfit) })
                }
            }
        }
    }
}

@Composable
private fun OutfitCard(outfit: Outfit, onClick: () -> Unit) {
    Card(
        onClick = onClick,
        modifier = Modifier
            .fillMaxWidth()
            .testTag(OUTFIT_CARD_TAG),
    ) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(
                outfit.name,
                style = MaterialTheme.typography.titleMedium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                outfit.items.take(PREVIEW_ITEM_COUNT).forEach { item ->
                    ClothingThumbnail(item, Modifier.size(64.dp))
                }
                val hidden = outfit.items.size - PREVIEW_ITEM_COUNT
                if (hidden > 0) {
                    Text("+$hidden", style = MaterialTheme.typography.titleMedium)
                }
            }
        }
    }
}
