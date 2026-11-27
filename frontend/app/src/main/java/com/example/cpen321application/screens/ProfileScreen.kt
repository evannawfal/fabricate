package com.example.cpen321application.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Badge
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import com.example.cpen321application.data.AvatarStore
import com.example.cpen321application.model.AvatarMeasurements
import com.example.cpen321application.model.BodyMeasurement
import com.example.cpen321application.viewmodel.ProfileViewModel

const val PRONOUNS_FIELD_TAG = "pronouns_field"
const val SAVE_PROFILE_TAG = "save_profile"
const val FRIENDS_CARD_TAG = "friends_card"

private const val MAX_PRONOUNS_LENGTH = 30

@Composable
fun ProfileScreen(viewModel: ProfileViewModel, modifier: Modifier = Modifier) {
    val state by viewModel.uiState.collectAsState()
    val profile = state.profile
    val context = LocalContext.current
    val avatarStore = remember { AvatarStore(context) }
    val savedMeasurements by avatarStore.measurements.collectAsState(initial = null)
    var showingFriends by rememberSaveable { mutableStateOf(false) }

    if (showingFriends) {
        FriendsScreen(
            state = state,
            viewModel = viewModel,
            onBack = {
                showingFriends = false
                viewModel.clearFriendMessages()
            },
            modifier = modifier,
        )
        return
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        if (profile == null) {
            if (state.error == null) CircularProgressIndicator()
        } else {
            FriendsCard(state.friends.size, state.incomingRequests.size, onClick = { showingFriends = true })

            ProfileInfoRow(title = "Name", value = profile.name)
            ProfileInfoRow(title = "Email", value = profile.email)
            PronounsEditor(profile.pronouns, state.isSaving, viewModel::savePronouns)

            HorizontalDivider()

            MeasurementsSection(savedMeasurements ?: AvatarMeasurements())
        }
        state.error?.let { error ->
            Text(error, color = MaterialTheme.colorScheme.error)
            if (profile == null) Button(onClick = viewModel::load) { Text("Try again") }
        }
    }
}

@Composable
private fun FriendsCard(friendCount: Int, requestCount: Int, onClick: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .testTag(FRIENDS_CARD_TAG),
    ) {
        Box(modifier = Modifier.fillMaxWidth()) {
            if (requestCount > 0) {
                Badge(modifier = Modifier.align(Alignment.TopEnd).padding(12.dp)) { Text(requestCount.toString()) }
            }
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    text = friendCount.toString(),
                    style = MaterialTheme.typography.headlineMedium,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = if (friendCount == 1) "Friend" else "Friends",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text = friendsCardHint(requestCount),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
        }
    }
}

@Composable
private fun PronounsEditor(savedPronouns: String, isSaving: Boolean, onSave: (String) -> Unit) {
    var pronouns by rememberSaveable(savedPronouns) { mutableStateOf(savedPronouns) }
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Text(
            text = "Pronouns:",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
        )
        OutlinedTextField(
            value = pronouns,
            onValueChange = { if (it.length <= MAX_PRONOUNS_LENGTH) pronouns = it },
            placeholder = { Text("e.g. they/them") },
            singleLine = true,
            modifier = Modifier
                .weight(1f)
                .testTag(PRONOUNS_FIELD_TAG),
        )
    }

    Button(
        onClick = { onSave(pronouns) },
        enabled = !isSaving && pronouns.trim() != savedPronouns,
        modifier = Modifier.testTag(SAVE_PROFILE_TAG),
    ) {
        Text("Save")
    }
}

private fun friendsCardHint(requestCount: Int): String = when (requestCount) {
    0 -> "Tap to see or add friends"
    1 -> "1 friend request"
    else -> "$requestCount friend requests"
}

@Composable
private fun MeasurementsSection(measurements: AvatarMeasurements) {
    Text(
        text = "Measurements",
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.SemiBold,
    )
    ProfileInfoRow(title = "Height", value = "${measurements[BodyMeasurement.Height]} cm")
    ProfileInfoRow(title = "Shoulder width", value = "${measurements[BodyMeasurement.Shoulders]} cm")
    ProfileInfoRow(title = "Hip width", value = "${measurements[BodyMeasurement.Hips]} cm")
}

@Composable
private fun ProfileInfoRow(title: String, value: String) {
    Text(
        text = buildAnnotatedString {
            withStyle(SpanStyle(fontWeight = FontWeight.SemiBold)) {
                append("$title: ")
            }
            append(value)
        },
        style = MaterialTheme.typography.bodyLarge,
    )
}