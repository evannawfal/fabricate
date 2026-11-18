package com.example.cpen321application.screens.avatar

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import com.example.cpen321application.model.AvatarMeasurements
import com.example.cpen321application.model.BodyMeasurement
import com.example.cpen321application.model.Bounds
import com.example.cpen321application.model.ClothingCategory
import com.example.cpen321application.model.ClothingItem
import com.example.cpen321application.model.GarmentPlacement
import com.example.cpen321application.model.MOVABLE_BODY_PARTS
import com.example.cpen321application.model.bodyWidth
import com.example.cpen321application.model.computeBodyAdjustments
import com.example.cpen321application.model.isPantsItem
import com.example.cpen321application.model.placeGarment
import com.example.cpen321application.model.placeGarmentWithReferencePoints
import dev.romainguy.kotlin.math.Float3
import io.github.sceneview.Scene
import io.github.sceneview.loaders.ModelLoader
import io.github.sceneview.math.Position
import io.github.sceneview.node.ModelNode
import io.github.sceneview.rememberCameraManipulator
import io.github.sceneview.rememberCameraNode
import io.github.sceneview.rememberEngine
import io.github.sceneview.rememberModelLoader
import io.github.sceneview.rememberNodes
import java.io.File

private const val CM_PER_M = 100f
private const val BOTTOM_RENDER_PRIORITY = 4
private const val TOP_RENDER_PRIORITY = 5

@Composable
internal fun AvatarViewer(
    modelFile: File,
    garments: Map<ClothingCategory, File>,
    garmentItems: Map<ClothingCategory, ClothingItem?>,
    sizes: Map<ClothingCategory, Float>,
    measurements: AvatarMeasurements,
) {
    val engine = rememberEngine()
    val modelLoader = rememberModelLoader(engine)
    val h = measurements[BodyMeasurement.Height] / CM_PER_M
    val cameraNode = rememberCameraNode(engine) {
        position = Position(x = 0f, y = h * 0.6f, z = h * 2.4f)
    }
    val sceneState = remember { AvatarSceneState() }
    val childNodes = rememberNodes {
        add(buildAvatarNode(modelLoader, modelFile, garments, sceneState))
    }

    val avatar = childNodes.first() as ModelNode
    SideEffect {
        updateGarmentsAndBody(avatar, sceneState, garmentItems, sizes, measurements)
    }

    Scene(
        modifier = Modifier.fillMaxSize(),
        engine = engine,
        modelLoader = modelLoader,
        cameraNode = cameraNode,
        childNodes = childNodes,
        cameraManipulator = rememberCameraManipulator(
            orbitHomePosition = cameraNode.worldPosition,
            targetPosition = Position(0f, h * 0.5f, 0f),
        ),
    )
}

private class AvatarSceneState {
    val garmentNodes = mutableMapOf<ClothingCategory, ModelNode>()
    val initialPartPositions = mutableMapOf<String, Position>()
    val initialPartBounds = mutableMapOf<String, Bounds>()
}

private fun buildAvatarNode(
    modelLoader: ModelLoader,
    modelFile: File,
    garments: Map<ClothingCategory, File>,
    state: AvatarSceneState,
): ModelNode {
    val avatarNode = ModelNode(modelInstance = modelLoader.createModelInstance(modelFile))
    avatarNode.position = Position(0f, 0f, 0f)
    cacheInitialPartTransforms(avatarNode, state)

    val sortedGarments = garments.entries.sortedBy { if (it.key == ClothingCategory.Bottom) 0 else 1 }
    for ((category, file) in sortedGarments) {
        val gNode = buildGarmentNode(modelLoader, category, file)
        state.garmentNodes[category] = gNode
        avatarNode.addChildNode(gNode)
    }
    return avatarNode
}

private fun buildGarmentNode(
    modelLoader: ModelLoader,
    category: ClothingCategory,
    file: File,
): ModelNode {
    val priority = if (category == ClothingCategory.Bottom) BOTTOM_RENDER_PRIORITY else TOP_RENDER_PRIORITY
    val node = ModelNode(modelInstance = modelLoader.createModelInstance(file))
    node.renderableNodes.forEach { it.setPriority(priority) }
    return node
}

private fun cacheInitialPartTransforms(avatarNode: ModelNode, state: AvatarSceneState) {
    avatarNode.renderableNodes.forEach { node ->
        val partName = node.name
        if (!partName.isNullOrEmpty()) {
            state.initialPartPositions[partName] = node.position
            val center = node.axisAlignedBoundingBox.center
            val halfExtent = node.axisAlignedBoundingBox.halfExtent
            state.initialPartBounds[partName] = Bounds(
                center = Float3(center[0], center[1], center[2]),
                halfExtent = Float3(halfExtent[0], halfExtent[1], halfExtent[2]),
            )
        }
    }
}

private fun updateGarmentsAndBody(
    avatar: ModelNode,
    state: AvatarSceneState,
    garmentItems: Map<ClothingCategory, ClothingItem?>,
    sizes: Map<ClothingCategory, Float>,
    measurements: AvatarMeasurements,
) {
    val avatarBounds = Bounds(avatar.center, avatar.halfExtent)
    val placements = state.garmentNodes.mapValues { (category, node) ->
        fitGarmentNode(category, node, garmentItems[category], sizes[category] ?: 1f, avatarBounds, measurements)
    }
    applyBodyPartAdjustments(avatar, state, garmentItems, placements, measurements)
}

private fun fitGarmentNode(
    category: ClothingCategory,
    node: ModelNode,
    item: ClothingItem?,
    size: Float,
    avatarBounds: Bounds,
    measurements: AvatarMeasurements,
): GarmentPlacement {
    val refPoints = item?.referencePoints
    val placement = if (refPoints != null) {
        placeGarmentWithReferencePoints(category, refPoints, measurements, isPantsItem(item), size)
    } else {
        null
    } ?: placeGarment(
        category = category,
        garment = Bounds(node.center, node.halfExtent),
        avatar = avatarBounds,
        bodyWidth = bodyWidth(category, measurements, avatarBounds),
        size = size,
    )
    node.scale = placement.scale
    node.position = placement.position
    return placement
}

private fun applyBodyPartAdjustments(
    avatar: ModelNode,
    state: AvatarSceneState,
    garmentItems: Map<ClothingCategory, ClothingItem?>,
    placements: Map<ClothingCategory, GarmentPlacement>,
    measurements: AvatarMeasurements,
) {
    val topCategory = if (garmentItems.containsKey(ClothingCategory.Outerwear)) {
        ClothingCategory.Outerwear
    } else {
        ClothingCategory.Top
    }
    val adjustments = computeBodyAdjustments(
        measurements = measurements,
        partBounds = state.initialPartBounds,
        topItem = garmentItems[topCategory],
        topPlacement = placements[topCategory],
        bottomItem = garmentItems[ClothingCategory.Bottom],
        bottomPlacement = placements[ClothingCategory.Bottom],
    )
    val nodesByName = avatar.renderableNodes
        .filter { !it.name.isNullOrEmpty() }
        .associateBy { it.name!! }

    nodesByName.forEach { (partName, node) ->
        node.isVisible = !adjustments.autoHiddenParts.contains(partName)
    }
    for (partName in MOVABLE_BODY_PARTS) {
        val node = nodesByName[partName] ?: continue
        val base = state.initialPartPositions[partName] ?: Position(0f, 0f, 0f)
        val offset = adjustments.offsets[partName] ?: Float3(0f, 0f, 0f)
        node.position = Position(base.x + offset.x, base.y + offset.y, base.z + offset.z)
    }
}
