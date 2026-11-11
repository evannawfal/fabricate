package com.example.cpen321application

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.cpen321application.data.Post
import com.example.cpen321application.fakes.FakePostsRepository
import com.example.cpen321application.model.ClothingCategory
import com.example.cpen321application.model.ClothingItem
import com.example.cpen321application.screens.POST_CARD_TAG
import com.example.cpen321application.screens.PostsFeed
import com.example.cpen321application.viewmodel.PostsViewModel
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/** The Friends' posts feed with the back-end replaced by [FakePostsRepository]. */
@RunWith(AndroidJUnit4::class)
class PostsScreenTest {
    @get:Rule
    val composeRule = createComposeRule()

    private val hoodie = ClothingItem("1", "Grey Hoodie", ClothingCategory.Top, "grey", "casual")
    private val jeans = ClothingItem("2", "Black Jeans", ClothingCategory.Bottom, "black", "casual")
    private val ownPost = Post("p1", "Test User", isOwn = true, outfitName = "Weekend", items = listOf(hoodie, jeans))
    private val samsPost = Post("p2", "Sam Lee", isOwn = false, outfitName = "Gym day", items = listOf(hoodie))

    private fun showFeed(repository: FakePostsRepository) {
        composeRule.setContent { PostsFeed(PostsViewModel(repository)) }
    }

    private fun waitForText(text: String) {
        composeRule.waitUntil(timeoutMillis = 5_000) {
            composeRule.onAllNodesWithText(text).fetchSemanticsNodes().isNotEmpty()
        }
    }

    @Test
    fun showsOwnAndFriendsPosts_withDeleteOnlyOnOwn() {
        showFeed(FakePostsRepository(listOf(ownPost, samsPost)))

        waitForText("Sam Lee")
        composeRule.onAllNodesWithTag(POST_CARD_TAG).assertCountEquals(2)
        composeRule.onNodeWithText("You").assertIsDisplayed()
        composeRule.onNodeWithText("Weekend").assertIsDisplayed()
        composeRule.onNodeWithText("Gym day").assertIsDisplayed()
        composeRule.onAllNodesWithText("Delete post").assertCountEquals(1)
    }

    @Test
    fun deletesOwnPostAfterConfirming() {
        val repository = FakePostsRepository(listOf(ownPost, samsPost))
        showFeed(repository)

        waitForText("Delete post")
        composeRule.onNodeWithText("Delete post").performClick()
        composeRule.onNodeWithText("Delete your post?").assertIsDisplayed()
        composeRule.onNodeWithText("Delete").performClick()

        composeRule.waitUntil(timeoutMillis = 5_000) {
            composeRule.onAllNodesWithText("Weekend").fetchSemanticsNodes().isEmpty()
        }
        composeRule.onAllNodesWithTag(POST_CARD_TAG).assertCountEquals(1)
        assertEquals(listOf(samsPost), repository.posts)
    }

    @Test
    fun failedDelete_showsTheReasonAndKeepsThePost() {
        val repository = FakePostsRepository(listOf(ownPost))
        repository.deleteError = "Couldn't reach the server. Check your connection and try again."
        showFeed(repository)

        waitForText("Delete post")
        composeRule.onNodeWithText("Delete post").performClick()
        composeRule.onNodeWithText("Delete").performClick()

        waitForText("Couldn't delete post")
        composeRule.onNodeWithText(repository.deleteError!!).assertIsDisplayed()
        composeRule.onNodeWithText("OK").performClick()
        composeRule.onNodeWithText("Weekend").assertIsDisplayed()
    }

    @Test
    fun showsEmptyStateWithoutPosts() {
        showFeed(FakePostsRepository())

        waitForText("No posts today")
        composeRule.onAllNodesWithTag(POST_CARD_TAG).assertCountEquals(0)
    }

    @Test
    fun failedLoad_canBeTriedAgain() {
        val repository = FakePostsRepository(listOf(samsPost))
        repository.listError = "Couldn't reach the server. Check your connection and try again."
        showFeed(repository)

        waitForText("Couldn't load posts")
        repository.listError = null
        composeRule.onNodeWithText("Try again").performClick()

        waitForText("Sam Lee")
        composeRule.onNodeWithText("Gym day").assertIsDisplayed()
    }
}
