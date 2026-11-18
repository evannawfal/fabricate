package com.example.cpen321application.screens

import androidx.activity.compose.BackHandler
import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.Face
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.cpen321application.R
import com.example.cpen321application.data.ClothingRepository
import com.example.cpen321application.data.LocationProvider
import com.example.cpen321application.data.OutfitRepository
import com.example.cpen321application.data.ProfileRepository
import com.example.cpen321application.data.RecommendationRepository
import com.example.cpen321application.data.RoomsRepository
import com.example.cpen321application.screens.avatar.AvatarRoute
import com.example.cpen321application.viewmodel.ClosetViewModel
import com.example.cpen321application.viewmodel.OutfitsViewModel
import com.example.cpen321application.viewmodel.ProfileViewModel
import com.example.cpen321application.viewmodel.ShopViewModel

/** The 4 tabs shown in the bottom navigation bar. */
enum class BottomTab(@StringRes val labelRes: Int, val icon: ImageVector) {
  Closet(R.string.tab_closet, Icons.AutoMirrored.Filled.List),
  Outfits(R.string.tab_outfits, Icons.Filled.Star),
  Social(R.string.tab_social, Icons.Filled.Favorite),
  Avatar(R.string.tab_avatar, Icons.Filled.Face),
}

/** All top-level destinations (4 bottom bar tabs + 3 top bar destinations). */
enum class Destination {
  Closet,
  Outfits,
  Social,
  Avatar,
  Shop,
  Rooms,
  Profile,
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScreen(
  repositories: MainScreenRepositories,
  onSignOut: () -> Unit,
  modifier: Modifier = Modifier,
) {
  var destination by rememberSaveable { mutableStateOf(Destination.Closet) }
  var confirmingSignOut by rememberSaveable { mutableStateOf(false) }
  var profileMenuExpanded by remember { mutableStateOf(false) }

  val closetViewModel: ClosetViewModel = viewModel { ClosetViewModel(repositories.clothing) }
  val outfitsViewModel: OutfitsViewModel = viewModel { OutfitsViewModel(repositories.outfits, repositories.location) }
  val shopViewModel: ShopViewModel = viewModel { ShopViewModel(repositories.recommendations) }

  // Back from another destination returns to the Closet tab before leaving the app.
  BackHandler(enabled = destination != Destination.Closet) { destination = Destination.Closet }

  val screenTitle = when (destination) {
    Destination.Closet -> "My Closet"
    Destination.Outfits -> "My Outfits"
    Destination.Social -> "Social"
    Destination.Avatar -> "Avatar"
    Destination.Shop -> "Recommended for you"
    Destination.Rooms -> "Rooms"
    Destination.Profile -> "Profile"
  }

  Scaffold(
    modifier = modifier.fillMaxSize(),
    topBar = {
      TopAppBar(
        title = {
          Text(
            text = screenTitle,
            style = MaterialTheme.typography.headlineSmall,
          )
        },
        actions = {
          // 1. Shop action button
          IconButton(onClick = { destination = Destination.Shop }) {
            Icon(
              imageVector = Icons.Filled.ShoppingCart,
              contentDescription = stringResource(R.string.tab_shop),
              tint = if (destination == Destination.Shop) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
            )
          }
          // 2. Rooms action button
          IconButton(onClick = { destination = Destination.Rooms }) {
            Icon(
              imageVector = Icons.Filled.Person,
              contentDescription = stringResource(R.string.tab_rooms),
              tint = if (destination == Destination.Rooms) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
            )
          }
          // 3. Profile icon button with DropdownMenu (Profile & Sign Out)
          Box {
            IconButton(onClick = { profileMenuExpanded = true }) {
              Icon(
                imageVector = Icons.Filled.AccountCircle,
                contentDescription = stringResource(R.string.tab_profile),
                tint = if (destination == Destination.Profile) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
              )
            }
            DropdownMenu(
              expanded = profileMenuExpanded,
              onDismissRequest = { profileMenuExpanded = false },
            ) {
              DropdownMenuItem(
                text = { Text(stringResource(R.string.tab_profile)) },
                leadingIcon = { Icon(Icons.Filled.AccountCircle, contentDescription = null) },
                onClick = {
                  profileMenuExpanded = false
                  destination = Destination.Profile
                },
              )
              DropdownMenuItem(
                text = { Text(stringResource(R.string.sign_out)) },
                leadingIcon = { Icon(Icons.AutoMirrored.Filled.ExitToApp, contentDescription = null) },
                onClick = {
                  profileMenuExpanded = false
                  confirmingSignOut = true
                },
              )
            }
          }
        },
      )
    },
    bottomBar = {
      NavigationBar {
        BottomTab.entries.forEach { entry ->
          val entryDestination = when (entry) {
            BottomTab.Closet -> Destination.Closet
            BottomTab.Outfits -> Destination.Outfits
            BottomTab.Social -> Destination.Social
            BottomTab.Avatar -> Destination.Avatar
          }
          NavigationBarItem(
            selected = destination == entryDestination,
            onClick = { destination = entryDestination },
            icon = { Icon(entry.icon, contentDescription = null) },
            label = { Text(stringResource(entry.labelRes)) },
          )
        }
      }
    },
  ) { innerPadding ->
    val contentModifier = Modifier.padding(innerPadding)
    val closet by closetViewModel.uiState.collectAsState()
    when (destination) {
      Destination.Closet -> ClosetScreen(closetViewModel, contentModifier)
      Destination.Outfits -> OutfitsScreen(outfitsViewModel, closet.items, contentModifier)
      Destination.Social -> SocialScreen(contentModifier) // Placeholder composable for your new Social tab
      Destination.Avatar -> AvatarRoute(repositories.clothing, contentModifier)
      Destination.Shop -> ShopScreen(shopViewModel, closet.items, contentModifier)
      Destination.Rooms -> RoomsRoute(repositories.rooms, contentModifier)
      Destination.Profile -> ProfileScreen(viewModel { ProfileViewModel(repositories.profile) }, contentModifier)
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

class MainScreenRepositories(
  val clothing: ClothingRepository,
  val outfits: OutfitRepository,
  val recommendations: RecommendationRepository,
  val location: LocationProvider,
  val rooms: RoomsRepository,
  val profile: ProfileRepository,
)

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
@Composable
fun SocialScreen(modifier: Modifier = Modifier) {
  EmptyState(
    title = "Social Feed",
    message = "Share outfits and connect with friends here.",
    modifier = modifier,
  )
}
