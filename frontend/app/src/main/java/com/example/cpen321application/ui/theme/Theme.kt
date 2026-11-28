package com.example.cpen321application.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable

private val LightColorScheme = lightColorScheme(
    primary = RustLight,
    onPrimary = OnRustLight,
    primaryContainer = RustContainerLight,
    onPrimaryContainer = OnRustContainerLight,
    secondary = ClayLight,
    onSecondary = OnClayLight,
    secondaryContainer = ClayContainerLight,
    onSecondaryContainer = OnClayContainerLight,
    tertiary = OliveLight,
    onTertiary = OnOliveLight,
    tertiaryContainer = OliveContainerLight,
    onTertiaryContainer = OnOliveContainerLight,
    background = BackgroundLight,
    onBackground = OnBackgroundLight,
    surface = BackgroundLight,
    onSurface = OnBackgroundLight,
    surfaceVariant = SurfaceVariantLight,
    onSurfaceVariant = OnSurfaceVariantLight,
    outline = OutlineLight,
    outlineVariant = OutlineVariantLight,
    surfaceDim = SurfaceDimLight,
    surfaceBright = BackgroundLight,
    surfaceContainerLowest = SurfaceContainerLowestLight,
    surfaceContainerLow = SurfaceContainerLowLight,
    surfaceContainer = SurfaceContainerLight,
    surfaceContainerHigh = SurfaceContainerHighLight,
    surfaceContainerHighest = SurfaceContainerHighestLight,
)

private val DarkColorScheme = darkColorScheme(
    primary = RustDark,
    onPrimary = OnRustDark,
    primaryContainer = RustContainerDark,
    onPrimaryContainer = OnRustContainerDark,
    secondary = ClayDark,
    onSecondary = OnClayDark,
    secondaryContainer = ClayContainerDark,
    onSecondaryContainer = OnClayContainerDark,
    tertiary = OliveDark,
    onTertiary = OnOliveDark,
    tertiaryContainer = OliveContainerDark,
    onTertiaryContainer = OnOliveContainerDark,
    background = BackgroundDark,
    onBackground = OnBackgroundDark,
    surface = BackgroundDark,
    onSurface = OnBackgroundDark,
    surfaceVariant = SurfaceVariantDark,
    onSurfaceVariant = OnSurfaceVariantDark,
    outline = OutlineDark,
    outlineVariant = OutlineVariantDark,
    surfaceDim = BackgroundDark,
    surfaceBright = SurfaceBrightDark,
    surfaceContainerLowest = SurfaceContainerLowestDark,
    surfaceContainerLow = SurfaceContainerLowDark,
    surfaceContainer = SurfaceContainerDark,
    surfaceContainerHigh = SurfaceContainerHighDark,
    surfaceContainerHighest = SurfaceContainerHighestDark,
)

/**
 * Fabricate's own colours in light and dark mode. Android 12+ wallpaper colours (dynamic colour)
 * are not used, so the app looks the same on every device.
 */
@Composable
fun FabricateTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme,
        typography = Typography,
        content = content,
    )
}
