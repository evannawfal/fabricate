package com.example.cpen321application.screens.social

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage

const val POST_CAPTION_INPUT_TAG = "post_caption_input"
const val SUBMIT_POST_BUTTON_TAG = "submit_post_button"

private const val MAX_CAPTION_LENGTH = 280

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun OotdPhotoSourceSheet(
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
                text = "Share today's outfit",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            )
            ListItem(
                headlineContent = { Text("Take photo") },
                supportingContent = { Text("Snap your current outfit") },
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
internal fun ComposePostDialog(
    photoBytes: ByteArray,
    caption: String,
    isPosting: Boolean,
    error: String?,
    onCaptionChange: (String) -> Unit,
    onSubmit: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = { if (!isPosting) onDismiss() },
        title = { Text("Post Outfit") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                AsyncImage(
                    model = photoBytes,
                    contentDescription = "Selected outfit preview",
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .fillMaxWidth()
                        .aspectRatio(1f)
                        .clip(RoundedCornerShape(12.dp)),
                )
                OutlinedTextField(
                    value = caption,
                    onValueChange = onCaptionChange,
                    label = { Text("Caption (optional)") },
                    placeholder = { Text("What are you wearing today?") },
                    enabled = !isPosting,
                    maxLines = 3,
                    supportingText = { Text("${caption.length}/$MAX_CAPTION_LENGTH") },
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag(POST_CAPTION_INPUT_TAG),
                )
                if (error != null) {
                    Text(
                        text = error,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = onSubmit,
                enabled = !isPosting,
                modifier = Modifier.testTag(SUBMIT_POST_BUTTON_TAG),
            ) {
                if (isPosting) {
                    CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                } else {
                    Text("Share")
                }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !isPosting) {
                Text("Cancel")
            }
        },
    )
}