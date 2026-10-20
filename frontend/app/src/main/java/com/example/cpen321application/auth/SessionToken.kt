package com.example.cpen321application.auth

import java.util.Base64

/**
 * Reads the expiry of the back-end's session token (a JWT) so the app can send
 * the user back to login once it has expired. The token isn't verified here;
 * the back-end still checks every token it receives.
 */
object SessionToken {

  private const val MILLIS_PER_SECOND = 1000L

  // The JWT payload's "exp" claim: seconds since the epoch.
  private val EXPIRY_CLAIM = Regex("\"exp\"\\s*:\\s*(\\d+)")

  /** True if [token] has expired at [nowMillis], or isn't a readable JWT. */
  fun isExpired(token: String, nowMillis: Long = System.currentTimeMillis()): Boolean {
    val expirySeconds = expirySeconds(token) ?: return true
    return nowMillis >= expirySeconds * MILLIS_PER_SECOND
  }

  private fun expirySeconds(token: String): Long? {
    val payload = token.split('.').getOrNull(1) ?: return null
    val json = runCatching { String(Base64.getUrlDecoder().decode(payload), Charsets.UTF_8) }.getOrNull()
    return json?.let { EXPIRY_CLAIM.find(it) }?.groupValues?.get(1)?.toLongOrNull()
  }
}
