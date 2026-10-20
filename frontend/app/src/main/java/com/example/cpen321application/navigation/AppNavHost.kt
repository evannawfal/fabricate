package com.example.cpen321application.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.example.cpen321application.FabricateApp
import com.example.cpen321application.auth.SessionStore
import com.example.cpen321application.network.BackendClothingRepository
import com.example.cpen321application.screens.LoginScreen
import com.example.cpen321application.viewmodel.LoginUiState
import com.example.cpen321application.viewmodel.LoginViewModel
import kotlinx.coroutines.flow.first

private object Routes {
  const val LOGIN = "login"
  const val HOME = "home"
}

@Composable
fun AppNavHost(navController: NavHostController = rememberNavController()) {
  val context = LocalContext.current
  val sessionStore = remember { SessionStore(context) }

  // Read the saved session once; null until DataStore answers. Read once (not
  // collected) because NavHost's start destination must not change afterwards.
  val startDestination by produceState<String?>(initialValue = null) {
    value = if (sessionStore.token.first() != null) Routes.HOME else Routes.LOGIN
  }
  val start = startDestination ?: return

  NavHost(navController = navController, startDestination = start) {

    composable(Routes.LOGIN) {
      val loginViewModel: LoginViewModel = viewModel { LoginViewModel(sessionStore) }
      val uiState by loginViewModel.uiState.collectAsState()

      LaunchedEffect(uiState) {
        if (uiState is LoginUiState.Success) {
          navController.navigate(Routes.HOME) {
            popUpTo(Routes.LOGIN) { inclusive = true }
          }
        }
      }

      LoginScreen(
        uiState = uiState,
        onSignInClick = { loginViewModel.signIn(context) },
      )
    }

    composable(Routes.HOME) {
      val clothingRepository = remember { backendClothingRepository(sessionStore) }
      FabricateApp(clothingRepository)
    }
  }
}

// A rejected token (e.g. expired) is cleared, so the next launch starts at the login screen.
private fun backendClothingRepository(sessionStore: SessionStore) = BackendClothingRepository(
  tokenProvider = { sessionStore.token.first() },
  onUnauthorized = { sessionStore.clearToken() },
)
