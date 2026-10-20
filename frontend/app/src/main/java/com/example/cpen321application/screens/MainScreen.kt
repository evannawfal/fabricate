package com.example.cpen321application.screens

import androidx.activity.compose.BackHandler
import androidx.annotation.StringRes
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Face
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.Preview
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.cpen321application.R
import com.example.cpen321application.data.ClothingRepository
import com.example.cpen321application.ui.theme.CPEN321ApplicationTheme
import com.example.cpen321application.viewmodel.ClosetViewModel

/** Top-level tabs reachable from the bottom navigation bar. */
enum class Tab(@StringRes val labelRes: Int, val icon: ImageVector) {
  Closet(R.string.tab_closet, Icons.AutoMirrored.Filled.List),
  Avatar(R.string.tab_avatar, Icons.Filled.Face),
}

/**
 * The app's main screen after sign-in: the Closet and Avatar tabs, and a sign-out
 * option that asks for confirmation before calling [onSignOut].
 */
@Composable
fun MainScreen(
  clothingRepository: ClothingRepository,
  onSignOut: () -> Unit,
  modifier: Modifier = Modifier,
) {
  var tab by rememberSaveable { mutableStateOf(Tab.Closet) }
  var confirmingSignOut by rememberSaveable { mutableStateOf(false) }
  // Created here, above the tabs, so the closet keeps its state while another tab is open.
  val closetViewModel: ClosetViewModel = viewModel { ClosetViewModel(clothingRepository) }

  // Back from another tab returns to the Closet tab before leaving the app.
  BackHandler(enabled = tab != Tab.Closet) { tab = Tab.Closet }

  Scaffold(
    modifier = modifier.fillMaxSize(),
    bottomBar = {
      NavigationBar {
        Tab.entries.forEach { entry ->
          NavigationBarItem(
            selected = tab == entry,
            onClick = { tab = entry },
            icon = { Icon(entry.icon, contentDescription = null) },
            label = { Text(stringResource(entry.labelRes)) },
          )
        }
        NavigationBarItem(
          selected = false,
          onClick = { confirmingSignOut = true },
          icon = { Icon(Icons.AutoMirrored.Filled.ExitToApp, contentDescription = null) },
          label = { Text(stringResource(R.string.sign_out)) },
        )
      }
    },
  ) { innerPadding ->
    val contentModifier = Modifier.padding(innerPadding)
    when (tab) {
      Tab.Closet -> ClosetScreen(closetViewModel, contentModifier)
      Tab.Avatar -> AvatarRoute(contentModifier)
    }
  }

  if (confirmingSignOut) {
    SignOutDialog(
      onConfirm = {
        confirmingSignOut = false
        onSignOut()
      },
      onDismiss = { confirmingSignOut = false },
    )
  }
}

@Composable
private fun SignOutDialog(onConfirm: () -> Unit, onDismiss: () -> Unit) {
  AlertDialog(
    onDismissRequest = onDismiss,
    title = { Text(stringResource(R.string.sign_out_confirm_title)) },
    text = { Text(stringResource(R.string.sign_out_confirm_message)) },
    confirmButton = {
      TextButton(onClick = onConfirm) { Text(stringResource(R.string.sign_out)) }
    },
    dismissButton = {
      TextButton(onClick = onDismiss) { Text(stringResource(R.string.cancel)) }
    },
  )
}

@Preview(showBackground = true)
@Composable
private fun SignOutDialogPreview() {
  CPEN321ApplicationTheme {
    SignOutDialog(onConfirm = {}, onDismiss = {})
  }
}
