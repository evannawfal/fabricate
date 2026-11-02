package com.example.cpen321application

import android.Manifest
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextReplacement
import androidx.test.espresso.Espresso.pressBack
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.example.cpen321application.data.ClothingRepositoryException
import com.example.cpen321application.fakes.FakeLocationProvider
import com.example.cpen321application.fakes.FakeOutfitRepository
import com.example.cpen321application.model.ClothingCategory
import com.example.cpen321application.model.ClothingItem
import com.example.cpen321application.model.Coordinates
import com.example.cpen321application.model.GeneratedOutfit
import com.example.cpen321application.model.Outfit
import com.example.cpen321application.model.OutfitOccasion
import com.example.cpen321application.model.Weather
import com.example.cpen321application.screens.GENERATE_OUTFIT_BUTTON_TAG
import com.example.cpen321application.screens.GENERATING_OUTFIT_TAG
import com.example.cpen321application.screens.OUTFIT_NAME_FIELD_TAG
import com.example.cpen321application.screens.OutfitsScreen
import com.example.cpen321application.screens.REGENERATE_OUTFIT_TAG
import com.example.cpen321application.screens.SAVE_GENERATED_OUTFIT_TAG
import com.example.cpen321application.screens.SAVE_OUTFIT_BUTTON_TAG
import com.example.cpen321application.screens.occasionOptionTag
import com.example.cpen321application.viewmodel.OutfitsViewModel
import kotlinx.coroutines.CompletableDeferred
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class OutfitsScreenTest {
    @get:Rule
    val composeRule = createComposeRule()

    private val hoodie = ClothingItem("1", "Grey Hoodie", ClothingCategory.Top, "grey", "casual")
    private val jeans = ClothingItem("2", "Black Jeans", ClothingCategory.Bottom, "black", "casual")
    private val sneakers = ClothingItem("3", "White Sneakers", ClothingCategory.Shoes, "white", "casual")
    private val closet = listOf(hoodie, jeans, sneakers)
    private val weekend = Outfit("o1", "Weekend", listOf(hoodie, jeans))
    private lateinit var viewModel: OutfitsViewModel

    private val rain = Weather(9, "Rain", "light rain")
    private val rainyDay = GeneratedOutfit("Rainy day layers", OutfitOccasion.Work, listOf(hoodie, jeans), rain)
    private val location = FakeLocationProvider()

    @Before
    fun allowLocation() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        instrumentation.uiAutomation.grantRuntimePermission(
            instrumentation.targetContext.packageName,
            Manifest.permission.ACCESS_COARSE_LOCATION,
        )
    }

    private fun showOutfits(outfits: List<Outfit> = emptyList(), listError: String? = null): FakeOutfitRepository {
        val repository = FakeOutfitRepository(outfits, closet)
        repository.listError = listError
        viewModel = OutfitsViewModel(repository, location)
        composeRule.setContent { OutfitsScreen(viewModel, closet) }
        return repository
    }

    @Test
    fun showsSavedOutfits() {
        showOutfits(listOf(Outfit("o1", "Weekend", listOf(hoodie, jeans))))

        composeRule.onNodeWithText("Weekend").assertIsDisplayed()
    }

    @Test
    fun showsEmptyStateWithoutOutfits() {
        showOutfits()

        composeRule.onNodeWithText("No outfits yet").assertIsDisplayed()
    }

    @Test
    fun createsOutfitFromClosetItems() {
        val repository = showOutfits()

        composeRule.onNodeWithText("Create outfit").performClick()
        composeRule.onNodeWithTag(SAVE_OUTFIT_BUTTON_TAG).assertIsNotEnabled()
        composeRule.onNodeWithTag(OUTFIT_NAME_FIELD_TAG).performTextReplacement("Weekend")
        composeRule.onNodeWithText("Black Jeans").performClick()
        composeRule.onNodeWithText("Grey Hoodie").performClick()
        composeRule.onNodeWithText("Grey Hoodie").assertIsSelected()
        composeRule.onNodeWithTag(SAVE_OUTFIT_BUTTON_TAG).assertIsEnabled().performClick()

        composeRule.onNodeWithText("My Outfits").assertIsDisplayed()
        composeRule.onNodeWithText("Weekend").assertIsDisplayed()
        // Saved in category order, whatever order they were picked in.
        assertEquals(listOf("1", "2"), repository.outfits.single().items.map { it.id })
    }

    @Test
    fun renamesAndChangesOutfit() {
        val repository = showOutfits(listOf(Outfit("o1", "Weekend", listOf(hoodie, jeans))))

        composeRule.onNodeWithText("Weekend").performClick()
        composeRule.onNodeWithText("Black Jeans").assertIsSelected().performClick()
        composeRule.onNodeWithText("Black Jeans").assertIsNotSelected()
        composeRule.onNodeWithText("White Sneakers").performClick()
        composeRule.onNodeWithTag(OUTFIT_NAME_FIELD_TAG).performTextReplacement("Gym")
        composeRule.onNodeWithText("Save changes").performClick()

        composeRule.onNodeWithText("Gym").assertIsDisplayed()
        composeRule.onNodeWithText("Weekend").assertDoesNotExist()
        assertEquals(listOf("1", "3"), repository.outfits.single().items.map { it.id })
    }

    @Test
    fun deletesOutfitAfterConfirming() {
        val repository = showOutfits(listOf(Outfit("o1", "Weekend", listOf(hoodie))))

        composeRule.onNodeWithText("Weekend").performClick()
        composeRule.onNodeWithText("Delete outfit").performClick()
        composeRule.onNodeWithText("Delete this outfit?").assertIsDisplayed()
        composeRule.onNodeWithText("Delete").performClick()

        composeRule.onNodeWithText("No outfits yet").assertIsDisplayed()
        assertEquals(0, repository.outfits.size)
    }

    @Test
    fun failedSaveKeepsTheEditorOpenWithTheReason() {
        val repository = showOutfits()
        repository.saveError = "Couldn't reach the server."

        composeRule.onNodeWithText("Create outfit").performClick()
        composeRule.onNodeWithTag(OUTFIT_NAME_FIELD_TAG).performTextReplacement("Weekend")
        composeRule.onNodeWithText("Grey Hoodie").performClick()
        composeRule.onNodeWithTag(SAVE_OUTFIT_BUTTON_TAG).performClick()

        composeRule.onNodeWithText("Couldn't reach the server.").assertIsDisplayed()
        composeRule.onNodeWithText("New outfit").assertIsDisplayed()
    }

    @Test
    fun failedLoadCanBeRetried() {
        val repository = showOutfits(listOf(weekend), listError = "Couldn't reach the server.")

        composeRule.onNodeWithText("Couldn't load your outfits").assertIsDisplayed()
        repository.listError = null
        composeRule.onNodeWithText("Try again").performClick()

        composeRule.onNodeWithText("Weekend").assertIsDisplayed()
    }

    @Test
    fun failedDeleteShowsTheReasonAndKeepsTheOutfit() {
        val repository = showOutfits(listOf(weekend))
        repository.deleteError = "Couldn't reach the server."

        composeRule.onNodeWithText("Weekend").performClick()
        composeRule.onNodeWithText("Delete outfit").performClick()
        composeRule.onNodeWithText("Delete").performClick()

        composeRule.onNodeWithText("Couldn't delete outfit").assertIsDisplayed()
        composeRule.onNodeWithText("Couldn't reach the server.").assertIsDisplayed()
        composeRule.onNodeWithText("OK").performClick()
        composeRule.onNodeWithText("Edit outfit").assertIsDisplayed()
        assertEquals(1, repository.outfits.size)
    }

    @Test
    fun draftCantChangeWhileSaving() {
        val gate = CompletableDeferred<Unit>()
        val repository = showOutfits(listOf(weekend))
        repository.saveGate = gate

        composeRule.onNodeWithText("Weekend").performClick()
        composeRule.onNodeWithTag(SAVE_OUTFIT_BUTTON_TAG).performClick()

        composeRule.onNodeWithTag(OUTFIT_NAME_FIELD_TAG).assertIsNotEnabled()
        composeRule.onNodeWithText("White Sneakers").assertIsNotEnabled()
        composeRule.onNodeWithContentDescription("Back").assertIsNotEnabled()
        composeRule.onNodeWithText("Delete outfit").assertIsNotEnabled()
        pressBack()
        composeRule.onNodeWithText("Edit outfit").assertIsDisplayed()

        gate.complete(Unit)
        composeRule.onNodeWithText("My Outfits").assertIsDisplayed()
    }

    @Test
    fun outfitCantBeSavedOrLeftWhileDeleting() {
        val gate = CompletableDeferred<Unit>()
        val repository = showOutfits(listOf(weekend))
        repository.deleteGate = gate

        composeRule.onNodeWithText("Weekend").performClick()
        composeRule.onNodeWithText("Delete outfit").performClick()
        composeRule.onNodeWithText("Delete").performClick()

        composeRule.onNodeWithTag(SAVE_OUTFIT_BUTTON_TAG).assertIsNotEnabled()
        pressBack()
        composeRule.onNodeWithText("Edit outfit").assertIsDisplayed()

        gate.complete(Unit)
        composeRule.onNodeWithText("No outfits yet").assertIsDisplayed()
        assertEquals(0, repository.outfits.size)
    }

    // The buttons are disabled during a request, so these call the view model directly.
    @Test
    fun secondRequestIsIgnoredWhileSaving() {
        val gate = CompletableDeferred<Unit>()
        val repository = showOutfits(listOf(weekend))
        repository.saveGate = gate

        composeRule.onNodeWithText("Weekend").performClick()
        composeRule.onNodeWithTag(SAVE_OUTFIT_BUTTON_TAG).performClick()
        composeRule.runOnIdle {
            viewModel.saveDraft()
            viewModel.deleteOutfit(weekend.id)
        }
        gate.complete(Unit)

        composeRule.onNodeWithText("My Outfits").assertIsDisplayed()
        assertEquals(1, repository.saveCalls)
        assertEquals(0, repository.deleteCalls)
    }

    @Test
    fun secondRequestIsIgnoredWhileDeleting() {
        val gate = CompletableDeferred<Unit>()
        val repository = showOutfits(listOf(weekend))
        repository.deleteGate = gate

        composeRule.onNodeWithText("Weekend").performClick()
        composeRule.onNodeWithText("Delete outfit").performClick()
        composeRule.onNodeWithText("Delete").performClick()
        composeRule.runOnIdle {
            viewModel.deleteOutfit(weekend.id)
            viewModel.saveDraft()
        }
        gate.complete(Unit)

        composeRule.onNodeWithText("No outfits yet").assertIsDisplayed()
        assertEquals(1, repository.deleteCalls)
        assertEquals(0, repository.saveCalls)
    }

    private fun generateForWork() {
        composeRule.onNodeWithTag(GENERATE_OUTFIT_BUTTON_TAG).performClick()
        composeRule.onNodeWithTag(occasionOptionTag(OutfitOccasion.Work)).performClick()
    }

    @Test
    fun generatesAnOutfitForTheChosenOccasion() {
        val gate = CompletableDeferred<Unit>()
        val repository = showOutfits()
        repository.generateGate = gate
        repository.generateResult = { rainyDay }

        composeRule.onNodeWithTag(GENERATE_OUTFIT_BUTTON_TAG).performClick()
        OutfitOccasion.entries.forEach { composeRule.onNodeWithText(it.label).assertIsDisplayed() }
        composeRule.onNodeWithTag(occasionOptionTag(OutfitOccasion.Work)).performClick()

        composeRule.onNodeWithTag(GENERATING_OUTFIT_TAG).assertIsDisplayed()
        gate.complete(Unit)

        composeRule.onNodeWithText("Rainy day layers").assertIsDisplayed()
        composeRule.onNodeWithText("Based on the weather: 9°C, light rain").assertIsDisplayed()
        composeRule.onNodeWithText("Grey Hoodie").assertIsDisplayed()
        composeRule.onNodeWithText("Black Jeans").assertIsDisplayed()
        assertEquals(listOf(OutfitOccasion.Work to Coordinates(49.26, -123.25)), repository.generateRequests)
    }

    @Test
    fun savesTheGeneratedOutfitWithItsOccasion() {
        val repository = showOutfits()
        repository.generateResult = { rainyDay }

        generateForWork()
        composeRule.onNodeWithTag(SAVE_GENERATED_OUTFIT_TAG).performClick()

        composeRule.onNodeWithText("My Outfits").assertIsDisplayed()
        composeRule.onNodeWithText("Rainy day layers").assertIsDisplayed()
        val saved = repository.outfits.single()
        assertEquals(listOf("1", "2"), saved.items.map { it.id })
        assertEquals("work", saved.occasion)
    }

    @Test
    fun regenerateAsksForAnotherOutfitForTheSameOccasion() {
        val repository = showOutfits()
        repository.generateResult = { rainyDay }

        generateForWork()
        repository.generateResult = { rainyDay.copy(name = "Office casual") }
        composeRule.onNodeWithTag(REGENERATE_OUTFIT_TAG).performClick()

        composeRule.onNodeWithText("Office casual").assertIsDisplayed()
        assertEquals(listOf(OutfitOccasion.Work, OutfitOccasion.Work), repository.generateRequests.map { it.first })
        assertEquals(0, repository.outfits.size)
    }

    @Test
    fun missingClothesExplainsWhatToAddWithoutOfferingARetry() {
        val message = "Your clean clothes don't include a bottom. Add one to your closet or empty your wash bin."
        val repository = showOutfits()
        repository.generateResult = { throw ClothingRepositoryException(message) }

        generateForWork()

        composeRule.onNodeWithText(message).assertIsDisplayed()
        composeRule.onNodeWithText("Try again").assertDoesNotExist()
    }

    @Test
    fun unavailableServiceCanBeRetried() {
        val repository = showOutfits()
        repository.generateResult = { throw ClothingRepositoryException("Try again later.", canRetry = true) }

        generateForWork()
        composeRule.onNodeWithText("Try again later.").assertIsDisplayed()

        repository.generateResult = { rainyDay }
        composeRule.onNodeWithText("Try again").performClick()
        composeRule.onNodeWithText("Rainy day layers").assertIsDisplayed()
    }

    @Test
    fun missingWeatherIsCalledOut() {
        val repository = showOutfits()
        repository.generateResult = { rainyDay.copy(weather = null) }

        generateForWork()

        composeRule.onNodeWithText("The weather wasn't considered for this outfit.").assertIsDisplayed()
    }

    @Test
    fun unavailableLocationExplainsWhyItsNeededWithoutCallingTheBackEnd() {
        location.coordinates = null
        val repository = showOutfits()

        generateForWork()

        composeRule.onNodeWithText("Couldn't generate an outfit").assertIsDisplayed()
        composeRule.onNodeWithText("Try again").assertIsDisplayed()
        assertEquals(0, repository.generateRequests.size)
    }

    @Test
    fun leavingDuringGenerationIgnoresTheLateResult() {
        val gate = CompletableDeferred<Unit>()
        val repository = showOutfits()
        repository.generateGate = gate
        repository.generateResult = { rainyDay }

        generateForWork()
        composeRule.onNodeWithContentDescription("Back").performClick()
        composeRule.onNodeWithText("My Outfits").assertIsDisplayed()

        gate.complete(Unit)
        composeRule.waitForIdle()
        composeRule.onNodeWithText("My Outfits").assertIsDisplayed()
        composeRule.onNodeWithText("Rainy day layers").assertDoesNotExist()
    }

    @Test
    fun failedSaveKeepsTheGeneratedOutfit() {
        val repository = showOutfits()
        repository.generateResult = { rainyDay }
        repository.saveError = "Couldn't reach the server."

        generateForWork()
        composeRule.onNodeWithTag(SAVE_GENERATED_OUTFIT_TAG).performClick()

        composeRule.onNodeWithText("Couldn't reach the server.").assertIsDisplayed()
        composeRule.onNodeWithText("Rainy day layers").assertIsDisplayed()
    }

    @Test
    fun generatedOutfitCantBeLeftOrRegeneratedWhileSaving() {
        val gate = CompletableDeferred<Unit>()
        val repository = showOutfits()
        repository.generateResult = { rainyDay }
        repository.saveGate = gate

        generateForWork()
        composeRule.onNodeWithTag(SAVE_GENERATED_OUTFIT_TAG).performClick()

        composeRule.onNodeWithTag(REGENERATE_OUTFIT_TAG).assertIsNotEnabled()
        pressBack()
        composeRule.onNodeWithText("Rainy day layers").assertIsDisplayed()

        gate.complete(Unit)
        composeRule.onNodeWithText("My Outfits").assertIsDisplayed()
    }

    @Test
    fun backLeavesTheEditorWithoutSaving() {
        val repository = showOutfits()

        composeRule.onNodeWithText("Create outfit").performClick()
        composeRule.onNodeWithText("Grey Hoodie").performClick()
        composeRule.onNodeWithContentDescription("Back").performClick()

        composeRule.onNodeWithText("No outfits yet").assertIsDisplayed()
        assertEquals(0, repository.outfits.size)
    }
}
