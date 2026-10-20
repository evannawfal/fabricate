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
import com.example.cpen321application.auth.SessionStore
import com.example.cpen321application.network.BackendApi
import com.example.cpen321application.network.HttpException
import java.io.IOException
import java.net.HttpURLConnection
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.json.JSONException

sealed interface LoginUiState {
  data object Idle : LoginUiState
  data object Loading : LoginUiState
  data object Success : LoginUiState
  data class Error(@StringRes val messageRes: Int) : LoginUiState
}

class LoginViewModel(
  private val sessionStore: SessionStore,
  private val authClient: GoogleAuthClient = GoogleAuthClient(),
) : ViewModel() {

  private val _uiState = MutableStateFlow<LoginUiState>(LoginUiState.Idle)
  val uiState: StateFlow<LoginUiState> = _uiState.asStateFlow()

  fun signIn(activityContext: Context) {
    if (_uiState.value is LoginUiState.Loading) return
    _uiState.value = LoginUiState.Loading

    viewModelScope.launch {
      _uiState.value = try {
        val idToken = authClient.getGoogleIdToken(activityContext)
        val sessionToken = BackendApi.signInWithGoogle(idToken)
        sessionStore.saveToken(sessionToken)
        Log.d(TAG, "Signed in and saved session")
        LoginUiState.Success
      } catch (e: GetCredentialCancellationException) {
        Log.d(TAG, "User cancelled sign-in", e)
        LoginUiState.Idle
      } catch (e: NoCredentialException) {
        Log.w(TAG, "No Google account available", e)
        LoginUiState.Error(R.string.login_error_no_account)
      } catch (e: GetCredentialException) {
        Log.e(TAG, "Google sign-in failed", e)
        LoginUiState.Error(R.string.login_error_generic)
      } catch (e: HttpException) {
        // Must come before IOException, which HttpException extends.
        Log.e(TAG, "Backend rejected sign-in", e)
        if (e.code == HttpURLConnection.HTTP_UNAUTHORIZED) {
          LoginUiState.Error(R.string.login_error_rejected)
        } else {
          LoginUiState.Error(R.string.login_error_generic)
        }
      } catch (e: IOException) {
        Log.e(TAG, "Could not reach backend", e)
        LoginUiState.Error(R.string.login_error_network)
      } catch (e: JSONException) {
        Log.e(TAG, "Unexpected backend response", e)
        LoginUiState.Error(R.string.login_error_generic)
      }
    }
  }

  private companion object {
    const val TAG = "LoginViewModel"
  }

  
}