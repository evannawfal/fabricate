package com.example.cpen321application.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.example.cpen321application.model.ClothingItem
import com.example.cpen321application.model.Recommendations
import com.example.cpen321application.model.ShopDepartment
import com.example.cpen321application.model.StoreItem
import com.example.cpen321application.viewmodel.ShopUiState
import com.example.cpen321application.viewmodel.ShopViewModel

// Test tags for the Shop tests.
const val SHOP_LOADING_TAG = "shop_loading"
const val STORE_ITEM_CARD_TAG = "store_item_card"
const val PAIRED_ITEM_TAG = "paired_item"
const val VIEW_IN_STORE_TAG = "view_in_store"

/**
 * Store items that fill the gaps in the user's closet, picked by the back-end from
 * [closetItems]. Tapping an item shows what it pairs with and links to it in the store.
 */
@Composable
fun ShopScreen(viewModel: ShopViewModel, closetItems: List<ClothingItem>, modifier: Modifier = Modifier) {
    val state by viewModel.uiState.collectAsState()

    LaunchedEffect(closetItems) { viewModel.refreshFor(closetItems) }

    val openItem = state.openItem
    if (openItem != null) {
        BackHandler { viewModel.closeItem() }
        StoreItemDetails(openItem, onClose = viewModel::closeItem, modifier = modifier)
    } else {
        Column(modifier = modifier.fillMaxSize()) {
            Text(
                "Recommended for you",
                style = MaterialTheme.typography.headlineSmall,
                modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 24.dp, bottom = 8.dp),
            )
            DepartmentPicker(state.department, onSelect = viewModel::selectDepartment)
            ShopContent(state, onOpenItem = viewModel::openItem, onRetry = viewModel::load)
        }
    }
}

@Composable
private fun DepartmentPicker(selected: ShopDepartment, onSelect: (ShopDepartment) -> Unit) {
    Row(modifier = Modifier.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        ShopDepartment.entries.forEach { department ->
            FilterChip(
                selected = department == selected,
                onClick = { onSelect(department) },
                label = { Text(department.label) },
            )
        }
    }
}

@Composable
private fun ShopContent(state: ShopUiState, onOpenItem: (StoreItem) -> Unit, onRetry: () -> Unit) {
    val recommendations = state.recommendations
    when {
        state.isLoading -> ShopLoadingIndicator()
        recommendations != null -> RecommendedItems(recommendations, onOpenItem)
        state.canRetry -> EmptyState(
            title = "Couldn't load recommendations",
            message = state.error.orEmpty(),
            action = { TextButton(onClick = onRetry) { Text("Try again") } },
        )
        else -> EmptyState(title = "No recommendations yet", message = state.error.orEmpty())
    }
}

@Composable
private fun ShopLoadingIndicator() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .testTag(SHOP_LOADING_TAG),
        verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        CircularProgressIndicator()
        Text("Looking through your closet…", style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun RecommendedItems(recommendations: Recommendations, onOpenItem: (StoreItem) -> Unit) {
    when {
        recommendations.items.isNotEmpty() -> LazyColumn(
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier.fillMaxSize(),
        ) {
            items(recommendations.items, key = { it.link }) { item ->
                StoreItemCard(item, onClick = { onOpenItem(item) })
            }
        }
        recommendations.gaps.isNotEmpty() -> EmptyState(
            title = "No matching items are available right now",
            message = recommendations.gaps.joinToString("\n"),
        )
        else -> EmptyState(
            title = "Your closet has you covered",
            message = "We didn't find any gaps to fill right now.",
        )
    }
}

@Composable
private fun StoreItemCard(item: StoreItem, onClick: () -> Unit) {
    Card(
        onClick = onClick,
        modifier = Modifier
            .fillMaxWidth()
            .testTag(STORE_ITEM_CARD_TAG),
    ) {
        Row(modifier = Modifier.padding(12.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            StorePhoto(item, Modifier.size(96.dp))
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    item.name,
                    style = MaterialTheme.typography.titleSmall,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(item.price, style = MaterialTheme.typography.titleMedium)
                Text(
                    item.reason,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun StorePhoto(item: StoreItem, modifier: Modifier = Modifier) {
    AsyncImage(
        model = item.imageUrl,
        contentDescription = null,
        contentScale = ContentScale.Fit,
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant),
    )
}

@Composable
private fun StoreItemDetails(item: StoreItem, onClose: () -> Unit, modifier: Modifier = Modifier) {
    val uriHandler = LocalUriHandler.current
    Column(modifier = modifier.fillMaxSize()) {
        Row(modifier = Modifier.padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onClose) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
            }
            Text(
                item.store,
                style = MaterialTheme.typography.titleMedium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            StorePhoto(item, Modifier.fillMaxWidth().aspectRatio(PHOTO_ASPECT_RATIO))
            Text(item.name, style = MaterialTheme.typography.titleLarge)
            Text(item.price, style = MaterialTheme.typography.titleMedium)
            Text(item.reason, style = MaterialTheme.typography.bodyMedium)
            PairedItems(item.pairsWith)
            Button(
                onClick = { uriHandler.openUri(item.link) },
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag(VIEW_IN_STORE_TAG),
            ) {
                Text("View in store")
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PairedItems(items: List<ClothingItem>) {
    if (items.isEmpty()) return
    Text("Goes with your", style = MaterialTheme.typography.titleSmall)
    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items.forEach { item ->
            Column(
                modifier = Modifier
                    .width(PAIRED_ITEM_WIDTH)
                    .testTag(PAIRED_ITEM_TAG),
            ) {
                ClothingThumbnail(item, Modifier.fillMaxWidth())
                Text(
                    item.name,
                    style = MaterialTheme.typography.bodySmall,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(vertical = 4.dp, horizontal = 2.dp),
                )
            }
        }
    }
}

private const val PHOTO_ASPECT_RATIO = 1.5f
private val PAIRED_ITEM_WIDTH = 96.dp
