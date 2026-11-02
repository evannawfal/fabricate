package com.example.cpen321application.fakes

import com.example.cpen321application.data.LocationProvider
import com.example.cpen321application.model.Coordinates

class FakeLocationProvider(var coordinates: Coordinates? = Coordinates(49.26, -123.25)) : LocationProvider {
    override suspend fun currentCoordinates(): Coordinates? = coordinates
}
