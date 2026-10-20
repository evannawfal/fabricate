package com.example.cpen321application

import com.example.cpen321application.data.MAX_PHOTO_SIDE
import com.example.cpen321application.data.scaledSize
import org.junit.Assert.assertEquals
import org.junit.Test

class PhotoFilesTest {
    @Test
    fun scaledSize_keepsSmallPhotosAsTheyAre() {
        assertEquals(800 to 600, scaledSize(800, 600, MAX_PHOTO_SIDE))
        assertEquals(MAX_PHOTO_SIDE to 100, scaledSize(MAX_PHOTO_SIDE, 100, MAX_PHOTO_SIDE))
    }

    @Test
    fun scaledSize_shrinksTheLongestSideAndKeepsTheAspectRatio() {
        // A 12 MP portrait camera photo.
        assertEquals(1176 to 1568, scaledSize(3000, 4000, 1568))
        // Landscape.
        assertEquals(1568 to 882, scaledSize(4000, 2250, 1568))
    }

    @Test
    fun scaledSize_neverReturnsAZeroSide() {
        assertEquals(1568 to 1, scaledSize(100_000, 10, 1568))
    }
}
