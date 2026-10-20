package com.example.cpen321application.screens

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.example.cpen321application.R
import io.github.sceneview.Scene
import io.github.sceneview.math.Position
import io.github.sceneview.node.ModelNode
import io.github.sceneview.rememberCameraManipulator
import io.github.sceneview.rememberCameraNode
import io.github.sceneview.rememberEngine
import io.github.sceneview.rememberModelLoader
import io.github.sceneview.rememberNodes

private const val MODEL_DIR = "models"
private const val MODEL_FILE = "avatar.glb"
private val MessagePadding = 32.dp

@Composable
fun AvatarScreen() {
    val context = LocalContext.current
    // Loading a missing model crashes the app, so check that it's bundled first.
    val hasModel = remember { context.assets.list(MODEL_DIR)?.contains(MODEL_FILE) == true }
    if (hasModel) {
        AvatarViewer()
    } else {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(MessagePadding),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = stringResource(R.string.avatar_unavailable),
                style = MaterialTheme.typography.bodyLarge,
                textAlign = TextAlign.Center,
            )
        }
    }
}

@Composable
private fun AvatarViewer() {
    val engine = rememberEngine()
    val modelLoader = rememberModelLoader(engine)

    val cameraNode = rememberCameraNode(engine) {
        position = Position(z = 4.0f)
    }

    val childNodes = rememberNodes {
        add(
            ModelNode(
                modelInstance = modelLoader.createModelInstance(
                    assetFileLocation = "$MODEL_DIR/$MODEL_FILE"
                ),
                scaleToUnits = 1.7f
            )
        )
    }

    Scene(
        modifier = Modifier.fillMaxSize(),
        engine = engine,
        modelLoader = modelLoader,
        cameraNode = cameraNode,
        childNodes = childNodes,
        cameraManipulator = rememberCameraManipulator()
    )
}