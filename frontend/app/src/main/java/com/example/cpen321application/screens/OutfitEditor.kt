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
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.example.cpen321application.model.ClothingCategory
import com.example.cpen321application.model.ClothingItem
import com.example.cpen321application.model.Outfit
import com.example.cpen321application.model.outfitLimit
import com.example.cpen321application.model.outfitLimitPhrase
import com.example.cpen321application.viewmodel.OutfitDraft
import com.example.cpen321application.viewmodel.OutfitsUiState
import com.example.cpen321application.viewmodel.OutfitsViewModel

// Test tags for the Create Outfit end-to-end test.
const val OUTFIT_NAME_FIELD_TAG = "outfit_name"
const val OUTFIT_ITEM_CHOICE_TAG = "outfit_item_choice"
const val SAVE_OUTFIT_BUTTON_TAG = "save_outfit_button"

/** Tag of the message shown when [category] has as many items as an outfit can have. */
fun categoryLimitTag(category: ClothingCategory) = "outfit_limit_${category.apiValue}"

private const val DISABLED_CHOICE_ALPHA = 0.38f

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
    val choices = choicesByCategory(closetItems, draft)
    val duplicate = state.draftDuplicate

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = viewModel::closeDraft, enabled = !state.isBusy) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
            }
            Text(if (isNew) "New outfit" else "Edit outfit", style = MaterialTheme.typography.headlineSmall)
        }
        OutlinedTextField(
            value = draft.name,
            onValueChange = viewModel::rename,
            label = { Text("Name") },
            singleLine = true,
            enabled = !state.isBusy,
            modifier = Modifier
                .fillMaxWidth()
                .testTag(OUTFIT_NAME_FIELD_TAG),
        )
        if (choices.isEmpty()) {
            Text("Your closet is empty. Add clothing in the Closet tab first.")
        }
        choices.forEach { (category, items) ->
            ItemChoiceRow(category, items, draft, enabled = !state.isBusy, onToggle = viewModel::toggleItem)
        }
        state.saveError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        SaveOutfitButton(
            isNew = isNew,
            canSave = draft.canSave && duplicate == null,
            blockedReason = saveBlockedReason(draft, duplicate),
            isSaving = state.isSaving,
            enabled = !state.isBusy,
            onSave = viewModel::saveDraft,
        )
        if (!isNew) {
            ConfirmDeleteButton(
                label = "Delete outfit",
                title = "Delete this outfit?",
                message = "Its clothes stay in your closet.",
                onDelete = { draft.outfitId?.let(viewModel::deleteOutfit) },
                isDeleting = state.isDeleting,
                enabled = !state.isBusy,
            )
        }
    }
}

// The items the outfit had when editing started come first in each category, so they can be
// removed without scrolling through the closet. Items picked since stay where they are.
private fun choicesByCategory(
    closetItems: List<ClothingItem>,
    draft: OutfitDraft,
): Map<ClothingCategory, List<ClothingItem>> {
    val closetIds = closetItems.map { it.id }.toSet()
    return (closetItems + draft.items.filterNot { it.id in closetIds })
        .sortedBy { it.id !in draft.originalItemIds }
        .groupBy { it.category }
        .toSortedMap()
}

private fun saveBlockedReason(draft: OutfitDraft, duplicate: Outfit?): String? {
    val overLimit = draft.overLimitCategory
    return when {
        draft.name.isBlank() || draft.items.isEmpty() -> "Give the outfit a name and pick at least one item."
        overLimit != null -> "An outfit can have at most ${overLimit.outfitLimitPhrase}. Deselect one to save."
        duplicate != null -> "You already have an outfit with these items: “${duplicate.name}”."
        else -> null
    }
}

@Composable
private fun ItemChoiceRow(
    category: ClothingCategory,
    items: List<ClothingItem>,
    draft: OutfitDraft,
    enabled: Boolean,
    onToggle: (ClothingItem) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(category.label, style = MaterialTheme.typography.titleSmall)
            Text(
                "${draft.count(category)} of ${category.outfitLimit}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        // Only worth explaining when some item in the row can't be picked, or there are too many.
        if (draft.isFull(category) && (items.size > draft.count(category) || draft.overLimitCategory == category)) {
            Text(
                "An outfit can have at most ${category.outfitLimitPhrase}. Deselect one to pick another.",
                style = MaterialTheme.typography.bodySmall,
                color = if (draft.count(category) > category.outfitLimit) {
                    MaterialTheme.colorScheme.error
                } else {
                    MaterialTheme.colorScheme.onSurfaceVariant
                },
                modifier = Modifier.testTag(categoryLimitTag(category)),
            )
        }
        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            items(items, key = { it.id }) { item ->
                ItemChoice(
                    item,
                    selected = draft.contains(item),
                    enabled = enabled && draft.canToggle(item),
                    onClick = { onToggle(item) },
                )
            }
        }
    }
}

@Composable
private fun ItemChoice(item: ClothingItem, selected: Boolean, enabled: Boolean, onClick: () -> Unit) {
    val shape = RoundedCornerShape(12.dp)
    Column(
        modifier = Modifier
            .width(96.dp)
            .clip(shape)
            .selectable(selected = selected, enabled = enabled, role = Role.Checkbox, onClick = onClick)
            // Dimmed when its category is full, so it's clear why it can't be picked.
            .alpha(if (enabled || selected) 1f else DISABLED_CHOICE_ALPHA)
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
private fun SaveOutfitButton(
    isNew: Boolean,
    canSave: Boolean,
    blockedReason: String?,
    isSaving: Boolean,
    enabled: Boolean,
    onSave: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Button(
            onClick = onSave,
            enabled = canSave && enabled,
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
        if (!canSave && blockedReason != null) {
            Text(
                blockedReason,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
