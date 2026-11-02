package com.example.cpen321application.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.SuggestionChip
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.example.cpen321application.data.readPhotoForUpload
import com.example.cpen321application.model.ClothingCategory
import com.example.cpen321application.model.ClothingItem
import com.example.cpen321application.model.filterByCategory
import com.example.cpen321application.viewmodel.ClosetError
import com.example.cpen321application.viewmodel.ClosetUiState
import com.example.cpen321application.viewmodel.ClosetViewModel

// Test tags used by the Upload Clothing end-to-end test (documentation/Testing.md, section 4).
const val CLOSET_ITEM_TAG = "closet_item"
const val CLOSET_ITEM_IMAGE_TAG = "closet_item_image"

/**
 * The user's closet: a category filter over a grid of their clothing items.
 * Items are added from a photo with the Add button. Tapping an item opens its
 * details, where it can be edited or deleted.
 */
@Composable
fun ClosetScreen(viewModel: ClosetViewModel, modifier: Modifier = Modifier) {
    val state by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    var choosingPhotoSource by rememberSaveable { mutableStateOf(false) }
    val photoPicker = rememberPhotoPicker(
        onPhoto = { uri -> viewModel.addPhoto { readPhotoForUpload(context, uri) } },
        onCameraUnavailable = {
            viewModel.showError(ClosetError("No camera app is available.", title = "Couldn't open the camera"))
        },
    )

    val openItem = state.openItem
    if (openItem != null) {
        BackHandler { viewModel.closeItem() }
        ClothingItemDetail(
            item = openItem,
            isNew = openItem.id == state.newItemId,
            onBack = viewModel::closeItem,
            onEdit = { viewModel.startEditing(openItem.id) },
            onDelete = { viewModel.deleteItem(openItem.id) },
            modifier = modifier,
        )
    } else {
        Box(modifier = modifier.fillMaxSize()) {
            ClosetGrid(
                state = state,
                onSelectCategory = viewModel::selectCategory,
                onOpenItem = { viewModel.openItem(it.id) },
                onRetry = viewModel::loadItems,
            )
            ExtendedFloatingActionButton(
                onClick = { choosingPhotoSource = true },
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(16.dp),
            ) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Text("Add clothing", modifier = Modifier.padding(start = 12.dp))
            }
        }
    }

    if (choosingPhotoSource) {
        PhotoSourceSheet(
            onTakePhoto = {
                choosingPhotoSource = false
                photoPicker.takePhoto()
            },
            onChooseFromGallery = {
                choosingPhotoSource = false
                photoPicker.chooseFromGallery()
            },
            onDismiss = { choosingPhotoSource = false },
        )
    }
    ClosetDialogs(state, viewModel)
}

// The dialogs that can show over the closet: uploading, editing an item, and errors.
@Composable
private fun ClosetDialogs(state: ClosetUiState, viewModel: ClosetViewModel) {
    if (state.isUploading) {
        UploadingDialog()
    }
    state.editingItem?.let { item ->
        EditItemDialog(
            item = item,
            isSaving = state.isSaving,
            error = state.editError,
            onSave = { changes -> viewModel.saveChanges(item.id, changes) },
            onDismiss = viewModel::cancelEditing,
        )
    }
    state.error?.let { error ->
        AlertDialog(
            onDismissRequest = viewModel::dismissError,
            title = error.title?.let { title -> { Text(title) } },
            text = { Text(error.message) },
            confirmButton = {
                if (error.canRetry) {
                    TextButton(onClick = viewModel::retryUpload) { Text("Try again") }
                } else {
                    TextButton(onClick = viewModel::dismissError) { Text("OK") }
                }
            },
            dismissButton = if (error.canRetry) {
                { TextButton(onClick = viewModel::dismissError) { Text("Cancel") } }
            } else {
                null
            },
        )
    }
}

@Composable
private fun ClosetGrid(
    state: ClosetUiState,
    onSelectCategory: (ClothingCategory?) -> Unit,
    onOpenItem: (ClothingItem) -> Unit,
    onRetry: () -> Unit,
) {
    val items = state.items
    Column(modifier = Modifier.fillMaxSize()) {
        Text(
            "My Closet",
            style = MaterialTheme.typography.headlineSmall,
            modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 24.dp, bottom = 8.dp),
        )

        if (items.isNotEmpty()) {
            CategoryFilter(state.selectedCategory, onSelectCategory)
        }

        val visibleItems = items.filterByCategory(state.selectedCategory)
        when {
            state.isLoading && items.isEmpty() -> Box(Modifier.fillMaxSize(), Alignment.Center) {
                CircularProgressIndicator()
            }
            state.loadError != null -> EmptyState(
                title = "Couldn't load your closet",
                message = state.loadError,
                action = { TextButton(onClick = onRetry) { Text("Try again") } },
            )
            items.isEmpty() -> EmptyState(
                title = "Your closet is empty",
                message = "Tap Add clothing to photograph your first item.",
            )
            visibleItems.isEmpty() -> EmptyState(
                title = "No ${state.selectedCategory?.label?.lowercase()} yet",
                message = "Try another category.",
            )
            else -> LazyVerticalGrid(
                columns = GridCells.Fixed(2),
                // Extra space at the bottom so the Add button doesn't cover the last row.
                contentPadding = PaddingValues(start = 16.dp, top = 16.dp, end = 16.dp, bottom = 88.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.fillMaxSize(),
            ) {
                items(visibleItems, key = { it.id }) { item ->
                    ClothingItemCard(item, onClick = { onOpenItem(item) })
                }
            }
        }
    }
}

@Composable
private fun CategoryFilter(
    selected: ClothingCategory?,
    onSelect: (ClothingCategory?) -> Unit,
) {
    val options = listOf<ClothingCategory?>(null) + ClothingCategory.entries
    LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items(options) { category ->
            FilterChip(
                selected = category == selected,
                onClick = { onSelect(category) },
                label = { Text(category?.label ?: "All") },
            )
        }
    }
}

@Composable
private fun ClothingItemCard(item: ClothingItem, onClick: () -> Unit) {
    Column(
        modifier = Modifier
            .testTag(CLOSET_ITEM_TAG)
            .clip(RoundedCornerShape(12.dp))
            .clickable(onClick = onClick),
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

// The item's photo. Has a swatch in item's color underneath with category's
// initial. This shows while the photo loads, or if no photo is available.
@Composable
internal fun ClothingThumbnail(item: ClothingItem, modifier: Modifier = Modifier) {
    val swatch = swatchFor(item.color) ?: MaterialTheme.colorScheme.surfaceVariant
    Box(
        modifier = modifier
            .aspectRatio(1f)
            .clip(RoundedCornerShape(12.dp))
            .background(swatch)
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(12.dp)),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            item.category.label.take(1),
            style = MaterialTheme.typography.displaySmall,
            color = if (swatch.luminance() > 0.5f) Color.Black else Color.White,
        )
        if (item.imageUrl != null) {
            AsyncImage(
                model = ImageRequest.Builder(LocalContext.current)
                    .data(item.imageUrl)
                    // Photo links expire and change on every load, but an item's photo never does.
                    .memoryCacheKey(item.id)
                    .diskCacheKey(item.id)
                    .build(),
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .matchParentSize()
                    .testTag(CLOSET_ITEM_IMAGE_TAG),
            )
        }
    }
}

@Composable
internal fun EmptyState(
    title: String,
    message: String,
    modifier: Modifier = Modifier,
    action: (@Composable () -> Unit)? = null,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(32.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(title, style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center)
        Text(
            message,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        action?.invoke()
    }
}

// The item's details. [isNew] marks an item that was just added from a photo,
// so the user is asked to check what was detected.
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ClothingItemDetail(
    item: ClothingItem,
    isNew: Boolean,
    onBack: () -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
            }
            Text(
                item.name,
                style = MaterialTheme.typography.headlineSmall,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }

        if (isNew) {
            NewItemNotice()
        }

        ClothingThumbnail(item, Modifier.fillMaxWidth())

        DetailRow("Type", item.category.label)
        DetailRow("Colour", item.color.replaceFirstChar(Char::uppercase))
        DetailRow("Style", item.style.replaceFirstChar(Char::uppercase))
        DetailRow("Status", if (item.isClean) "Clean" else "In the laundry")

        Text("Tags", style = MaterialTheme.typography.labelMedium)
        if (item.tags.isEmpty()) {
            Text("No tags", style = MaterialTheme.typography.bodyLarge)
        } else {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                item.tags.forEach { tag -> SuggestionChip(onClick = {}, label = { Text(tag) }) }
            }
        }

        OutlinedButton(onClick = onEdit, modifier = Modifier.fillMaxWidth()) {
            Icon(Icons.Filled.Edit, contentDescription = null)
            Text("Edit details", modifier = Modifier.padding(start = 8.dp))
        }
        ConfirmDeleteButton(
            label = "Delete item",
            title = "Delete ${item.name}?",
            message = "It will be removed from your closet.",
            onDelete = onDelete,
        )
    }
}

@Composable
private fun NewItemNotice() {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer)) {
        Text(
            "Added to your closet! Check the details we detected, and tap Edit details if anything's wrong.",
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.padding(12.dp),
        )
    }
}

@Composable
private fun DetailRow(label: String, value: String) {
    Column {
        Text(label, style = MaterialTheme.typography.labelMedium)
        Text(value, style = MaterialTheme.typography.bodyLarge)
    }
}

// Approximate swatch for common colour names.
private fun swatchFor(colorName: String): Color? = when (colorName.trim().lowercase()) {
    "white" -> Color(0xFFF5F5F5)
    "black" -> Color(0xFF212121)
    "grey", "gray" -> Color(0xFF9E9E9E)
    "navy" -> Color(0xFF1A237E)
    "blue" -> Color(0xFF1E88E5)
    "brown" -> Color(0xFF6D4C41)
    "red" -> Color(0xFFC62828)
    "green" -> Color(0xFF2E7D32)
    "yellow" -> Color(0xFFFDD835)
    "pink" -> Color(0xFFF48FB1)
    "beige" -> Color(0xFFD7CCC8)
    else -> null
}
