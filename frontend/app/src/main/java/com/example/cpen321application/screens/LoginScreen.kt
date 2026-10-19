package com.example.cpen321application.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.example.cpen321application.R

private val ScreenPadding = 24.dp
private val TitleSpacing = 8.dp
private val ButtonSpacing = 48.dp

@Composable
fun LoginScreen(
  onSignInClick: () -> Unit,
  modifier: Modifier = Modifier,
) {
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
      modifier = Modifier.fillMaxWidth(),
    ) {
      Text(stringResource(R.string.login_google_button))
    }
  }
}

@Preview(showBackground = true)
@Composable
private fun LoginScreenPreview() {
  LoginScreen(onSignInClick = {})
}