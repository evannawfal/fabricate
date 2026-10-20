package com.example.cpen321application.auth

import android.content.Context
import android.util.Log
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import java.io.IOException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map

// Top level so there is exactly one DataStore per file; two instances on the same file throw.
private val Context.sessionDataStore: DataStore<Preferences> by preferencesDataStore(name = "session")

/** Persists the back-end session token so the user stays signed in across launches. */
class SessionStore(context: Context) {

  private val dataStore = context.applicationContext.sessionDataStore

  /** The saved session token, or null when signed out. */
  val token: Flow<String?> = dataStore.data
    .catch { e ->
      if (e !is IOException) throw e
      // Unreadable file: treat as signed out rather than crash on launch.
      Log.e(TAG, "Could not read session", e)
      emit(emptyPreferences())
    }
    .map { prefs -> prefs[TOKEN_KEY] }

  suspend fun saveToken(token: String) {
    dataStore.edit { prefs -> prefs[TOKEN_KEY] = token }
  }

  suspend fun clearToken() {
    dataStore.edit { prefs -> prefs.remove(TOKEN_KEY) }
  }

  private companion object {
    const val TAG = "SessionStore"
    val TOKEN_KEY = stringPreferencesKey("session_token")
  }
}
