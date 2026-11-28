package com.example.cpen321application

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.cpen321application.fakes.FakeSocialRepository
import com.example.cpen321application.model.SocialPost
import com.example.cpen321application.screens.social.FEED_POLL_INTERVAL_MS
import com.example.cpen321application.screens.social.SocialScreen
import com.example.cpen321application.viewmodel.SocialViewModel
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.time.Instant
import java.time.temporal.ChronoUnit

@RunWith(AndroidJUnit4::class)
class SocialScreenTest {
    @get:Rule
    val composeRule = createComposeRule()

    private val friendPost = SocialPost(
        id = "p1",
        authorId = "friend",
        authorName = "Alex Kim",
        imageUrl = null,
        caption = "Sunday fit",
        likeCount = 0,
        likedByMe = false,
        createdAt = Instant.now(),
        expiresAt = Instant.now().plus(1, ChronoUnit.DAYS),
    )

    private fun showFeed(): FakeSocialRepository {
        val repository = FakeSocialRepository(posts = listOf(friendPost))
        val viewModel = SocialViewModel(repository)
        composeRule.setContent { SocialScreen(viewModel) }
        composeRule.onNodeWithText("Be the first to like").assertIsDisplayed()
        return repository
    }

    @Test
    fun likesFromOthersShowUpWithoutRefreshing() {
        val repository = showFeed()

        // Another user likes the post on the back-end.
        repository.posts = listOf(friendPost.copy(likeCount = 2))
        composeRule.mainClock.advanceTimeBy(FEED_POLL_INTERVAL_MS)

        composeRule.waitUntil(timeoutMillis = 5_000) {
            composeRule.onAllNodes(hasText("2 likes")).fetchSemanticsNodes().isNotEmpty()
        }
    }

    @Test
    fun feedDoesntReloadBeforeTheInterval() {
        val repository = showFeed()

        repository.posts = listOf(friendPost.copy(likeCount = 2))
        composeRule.mainClock.advanceTimeBy(FEED_POLL_INTERVAL_MS / 2)
        composeRule.waitForIdle()

        composeRule.onNodeWithText("Be the first to like").assertIsDisplayed()
    }
}
