package com.example.cpen321application

import com.example.cpen321application.auth.SessionToken
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Base64

class SessionTokenTest {
    private val now = 1_800_000_000_000L
    private val nowSeconds = now / 1000

    // Builds a JWT-shaped token; only the payload matters to SessionToken.
    private fun token(payload: String): String {
        val encoder = Base64.getUrlEncoder().withoutPadding()
        val header = encoder.encodeToString("""{"alg":"HS256","typ":"JWT"}""".toByteArray())
        return "$header.${encoder.encodeToString(payload.toByteArray())}.signature"
    }

    @Test
    fun isExpired_falseBeforeExpiry() {
        val token = token("""{"sub":"user","exp":${nowSeconds + 60}}""")
        assertFalse(SessionToken.isExpired(token, now))
    }

    @Test
    fun isExpired_trueAfterExpiry() {
        val token = token("""{"sub":"user","exp":${nowSeconds - 60}}""")
        assertTrue(SessionToken.isExpired(token, now))
    }

    @Test
    fun isExpired_trueAtTheExpiryTime() {
        val token = token("""{"sub":"user","exp":$nowSeconds}""")
        assertTrue(SessionToken.isExpired(token, now))
    }

    @Test
    fun isExpired_trueWithoutExpiryClaim() {
        assertTrue(SessionToken.isExpired(token("""{"sub":"user"}"""), now))
    }

    @Test
    fun isExpired_trueForMalformedTokens() {
        assertTrue(SessionToken.isExpired("not-a-jwt", now))
        assertTrue(SessionToken.isExpired("header.%%%.signature", now))
        assertTrue(SessionToken.isExpired("", now))
    }
}
