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
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.SuggestionChip
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.toMutableStateList
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.example.cpen321application.data.MockCloset
import com.example.cpen321application.model.ClothingCategory
import com.example.cpen321application.model.ClothingItem
import com.example.cpen321application.model.filterByCategory

/**
 * The user's closet: a category filter over a grid of their clothing items.
 * Tapping an item opens its details, where it can be deleted.
 *
 * Items live in memory for now. [initialItems] defaults to [MockCloset] until
 * the clothing endpoints are ready.
 */
@Composable
fun ClosetScreen(
    modifier: Modifier = Modifier,
    initialItems: List<ClothingItem> = MockCloset.items,
) {
    val items = remember { initialItems.toMutableStateList() }
    var selectedCategory by rememberSaveable { mutableStateOf<ClothingCategory?>(null) }
    var openItemId by rememberSaveable { mutableStateOf<String?>(null) }

    val openItem = items.firstOrNull { it.id == openItemId }
    if (openItem != null) {
        BackHandler { openItemId = null }
        ClothingItemDetail(
            item = openItem,
            onBack = { openItemId = null },
            onDelete = {
                items.remove(openItem)
                openItemId = null
            },
            modifier = modifier,
        )
    } else {
        ClosetGrid(
            items = items,
            selectedCategory = selectedCategory,
            onSelectCategory = { selectedCategory = it },
            onOpenItem = { openItemId = it.id },
            modifier = modifier,
        )
    }
}

@Composable
private fun ClosetGrid(
    items: List<ClothingItem>,
    selectedCategory: ClothingCategory?,
    onSelectCategory: (ClothingCategory?) -> Unit,
    onOpenItem: (ClothingItem) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier.fillMaxSize()) {
        Text(
            "My Closet",
            style = MaterialTheme.typography.headlineSmall,
            modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 24.dp, bottom = 8.dp),
        )

        if (items.isNotEmpty()) {
            CategoryFilter(selectedCategory, onSelectCategory)
        }

        val visibleItems = items.filterByCategory(selectedCategory)
        when {
            items.isEmpty() -> EmptyCloset(
                title = "Your closet is empty",
                message = "Items you add will show up here.",
            )
            visibleItems.isEmpty() -> EmptyCloset(
                title = "No ${selectedCategory?.label?.lowercase()} yet",
                message = "Try another category.",
            )
            else -> LazyVerticalGrid(
                columns = GridCells.Fixed(2),
                contentPadding = PaddingValues(16.dp),
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
private fun ClothingThumbnail(item: ClothingItem, modifier: Modifier = Modifier) {
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
                model = item.imageUrl,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.matchParentSize(),
            )
        }
    }
}

@Composable
private fun EmptyCloset(title: String, message: String) {
    Column(
        modifier = Modifier
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
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ClothingItemDetail(
    item: ClothingItem,
    onBack: () -> Unit,
    onDelete: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var confirmingDelete by remember { mutableStateOf(false) }

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

        OutlinedButton(
            onClick = { confirmingDelete = true },
            colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Icon(Icons.Filled.Delete, contentDescription = null)
            Text("Delete item", modifier = Modifier.padding(start = 8.dp))
        }
    }

    if (confirmingDelete) {
        AlertDialog(
            onDismissRequest = { confirmingDelete = false },
            title = { Text("Delete ${item.name}?") },
            text = { Text("It will be removed from your closet.") },
            confirmButton = {
                TextButton(onClick = {
                    confirmingDelete = false
                    onDelete()
                }) { Text("Delete") }
            },
            dismissButton = {
                TextButton(onClick = { confirmingDelete = false }) { Text("Cancel") }
            },
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
