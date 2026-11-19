package com.example.cpen321application

import com.example.cpen321application.screens.expiryLabel
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Duration
import java.time.Instant

class RoomExpiryTest {
    private val now = Instant.parse("2026-11-18T12:00:00Z")

    private fun labelIn(left: Duration) = expiryLabel(now + left, now)

    @Test
    fun showsDaysAndHours() {
        assertEquals("Expires in 1 day 23 h", labelIn(Duration.ofHours(47).plusMinutes(59)))
        assertEquals("Expires in 2 days 0 h", labelIn(Duration.ofDays(2)))
    }

    @Test
    fun showsHoursOrMinutesOnTheLastDay() {
        assertEquals("Expires in 5 h", labelIn(Duration.ofHours(5).plusMinutes(30)))
        assertEquals("Expires in 12 min", labelIn(Duration.ofMinutes(12)))
    }

    @Test
    fun showsExpiringNowInTheLastMinuteOrAfter() {
        assertEquals("Expiring now", labelIn(Duration.ofSeconds(30)))
        assertEquals("Expiring now", labelIn(Duration.ofMinutes(-5)))
    }
}
