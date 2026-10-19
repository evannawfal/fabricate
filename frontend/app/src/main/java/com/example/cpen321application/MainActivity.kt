package com.example.cpen321application

import android.content.Context
import android.graphics.Color as AndroidColor
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.example.cpen321application.network.BackendApi
import com.example.cpen321application.network.TriviaQuestion
import com.example.cpen321application.screens.AvatarScreen
import com.example.cpen321application.ui.theme.CPEN321ApplicationTheme
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInClient
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.android.gms.common.api.ApiException
import java.util.Calendar
import java.util.Locale
import kotlin.math.abs
import kotlinx.coroutines.delay
import android.util.Log
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.platform.LocalContext
import androidx.credentials.exceptions.GetCredentialException
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.cpen321application.auth.GoogleAuthClient
import com.example.cpen321application.screens.LoginScreen
import com.example.cpen321application.viewmodel.LoginViewModel
import kotlinx.coroutines.launch

/** The three feature areas plus the home menu. */
enum class Screen { Home, ServerInfo, LiveUpdates, Timer }

// Button 2: the pixel canvas is a fixed 16x16 grid.
private const val GRID = 16

// Standard websocket close code (RFC 6455).
private const val NORMAL_CLOSURE = 1000

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            CPEN321ApplicationTheme {
                // temp show the login screen
                val loginViewModel: LoginViewModel = viewModel()
                val uiState by loginViewModel.uiState.collectAsState()
                val context = LocalContext.current

                Log.d("Auth", "State: $uiState")

                LoginScreen(
                    uiState = uiState,
                    onSignInClick = { loginViewModel.signIn(context) },
                )
//                AvatarScreen()
            }
        }
    }
}

@Composable
fun AppRoot() {
    var screen by remember { mutableStateOf(Screen.Home) }

    // Hardware/system back returns to the home menu from any feature screen.
    BackHandler(enabled = screen != Screen.Home) { screen = Screen.Home }

    Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->
        val contentModifier = Modifier.padding(innerPadding)
        when (screen) {
            Screen.Home -> HomeScreen(
                onOpenServerInfo = { screen = Screen.ServerInfo },
                onOpenLiveUpdates = { screen = Screen.LiveUpdates },
                onOpenTimer = { screen = Screen.Timer },
                modifier = contentModifier,
            )
            Screen.ServerInfo -> ServerInfoScreen({ screen = Screen.Home }, contentModifier)
            Screen.LiveUpdates -> LiveUpdatesScreen({ screen = Screen.Home }, contentModifier)
            Screen.Timer -> TimerScreen({ screen = Screen.Home }, contentModifier)
        }
    }
}

@Composable
private fun HomeScreen(
    onOpenServerInfo: () -> Unit,
    onOpenLiveUpdates: () -> Unit,
    onOpenTimer: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("CPEN 321 — M1", style = MaterialTheme.typography.headlineMedium)
        Button(onClick = onOpenServerInfo, modifier = Modifier.fillMaxWidth()) {
            Text("Login + Server")
        }
        Button(onClick = onOpenLiveUpdates, modifier = Modifier.fillMaxWidth()) {
            Text("Live Updates")
        }
        Button(onClick = onOpenTimer, modifier = Modifier.fillMaxWidth()) {
            Text("Timer")
        }
    }
}

/**
 * Button 1: signs in with Google, then shows server/client IPs, server/client
 * local times, the app owner's name (from the back-end), and the logged-in
 * user's name (from the Google account).
 */
@Composable
private fun ServerInfoScreen(onBack: () -> Unit, modifier: Modifier = Modifier) {
    val context = LocalContext.current

    var serverIp by remember { mutableStateOf("…") }
    var clientIp by remember { mutableStateOf("…") }
    var serverTime by remember { mutableStateOf("…") }
    val clientTime = remember { currentClientTime() }
    var ownerName by remember { mutableStateOf("…") }
    var loggedInUser by remember { mutableStateOf("Not signed in") }
    var error by remember { mutableStateOf<String?>(null) }

    val signInLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) { result ->
        try {
            val account = GoogleSignIn
                .getSignedInAccountFromIntent(result.data)
                .getResult(ApiException::class.java)
            loggedInUser = listOfNotNull(account.givenName, account.familyName)
                .joinToString(" ")
                .ifBlank { account.email ?: "Signed in" }
        } catch (e: ApiException) {
            error = "Sign-in failed (code ${e.statusCode})."
        }
    }

    LaunchedEffect(Unit) {
        try {
            serverIp = BackendApi.getServerIp()
            serverTime = BackendApi.getServerTime()
            clientIp = BackendApi.getClientIp()
            val (first, last) = BackendApi.getOwnerName()
            ownerName = "$first $last"
        } catch (e: Exception) {
            error = "Could not reach backend: ${e.message}"
        }
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Login + Server", style = MaterialTheme.typography.headlineSmall)

        InfoRow("Server IP", serverIp)
        InfoRow("Client IP", clientIp)
        InfoRow("Server time", serverTime)
        InfoRow("Client time", clientTime)
        InfoRow("Your name", ownerName)
        InfoRow("Logged-in user", loggedInUser)

        val currentError = error
        if (currentError != null) {
            Text(currentError, color = MaterialTheme.colorScheme.error)
        }

        Spacer(Modifier.height(8.dp))

        Button(
            onClick = {
                error = null
                signInLauncher.launch(googleSignInClient(context).signInIntent)
            },
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("Sign in with Google")
        }

        OutlinedButton(onClick = onBack, modifier = Modifier.fillMaxWidth()) {
            Text("Back")
        }
    }
}

/**
 * Button 2: shows a 16x16 grid that fills in live as pixels arrive from the
 * back-end relay, starting from a blank (white) canvas.
 */
@Composable
private fun LiveUpdatesScreen(onBack: () -> Unit, modifier: Modifier = Modifier) {
    // Maps a cell index (y * GRID + x) to its current colour.
    val pixels = remember { mutableStateMapOf<Int, Color>() }

    DisposableEffect(Unit) {
        val socket = BackendApi.openPixelSocket { x, y, hex ->
            pixels[y * GRID + x] = parsePixelColor(hex)
        }
        onDispose { socket.close(NORMAL_CLOSURE, null) }
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Live Updates", style = MaterialTheme.typography.headlineSmall)
        Column(
            Modifier
                .fillMaxWidth()
                .aspectRatio(1f)
                .border(1.dp, Color.LightGray),
        ) {
            for (y in 0 until GRID) {
                Row(
                    Modifier
                        .weight(1f)
                        .fillMaxWidth(),
                ) {
                    for (x in 0 until GRID) {
                        Box(
                            Modifier
                                .weight(1f)
                                .fillMaxHeight()
                                .background(pixels[y * GRID + x] ?: Color.White),
                        )
                    }
                }
            }
        }
        OutlinedButton(onClick = onBack, modifier = Modifier.fillMaxWidth()) {
            Text("Back")
        }
    }
}

/**
 * Button 3: a countdown timer (minutes/seconds). When it reaches zero it
 * fetches a trivia question from the Open Trivia DB and lets the user answer it.
 */
@Composable
private fun TimerScreen(onBack: () -> Unit, modifier: Modifier = Modifier) {
    var minutesText by remember { mutableStateOf("0") }
    var secondsText by remember { mutableStateOf("10") }
    var remaining by remember { mutableStateOf<Int?>(null) } // null = idle, else seconds left
    var trivia by remember { mutableStateOf<TriviaQuestion?>(null) }
    var chosen by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    // Counts down once started; on reaching zero, fetches a trivia question.
    LaunchedEffect(remaining != null) {
        if (remaining == null) return@LaunchedEffect
        while ((remaining ?: 0) > 0) {
            delay(1000)
            remaining = (remaining ?: 0) - 1
        }
        loading = true
        try {
            trivia = BackendApi.fetchTrivia()
        } catch (e: Exception) {
            error = "Couldn't load trivia: ${e.message}"
        }
        loading = false
        remaining = null
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Timer", style = MaterialTheme.typography.headlineSmall)

        val secondsLeft = remaining
        val question = trivia
        when {
            secondsLeft != null -> {
                Text(
                    "%02d:%02d".format(secondsLeft / 60, secondsLeft % 60),
                    style = MaterialTheme.typography.displaySmall,
                )
                OutlinedButton(onClick = { remaining = null }, modifier = Modifier.fillMaxWidth()) {
                    Text("Cancel")
                }
            }
            loading -> Text("Loading a question…")
            question != null -> {
                TriviaCard(question, chosen) { chosen = it }
                OutlinedButton(
                    onClick = { trivia = null; chosen = null },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("New timer")
                }
            }
            else -> {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedTextField(
                        value = minutesText,
                        onValueChange = { minutesText = it.filter(Char::isDigit).take(3) },
                        label = { Text("Min") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.weight(1f),
                    )
                    OutlinedTextField(
                        value = secondsText,
                        onValueChange = { secondsText = it.filter(Char::isDigit).take(2) },
                        label = { Text("Sec") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.weight(1f),
                    )
                }
                Button(
                    onClick = {
                        val total = (minutesText.toIntOrNull() ?: 0) * 60 +
                            (secondsText.toIntOrNull() ?: 0)
                        if (total > 0) {
                            trivia = null
                            chosen = null
                            error = null
                            remaining = total
                        } else {
                            error = "Enter a time greater than zero."
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Start timer")
                }
            }
        }

        val currentError = error
        if (currentError != null) {
            Text(currentError, color = MaterialTheme.colorScheme.error)
        }

        OutlinedButton(onClick = onBack, modifier = Modifier.fillMaxWidth()) {
            Text("Back")
        }
    }
}

@Composable
private fun TriviaCard(trivia: TriviaQuestion, chosen: String?, onChoose: (String) -> Unit) {
    Text(trivia.question, style = MaterialTheme.typography.titleMedium)
    trivia.answers.forEach { answer ->
        Button(
            onClick = { if (chosen == null) onChoose(answer) },
            enabled = chosen == null,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(answer)
        }
    }
    if (chosen != null) {
        val correct = chosen == trivia.correctAnswer
        Text(
            if (correct) "Correct!" else "Wrong — the answer was: ${trivia.correctAnswer}",
            color = if (correct) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
        )
    }
}

@Composable
private fun InfoRow(label: String, value: String) {
    Column {
        Text(label, style = MaterialTheme.typography.labelMedium)
        Text(value, style = MaterialTheme.typography.bodyLarge)
    }
}

private fun googleSignInClient(context: Context): GoogleSignInClient {
    val options = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
        .requestEmail()
        .build()
    return GoogleSignIn.getClient(context, options)
}

/** Parses a hex colour like "#FFD23F"; falls back to white if malformed. */
private fun parsePixelColor(hex: String): Color =
    try {
        Color(AndroidColor.parseColor(hex))
    } catch (e: IllegalArgumentException) {
        Color.White
    }

/** The device's current time as "hh:mm:ss GMT+hh:mm", matching the server format. */
private fun currentClientTime(): String {
    val calendar = Calendar.getInstance()
    val offsetMinutes =
        (calendar.get(Calendar.ZONE_OFFSET) + calendar.get(Calendar.DST_OFFSET)) / 60000
    val sign = if (offsetMinutes >= 0) "+" else "-"
    val absMinutes = abs(offsetMinutes)
    return String.format(
        Locale.US,
        "%02d:%02d:%02d GMT%s%02d:%02d",
        calendar.get(Calendar.HOUR_OF_DAY),
        calendar.get(Calendar.MINUTE),
        calendar.get(Calendar.SECOND),
        sign,
        absMinutes / 60,
        absMinutes % 60,
    )
}
