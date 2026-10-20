package com.example.cpen321application.viewmodel

import android.util.Log
import androidx.annotation.StringRes
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.cpen321application.R
import com.example.cpen321application.auth.SessionStore
import com.example.cpen321application.data.AvatarStore
import com.example.cpen321application.model.AvatarMeasurements
import com.example.cpen321application.model.BodyMeasurement
import com.example.cpen321application.network.BackendApi
import com.example.cpen321application.network.HttpException
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.json.JSONException

sealed interface AvatarSaveState {
  data object Idle : AvatarSaveState
  data object Saving : AvatarSaveState
  data class Error(@StringRes val messageRes: Int) : AvatarSaveState
}

data class AvatarUiState(
  /** The measurements shown on the sliders (saved or being edited). */
  val measurements: AvatarMeasurements = AvatarMeasurements(),
  /** The saved avatar model, or null if the user hasn't created one yet. */
  val modelFile: File? = null,
  /** Changes every time a new model is saved, so the viewer reloads it. */
  val modelVersion: Int = 0,
  val saveState: AvatarSaveState = AvatarSaveState.Idle,
)

/**
 * Avatar customization: loads the saved avatar when the screen opens, and on
 * [save] has the back-end generate a model from the chosen measurements, then
 * keeps the model and measurements on the device.
 */
class AvatarViewModel(
  private val sessionStore: SessionStore,
  private val avatarStore: AvatarStore,
) : ViewModel() {

  private val _uiState = MutableStateFlow(AvatarUiState())
  val uiState: StateFlow<AvatarUiState> = _uiState.asStateFlow()

  init {
    viewModelScope.launch {
      val saved = avatarStore.measurements.first()
      _uiState.update { state ->
        state.copy(
          measurements = saved ?: state.measurements,
          modelFile = avatarStore.modelFile.takeIf { it.exists() },
        )
      }
    }
  }

  fun setMeasurement(measurement: BodyMeasurement, cm: Int) {
    _uiState.update { it.copy(measurements = it.measurements.with(measurement, cm)) }
  }

  fun save() {
    if (_uiState.value.saveState is AvatarSaveState.Saving) return
    _uiState.update { it.copy(saveState = AvatarSaveState.Saving) }
    val measurements = _uiState.value.measurements

    viewModelScope.launch {
      val error = try {
        val token = sessionStore.token.first()
          ?: throw HttpException(HttpURLConnection.HTTP_UNAUTHORIZED, "/avatar")
        val modelUrl = BackendApi.generateAvatar(token, measurements)
        avatarStore.save(measurements, BackendApi.download(modelUrl))
        _uiState.update {
          it.copy(modelFile = avatarStore.modelFile, modelVersion = it.modelVersion + 1)
        }
        null
      } catch (e: HttpException) {
        // Must come before IOException, which HttpException extends.
        Log.e(TAG, "Back-end rejected the avatar", e)
        if (e.code == HttpURLConnection.HTTP_UNAUTHORIZED) R.string.avatar_error_session else R.string.avatar_error_generic
      } catch (e: IOException) {
        Log.e(TAG, "Could not reach the back-end", e)
        R.string.avatar_error_network
      } catch (e: JSONException) {
        Log.e(TAG, "Unexpected back-end response", e)
        R.string.avatar_error_generic
      }
      _uiState.update {
        it.copy(saveState = if (error == null) AvatarSaveState.Idle else AvatarSaveState.Error(error))
      }
    }
  }

  private companion object {
    const val TAG = "AvatarViewModel"
  }
}
