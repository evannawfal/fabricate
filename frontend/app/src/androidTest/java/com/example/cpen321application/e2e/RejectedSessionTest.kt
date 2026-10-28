package com.example.cpen321application.e2e

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.example.cpen321application.auth.SessionStore
import com.example.cpen321application.navigation.AppNavHost
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.util.Base64

/**
 * A session the back-end rejects while the app is open (e.g. it expired after 30 minutes)
 * sends the user back to login. Talks to the real back-end from local.properties.
 */
@RunWith(AndroidJUnit4::class)
class RejectedSessionTest {
    @get:Rule
    val composeRule = createComposeRule()

    private val sessionStore = SessionStore(InstrumentationRegistry.getInstrumentation().targetContext)
    private var testerSession: String? = null

    // The other end-to-end tests run as the tester who signed in, so put their session back.
    @Before
    fun saveTesterSession() = runBlocking {
        testerSession = sessionStore.token.first()
    }

    @After
    fun restoreTesterSession() = runBlocking {
        testerSession?.let { sessionStore.saveToken(it) } ?: sessionStore.clearToken()
    }

    // Not expired, so the app opens on the closet, but not signed by the back-end, so the
    // back-end rejects it with 401 just like an expired session.
    private fun unsignedSessionToken(): String {
        val encoder = Base64.getUrlEncoder().withoutPadding()
        val expiry = System.currentTimeMillis() / 1000 + 600
        val payload = """{"sub":"000000000000000000000000","exp":$expiry}"""
        return "${encoder.encodeToString("{}".toByteArray())}.${encoder.encodeToString(payload.toByteArray())}.sig"
    }

    @Test
    fun sessionRejectedByTheBackEnd_returnsToTheLoginScreen() {
        runBlocking { sessionStore.saveToken(unsignedSessionToken()) }

        composeRule.setContent { AppNavHost() }

        composeRule.waitUntil(timeoutMillis = 15_000) {
            composeRule.onAllNodesWithText("Sign in with Google").fetchSemanticsNodes().isNotEmpty()
        }
        assertNull(runBlocking { sessionStore.token.first() })
    }
}
