import fs from "node:fs/promises";

interface SolidColourOptions {
  inputPath: string;
  colour: string;
}

interface CachedGlbTemplate {
  jsonChunk: any;
  binChunkBuffer: Buffer | null;
}

const glbTemplateCache = new Map<string, CachedGlbTemplate>();

/**
 * Converts a single sRGB channel [0, 1] to Linear RGB [0, 1] per glTF 2.0 spec.
 */
function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * Converts a hex colour string (sRGB) to Linear RGBA array.
 */
function hexToRgba(hex: string): [number, number, number, number] {
  let c = hex.replace("#", "");
  if (c.length === 3) {
    c = c
      .split("")
      .map((char) => char + char)
      .join("");
  }
  const num = parseInt(c, 16);
  return [
    srgbToLinear(((num >> 16) & 255) / 255),
    srgbToLinear(((num >> 8) & 255) / 255),
    srgbToLinear((num & 255) / 255),
    1.0,
  ];
}

/**
 * Loads and parses a GLB file from disk once, caching its JSON and BIN chunks in memory.
 */
async function getCachedGlbTemplate(
  inputPath: string
): Promise<CachedGlbTemplate> {
  const cached = glbTemplateCache.get(inputPath);
  if (cached) {
    return cached;
  }

  const buffer = await fs.readFile(inputPath);

  // Validate GLB header
  const magic = buffer.toString("ascii", 0, 4);
  const version = buffer.readUInt32LE(4);

  if (magic !== "glTF") {
    throw new Error("Invalid GLB file: Missing 'glTF' magic bytes.");
  }
  if (version !== 2) {
    throw new Error(`Unsupported GLB version: ${version}`);
  }

  // Parse GLB chunks to find JSON and binary data
  let offset = 12;
  let jsonChunk: any = null;
  let binChunkBuffer: Buffer | null = null;

  while (offset < buffer.length) {
    const chunkLength = buffer.readUInt32LE(offset);
    const chunkType = buffer.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;

    if (chunkType === 0x4e4f534a) {
      const jsonString = buffer
        .toString("utf8", dataOffset, dataOffset + chunkLength)
        .replace(/\0+$/, "");
      jsonChunk = JSON.parse(jsonString);
    } else if (chunkType === 0x004e4942) {
      binChunkBuffer = buffer.subarray(dataOffset, dataOffset + chunkLength);
    }

    offset += 8 + chunkLength;
  }

  if (!jsonChunk) {
    throw new Error("GLB JSON chunk not found.");
  }

  const template: CachedGlbTemplate = { jsonChunk, binChunkBuffer };
  glbTemplateCache.set(inputPath, template);
  return template;
}

/**
 * Applies a solid colour to every material in a GLB model
 * using the cached GLB template and saving a new GLB buffer.
 */
export async function applySolidColour({
  inputPath,
  colour,
}: SolidColourOptions): Promise<Uint8Array> {
  const { jsonChunk: cachedJson, binChunkBuffer } =
    await getCachedGlbTemplate(inputPath);

  // Shallow/structured clone of JSON so cached materials aren't mutated across requests
  const jsonChunk = structuredClone(cachedJson);
  const rgba = hexToRgba(colour);

  // Update all materials with the solid color and clear texture maps
  if (jsonChunk.materials && jsonChunk.materials.length > 0) {
    jsonChunk.materials.forEach((material: any) => {
      if (!material.pbrMetallicRoughness) {
        material.pbrMetallicRoughness = {};
      }
      material.pbrMetallicRoughness.baseColorFactor = rgba;
      material.pbrMetallicRoughness.roughnessFactor = 0.85;
      material.pbrMetallicRoughness.metallicFactor = 0.0;

      delete material.pbrMetallicRoughness.baseColorTexture;
      delete material.normalTexture;
      delete material.emissiveTexture;
    });
  } else {
    throw new Error("No materials found in input GLB JSON.");
  }

  let newJsonString = JSON.stringify(jsonChunk);
  const paddedLength = Math.ceil(newJsonString.length / 4) * 4;
  newJsonString = newJsonString.padEnd(paddedLength, " ");
  const newJsonBuffer = Buffer.from(newJsonString, "utf8");

  // Calculate new total file size
  let totalLength = 12 + 8 + newJsonBuffer.length;
  if (binChunkBuffer) {
    totalLength += 8 + binChunkBuffer.length;
  }

  // Assemble the new GLB binary buffer
  const outputBuffer = Buffer.alloc(totalLength);
  let writeOffset = 0;

  outputBuffer.write("glTF", writeOffset);
  writeOffset += 4;
  outputBuffer.writeUInt32LE(2, writeOffset);
  writeOffset += 4;
  outputBuffer.writeUInt32LE(totalLength, writeOffset);
  writeOffset += 4;

  outputBuffer.writeUInt32LE(newJsonBuffer.length, writeOffset);
  writeOffset += 4;
  outputBuffer.writeUInt32LE(0x4e4f534a, writeOffset);
  writeOffset += 4;
  newJsonBuffer.copy(outputBuffer, writeOffset);
  writeOffset += newJsonBuffer.length;

  if (binChunkBuffer) {
    outputBuffer.writeUInt32LE(binChunkBuffer.length, writeOffset);
    writeOffset += 4;
    outputBuffer.writeUInt32LE(0x004e4942, writeOffset);
    writeOffset += 4;
    binChunkBuffer.copy(outputBuffer, writeOffset);
    writeOffset += binChunkBuffer.length;
  }
  return new Uint8Array(outputBuffer);
}