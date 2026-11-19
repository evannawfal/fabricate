package com.example.cpen321application.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
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

/**
 * The user's friends and friend requests. Friends can be removed, requests sent to the user
 * accepted or declined, new ones sent by email, and the ones the user sent cancelled until
 * they're answered.
 */
@Composable
internal fun FriendsDialog(state: ProfileUiState, viewModel: ProfileViewModel, onDismiss: () -> Unit) {
    val enabled = !state.isUpdatingFriends
    var confirmingRemoval by remember { mutableStateOf<Friend?>(null) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Friends (${state.friends.size})") },
        text = {
            // The result of the last action stays above the scrolling lists, so it's seen wherever the user tapped.
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                state.friendError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                state.friendMessage?.let { Text(it, color = MaterialTheme.colorScheme.primary) }
                FriendsDialogLists(
                    state,
                    viewModel,
                    enabled,
                    onRemove = { confirmingRemoval = it },
                    modifier = Modifier.weight(1f, fill = false),
                )
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Close") } },
    )
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
private fun FriendsDialogLists(
    state: ProfileUiState,
    viewModel: ProfileViewModel,
    enabled: Boolean,
    onRemove: (Friend) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        if (state.incomingRequests.isNotEmpty()) {
            RequestSection("Requests for you", state.incomingRequests, INCOMING_REQUEST_TAG) { request ->
                TextButton(onClick = { viewModel.removeFriendRequest(request) }, enabled = enabled) {
                    Text("Decline")
                }
                Button(onClick = { viewModel.acceptFriendRequest(request) }, enabled = enabled) {
                    Text("Accept")
                }
            }
            HorizontalDivider()
        }
        FriendList(state.friends, enabled, onRemove)
        HorizontalDivider()
        SendRequestField(state, viewModel::sendFriendRequest)
        if (state.outgoingRequests.isNotEmpty()) {
            RequestSection("Sent requests", state.outgoingRequests, OUTGOING_REQUEST_TAG) { request ->
                TextButton(onClick = { viewModel.removeFriendRequest(request) }, enabled = enabled) {
                    Text("Cancel")
                }
            }
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
private fun RequestSection(
    title: String,
    requests: List<FriendRequest>,
    tag: String,
    actions: @Composable RowScope.(FriendRequest) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(title, style = MaterialTheme.typography.titleSmall)
        requests.forEach { request ->
            Column(modifier = Modifier.fillMaxWidth().testTag(tag)) {
                Person(request.user)
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    actions(request)
                }
            }
        }
    }
}

@Composable
private fun FriendList(friends: List<Friend>, enabled: Boolean, onRemove: (Friend) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Your friends", style = MaterialTheme.typography.titleSmall)
        if (friends.isEmpty()) {
            Text(
                text = "You haven't added any friends yet.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        friends.forEach { friend ->
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.testTag(FRIEND_ROW_TAG)) {
                Person(friend, Modifier.weight(1f))
                TextButton(onClick = { onRemove(friend) }, enabled = enabled) { Text("Remove") }
            }
        }
    }
}

@Composable
private fun Person(person: Friend, modifier: Modifier = Modifier.fillMaxWidth()) {
    Column(modifier = modifier) {
        Text(person.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        Text(
            person.email,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun SendRequestField(state: ProfileUiState, onSend: (String) -> Unit) {
    var email by rememberSaveable { mutableStateOf("") }
    LaunchedEffect(state.requestsSent) { email = "" }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Add a friend", style = MaterialTheme.typography.titleSmall)
        Text(
            "They're added once they accept your request.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(
                value = email,
                onValueChange = { email = it },
                label = { Text("Their email") },
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
}
