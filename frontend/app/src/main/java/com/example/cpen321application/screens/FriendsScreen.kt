package com.example.cpen321application.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Badge
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.example.cpen321application.data.Friend
import com.example.cpen321application.data.FriendRequest
import com.example.cpen321application.viewmodel.ProfileUiState
import com.example.cpen321application.viewmodel.ProfileViewModel

const val ADD_FRIEND_EMAIL_TAG = "add_friend_email"
const val INCOMING_REQUEST_TAG = "incoming_request"
const val OUTGOING_REQUEST_TAG = "outgoing_request"
const val FRIEND_ROW_TAG = "friend_row"
const val CONFIRM_REMOVE_FRIEND_TAG = "confirm_remove_friend"

private enum class FriendsTab { Friends, Requests, Sent }

/**
 * The user's friends and friend requests. Friends can be removed, requests sent to the user
 * accepted or declined, new ones sent by email, and the ones the user sent cancelled until
 * they're answered.
 */
@Composable
internal fun FriendsScreen(
    state: ProfileUiState,
    viewModel: ProfileViewModel,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    BackHandler(onBack = onBack)
    var tab by rememberSaveable {
        mutableStateOf(if (state.incomingRequests.isEmpty()) FriendsTab.Friends else FriendsTab.Requests)
    }
    var confirmingRemoval by remember { mutableStateOf<Friend?>(null) }

    Column(modifier = modifier.fillMaxSize()) {
        FriendsHeader(onBack)
        Column(
            modifier = Modifier.padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            SendRequestField(state, viewModel::sendFriendRequest)
            state.friendError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            state.friendMessage?.let { Text(it, color = MaterialTheme.colorScheme.primary) }
        }
        FriendsTabs(state, tab, onSelect = { tab = it })
        Box(modifier = Modifier.weight(1f)) {
            FriendsTabContent(tab, state, viewModel, onRemove = { confirmingRemoval = it })
        }
    }

    confirmingRemoval?.let { friend ->
        ConfirmRemoveFriendDialog(
            friend = friend,
            onConfirm = {
                confirmingRemoval = null
                viewModel.removeFriend(friend)
            },
            onDismiss = { confirmingRemoval = null },
        )
    }
}

@Composable
private fun FriendsHeader(onBack: () -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.padding(horizontal = 4.dp, vertical = 4.dp),
    ) {
        IconButton(onClick = onBack) {
            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back to profile")
        }
        Text("Friends", style = MaterialTheme.typography.titleLarge)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FriendsTabs(state: ProfileUiState, selected: FriendsTab, onSelect: (FriendsTab) -> Unit) {
    PrimaryTabRow(selectedTabIndex = selected.ordinal, modifier = Modifier.padding(top = 8.dp)) {
        FriendsTab.entries.forEach { entry ->
            Tab(
                selected = entry == selected,
                onClick = { onSelect(entry) },
                selectedContentColor = MaterialTheme.colorScheme.primary,
                unselectedContentColor = MaterialTheme.colorScheme.onSurfaceVariant,
                text = {
                    when (entry) {
                        FriendsTab.Friends -> Text("Friends (${state.friends.size})")
                        FriendsTab.Sent -> Text("Sent (${state.outgoingRequests.size})")
                        FriendsTab.Requests -> Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            Text("Requests")
                            if (state.incomingRequests.isNotEmpty()) {
                                Badge { Text(state.incomingRequests.size.toString()) }
                            }
                        }
                    }
                },
            )
        }
    }
}

@Composable
private fun FriendsTabContent(
    tab: FriendsTab,
    state: ProfileUiState,
    viewModel: ProfileViewModel,
    onRemove: (Friend) -> Unit,
) {
    val enabled = !state.isUpdatingFriends
    when (tab) {
        FriendsTab.Friends -> PeopleList(
            people = state.friends,
            key = Friend::id,
            emptyTitle = "No friends yet",
            emptyBody = "Add someone with their email above. They'll show here once they accept.",
        ) { friend ->
            PersonRow(friend, Modifier.testTag(FRIEND_ROW_TAG)) { FriendMenu(friend, enabled, onRemove) }
        }
        FriendsTab.Requests -> PeopleList(
            people = state.incomingRequests,
            key = FriendRequest::id,
            emptyTitle = "No requests",
            emptyBody = "When someone sends you a friend request, you can accept it here.",
        ) { request ->
            PersonRow(request.user, Modifier.testTag(INCOMING_REQUEST_TAG)) {
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    TextButton(onClick = { viewModel.removeFriendRequest(request) }, enabled = enabled) {
                        Text("Decline")
                    }
                    Button(onClick = { viewModel.acceptFriendRequest(request) }, enabled = enabled) {
                        Text("Accept")
                    }
                }
            }
        }
        FriendsTab.Sent -> PeopleList(
            people = state.outgoingRequests,
            key = FriendRequest::id,
            emptyTitle = "No sent requests",
            emptyBody = "Requests you send wait here until they're answered.",
        ) { request ->
            PersonRow(request.user, Modifier.testTag(OUTGOING_REQUEST_TAG)) {
                TextButton(onClick = { viewModel.removeFriendRequest(request) }, enabled = enabled) {
                    Text("Cancel")
                }
            }
        }
    }
}

@Composable
private fun <T> PeopleList(
    people: List<T>,
    key: (T) -> String,
    emptyTitle: String,
    emptyBody: String,
    row: @Composable (T) -> Unit,
) {
    if (people.isEmpty()) {
        EmptyState(emptyTitle, emptyBody)
        return
    }
    LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(vertical = 8.dp)) {
        items(people, key = key) { row(it) }
    }
}

@Composable
private fun EmptyState(title: String, body: String) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 32.dp, vertical = 48.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(title, style = MaterialTheme.typography.titleMedium)
        Text(
            body,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun PersonRow(person: Friend, modifier: Modifier = Modifier, actions: @Composable () -> Unit) {
    ListItem(
        modifier = modifier,
        leadingContent = { Initials(person) },
        headlineContent = { Text(person.name, fontWeight = FontWeight.SemiBold) },
        supportingContent = { Text(person.email) },
        trailingContent = actions,
    )
}

@Composable
private fun Initials(person: Friend) {
    val colors = MaterialTheme.colorScheme
    val palette = listOf(
        colors.primaryContainer to colors.onPrimaryContainer,
        colors.secondaryContainer to colors.onSecondaryContainer,
        colors.tertiaryContainer to colors.onTertiaryContainer,
    )
    val (background, content) = palette[Math.floorMod(person.id.hashCode(), palette.size)]
    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .size(40.dp)
            .clip(CircleShape)
            .background(background),
    ) {
        Text(initialsOf(person.name), color = content, style = MaterialTheme.typography.titleSmall)
    }
}

internal fun initialsOf(name: String): String =
    name.split(' ').filter(String::isNotBlank).take(2).joinToString("") { it.first().uppercase() }

@Composable
private fun FriendMenu(friend: Friend, enabled: Boolean, onRemove: (Friend) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        IconButton(onClick = { expanded = true }, enabled = enabled) {
            Icon(Icons.Filled.MoreVert, contentDescription = "More options for ${friend.name}")
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            DropdownMenuItem(
                text = { Text("Remove friend") },
                onClick = {
                    expanded = false
                    onRemove(friend)
                },
            )
        }
    }
}

// Removing is easy to do by accident and slow to undo: they'd have to accept a new request.
@Composable
private fun ConfirmRemoveFriendDialog(friend: Friend, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Remove ${friend.name}?") },
        text = {
            Text(
                "You'll stop seeing each other's posts and can't invite each other to rooms. " +
                    "To be friends again, one of you will need to send a new request.",
            )
        },
        confirmButton = {
            TextButton(onClick = onConfirm, modifier = Modifier.testTag(CONFIRM_REMOVE_FRIEND_TAG)) { Text("Remove") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Keep") } },
    )
}

@Composable
private fun SendRequestField(state: ProfileUiState, onSend: (String) -> Unit) {
    var email by rememberSaveable { mutableStateOf("") }
    LaunchedEffect(state.requestsSent) { email = "" }
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedTextField(
            value = email,
            onValueChange = { email = it },
            label = { Text("Add a friend by email") },
            singleLine = true,
            enabled = !state.isUpdatingFriends,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Send),
            keyboardActions = KeyboardActions(onSend = { onSend(email) }),
            modifier = Modifier
                .weight(1f)
                .testTag(ADD_FRIEND_EMAIL_TAG),
        )
        Button(onClick = { onSend(email) }, enabled = email.isNotBlank() && !state.isUpdatingFriends) {
            if (state.isUpdatingFriends) {
                CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
            } else {
                Text("Send")
            }
        }
    }
}
