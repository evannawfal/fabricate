package com.example.cpen321application.e2e

import android.Manifest
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasAnyDescendant
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.example.cpen321application.BuildConfig
import com.example.cpen321application.MainActivity
import com.example.cpen321application.auth.SessionStore
import com.example.cpen321application.data.ClothingItemChanges
import com.example.cpen321application.model.ClothingCategory
import com.example.cpen321application.model.ClothingItem
import com.example.cpen321application.model.Outfit
import com.example.cpen321application.model.OutfitOccasion
import com.example.cpen321application.network.BackendClothingRepository
import com.example.cpen321application.network.BackendOutfitRepository
import com.example.cpen321application.screens.GENERATED_OUTFIT_ERROR_TAG
import com.example.cpen321application.screens.GENERATED_OUTFIT_ITEM_TAG
import com.example.cpen321application.screens.GENERATED_OUTFIT_NAME_TAG
import com.example.cpen321application.screens.GENERATED_OUTFIT_WEATHER_TAG
import com.example.cpen321application.screens.GENERATE_OUTFIT_BUTTON_TAG
import com.example.cpen321application.screens.GENERATING_OUTFIT_TAG
import com.example.cpen321application.screens.OUTFIT_CARD_TAG
import com.example.cpen321application.screens.REGENERATE_OUTFIT_TAG
import com.example.cpen321application.screens.SAVE_GENERATED_OUTFIT_TAG
import com.example.cpen321application.screens.occasionOptionTag
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The Generate Daily Outfit use case end to end (documentation/Testing.md, section 4): the app
 * signed in as the tester, and the real back-end with its outfit generator and weather service.
 * Each test adds the clothes it needs to the tester's closet and gives the emulator a fixed
 * location; afterwards it removes those clothes, any outfit it saved and the location.
 */
@RunWith(AndroidJUnit4::class)
class GenerateOutfitTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context = instrumentation.targetContext
    private val sessionStore = SessionStore(context)
    private val closet = BackendClothingRepository(tokenProvider = { sessionStore.token.first() })
    private val outfits = BackendOutfitRepository(tokenProvider = { sessionStore.token.first() })

    private val addedItems = mutableListOf<ClothingItem>()
    private val itemsMadeDirty = mutableListOf<String>()
    private var outfitsBefore: List<Outfit>? = null

    @Before
    fun setUp() = runBlocking {
        assertNotNull("Sign in to the app before running the end-to-end tests", sessionStore.token.first())
        outfitsBefore = outfits.listOutfits()
        instrumentation.uiAutomation.grantRuntimePermission(context.packageName, Manifest.permission.ACCESS_COARSE_LOCATION)
        // The emulator has no location fix of its own, and the weather is looked up for it.
        shell("appops set com.android.shell android:mock_location allow")
        shell("cmd location providers add-test-provider gps")
        shell("cmd location providers set-test-provider-enabled gps true")
        shell("cmd location providers set-test-provider-location gps --location $UBC_LOCATION")
    }

    @After
    fun cleanUp() = runBlocking {
        shell("cmd location providers remove-test-provider gps")
        itemsMadeDirty.forEach { setClean(it, true) }
        addedItems.forEach { closet.deleteItem(it.id) }
        if (outfitsBefore != null) addedOutfits().forEach { outfits.deleteOutfit(it.id) }
    }

    private fun shell(command: String) {
        instrumentation.uiAutomation.executeShellCommand(command).close()
    }

    // Classified like any upload, then renamed and recategorized, so the test always has the
    // clothes it expects whatever the classifier makes of the photo.
    private suspend fun addItem(name: String, category: ClothingCategory, color: String): ClothingItem {
        val photo = instrumentation.context.assets.open(SHIRT_PHOTO).use { it.readBytes() }
        val uploaded = closet.uploadPhotos(photo, photo)
        addedItems += uploaded
        return closet.updateItem(uploaded.id, ClothingItemChanges(name, category, color, "casual"))
    }

    private fun addTopAndBottom() = runBlocking {
        addItem(TEST_TOP, ClothingCategory.Top, "black")
        addItem(TEST_BOTTOM, ClothingCategory.Bottom, "blue")
    }

    // The app has no wash bin yet, so items are marked dirty through the back-end, as it would.
    private suspend fun setClean(id: String, clean: Boolean) = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url("${BuildConfig.API_BASE_URL.trimEnd('/')}/clothing/$id")
            .header("Authorization", "Bearer ${sessionStore.token.first()}")
            .patch("""{"isClean":$clean}""".toRequestBody("application/json".toMediaType()))
            .build()
        OkHttpClient().newCall(request).execute().use { response ->
            check(response.isSuccessful) { "PATCH /clothing/$id returned ${response.code}" }
        }
    }

    private suspend fun addedOutfits(): List<Outfit> {
        val idsBefore = requireNotNull(outfitsBefore).map { it.id }.toSet()
        return outfits.listOutfits().filterNot { it.id in idsBefore }
    }

    private fun waitForTag(tag: String, timeoutMillis: Long) {
        composeRule.waitUntil(timeoutMillis) {
            composeRule.onAllNodesWithTag(tag).fetchSemanticsNodes().isNotEmpty()
        }
    }

    // Use case steps 1-3
    private fun generateFor(occasion: OutfitOccasion) {
        composeRule.onNodeWithText("Outfits").performClick()
        composeRule.onNodeWithText("My Outfits").assertIsDisplayed()
        composeRule.onNodeWithTag(GENERATE_OUTFIT_BUTTON_TAG).performClick()

        composeRule.onNodeWithText("What's the occasion?").assertIsDisplayed()
        OutfitOccasion.entries.forEach { composeRule.onNodeWithTag(occasionOptionTag(it)).assertIsDisplayed() }
        composeRule.onNodeWithTag(occasionOptionTag(occasion)).performClick()
    }

    // Steps 4-5: the loading indicator, then an outfit of the user's own clean clothes.
    private fun awaitGeneratedOutfit(occasion: OutfitOccasion): String {
        waitForTag(GENERATING_OUTFIT_TAG, UI_TIMEOUT_MS)
        composeRule.onNodeWithTag(GENERATING_OUTFIT_TAG).assertIsDisplayed()
        waitForTag(GENERATED_OUTFIT_NAME_TAG, GENERATE_TIMEOUT_MS)

        composeRule.onNodeWithText("${occasion.label} outfit").assertIsDisplayed()
        composeRule.onNodeWithTag(GENERATED_OUTFIT_WEATHER_TAG)
            .assert(hasText("Based on the weather:", substring = true))
        val cleanNames = runBlocking { closet.listItems() }.filter { it.isClean }.map { it.name }.toSet()
        val shownItems = composeRule.onAllNodesWithTag(GENERATED_OUTFIT_ITEM_TAG)
        val count = shownItems.fetchSemanticsNodes().size
        assertTrue("The outfit has no items", count > 0)
        repeat(count) { shownItems[it].assert(hasAnyDescendant(hasTextIn(cleanNames))) }
        return composeRule.onNodeWithTag(GENERATED_OUTFIT_NAME_TAG).fetchSemanticsNode()
            .config[SemanticsProperties.Text].joinToString()
    }

    private fun hasTextIn(names: Set<String>) = SemanticsMatcher("shows one of the user's clean clothes") { node ->
        node.config.getOrElse(SemanticsProperties.Text) { emptyList() }.any { it.text in names }
    }

    // Main success scenario, saving the outfit
    @Test
    fun generatingAnOutfit_showsItWithTheWeatherAndSavesIt() {
        addTopAndBottom()

        generateFor(OutfitOccasion.Casual)
        val name = awaitGeneratedOutfit(OutfitOccasion.Casual)

        // Step 6: saving keeps the outfit, and the list shows it first.
        composeRule.onNodeWithTag(SAVE_GENERATED_OUTFIT_TAG).performClick()
        composeRule.waitUntil(UI_TIMEOUT_MS) {
            composeRule.onAllNodesWithTag(GENERATED_OUTFIT_NAME_TAG).fetchSemanticsNodes().isEmpty()
        }
        composeRule.onNodeWithText("My Outfits").assertIsDisplayed()
        composeRule.onAllNodesWithTag(OUTFIT_CARD_TAG).onFirst().assert(hasText(name))
        val saved = runBlocking { addedOutfits() }.single()
        assertEquals(name, saved.name)
        assertEquals(OutfitOccasion.Casual.apiValue, saved.occasion)
    }

    // Main success scenario, regenerating instead of saving
    @Test
    fun regenerating_showsAnotherOutfitWithoutSavingTheFirst() {
        addTopAndBottom()

        generateFor(OutfitOccasion.Work)
        awaitGeneratedOutfit(OutfitOccasion.Work)

        composeRule.onNodeWithTag(REGENERATE_OUTFIT_TAG).performClick()
        awaitGeneratedOutfit(OutfitOccasion.Work)
        assertEquals(emptyList<Outfit>(), runBlocking { addedOutfits() })
    }

    // Failure 1a
    @Test
    fun noCleanBottom_showsWhatIsMissing() {
        runBlocking {
            addItem(TEST_TOP, ClothingCategory.Top, "black")
            closet.listItems().filter { it.category == ClothingCategory.Bottom && it.isClean }.forEach {
                setClean(it.id, false)
                itemsMadeDirty += it.id
            }
        }

        generateFor(OutfitOccasion.Casual)

        waitForTag(GENERATED_OUTFIT_ERROR_TAG, GENERATE_TIMEOUT_MS)
        composeRule.onNodeWithText("Couldn't generate an outfit").assertIsDisplayed()
        composeRule.onNodeWithText(MISSING_BOTTOM_MESSAGE).assertIsDisplayed()
        // Generating again would fail the same way until the closet changes.
        composeRule.onNodeWithText("Try again").assertDoesNotExist()
        assertEquals(emptyList<Outfit>(), runBlocking { addedOutfits() })
    }

    private companion object {
        const val SHIRT_PHOTO = "shirt.jpg"
        const val TEST_TOP = "E2E Test Tee"
        const val TEST_BOTTOM = "E2E Test Jeans"
        const val MISSING_BOTTOM_MESSAGE =
            "Your clean clothes don't include a bottom. Add one to your closet or empty your wash bin."
        const val UBC_LOCATION = "49.2606,-123.2460"
        const val UI_TIMEOUT_MS = 10_000L

        // The back-end can spend over 90 s on generation: Claude's timeout, retried twice.
        const val GENERATE_TIMEOUT_MS = 120_000L
    }
}
