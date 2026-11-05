package com.example.cpen321application

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.example.cpen321application.auth.SessionStore
import com.example.cpen321application.data.AvatarStore
import com.example.cpen321application.fakes.FakeClothingRepository
import com.example.cpen321application.model.ClothingCategory
import com.example.cpen321application.model.ClothingItem
import com.example.cpen321application.viewmodel.AvatarUiState
import com.example.cpen321application.viewmodel.AvatarViewModel
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class AvatarViewModelTest {
    private val context = InstrumentationRegistry.getInstrumentation().targetContext

    private val tee = ClothingItem("1", "White Tee", ClothingCategory.Top, "white", "casual", hasModel = true)
    private val shirt = ClothingItem("2", "Blue Shirt", ClothingCategory.Top, "blue", "formal")
    private val jeans = ClothingItem("3", "Black Jeans", ClothingCategory.Bottom, "black", "casual")
    private val sneakers = ClothingItem("4", "White Sneakers", ClothingCategory.Shoes, "white", "casual")

    private val repository = FakeClothingRepository(listOf(tee, shirt, jeans, sneakers))

    // The view model works on the main thread, so the test waits for each change to arrive.
    private fun AvatarViewModel.awaitState(condition: (AvatarUiState) -> Boolean): AvatarUiState =
        runBlocking { withTimeout(5_000) { uiState.first(condition) } }

    private fun viewModel(): AvatarViewModel {
        val viewModel = runBlocking(Dispatchers.Main) {
            AvatarViewModel(SessionStore(context), AvatarStore(context), repository)
        }
        viewModel.loadWardrobe()
        viewModel.awaitState { it.wardrobe.isNotEmpty() }
        return viewModel
    }

    @Test
    fun wardrobe_listsOnlyClothesThatCanBeTriedOn() {
        val state = viewModel().uiState.value

        assertEquals(listOf(tee, shirt, jeans), state.wardrobe)
    }

    @Test
    fun tappingAnItemPutsItOnAndTappingAgainTakesItOff() {
        val viewModel = viewModel()

        viewModel.toggleGarment(tee)
        viewModel.awaitState { it.isWorn(tee) }
        viewModel.toggleGarment(tee)

        val state = viewModel.awaitState { !it.isWorn(tee) }
        assertTrue(state.worn.isEmpty())
        // The tee already had a model, so none was built.
        assertTrue(repository.generatedModels.isEmpty())
    }

    @Test
    fun anItemWithoutAModelHasOneBuiltFirst() {
        val viewModel = viewModel()

        viewModel.toggleGarment(jeans)

        val state = viewModel.awaitState { it.isWorn(jeans) }
        assertEquals(listOf(jeans.id), repository.generatedModels)
        assertTrue(state.wardrobe.first { it.id == jeans.id }.hasModel)
    }

    @Test
    fun onlyOneItemPerCategoryIsWorn() {
        val viewModel = viewModel()

        viewModel.toggleGarment(tee)
        viewModel.awaitState { it.isWorn(tee) }
        viewModel.toggleGarment(shirt)

        val state = viewModel.awaitState { it.isWorn(shirt) }
        assertEquals(false, state.isWorn(tee))
    }

    @Test
    fun anotherItemCantBeTriedOnWhileOneIsLoading() {
        val viewModel = viewModel()
        val gate = CompletableDeferred<Unit>().also { repository.modelGate = it }

        viewModel.toggleGarment(shirt)
        viewModel.awaitState { it.tryingOnId == shirt.id }
        viewModel.toggleGarment(tee)
        gate.complete(Unit)

        val state = viewModel.awaitState { it.tryingOnId == null }
        assertEquals(setOf(ClothingCategory.Top), state.worn.keys)
        assertTrue(state.isWorn(shirt))
    }

    @Test
    fun aFailedTryOnShowsWhy() {
        val viewModel = viewModel()
        repository.modelError = "3D models aren't available right now. Try again later."

        viewModel.toggleGarment(jeans)

        val state = viewModel.awaitState { it.tryOnError != null }
        assertEquals("3D models aren't available right now. Try again later.", state.tryOnError)
        assertNull(state.tryingOnId)
        assertTrue(state.worn.isEmpty())
    }

    @Test
    fun garmentSizeIsKeptWithinItsRange() {
        val viewModel = viewModel()
        viewModel.toggleGarment(tee)
        viewModel.awaitState { it.isWorn(tee) }

        viewModel.setGarmentSize(ClothingCategory.Top, 5f)
        assertEquals(1.3f, viewModel.awaitState { it.garmentSizes[ClothingCategory.Top] != 1f }.garmentSizes[ClothingCategory.Top])

        // Garments that aren't worn have no size to change.
        viewModel.setGarmentSize(ClothingCategory.Bottom, 1.1f)
        assertNull(viewModel.uiState.value.garmentSizes[ClothingCategory.Bottom])
    }
}
