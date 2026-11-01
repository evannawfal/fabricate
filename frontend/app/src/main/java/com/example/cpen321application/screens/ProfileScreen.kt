package com.example.cpen321application.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.example.cpen321application.viewmodel.ProfileViewModel

const val PRONOUNS_FIELD_TAG = "pronouns_field"
const val SAVE_PROFILE_TAG = "save_profile"

private const val MAX_PRONOUNS_LENGTH = 30

@Composable
fun ProfileScreen(viewModel: ProfileViewModel, modifier: Modifier = Modifier) {
    val state by viewModel.uiState.collectAsState()
    val profile = state.profile

    Column(modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Profile", style = MaterialTheme.typography.headlineMedium)
        if (profile == null) {
            if (state.error == null) CircularProgressIndicator()
        } else {
            // Keyed on the saved value so the field resets to it after loading or saving.
            var pronouns by rememberSaveable(profile.pronouns) { mutableStateOf(profile.pronouns) }
            Text(profile.name, style = MaterialTheme.typography.titleLarge)
            Text(profile.email, style = MaterialTheme.typography.bodyMedium)
            OutlinedTextField(
                value = pronouns,
                onValueChange = { if (it.length <= MAX_PRONOUNS_LENGTH) pronouns = it },
                label = { Text("Pronouns") },
                placeholder = { Text("e.g. they/them") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth().testTag(PRONOUNS_FIELD_TAG),
            )
            Button(
                onClick = { viewModel.savePronouns(pronouns) },
                enabled = !state.isSaving && pronouns.trim() != profile.pronouns,
                modifier = Modifier.testTag(SAVE_PROFILE_TAG),
            ) { Text("Save") }
            if (state.saved) Text("Saved.")
        }
        state.error?.let { error ->
            Text(error, color = MaterialTheme.colorScheme.error)
            if (profile == null) Button(onClick = viewModel::load) { Text("Try again") }
        }
    }
}
