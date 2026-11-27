package com.example.cpen321application.screens.social

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.LaunchedEffect
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import kotlinx.coroutines.delay
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.example.cpen321application.data.readPhotoForUpload
import com.example.cpen321application.model.SocialPost
import com.example.cpen321application.screens.EmptyState
import com.example.cpen321application.screens.PhotoPicker
import com.example.cpen321application.screens.rememberPhotoPicker
import com.example.cpen321application.viewmodel.SocialUiState
import com.example.cpen321application.viewmodel.SocialViewModel

const val CREATE_POST_BUTTON_TAG = "create_post_button"

/** How often the open feed reloads, so friends' likes show up without pulling to refresh. */
const val FEED_POLL_INTERVAL_MS = 5_000L

@Composable
fun SocialScreen(viewModel: SocialViewModel, modifier: Modifier = Modifier) {
    val state by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    var choosingPhotoSource by rememberSaveable { mutableStateOf(false) }
    var deletingPostId by rememberSaveable { mutableStateOf<String?>(null) }

    val photoPicker = rememberPhotoPicker(
        onPhoto = { uri -> viewModel.preparePost { readPhotoForUpload(context, uri) } },
        onCameraUnavailable = {
            viewModel.showActionError("No camera app is available on this device.")
        },
        onCancelled = { choosingPhotoSource = false },
    )

    // Runs while the feed is on screen, and only polls while the app is in the foreground.
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(viewModel, lifecycle) {
        while (true) {
            delay(FEED_POLL_INTERVAL_MS)
            if (lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) viewModel.pollPosts()
        }
    }

    Box(modifier = modifier.fillMaxSize()) {
        SocialFeedContent(
            state = state,
            onRefresh = viewModel::refresh,
            onRetry = viewModel::loadPosts,
            onToggleLike = viewModel::toggleLike,
            onRequestDelete = { deletingPostId = it },
        )
        PostOutfitFab(
            onClick = { choosingPhotoSource = true },
            modifier = Modifier.align(Alignment.BottomEnd),
        )
    }

    SocialDialogs(
        state = state,
        viewModel = viewModel,
        photoPicker = photoPicker,
        choosingPhotoSource = choosingPhotoSource,
        onDismissPhotoSource = { choosingPhotoSource = false },
        deletingPostId = deletingPostId,
        onDismissDelete = { deletingPostId = null },
    )
}

@Composable
private fun PostOutfitFab(onClick: () -> Unit, modifier: Modifier = Modifier) {
    ExtendedFloatingActionButton(
        onClick = onClick,
        modifier = modifier
            .padding(16.dp)
            .testTag(CREATE_POST_BUTTON_TAG),
    ) {
        Icon(Icons.Filled.Add, contentDescription = null)
        Text("Post Outfit", modifier = Modifier.padding(start = 12.dp))
    }
}

@Composable
private fun SocialDialogs(
    state: SocialUiState,
    viewModel: SocialViewModel,
    photoPicker: PhotoPicker,
    choosingPhotoSource: Boolean,
    onDismissPhotoSource: () -> Unit,
    deletingPostId: String?,
    onDismissDelete: () -> Unit,
) {
    if (choosingPhotoSource) {
        OotdPhotoSourceSheet(
            onTakePhoto = {
                onDismissPhotoSource()
                photoPicker.takePhoto()
            },
            onChooseFromGallery = {
                onDismissPhotoSource()
                photoPicker.chooseFromGallery()
            },
            onDismiss = onDismissPhotoSource,
        )
    }

    state.pendingPhoto?.let { photoBytes ->
        ComposePostDialog(
            photoBytes = photoBytes,
            caption = state.captionDraft,
            isPosting = state.isPosting,
            error = state.postError,
            onCaptionChange = viewModel::updateCaption,
            onSubmit = viewModel::submitPost,
            onDismiss = viewModel::cancelComposing,
        )
    }

    deletingPostId?.let { postId ->
        DeletePostDialog(
            onConfirm = {
                onDismissDelete()
                viewModel.deletePost(postId)
            },
            onDismiss = onDismissDelete,
        )
    }

    state.actionError?.let { error ->
        ActionErrorDialog(message = error, onDismiss = viewModel::dismissActionError)
    }
}

@Composable
private fun DeletePostDialog(onConfirm: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Delete post?") },
        text = { Text("This Outfit of the Day post will be removed from your friends' feeds.") },
        confirmButton = {
            TextButton(onClick = onConfirm) {
                Text("Delete", color = MaterialTheme.colorScheme.error)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        },
    )
}

@Composable
private fun ActionErrorDialog(message: String, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        text = { Text(message) },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text("OK") }
        },
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SocialFeedContent(
    state: SocialUiState,
    onRefresh: () -> Unit,
    onRetry: () -> Unit,
    onToggleLike: (SocialPost) -> Unit,
    onRequestDelete: (String) -> Unit,
) {
    when {
        state.isLoading && state.posts.isEmpty() -> Box(Modifier.fillMaxSize(), Alignment.Center) {
            CircularProgressIndicator()
        }
        state.loadError != null && state.posts.isEmpty() -> EmptyState(
            title = "Couldn't load today's outfits",
            message = state.loadError,
            action = { TextButton(onClick = onRetry) { Text("Try again") } },
        )
        else -> PullToRefreshBox(
            isRefreshing = state.isRefreshing,
            onRefresh = onRefresh,
            modifier = Modifier.fillMaxSize(),
        ) {
            SocialPostsList(
                state = state,
                onToggleLike = onToggleLike,
                onRequestDelete = onRequestDelete,
            )
        }
    }
}

@Composable
private fun SocialPostsList(
    state: SocialUiState,
    onToggleLike: (SocialPost) -> Unit,
    onRequestDelete: (String) -> Unit,
) {
    if (state.posts.isEmpty()) {
        EmptyState(
            title = "No outfit today yet",
            message = "Share today's outfit with your friends—posts disappear at midnight.",
        )
    } else {
        LazyColumn(
            contentPadding = PaddingValues(start = 16.dp, top = 12.dp, end = 16.dp, bottom = 88.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
            modifier = Modifier.fillMaxSize(),
        ) {
            items(state.posts, key = SocialPost::id) { post ->
                SocialPostCard(
                    post = post,
                    isMine = post.authorId == state.currentUserId,
                    isLiking = post.id in state.likingPostIds,
                    isDeleting = state.deletingPostId == post.id,
                    onToggleLike = { onToggleLike(post) },
                    onDelete = { onRequestDelete(post.id) },
                )
            }
        }
    }
}