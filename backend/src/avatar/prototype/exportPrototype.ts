import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { Buffer } from "node:buffer";
import type { AvatarInput } from "../types.js";
import { generatePartGeometry, generateSegmentedAvatarMeshes } from "./partsMeshGenerator.js";
import { PART_METADATA, type BodyPartName } from "./types.js";

// Polyfill FileReader for Node.js so GLTFExporter can produce binary GLBs
if (typeof globalThis.FileReader === "undefined") {
  class NodeFileReader {
    result: string | ArrayBuffer | null = null;
    error: DOMException | null = null;
    onload: ((event: { target: NodeFileReader }) => void) | null = null;
    onloadend: ((event: { target: NodeFileReader }) => void) | null = null;
    onerror: ((event: { target: NodeFileReader }) => void) | null = null;

    async readAsArrayBuffer(blob: Blob): Promise<void> {
      try {
        this.result = await blob.arrayBuffer();
        this.onload?.({ target: this });
      } catch (error) {
        this.error =
          error instanceof DOMException
            ? error
            : new DOMException(String(error));
        this.onerror?.({ target: this });
      } finally {
        this.onloadend?.({ target: this });
      }
    }

    async readAsDataURL(blob: Blob): Promise<void> {
      try {
        const data = Buffer.from(await blob.arrayBuffer()).toString("base64");
        this.result = `data:${blob.type || "application/octet-stream"};base64,${data}`;
        this.onload?.({ target: this });
      } catch (error) {
        this.error =
          error instanceof DOMException
            ? error
            : new DOMException(String(error));
        this.onerror?.({ target: this });
      } finally {
        this.onloadend?.({ target: this });
      }
    }
  }

  globalThis.FileReader = NodeFileReader as unknown as typeof FileReader;
}

/**
 * Exports a segmented avatar containing all body parts as independent named meshes
 * inside a single binary GLB file.
 */
export async function exportSegmentedGLB(
  options: AvatarInput,
  useDistinctColors = true
): Promise<Uint8Array> {
  const meshes = generateSegmentedAvatarMeshes(options, useDistinctColors);
  const avatarGroup = new THREE.Group();
  avatarGroup.name = "SegmentedAvatar";

  for (const [, mesh] of meshes) {
    avatarGroup.add(mesh);
  }

  const scene = new THREE.Scene();
  scene.name = "SegmentedAvatarScene";
  scene.add(avatarGroup);

  try {
    const exporter = new GLTFExporter();
    const glb = await exporter.parseAsync(scene, {
      binary: true,
      onlyVisible: true,
    });

    if (!(glb instanceof ArrayBuffer)) {
      throw new Error("Expected binary GLB output");
    }
    return new Uint8Array(glb);
  } finally {
    for (const [, mesh] of meshes) {
      mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m) => m.dispose());
      } else {
        mesh.material.dispose();
      }
    }
  }
}

/**
 * Exports a single body part as a standalone GLB.
 */
export async function exportPartGLB(
  part: BodyPartName,
  options: AvatarInput,
  color?: number
): Promise<Uint8Array> {
  const geometry = generatePartGeometry(part, options);
  const meta = PART_METADATA[part];
  const material = new THREE.MeshStandardMaterial({
    color: color ?? meta.color,
    roughness: 0.85,
    metalness: 0.05,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = part;

  const scene = new THREE.Scene();
  scene.add(mesh);

  try {
    const exporter = new GLTFExporter();
    const glb = await exporter.parseAsync(scene, {
      binary: true,
      onlyVisible: true,
    });
    if (!(glb instanceof ArrayBuffer)) {
      throw new Error("Expected binary GLB output");
    }
    return new Uint8Array(glb);
  } finally {
    geometry.dispose();
    material.dispose();
  }
}
