package com.example.cpen321application.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.cpen321application.data.ClothingRepository
import com.example.cpen321application.data.Friend
import com.example.cpen321application.data.Room
import com.example.cpen321application.data.RoomsRepository
import com.example.cpen321application.viewmodel.RoomViewModel
import com.example.cpen321application.viewmodel.RoomsUiState
import com.example.cpen321application.viewmodel.RoomsViewModel

const val ROOM_ITEM_TAG = "room_item"
const val CREATE_ROOM_TAG = "create_room"
const val ROOM_NAME_FIELD_TAG = "room_name_field"
const val FRIEND_CHECKBOX_TAG = "friend_checkbox"
const val FRIEND_EMAIL_FIELD_TAG = "friend_email_field"

/** The Rooms tab: the user's rooms, or the open room. */
@Composable
fun RoomsRoute(
    roomsRepository: RoomsRepository,
    clothingRepository: ClothingRepository,
    modifier: Modifier = Modifier,
) {
    val viewModel: RoomsViewModel = viewModel { RoomsViewModel(roomsRepository) }
    val state by viewModel.uiState.collectAsState()
    val openRoomId = state.openRoomId
    if (openRoomId == null) {
        RoomsScreen(state, viewModel, modifier)
        return
    }
    // Not a stored ViewModel: the room's socket must close as soon as the room does.
    val roomViewModel = remember(openRoomId) { RoomViewModel(openRoomId, roomsRepository, clothingRepository) }
    DisposableEffect(roomViewModel) { onDispose(roomViewModel::leave) }
    BackHandler(onBack = viewModel::closeRoom)
    RoomScreen(roomViewModel, onBack = viewModel::closeRoom, modifier = modifier)
}

@Composable
private fun RoomsScreen(state: RoomsUiState, viewModel: RoomsViewModel, modifier: Modifier) {
    Box(modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize().padding(16.dp)) {
            Text("Rooms", style = MaterialTheme.typography.headlineMedium)
            when {
                state.isLoading -> CircularProgressIndicator(Modifier.padding(top = 24.dp).align(Alignment.CenterHorizontally))
                state.rooms.isEmpty() -> Text(
                    "No rooms yet. Create one to style outfits with your friends.",
                    modifier = Modifier.padding(top = 16.dp),
                )
                else -> LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 16.dp)) {
                    items(state.rooms, key = Room::id) { room ->
                        RoomCard(room, onClick = { viewModel.openRoom(room.id) })
                    }
                }
            }
        }
        ExtendedFloatingActionButton(
            onClick = viewModel::startCreating,
            modifier = Modifier.align(Alignment.BottomEnd).padding(16.dp).testTag(CREATE_ROOM_TAG),
        ) {
            Icon(Icons.Filled.Add, contentDescription = null)
            Text("Create room", modifier = Modifier.padding(start = 12.dp))
        }
    }

    if (state.isCreating) {
        CreateRoomDialog(
            friends = state.friends,
            isBusy = state.isBusy,
            error = state.error,
            onCreate = viewModel::createRoom,
            onAddFriend = viewModel::addFriend,
            onDismiss = viewModel::cancelCreating,
        )
    } else if (state.error != null) {
        AlertDialog(
            onDismissRequest = viewModel::dismissError,
            text = { Text(state.error) },
            confirmButton = { TextButton(onClick = viewModel::load) { Text("Try again") } },
            dismissButton = { TextButton(onClick = viewModel::dismissError) { Text("OK") } },
        )
    }
}

@Composable
private fun RoomCard(room: Room, onClick: () -> Unit) {
    Card(Modifier.fillMaxWidth().clickable(onClick = onClick).testTag(ROOM_ITEM_TAG)) {
        Column(Modifier.padding(16.dp)) {
            Text(room.name, style = MaterialTheme.typography.titleMedium)
            Text(room.members.joinToString { it.name }, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
private fun CreateRoomDialog(
    friends: List<Friend>,
    isBusy: Boolean,
    error: String?,
    onCreate: (String, List<String>) -> Unit,
    onAddFriend: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    var name by rememberSaveable { mutableStateOf("") }
    var selected by rememberSaveable { mutableStateOf(setOf<String>()) }
    var email by rememberSaveable { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Create room") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (friends.isEmpty()) {
                    Text("Rooms are for styling with friends. Add a friend by email first.")
                } else {
                    OutlinedTextField(
                        value = name,
                        onValueChange = { name = it },
                        label = { Text("Room name") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth().testTag(ROOM_NAME_FIELD_TAG),
                    )
                    Text("Invite friends", style = MaterialTheme.typography.labelLarge)
                    LazyColumn(Modifier.heightIn(max = 200.dp)) {
                        items(friends, key = Friend::id) { friend ->
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Checkbox(
                                    checked = friend.id in selected,
                                    onCheckedChange = { selected = if (it) selected + friend.id else selected - friend.id },
                                    modifier = Modifier.testTag(FRIEND_CHECKBOX_TAG),
                                )
                                Text(friend.name)
                            }
                        }
                    }
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(
                        value = email,
                        onValueChange = { email = it },
                        label = { Text("Friend's email") },
                        singleLine = true,
                        modifier = Modifier.weight(1f).testTag(FRIEND_EMAIL_FIELD_TAG),
                    )
                    TextButton(onClick = { onAddFriend(email); email = "" }, enabled = email.isNotBlank() && !isBusy) {
                        Text("Add")
                    }
                }
                if (error != null) Text(error, color = MaterialTheme.colorScheme.error)
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onCreate(name, selected.toList()) },
                enabled = name.isNotBlank() && selected.isNotEmpty() && !isBusy,
            ) { Text("Create") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
