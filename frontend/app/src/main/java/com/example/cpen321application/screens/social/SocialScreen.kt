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
import com.example.cpen321application.screens.rememberPhotoPicker
import com.example.cpen321application.viewmodel.SocialUiState
import com.example.cpen321application.viewmodel.SocialViewModel

const val CREATE_POST_BUTTON_TAG = "create_post_button"

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SocialScreen(viewModel: SocialViewModel, modifier: Modifier = Modifier) {
    val state by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    var choosingPhotoSource by rememberSaveable { mutableStateOf(false) }
    var deletingPost by rememberSaveable { mutableStateOf<String?>(null) }

    val photoPicker = rememberPhotoPicker(
        onPhoto = { uri -> viewModel.preparePost { readPhotoForUpload(context, uri) } },
        onCameraUnavailable = {
            viewModel.showActionError("No camera app is available on this device.")
        },
        onCancelled = { choosingPhotoSource = false },
    )

    Box(modifier = modifier.fillMaxSize()) {
        SocialFeedContent(
            state = state,
            onRefresh = viewModel::refresh,
            onRetry = viewModel::loadPosts,
            onToggleLike = viewModel::toggleLike,
            onRequestDelete = { deletingPost = it },
        )

        ExtendedFloatingActionButton(
            onClick = { choosingPhotoSource = true },
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(16.dp)
                .testTag(CREATE_POST_BUTTON_TAG),
        ) {
            Icon(Icons.Filled.Add, contentDescription = null)
            Text("Post Outfit", modifier = Modifier.padding(start = 12.dp))
        }
    }

    if (choosingPhotoSource) {
        OotdPhotoSourceSheet(
            onTakePhoto = {
                choosingPhotoSource = false
                photoPicker.takePhoto()
            },
            onChooseFromGallery = {
                choosingPhotoSource = false
                photoPicker.chooseFromGallery()
            },
            onDismiss = { choosingPhotoSource = false },
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

    deletingPost?.let { postId ->
        AlertDialog(
            onDismissRequest = { deletingPost = null },
            title = { Text("Delete post?") },
            text = { Text("This Outfit of the Day post will be removed from your friends' feeds.") },
            confirmButton = {
                TextButton(onClick = {
                    deletingPost = null
                    viewModel.deletePost(postId)
                }) {
                    Text("Delete", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { deletingPost = null }) { Text("Cancel") }
            },
        )
    }

    state.actionError?.let { error ->
        AlertDialog(
            onDismissRequest = viewModel::dismissActionError,
            text = { Text(error) },
            confirmButton = {
                TextButton(onClick = viewModel::dismissActionError) { Text("OK") }
            },
        )
    }
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
    }
}