package com.example.cpen321application.auth

import android.content.Context
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import com.example.cpen321application.R
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential

class GoogleAuthClient(private val context: Context) {

  private val credentialManager = CredentialManager.create(context)

  suspend fun getGoogleIdToken(): String {
    val googleOption = GetSignInWithGoogleOption
      .Builder(context.getString(R.string.google_web_client_id))
      .build()

    val request = GetCredentialRequest.Builder()
      .addCredentialOption(googleOption)
      .build()

    val credential = credentialManager.getCredential(context, request).credential

    if (credential is CustomCredential &&
      credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
    ) {
      return GoogleIdTokenCredential.createFrom(credential.data).idToken
    }
    error("Unexpected credential type: ${credential.type}")
  }
}