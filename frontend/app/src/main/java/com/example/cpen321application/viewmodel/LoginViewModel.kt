package com.example.cpen321application.viewmodel

import android.content.Context
import android.util.Log
import androidx.annotation.StringRes
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.cpen321application.R
import com.example.cpen321application.auth.GoogleAuthClient
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface LoginUiState {
  data object Idle : LoginUiState
  data object Loading : LoginUiState
  data object Success : LoginUiState
  data class Error(@StringRes val messageRes: Int) : LoginUiState
}

class LoginViewModel(
  private val authClient: GoogleAuthClient = GoogleAuthClient(),
) : ViewModel() {

  private val _uiState = MutableStateFlow<LoginUiState>(LoginUiState.Idle)
  val uiState: StateFlow<LoginUiState> = _uiState.asStateFlow()

  fun signIn(activityContext: Context) {
    if (_uiState.value is LoginUiState.Loading) return
    _uiState.value = LoginUiState.Loading

    viewModelScope.launch {
      _uiState.value = try {
        authClient.getGoogleIdToken(activityContext)
        Log.d(TAG, "Got ID token")
        LoginUiState.Success
      } catch (e: GetCredentialCancellationException) {
        Log.d(TAG, "User cancelled sign-in", e)
        LoginUiState.Idle
      } catch (e: NoCredentialException) {
        Log.w(TAG, "No Google account available", e)
        LoginUiState.Error(R.string.login_error_no_account)
      } catch (e: GetCredentialException) {
        Log.e(TAG, "Sign-in failed", e)
        LoginUiState.Error(R.string.login_error_generic)
      }
    }
  }

  private companion object {
    const val TAG = "LoginViewModel"
  }

  
}