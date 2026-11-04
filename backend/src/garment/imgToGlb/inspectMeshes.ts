
import fs from "node:fs";
import path from "node:path";

const BASE_DIR = path.resolve(
  process.cwd(),
  "backend/src/garment/baseMeshes"
);

interface GLBData {
  meshes?: any[];
  nodes?: any[];
  accessors?: any[];
  materials?: any[];
  textures?: any[];
  images?: any[];
  scenes?: any[];
}

function readGLB(filePath: string): GLBData {
  const buffer = fs.readFileSync(filePath);

  // GLB header
  const magic = buffer.toString("ascii", 0, 4);
  const version = buffer.readUInt32LE(4);

  if (magic !== "glTF") {
    throw new Error("Invalid GLB file");
  }

  if (version !== 2) {
    throw new Error(`Unsupported GLB version: ${version}`);
  }

  // Find JSON chunk
  let offset = 12;
  let json: GLBData | null = null;

  while (offset < buffer.length) {
    const chunkLength = buffer.readUInt32LE(offset);
    const chunkType = buffer.readUInt32LE(offset + 4);

    offset += 8;

    // JSON chunk: 0x4E4F534A
    if (chunkType === 0x4E4F534A) {
      const jsonString = buffer
        .toString("utf8", offset, offset + chunkLength)
        .replace(/\0+$/, "");

      json = JSON.parse(jsonString);
      break;
    }

    offset += chunkLength;
  }

  if (!json) {
    throw new Error("GLB JSON chunk not found");
  }

  return json;
}

function inspectGLB(filePath: string) {
  const glb = readGLB(filePath);

  const accessors = glb.accessors ?? [];
  const materials = glb.materials ?? [];
  const meshes = glb.meshes ?? [];
  const nodes = glb.nodes ?? [];

  const report = {
    file: path.basename(filePath),
    meshCount: meshes.length,
    nodeCount: nodes.length,
    totalVertices: 0,
    totalTriangles: 0,
    meshes: [] as any[],
    nodes: [] as any[]
  };

  meshes.forEach((mesh, meshIndex) => {
    const primitives = mesh.primitives ?? [];

    const meshReport = {
      name: mesh.name ?? `Mesh_${meshIndex}`,
      primitiveCount: primitives.length,
      primitives: [] as any[]
    };

    primitives.forEach((primitive: any, primitiveIndex: number) => {
      const attributes = primitive.attributes ?? {};

      const positionAccessor = accessors[attributes.POSITION];
      const indexAccessor = primitive.indices !== undefined
        ? accessors[primitive.indices]
        : null;

      const vertexCount = positionAccessor?.count ?? 0;

      const indexCount = indexAccessor?.count ?? vertexCount;

      const triangleCount = primitive.mode === 1
        ? 0
        : primitive.mode === 0
          ? 0
          : primitive.mode === 2 || primitive.mode === 3
            ? 0
            : primitive.mode === 1 || primitive.mode === 2
              ? 0
              : Math.floor(indexCount / 3);

      report.totalVertices += vertexCount;
      report.totalTriangles += triangleCount;

      const material = primitive.material !== undefined
        ? materials[primitive.material]
        : null;

      const primitiveReport = {
        primitiveIndex,
        vertices: vertexCount,
        indices: indexCount,
        triangles: triangleCount,

        attributes: Object.keys(attributes),

        hasUV: attributes.TEXCOORD_0 !== undefined,
        hasNormals: attributes.NORMAL !== undefined,
        hasVertexColors: attributes.COLOR_0 !== undefined,
        hasTangents: attributes.TANGENT !== undefined,

        positionBounds: positionAccessor
          ? {
              min: positionAccessor.min,
              max: positionAccessor.max
            }
          : null,

        material: material
          ? {
              name: material.name,
              baseColorFactor:
                material.pbrMetallicRoughness?.baseColorFactor,
              baseColorTexture:
                material.pbrMetallicRoughness?.baseColorTexture,
              normalTexture: material.normalTexture,
              metallicFactor:
                material.pbrMetallicRoughness?.metallicFactor,
              roughnessFactor:
                material.pbrMetallicRoughness?.roughnessFactor
            }
          : null,

        mode: primitive.mode ?? 4
      };

      meshReport.primitives.push(primitiveReport);
    });

    report.meshes.push(meshReport);
  });

  // Show which nodes reference which meshes
  nodes.forEach((node, index) => {
    report.nodes.push({
      name: node.name ?? `Node_${index}`,
      mesh: node.mesh !== undefined
        ? meshes[node.mesh]?.name ?? `Mesh_${node.mesh}`
        : null,
      children: node.children ?? [],
      translation: node.translation,
      rotation: node.rotation,
      scale: node.scale
    });
  });

  return report;
}

function main() {
  const files = fs.readdirSync(BASE_DIR)
    .filter(file => file.toLowerCase().endsWith(".glb"));

  for (const file of files) {
    console.log("\n==================================");
    console.log(`MODEL: ${file}`);
    console.log("==================================");

    try {
      const report = inspectGLB(path.join(BASE_DIR, file));

      console.log("Meshes:", report.meshCount);
      console.log("Nodes:", report.nodeCount);
      console.log("Vertices:", report.totalVertices);
      console.log("Triangles:", report.totalTriangles);

      console.log("\nMesh details:");
      console.dir(report.meshes, { depth: null });

      console.log("\nNode hierarchy:");
      console.dir(report.nodes, { depth: null });

    } catch (error) {
      console.error(`Failed to inspect ${file}:`, error);
    }
  }
}

main();
