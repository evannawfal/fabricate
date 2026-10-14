
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { generateAvatarGeometry } from "./meshGenerator.js";

import { Buffer } from "node:buffer";

if (typeof globalThis.FileReader === "undefined") {
  globalThis.FileReader = class FileReader {
    result = null;
    error = null;
    onload = null;
    onloadend = null;
    onerror = null;

    async readAsArrayBuffer(blob) {
      try {
        this.result = await blob.arrayBuffer();
        this.onload?.({ target: this });
      } catch (error) {
        this.error = error;
        this.onerror?.({ target: this });
      } finally {
        this.onloadend?.({ target: this });
      }
    }

    async readAsDataURL(blob) {
      try {
        const data = Buffer.from(await blob.arrayBuffer()).toString("base64");
        this.result = `data:${blob.type || "application/octet-stream"};base64,${data}`;
        this.onload?.({ target: this });
      } catch (error) {
        this.error = error;
        this.onerror?.({ target: this });
      } finally {
        this.onloadend?.({ target: this });
      }
    }
  };
}


const currentDir = dirname(fileURLToPath(import.meta.url));

export async function exportAvatar(
  options = {},
  outputPath = resolve(currentDir, "avatar.glb")
) {
  // 1. Generate the mesh.
  const geometry = generateAvatarGeometry(options);

  // 2. Give it a neutral material for visual inspection.
  const material = new THREE.MeshStandardMaterial({
    color: 0xb8b5ae,
    roughness: 0.85,
    metalness: 0,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "AvatarCore";

  // 3. Create a scene containing the mesh.
  const scene = new THREE.Scene();
  scene.name = "ProceduralAvatar";
  scene.add(mesh);

  // 4. Export the scene as binary glTF (.glb).
  const exporter = new GLTFExporter();

  const glb = await exporter.parseAsync(scene, {
    binary: true,
    onlyVisible: true,
  });

  // 5. Save the resulting binary file.
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, Buffer.from(glb));

  console.log(`GLB exported: ${outputPath}`);
  console.log(`File size: ${(glb.byteLength / 1024).toFixed(1)} KB`);

  // Release geometry resources when finished.
  geometry.dispose();
  material.dispose();

  return outputPath;
}

// Allow this file to be run directly.
const isMainModule =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  exportAvatar(
    {
      height: 1.85,
      shoulderWidth: 0.40,
      chestWidth: 0.35,
      waistWidth: 0.30,
      hipWidth: 0.32,
      resolution: 0.015,
    }
  ).catch(error => {
    console.error("Failed to export avatar:", error);
    process.exitCode = 1;
  });
}
