package com.example.cpen321application.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.example.cpen321application.auth.GoogleAuthClient
import com.example.cpen321application.auth.SessionStore
import com.example.cpen321application.network.BackendClothingRepository
import com.example.cpen321application.auth.SessionToken
import com.example.cpen321application.screens.LoginScreen
import com.example.cpen321application.screens.MainScreen
import com.example.cpen321application.viewmodel.LoginUiState
import com.example.cpen321application.viewmodel.LoginViewModel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

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
  // An expired session is cleared so the user signs in again.
  val startDestination by produceState<String?>(initialValue = null) {
    val token = sessionStore.token.first()
    value = if (token != null && !SessionToken.isExpired(token)) {
      Routes.HOME
    } else {
      if (token != null) sessionStore.clearToken()
      Routes.LOGIN
    }
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
      val scope = rememberCoroutineScope()
      val clothingRepository = remember {
        BackendClothingRepository(
          tokenProvider = { sessionStore.token.first() },
          onUnauthorized = { endRejectedSession(sessionStore, navController) },
        )
      }
      MainScreen(
        clothingRepository = clothingRepository,
        onSignOut = {
          scope.launch {
            sessionStore.clearToken()
            GoogleAuthClient().signOut(context)
            navController.navigate(Routes.LOGIN) {
              popUpTo(Routes.HOME) { inclusive = true }
            }
          }
        },
      )
    }
  }
}

// The back-end rejected the session token, e.g. it expired while the app was open.
private suspend fun endRejectedSession(sessionStore: SessionStore, navController: NavHostController) {
  sessionStore.clearToken()
  // Requests run off the main thread, but NavController only works on it. Several
  // requests can be rejected at once; only the first should leave the main screen.
  withContext(Dispatchers.Main) {
    if (navController.currentDestination?.route == Routes.HOME) {
      navController.navigate(Routes.LOGIN) {
        popUpTo(Routes.HOME) { inclusive = true }
      }
    }
  }
}
