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
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.example.cpen321application.data.cameraPhotoUri
import com.example.cpen321application.model.PhotoSide

const val UPLOAD_PROGRESS_TAG = "upload_progress"

class PhotoPicker(val takePhoto: () -> Unit, val chooseFromGallery: () -> Unit)

/**
 * A [PhotoPicker] that calls [onPhoto] with the photo the user took or picked,
 * [onCancelled] if they backed out without choosing one, or [onCameraUnavailable]
 * if the device has no camera app. Choosing from the gallery uses the system photo
 * picker, so neither option needs a permission.
 */
@Composable
fun rememberPhotoPicker(
    onPhoto: (Uri) -> Unit,
    onCameraUnavailable: () -> Unit,
    onCancelled: () -> Unit = {},
): PhotoPicker {
    val context = LocalContext.current
    val cameraUri = remember { cameraPhotoUri(context) }
    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { saved ->
        if (saved) onPhoto(cameraUri) else onCancelled()
    }
    val gallery = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) onPhoto(uri) else onCancelled()
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

/** Asks where the photo of [side] should come from. Each item needs a front and a back photo. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PhotoSourceSheet(
    side: PhotoSide,
    onTakePhoto: () -> Unit,
    onChooseFromGallery: () -> Unit,
    onDismiss: () -> Unit,
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
    ) {
        Column(modifier = Modifier.padding(bottom = 24.dp)) {
            Text(
                when (side) {
                    PhotoSide.Front -> "Step 1 of 2: the front"
                    PhotoSide.Back -> "Step 2 of 2: the back"
                },
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            )
            ListItem(
                headlineContent = { Text("Take photo") },
                supportingContent = { Text("Photograph the ${side.label} of one item on a plain background") },
                modifier = Modifier.clickable(onClick = onTakePhoto),
            )
            ListItem(
                headlineContent = { Text("Choose from gallery") },
                modifier = Modifier.clickable(onClick = onChooseFromGallery),
            )
        }
    }
}

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
                CircularProgressIndicator(modifier = Modifier.testTag(UPLOAD_PROGRESS_TAG))
                Column {
                    Text("Classifying your photos…", style = MaterialTheme.typography.titleMedium)
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