package com.example.cpen321application.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.example.cpen321application.data.Post
import com.example.cpen321application.viewmodel.PostsViewModel

const val POST_CARD_TAG = "post_card"

/** The user's and their friends' outfits of the day, newest first. Reloads each time it's shown. */
@Composable
fun PostsFeed(viewModel: PostsViewModel, modifier: Modifier = Modifier) {
    val state by viewModel.uiState.collectAsState()
    LaunchedEffect(viewModel) { viewModel.load() }

    when {
        state.isLoading && state.posts.isEmpty() -> Box(modifier.fillMaxSize(), Alignment.Center) {
            CircularProgressIndicator()
        }
        state.loadError != null -> EmptyState(
            title = "Couldn't load posts",
            message = state.loadError.orEmpty(),
            modifier = modifier,
            action = { TextButton(onClick = viewModel::load) { Text("Try again") } },
        )
        state.posts.isEmpty() -> EmptyState(
            title = "No posts today",
            message = "Open one of your outfits and tap \"Post as today's outfit\". Outfits your friends post today show up here too.",
            modifier = modifier,
        )
        else -> LazyColumn(
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            modifier = modifier.fillMaxSize(),
        ) {
            items(state.posts, key = Post::id) { post ->
                PostCard(post, isDeleting = state.deletingId == post.id, onDelete = { viewModel.deletePost(post.id) })
            }
        }
    }

    state.deleteError?.let { error ->
        AlertDialog(
            onDismissRequest = viewModel::dismissDeleteError,
            title = { Text("Couldn't delete post") },
            text = { Text(error) },
            confirmButton = { TextButton(onClick = viewModel::dismissDeleteError) { Text("OK") } },
        )
    }
}

@Composable
private fun PostCard(post: Post, isDeleting: Boolean, onDelete: () -> Unit) {
    Card(Modifier.fillMaxWidth().testTag(POST_CARD_TAG)) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(if (post.isOwn) "You" else post.authorName, style = MaterialTheme.typography.titleMedium)
            Text(
                post.outfitName,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(post.items, key = { it.id }) { item -> ClothingThumbnail(item, Modifier.size(72.dp)) }
            }
            if (post.isOwn) {
                ConfirmDeleteButton(
                    label = "Delete post",
                    title = "Delete your post?",
                    message = "Your friends will no longer see it. The outfit stays saved.",
                    onDelete = onDelete,
                    isDeleting = isDeleting,
                )
            }
        }
    }
}
