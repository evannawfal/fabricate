package com.example.cpen321application.screens

import android.content.ActivityNotFoundException
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.example.cpen321application.data.cameraPhotoUri

/** Opens the camera or the photo gallery; the chosen photo is passed to `onPhoto`. */
class PhotoPicker(val takePhoto: () -> Unit, val chooseFromGallery: () -> Unit)

/**
 * A [PhotoPicker] that calls [onPhoto] with the photo the user took or picked, or
 * [onCameraUnavailable] if the device has no camera app. Choosing from the gallery
 * uses the system photo picker, so neither option needs a permission.
 */
@Composable
fun rememberPhotoPicker(onPhoto: (Uri) -> Unit, onCameraUnavailable: () -> Unit): PhotoPicker {
    val context = LocalContext.current
    val cameraUri = remember { cameraPhotoUri(context) }
    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { saved ->
        if (saved) onPhoto(cameraUri)
    }
    val gallery = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) onPhoto(uri)
    }
    return PhotoPicker(
        takePhoto = {
            try {
                camera.launch(cameraUri)
            } catch (e: ActivityNotFoundException) {
                onCameraUnavailable()
            }
        },
        chooseFromGallery = {
            gallery.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
        },
    )
}

/** Asks whether to add an item by taking a photo or choosing one from the gallery. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PhotoSourceSheet(onTakePhoto: () -> Unit, onChooseFromGallery: () -> Unit, onDismiss: () -> Unit) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
    ) {
        Column(modifier = Modifier.padding(bottom = 24.dp)) {
            Text(
                "Add clothing",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            )
            ListItem(
                headlineContent = { Text("Take photo") },
                supportingContent = { Text("Photograph one item on a plain background") },
                modifier = Modifier.clickable(onClick = onTakePhoto),
            )
            ListItem(
                headlineContent = { Text("Choose from gallery") },
                modifier = Modifier.clickable(onClick = onChooseFromGallery),
            )
        }
    }
}

/** Shown while a photo is uploaded and classified. It can't be dismissed. */
@Composable
fun UploadingDialog() {
    Dialog(
        onDismissRequest = {},
        properties = DialogProperties(dismissOnBackPress = false, dismissOnClickOutside = false),
    ) {
        Card {
            Row(
                modifier = Modifier.padding(24.dp),
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                CircularProgressIndicator()
                Column {
                    Text("Classifying your photo…", style = MaterialTheme.typography.titleMedium)
                    Text(
                        "Detecting its type, colour and style",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}
