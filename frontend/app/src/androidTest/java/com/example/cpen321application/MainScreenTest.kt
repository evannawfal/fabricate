package com.example.cpen321application

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.isDialog
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.espresso.Espresso.pressBack
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.cpen321application.fakes.FakeClothingRepository
import com.example.cpen321application.fakes.FakeLocationProvider
import com.example.cpen321application.fakes.FakeOutfitRepository
import com.example.cpen321application.fakes.FakeProfileRepository
import com.example.cpen321application.fakes.FakeRecommendationRepository
import com.example.cpen321application.fakes.FakeRoomsRepository
import com.example.cpen321application.fakes.FakeSocialRepository
import com.example.cpen321application.model.ClothingCategory
import com.example.cpen321application.model.ClothingItem
import com.example.cpen321application.model.Outfit
import com.example.cpen321application.screens.MainScreen
import com.example.cpen321application.screens.MainScreenRepositories
import kotlinx.coroutines.CompletableDeferred
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class MainScreenTest {
    @get:Rule
    val composeRule = createComposeRule()

    private var signOutCalls = 0
    private val recommendations = FakeRecommendationRepository()

    private fun showMainScreen(outfitRepository: FakeOutfitRepository = FakeOutfitRepository()) {
        composeRule.setContent {
            MainScreen(
                repositories = MainScreenRepositories(
                    clothing = FakeClothingRepository(emptyList()),
                    outfits = outfitRepository,
                    recommendations = recommendations,
                    location = FakeLocationProvider(),
                    rooms = FakeRoomsRepository(),
                    profile = FakeProfileRepository(),
                    social = FakeSocialRepository(),
                ),
                onSignOut = { signOutCalls++ },
            )
        }
    }

    private fun openSignOut() {
        composeRule.onNodeWithContentDescription("Profile").performClick()
        composeRule.onNodeWithText("Sign out").performClick()
    }

    @Test
    fun opensOnTheClosetTab() {
        showMainScreen()

        composeRule.onNodeWithText("My Closet").assertIsDisplayed()
    }

    @Test
    fun switchesToAvatarAndBackReturnsToCloset() {
        showMainScreen()

        composeRule.onNodeWithText("Avatar").performClick()
        composeRule.onNodeWithText("Try on").assertIsDisplayed()

        pressBack()
        composeRule.onNodeWithText("My Closet").assertIsDisplayed()
    }

    @Test
    fun switchesToOutfitsAndBackReturnsToCloset() {
        showMainScreen()

        composeRule.onNodeWithText("Outfits").performClick()
        composeRule.onNodeWithText("My Outfits").assertIsDisplayed()

        pressBack()
        composeRule.onNodeWithText("My Closet").assertIsDisplayed()
    }

    @Test
    fun loadsRecommendationsOnlyOnceTheShopTabOpens() {
        showMainScreen()
        composeRule.onNodeWithText("My Closet").assertIsDisplayed()
        assertEquals(0, recommendations.requests.size)

        composeRule.onNodeWithContentDescription("Shop").performClick()
        composeRule.onAllNodesWithText("Recommended for you").onFirst().assertIsDisplayed()
        composeRule.waitForIdle()
        assertEquals(1, recommendations.requests.size)

        pressBack()
        composeRule.onNodeWithText("My Closet").assertIsDisplayed()
    }

    @Test
    fun systemBackStaysInTheOutfitEditorWhileSaving() {
        val hoodie = ClothingItem("1", "Grey Hoodie", ClothingCategory.Top, "grey", "casual")
        val gate = CompletableDeferred<Unit>()
        val outfits = FakeOutfitRepository(listOf(Outfit("o1", "Weekend", listOf(hoodie))), listOf(hoodie))
        outfits.saveGate = gate
        showMainScreen(outfits)

        composeRule.onNodeWithText("Outfits").performClick()
        composeRule.onNodeWithText("Weekend").performClick()
        composeRule.onNodeWithText("Save changes").performClick()
        pressBack()
        composeRule.onNodeWithText("Edit outfit").assertIsDisplayed()

        gate.complete(Unit)
        composeRule.onNodeWithText("My Outfits").assertIsDisplayed()
    }

    @Test
    fun cancellingSignOutStaysSignedIn() {
        showMainScreen()

        openSignOut()
        composeRule.onNodeWithText("Sign out?").assertIsDisplayed()
        composeRule.onNodeWithText("Cancel").performClick()

        composeRule.onNodeWithText("Sign out?").assertDoesNotExist()
        composeRule.onNodeWithText("My Closet").assertIsDisplayed()
        assertEquals(0, signOutCalls)
    }

    @Test
    fun confirmingSignOutSignsOut() {
        showMainScreen()

        openSignOut()
        composeRule.onNode(hasText("Sign out") and hasAnyAncestor(isDialog())).performClick()

        composeRule.onNodeWithText("Sign out?").assertDoesNotExist()
        assertEquals(1, signOutCalls)
    }
}
