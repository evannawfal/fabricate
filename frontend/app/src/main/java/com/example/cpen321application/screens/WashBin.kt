package com.example.cpen321application.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import com.example.cpen321application.R
import com.example.cpen321application.model.ClothingItem

const val WASH_BIN_BADGE_TAG = "wash_bin_badge"

private val CompactButtonPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp)

@Composable
private fun WashBinIcon(modifier: Modifier = Modifier, contentDescription: String? = null) {
    Icon(painterResource(R.drawable.ic_wash_bin), contentDescription, modifier)
}

/** Shown on the closet card of an item in the wash bin; clean items have no badge. */
@Composable
internal fun WashBinBadge(modifier: Modifier = Modifier) {
    Surface(
        shape = CircleShape,
        color = MaterialTheme.colorScheme.tertiaryContainer,
        contentColor = MaterialTheme.colorScheme.onTertiaryContainer,
        shadowElevation = 2.dp,
        modifier = modifier.testTag(WASH_BIN_BADGE_TAG),
    ) {
        WashBinIcon(Modifier.padding(6.dp).size(18.dp), contentDescription = "In the wash bin")
    }
}

@Composable
internal fun WashBinFilterChip(selected: Boolean, count: Int, onClick: () -> Unit) {
    FilterChip(
        selected = selected,
        onClick = onClick,
        label = { Text(if (count == 0) "Wash bin" else "Wash bin ($count)") },
        leadingIcon = { WashBinIcon(Modifier.size(FilterChipDefaults.IconSize)) },
    )
}

@Composable
internal fun WashBinButton(item: ClothingItem, isUpdating: Boolean, onSetClean: (Boolean) -> Unit) {
    OutlinedButton(
        onClick = { onSetClean(!item.isClean) },
        enabled = !isUpdating,
        modifier = Modifier.fillMaxWidth(),
    ) {
        if (isUpdating) {
            CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
        } else {
            WashBinIcon(Modifier.size(18.dp))
        }
        Text(if (item.isClean) "Move to wash bin" else "Mark clean", modifier = Modifier.padding(start = 8.dp))
    }
    if (!item.isClean) {
        Text(
            "Left out of generated outfits until it's clean.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

/** Replaces the closet's title while selecting items. */
@Composable
internal fun SelectionHeader(count: Int, onClose: () -> Unit, onSelectAll: () -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 4.dp, end = 8.dp, top = 12.dp, bottom = 4.dp),
    ) {
        IconButton(onClick = onClose) {
            Icon(Icons.Filled.Close, contentDescription = "Stop selecting")
        }
        Text(
            if (count == 0) "Tap items to select" else "$count selected",
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.weight(1f),
        )
        TextButton(onClick = onSelectAll) { Text("Select all") }
    }
}

@Composable
internal fun SelectionMark(isSelected: Boolean, modifier: Modifier = Modifier) {
    if (isSelected) {
        Icon(
            Icons.Filled.CheckCircle,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = modifier
                .size(28.dp)
                .background(MaterialTheme.colorScheme.surface, CircleShape),
        )
    } else {
        Box(
            modifier
                .size(28.dp)
                .padding(2.dp)
                .background(Color.Black.copy(alpha = 0.3f), CircleShape)
                .border(2.dp, Color.White, CircleShape),
        )
    }
}

@Composable
internal fun SelectionActions(
    selected: List<ClothingItem>,
    isUpdating: Boolean,
    onSetClean: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(tonalElevation = 3.dp, shadowElevation = 6.dp, modifier = modifier.fillMaxWidth()) {
        Column {
            if (isUpdating) {
                LinearProgressIndicator(Modifier.fillMaxWidth())
            }
            Row(
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
            ) {
                OutlinedButton(
                    onClick = { onSetClean(true) },
                    enabled = !isUpdating && selected.any { !it.isClean },
                    contentPadding = CompactButtonPadding,
                    modifier = Modifier.weight(1f),
                ) { Text("Mark clean") }
                Button(
                    onClick = { onSetClean(false) },
                    enabled = !isUpdating && selected.any { it.isClean },
                    contentPadding = CompactButtonPadding,
                    modifier = Modifier.weight(1f),
                ) { Text("Move to wash bin") }
            }
        }
    }
}
