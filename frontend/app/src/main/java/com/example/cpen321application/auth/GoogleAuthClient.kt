package com.example.cpen321application.auth

import android.content.Context
import android.util.Log
import androidx.credentials.ClearCredentialStateRequest
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.ClearCredentialException
import com.example.cpen321application.BuildConfig
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential

class GoogleAuthClient {

  suspend fun getGoogleIdToken(activityContext: Context): String {
    val credentialManager = CredentialManager.create(activityContext)

    // Web client ID: Google puts it in the token's `aud`, which the backend checks.
    val googleOption = GetSignInWithGoogleOption.Builder(BuildConfig.GOOGLE_CLIENT_ID)
      .build()

    val request = GetCredentialRequest.Builder()
      .addCredentialOption(googleOption)
      .build()

    val credential = credentialManager.getCredential(activityContext, request).credential

    if (credential is CustomCredential &&
      credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
    ) {
      return GoogleIdTokenCredential.createFrom(credential.data).idToken
    }
    error("Unexpected credential type: ${credential.type}")
  }

  /** Forgets the Google account used to sign in, so the next sign-in asks which account to use. */
  suspend fun signOut(activityContext: Context) {
    try {
      CredentialManager.create(activityContext).clearCredentialState(ClearCredentialStateRequest())
    } catch (e: ClearCredentialException) {
      // Signing out of the app still works; Google may just suggest the same account next time.
      Log.w(TAG, "Could not clear Google sign-in state", e)
    }
  }

  private companion object {
    const val TAG = "GoogleAuthClient"
  }
}
