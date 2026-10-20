package com.example.cpen321application

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Face
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import com.example.cpen321application.navigation.AppNavHost
import com.example.cpen321application.screens.AvatarScreen
import com.example.cpen321application.screens.ClosetScreen
import com.example.cpen321application.ui.theme.CPEN321ApplicationTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            CPEN321ApplicationTheme {
                AppNavHost()
            }
        }
    }
}

/** Top-level tabs reachable from the bottom navigation bar. */
enum class Tab(val label: String, val icon: ImageVector) {
    Closet("Closet", Icons.AutoMirrored.Filled.List),
    Avatar("Avatar", Icons.Filled.Face),
}

@Composable
fun FabricateApp() {
    var tab by rememberSaveable { mutableStateOf(Tab.Closet) }

    Scaffold(
        modifier = Modifier.fillMaxSize(),
        bottomBar = {
            NavigationBar {
                Tab.entries.forEach { entry ->
                    NavigationBarItem(
                        selected = tab == entry,
                        onClick = { tab = entry },
                        icon = { Icon(entry.icon, contentDescription = null) },
                        label = { Text(entry.label) },
                    )
                }
            }
        },
    ) { innerPadding ->
        val contentModifier = Modifier.padding(innerPadding)
        when (tab) {
            Tab.Closet -> ClosetScreen(contentModifier)
            Tab.Avatar -> Box(contentModifier) { AvatarScreen() }
        }
    }
}
