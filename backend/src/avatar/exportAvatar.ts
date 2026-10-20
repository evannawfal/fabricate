import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { Buffer } from "node:buffer";
import { AvatarInput } from "./types.js";
import { generateAvatarGeometry } from "./meshGenerator.js";

// GLTFExporter's binary output uses the browser's FileReader, which Node.js doesn't have.
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

  globalThis.FileReader =
    NodeFileReader as unknown as typeof FileReader;
}

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
