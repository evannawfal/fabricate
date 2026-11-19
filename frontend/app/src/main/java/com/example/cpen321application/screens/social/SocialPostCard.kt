package com.example.cpen321application.screens.social

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.example.cpen321application.model.SocialPost
import com.example.cpen321application.screens.expiryLabel
import java.time.Duration
import java.time.Instant

const val SOCIAL_POST_CARD_TAG = "social_post_card"
const val LIKE_POST_BUTTON_TAG = "like_post_button"
const val DELETE_POST_BUTTON_TAG = "delete_post_button"

@Composable
internal fun SocialPostCard(
    post: SocialPost,
    isMine: Boolean,
    isLiking: Boolean,
    isDeleting: Boolean,
    onToggleLike: () -> Unit,
    onDelete: () -> Unit,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .testTag(SOCIAL_POST_CARD_TAG),
    ) {
        Column {
            PostHeader(
                post = post,
                isMine = isMine,
                isDeleting = isDeleting,
                onDelete = onDelete,
            )
            PostPhoto(post = post)
            PostFooter(
                post = post,
                isLiking = isLiking,
                onToggleLike = onToggleLike,
            )
        }
    }
}

@Composable
private fun PostHeader(
    post: SocialPost,
    isMine: Boolean,
    isDeleting: Boolean,
    onDelete: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(
            modifier = Modifier
                .size(36.dp)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.primaryContainer),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = post.authorName.take(1).uppercase(),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onPrimaryContainer,
            )
        }

        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = if (isMine) "${post.authorName} (You)" else post.authorName,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = "${postedAgoLabel(post.createdAt)} · ${expiryLabel(post.expiresAt)}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        if (isMine) {
            IconButton(
                onClick = onDelete,
                enabled = !isDeleting,
                modifier = Modifier.testTag(DELETE_POST_BUTTON_TAG),
            ) {
                if (isDeleting) {
                    CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                } else {
                    Icon(
                        imageVector = Icons.Filled.Delete,
                        contentDescription = "Delete post",
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun PostPhoto(post: SocialPost) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .aspectRatio(4f / 5f)
            .background(MaterialTheme.colorScheme.surfaceVariant),
        contentAlignment = Alignment.Center,
    ) {
        if (post.imageUrl != null) {
            AsyncImage(
                model = ImageRequest.Builder(LocalContext.current)
                    .data(post.imageUrl)
                    .memoryCacheKey("post:${post.id}")
                    .diskCacheKey("post:${post.id}")
                    .build(),
                contentDescription = "${post.authorName}'s outfit",
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        } else {
            Text(
                text = "Photo unavailable",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun PostFooter(
    post: SocialPost,
    isLiking: Boolean,
    onToggleLike: () -> Unit,
) {
    Column(
        modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            IconButton(
                onClick = onToggleLike,
                enabled = !isLiking,
                modifier = Modifier
                    .size(36.dp)
                    .testTag(LIKE_POST_BUTTON_TAG),
            ) {
                Icon(
                    imageVector = if (post.likedByMe) Icons.Filled.Favorite else Icons.Outlined.FavoriteBorder,
                    contentDescription = if (post.likedByMe) "Unlike" else "Like",
                    tint = if (post.likedByMe) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
                )
            }
            Text(
                text = when (post.likeCount) {
                    0 -> "Be the first to like"
                    1 -> "1 like"
                    else -> "${post.likeCount} likes"
                },
                style = MaterialTheme.typography.labelLarge,
            )
        }

        if (post.caption.isNotBlank()) {
            Text(
                text = post.caption,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(horizontal = 4.dp, vertical = 2.dp),
            )
        }
    }
}

private fun postedAgoLabel(createdAt: Instant, now: Instant = Instant.now()): String {
    val elapsed = Duration.between(createdAt, now)
    return when {
        elapsed.toMinutes() < 1 -> "Just now"
        elapsed.toHours() < 1 -> "${elapsed.toMinutes()}m ago"
        else -> "${elapsed.toHours()}h ago"
    }
}