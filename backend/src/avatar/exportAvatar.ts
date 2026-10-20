import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { AvatarInput } from "./types.js";
import { generateAvatarGeometry } from "./meshGenerator.js";

const AVATAR_CONSTS = {
  color: 0xb8b5ae,
  roughness: 0.85,
  metalness: 0,
}

export async function exportAvatar(
  options: AvatarInput,
): Promise<Uint8Array> {
  // Generate the mesh
  const geometry = generateAvatarGeometry(options);

  // Give it a neutral material for visual inspection
  const material = new THREE.MeshStandardMaterial(AVATAR_CONSTS);

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "AvatarCore";

  // Create a scene containing the mesh
  const scene = new THREE.Scene();
  scene.name = "ProceduralAvatar";
  scene.add(mesh);

  try {
    // Export the scene as binary glTF (.glb)
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
    // Release geometry resources even if export fails
    geometry.dispose();
    material.dispose();
  }
}
