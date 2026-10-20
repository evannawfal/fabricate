package com.example.cpen321application.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.example.cpen321application.data.ClothingItemChanges
import com.example.cpen321application.model.ClothingCategory
import com.example.cpen321application.model.ClothingItem

// Longest values the back-end accepts (CLOTHING_LIMITS in its clothingItem model).
private const val NAME_MAX_LENGTH = 100
private const val COLOR_MAX_LENGTH = 50
private const val STYLE_MAX_LENGTH = 50

/**
 * Lets the user correct an item's details, e.g. after the classifier guessed wrong.
 * [error] is the reason the last save failed, if it did.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun EditItemDialog(
    item: ClothingItem,
    isSaving: Boolean,
    error: String?,
    onSave: (ClothingItemChanges) -> Unit,
    onDismiss: () -> Unit,
) {
    var name by rememberSaveable(item.id) { mutableStateOf(item.name) }
    var category by rememberSaveable(item.id) { mutableStateOf(item.category) }
    var color by rememberSaveable(item.id) { mutableStateOf(item.color) }
    var style by rememberSaveable(item.id) { mutableStateOf(item.style) }
    val changes = ClothingItemChanges(name.trim(), category, color.trim(), style.trim())
    val allFilledIn = listOf(changes.name, changes.color, changes.style).none { it.isEmpty() }

    AlertDialog(
        onDismissRequest = { if (!isSaving) onDismiss() },
        title = { Text("Edit item") },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                DetailField("Name", name, { name = it.take(NAME_MAX_LENGTH) }, "edit-name")
                Text("Type", style = MaterialTheme.typography.labelMedium)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    ClothingCategory.entries.forEach { option ->
                        FilterChip(
                            selected = option == category,
                            onClick = { category = option },
                            label = { Text(option.label) },
                        )
                    }
                }
                DetailField("Colour", color, { color = it.take(COLOR_MAX_LENGTH) }, "edit-color")
                DetailField("Style", style, { style = it.take(STYLE_MAX_LENGTH) }, "edit-style")
                if (error != null) {
                    Text(error, color = MaterialTheme.colorScheme.error)
                }
            }
        },
        confirmButton = {
            TextButton(onClick = { onSave(changes) }, enabled = allFilledIn && !isSaving) {
                if (isSaving) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                } else {
                    Text("Save")
                }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !isSaving) { Text("Cancel") }
        },
    )
}

@Composable
private fun DetailField(label: String, value: String, onValueChange: (String) -> Unit, tag: String) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        singleLine = true,
        isError = value.isBlank(),
        modifier = Modifier
            .fillMaxWidth()
            .testTag(tag),
    )
}
