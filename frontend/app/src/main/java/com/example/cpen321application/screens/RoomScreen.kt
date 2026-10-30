package com.example.cpen321application.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.example.cpen321application.data.ChatMessage
import com.example.cpen321application.model.ClothingItem
import com.example.cpen321application.viewmodel.RoomUiState
import com.example.cpen321application.viewmodel.RoomViewModel

const val RECONNECTING_BANNER_TAG = "reconnecting_banner"
const val CHAT_MESSAGE_TAG = "chat_message"
const val CHAT_INPUT_TAG = "chat_input"
const val SEND_MESSAGE_TAG = "send_message"
const val BOARD_ITEM_TAG = "board_item"
const val ADD_BOARD_ITEM_TAG = "add_board_item"
const val CLOSET_PICKER_ITEM_TAG = "closet_picker_item"
const val SAVE_ROOM_OUTFIT_TAG = "save_room_outfit"

/** An open room: the shared outfit board on top and the live chat below. */
@Composable
fun RoomScreen(viewModel: RoomViewModel, onBack: () -> Unit, modifier: Modifier = Modifier) {
    val state by viewModel.uiState.collectAsState()
    val snackbar = remember { SnackbarHostState() }
    var picking by rememberSaveable { mutableStateOf(false) }

    LaunchedEffect(state.notice) {
        state.notice?.let {
            snackbar.showSnackbar(it)
            viewModel.dismissNotice()
        }
    }

    Scaffold(modifier = modifier, snackbarHost = { SnackbarHost(snackbar) }) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") }
                Text(
                    state.room?.name.orEmpty(),
                    style = MaterialTheme.typography.titleLarge,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                TextButton(
                    onClick = viewModel::saveOutfit,
                    enabled = state.board.isNotEmpty() && !state.isSaving,
                    modifier = Modifier.testTag(SAVE_ROOM_OUTFIT_TAG),
                ) { Text("Save outfit") }
            }
            when {
                state.loadError != null -> LoadError(state.loadError!!, onRetry = viewModel::load)
                state.room == null -> CircularProgressIndicator(Modifier.align(Alignment.CenterHorizontally).padding(24.dp))
                else -> RoomContent(state, viewModel, onAddItem = { picking = true })
            }
        }
    }

    if (picking) {
        ClosetPicker(
            items = state.closet.filter { item -> state.board.none { it.id == item.id } },
            onPick = {
                viewModel.addItem(it)
                picking = false
            },
            onDismiss = { picking = false },
        )
    }
}

@Composable
private fun RoomContent(state: RoomUiState, viewModel: RoomViewModel, onAddItem: () -> Unit) {
    var draft by rememberSaveable { mutableStateOf("") }
    val chatState = rememberLazyListState()
    LaunchedEffect(state.messages.size) {
        if (state.messages.isNotEmpty()) chatState.animateScrollToItem(state.messages.lastIndex)
    }

    Column {
        if (!state.isConnected) {
            Text(
                if (state.hasConnected) "Reconnecting…" else "Connecting…",
                color = MaterialTheme.colorScheme.onErrorContainer,
                modifier = Modifier
                    .fillMaxWidth()
                    .background(MaterialTheme.colorScheme.errorContainer)
                    .padding(8.dp)
                    .testTag(RECONNECTING_BANNER_TAG),
            )
        }
        Text("Shared outfit", style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(16.dp, 8.dp))
        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(horizontal = 16.dp)) {
            items(state.board, key = ClothingItem::id) { item ->
                BoardItem(item, canRemove = state.isConnected, onRemove = { viewModel.removeItem(item.id) })
            }
            item {
                Card(
                    Modifier.size(96.dp).clickable(enabled = state.isConnected, onClick = onAddItem).testTag(ADD_BOARD_ITEM_TAG),
                ) {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Icon(Icons.Filled.Add, contentDescription = "Add from your closet")
                    }
                }
            }
        }
        LazyColumn(
            state = chatState,
            verticalArrangement = Arrangement.spacedBy(6.dp),
            modifier = Modifier.weight(1f).fillMaxWidth().padding(16.dp),
        ) {
            items(state.messages, key = ChatMessage::id) { message ->
                ChatBubble(message, isMine = message.senderId == state.currentUserId)
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(8.dp)) {
            OutlinedTextField(
                value = draft,
                onValueChange = { draft = it },
                placeholder = { Text("Message") },
                modifier = Modifier.weight(1f).testTag(CHAT_INPUT_TAG),
            )
            IconButton(
                onClick = {
                    viewModel.sendMessage(draft)
                    draft = ""
                },
                enabled = state.isConnected && draft.isNotBlank(),
                modifier = Modifier.testTag(SEND_MESSAGE_TAG),
            ) { Icon(Icons.AutoMirrored.Filled.Send, contentDescription = "Send") }
        }
    }
}

@Composable
private fun BoardItem(item: ClothingItem, canRemove: Boolean, onRemove: () -> Unit) {
    Column(Modifier.width(96.dp).testTag(BOARD_ITEM_TAG)) {
        Box {
            ItemImage(item, Modifier.size(96.dp))
            if (canRemove) {
                IconButton(onClick = onRemove, modifier = Modifier.align(Alignment.TopEnd).size(28.dp)) {
                    Icon(Icons.Filled.Close, contentDescription = "Remove ${item.name}")
                }
            }
        }
        Text(item.name, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun ItemImage(item: ClothingItem, modifier: Modifier) {
    Box(
        modifier.clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.surfaceVariant),
        contentAlignment = Alignment.Center,
    ) {
        Text(item.category.label.take(1), style = MaterialTheme.typography.titleLarge)
        if (item.imageUrl != null) {
            AsyncImage(model = item.imageUrl, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize())
        }
    }
}

@Composable
private fun ChatBubble(message: ChatMessage, isMine: Boolean) {
    Column(
        horizontalAlignment = if (isMine) Alignment.End else Alignment.Start,
        modifier = Modifier.fillMaxWidth().testTag(CHAT_MESSAGE_TAG),
    ) {
        if (!isMine) Text(message.senderName, style = MaterialTheme.typography.labelSmall)
        Text(
            message.text,
            color = if (isMine) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface,
            modifier = Modifier
                .clip(RoundedCornerShape(12.dp))
                .background(if (isMine) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant)
                .padding(horizontal = 12.dp, vertical = 8.dp),
        )
    }
}

@Composable
private fun ClosetPicker(items: List<ClothingItem>, onPick: (ClothingItem) -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add from your closet") },
        text = {
            if (items.isEmpty()) {
                Text("No more items in your closet to add.")
            } else {
                LazyColumn(Modifier.heightIn(max = 400.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(items, key = ClothingItem::id) { item ->
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.fillMaxWidth().clickable { onPick(item) }.testTag(CLOSET_PICKER_ITEM_TAG),
                        ) {
                            ItemImage(item, Modifier.size(56.dp))
                            Text(item.name, modifier = Modifier.padding(start = 12.dp))
                        }
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Close") } },
    )
}

@Composable
private fun LoadError(message: String, onRetry: () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(message)
        Button(onClick = onRetry, modifier = Modifier.padding(top = 12.dp).height(40.dp)) { Text("Try again") }
    }
}
