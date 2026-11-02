package com.example.cpen321application.data

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.os.CancellationSignal
import androidx.core.content.ContextCompat
import androidx.core.location.LocationManagerCompat
import com.example.cpen321application.model.Coordinates
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.coroutines.resume

interface LocationProvider {
    /** Null when location access was denied or the device can't find its location. */
    suspend fun currentCoordinates(): Coordinates?
}

/** Approximate location is enough to look up the weather, so only that permission is requested. */
class DeviceLocationProvider(context: Context) : LocationProvider {
    private val context = context.applicationContext
    private val locationManager = context.getSystemService(LocationManager::class.java)

    override suspend fun currentCoordinates(): Coordinates? {
        if (!hasLocationPermission(context)) return null
        val enabled = locationManager.getProviders(true)
        val providers = PROVIDERS_BEST_FIRST.filter { it in enabled }
        val location = providers.firstNotNullOfOrNull { provider ->
            withTimeoutOrNull(PROVIDER_TIMEOUT_MS) { requestLocation(provider) }
        } ?: providers.firstNotNullOfOrNull(::lastKnownLocation)
        return location?.let { Coordinates(it.latitude, it.longitude) }
    }

    // Callers check the permission first.
    @SuppressLint("MissingPermission")
    private suspend fun requestLocation(provider: String): Location? =
        suspendCancellableCoroutine { continuation ->
            val cancellation = CancellationSignal()
            continuation.invokeOnCancellation { cancellation.cancel() }
            LocationManagerCompat.getCurrentLocation(
                locationManager,
                provider,
                cancellation,
                ContextCompat.getMainExecutor(context),
            ) { location -> continuation.resume(location) }
        }

    @SuppressLint("MissingPermission")
    private fun lastKnownLocation(provider: String): Location? = locationManager.getLastKnownLocation(provider)

    private companion object {
        const val PROVIDER_TIMEOUT_MS = 6_000L

        // GPS comes last for phones, but it's the only provider that works on the emulator.
        val PROVIDERS_BEST_FIRST = listOf("fused", LocationManager.NETWORK_PROVIDER, LocationManager.GPS_PROVIDER)
    }
}

fun hasLocationPermission(context: Context): Boolean =
    ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) ==
        PackageManager.PERMISSION_GRANTED
