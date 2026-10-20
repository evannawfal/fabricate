package com.example.cpen321application.data

import android.content.Context
import android.util.Log
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.example.cpen321application.model.AvatarMeasurements
import com.example.cpen321application.model.BodyMeasurement
import java.io.File
import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext

// Top level so there is exactly one DataStore per file; two instances on the same file throw.
private val Context.avatarDataStore: DataStore<Preferences> by preferencesDataStore(name = "avatar")

/**
 * Keeps the user's saved avatar on the device: the measurements it was made from
 * and the generated 3D model, so both are still there after the app restarts.
 */
class AvatarStore(context: Context) {

  private val dataStore = context.applicationContext.avatarDataStore

  /** The last generated model, or a file that doesn't exist yet. */
  val modelFile = File(context.applicationContext.filesDir, MODEL_FILE_NAME)

  /** The measurements of the saved avatar, or null if none has been saved. */
  val measurements: Flow<AvatarMeasurements?> = dataStore.data
    .catch { e ->
      if (e !is IOException) throw e
      // Unreadable file: start from the default measurements rather than crash.
      Log.e(TAG, "Could not read avatar settings", e)
      emit(emptyPreferences())
    }
    .map { prefs ->
      val saved = BodyMeasurement.entries.mapNotNull { m -> prefs[key(m)]?.let { m to it } }.toMap()
      if (saved.isEmpty()) null else AvatarMeasurements(AvatarMeasurements().centimeters + saved)
    }

  /** Saves a newly generated [model] together with the [measurements] it was made from. */
  suspend fun save(measurements: AvatarMeasurements, model: ByteArray) {
    withContext(Dispatchers.IO) {
      // Write to a temporary file first so a failed write never leaves a broken model.
      val temp = File(modelFile.path + ".tmp")
      temp.writeBytes(model)
      if (!temp.renameTo(modelFile)) {
        temp.delete()
        throw IOException("Could not save the avatar model")
      }
    }
    dataStore.edit { prefs ->
      BodyMeasurement.entries.forEach { m -> prefs[key(m)] = measurements[m] }
    }
  }

  private companion object {
    const val TAG = "AvatarStore"
    const val MODEL_FILE_NAME = "avatar.glb"

    fun key(measurement: BodyMeasurement) = intPreferencesKey("${measurement.apiName}_cm")
  }
}
