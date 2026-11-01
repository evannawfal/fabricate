package com.example.cpen321application.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.example.cpen321application.model.ClothingCategory
import com.example.cpen321application.model.ClothingItem
import com.example.cpen321application.viewmodel.OutfitDraft
import com.example.cpen321application.viewmodel.OutfitsUiState
import com.example.cpen321application.viewmodel.OutfitsViewModel

// Test tags for the Create Outfit end-to-end test.
const val OUTFIT_NAME_FIELD_TAG = "outfit_name"
const val OUTFIT_ITEM_CHOICE_TAG = "outfit_item_choice"
const val SAVE_OUTFIT_BUTTON_TAG = "save_outfit_button"

/**
 * Names [draft] and picks its items, grouped by category, from [closetItems]. Items the
 * outfit already has stay listed even if they were since removed from the closet.
 */
@Composable
internal fun OutfitEditor(
    state: OutfitsUiState,
    draft: OutfitDraft,
    closetItems: List<ClothingItem>,
    viewModel: OutfitsViewModel,
    modifier: Modifier = Modifier,
) {
    val isNew = draft.outfitId == null
    val choices = choicesByCategory(closetItems, draft.items)

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = viewModel::closeDraft) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
            }
            Text(if (isNew) "New outfit" else "Edit outfit", style = MaterialTheme.typography.headlineSmall)
        }
        OutlinedTextField(
            value = draft.name,
            onValueChange = viewModel::rename,
            label = { Text("Name") },
            singleLine = true,
            modifier = Modifier
                .fillMaxWidth()
                .testTag(OUTFIT_NAME_FIELD_TAG),
        )
        if (choices.isEmpty()) {
            Text("Your closet is empty. Add clothing in the Closet tab first.")
        }
        choices.forEach { (category, items) ->
            ItemChoiceRow(category.label, items, draft, onToggle = viewModel::toggleItem)
        }
        state.saveError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        SaveOutfitButton(isNew, draft.canSave, state.isSaving, onSave = viewModel::saveDraft)
        if (!isNew) {
            ConfirmDeleteButton(
                label = "Delete outfit",
                title = "Delete this outfit?",
                message = "Its clothes stay in your closet.",
                onDelete = { draft.outfitId?.let(viewModel::deleteOutfit) },
                isDeleting = state.isDeleting,
            )
        }
    }
}

private fun choicesByCategory(
    closetItems: List<ClothingItem>,
    outfitItems: List<ClothingItem>,
): Map<ClothingCategory, List<ClothingItem>> {
    val closetIds = closetItems.map { it.id }.toSet()
    return (closetItems + outfitItems.filterNot { it.id in closetIds })
        .groupBy { it.category }
        .toSortedMap()
}

@Composable
private fun ItemChoiceRow(
    label: String,
    items: List<ClothingItem>,
    draft: OutfitDraft,
    onToggle: (ClothingItem) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(label, style = MaterialTheme.typography.titleSmall)
        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            items(items, key = { it.id }) { item ->
                ItemChoice(item, selected = draft.contains(item), onClick = { onToggle(item) })
            }
        }
    }
}

@Composable
private fun ItemChoice(item: ClothingItem, selected: Boolean, onClick: () -> Unit) {
    val shape = RoundedCornerShape(12.dp)
    Column(
        modifier = Modifier
            .width(96.dp)
            .clip(shape)
            .selectable(selected = selected, role = Role.Checkbox, onClick = onClick)
            .testTag(OUTFIT_ITEM_CHOICE_TAG),
    ) {
        Box {
            val highlight = if (selected) Modifier.border(3.dp, MaterialTheme.colorScheme.primary, shape) else Modifier
            ClothingThumbnail(item, Modifier.fillMaxWidth().then(highlight))
            if (selected) {
                Icon(
                    Icons.Filled.Check,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onPrimary,
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(6.dp)
                        .background(MaterialTheme.colorScheme.primary, CircleShape)
                        .padding(2.dp)
                        .size(16.dp),
                )
            }
        }
        Text(
            item.name,
            style = MaterialTheme.typography.bodySmall,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(vertical = 4.dp, horizontal = 2.dp),
        )
    }
}

@Composable
private fun SaveOutfitButton(isNew: Boolean, canSave: Boolean, isSaving: Boolean, onSave: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Button(
            onClick = onSave,
            enabled = canSave && !isSaving,
            modifier = Modifier
                .fillMaxWidth()
                .testTag(SAVE_OUTFIT_BUTTON_TAG),
        ) {
            if (isSaving) {
                CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
            } else {
                Text(if (isNew) "Save outfit" else "Save changes")
            }
        }
        if (!canSave) {
            Text(
                "Give the outfit a name and pick at least one item.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
