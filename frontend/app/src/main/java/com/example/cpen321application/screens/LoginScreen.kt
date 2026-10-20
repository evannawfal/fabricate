package com.example.cpen321application.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.example.cpen321application.R
import com.example.cpen321application.ui.theme.CPEN321ApplicationTheme
import com.example.cpen321application.viewmodel.LoginUiState

private val ScreenPadding = 24.dp
private val TitleSpacing = 8.dp
private val ButtonSpacing = 48.dp
private val StatusSpacing = 16.dp

@Composable
fun LoginScreen(
  uiState: LoginUiState,
  onSignInClick: () -> Unit,
  modifier: Modifier = Modifier,
) {
  val isLoading = uiState is LoginUiState.Loading

  Column(
    modifier = modifier
      .fillMaxSize()
      .padding(horizontal = ScreenPadding),
    verticalArrangement = Arrangement.Center,
    horizontalAlignment = Alignment.CenterHorizontally,
  ) {
    Text(
      text = stringResource(R.string.login_title),
      style = MaterialTheme.typography.displayMedium,
    )
    Spacer(Modifier.height(TitleSpacing))
    Text(
      text = stringResource(R.string.login_subtitle),
      style = MaterialTheme.typography.bodyLarge,
    )
    Spacer(Modifier.height(ButtonSpacing))
    Button(
      onClick = onSignInClick,
      enabled = !isLoading,
      modifier = Modifier.fillMaxWidth(),
    ) {
      Text(stringResource(R.string.login_google_button))
    }
    Spacer(Modifier.height(StatusSpacing))

    if (isLoading) {
      CircularProgressIndicator()
    }
    if (uiState is LoginUiState.Error) {
      Text(
        text = stringResource(uiState.messageRes),
        color = MaterialTheme.colorScheme.error,
        style = MaterialTheme.typography.bodyMedium,
        textAlign = TextAlign.Center,
      )
    }
  }
}

@Preview(showBackground = true, name = "Idle")
@Composable
private fun LoginScreenIdlePreview() {
  CPEN321ApplicationTheme {
    LoginScreen(uiState = LoginUiState.Idle, onSignInClick = {})
  }
}

@Preview(showBackground = true, name = "Loading")
@Composable
private fun LoginScreenLoadingPreview() {
  CPEN321ApplicationTheme {
    LoginScreen(uiState = LoginUiState.Loading, onSignInClick = {})
  }
}

@Preview(showBackground = true, name = "Error")
@Composable
private fun LoginScreenErrorPreview() {
  CPEN321ApplicationTheme {
    LoginScreen(
      uiState = LoginUiState.Error(R.string.login_error_generic),
      onSignInClick = {},
    )
  }
}