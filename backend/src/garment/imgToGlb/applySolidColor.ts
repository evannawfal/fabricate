import fs from "node:fs/promises";
import path from "node:path";

interface SolidColourOptions {
  inputPath: string;
  outputPath: string;
  colour: string;
}

/**
 * Converts a hex colour string (e.g. "#FF0000") to normalized RGBA array.
 */
function hexToRgba(hex: string): [number, number, number, number] {
  let c = hex.replace("#", "");
  if (c.length === 3) {
    c = c.split("").map((char) => char + char).join("");
  }
  const num = parseInt(c, 16);
  return [
    ((num >> 16) & 255) / 255,
    ((num >> 8) & 255) / 255,
    (num & 255) / 255,
    1.0,
  ];
}

/**
 * Applies a solid colour to every material in a GLB model
 * by directly editing its JSON chunk and saving a new GLB.
 */
export async function applySolidColour({
  inputPath,
  outputPath,
  colour,
}: SolidColourOptions): Promise<Buffer> {
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

    if (chunkType === 0x4E4F534A) {
      // JSON chunk (JSON)
      const jsonString = buffer
        .toString("utf8", dataOffset, dataOffset + chunkLength)
        .replace(/\0+$/, "");
      jsonChunk = JSON.parse(jsonString);
    } else if (chunkType === 0x004E4942) {
      // Binary chunk (BIN)
      binChunkBuffer = buffer.subarray(dataOffset, dataOffset + chunkLength);
    }

    offset += 8 + chunkLength;
  }

  if (!jsonChunk) {
    throw new Error("GLB JSON chunk not found.");
  }

  const rgba = hexToRgba(colour);
  let materialCount = 0;

  // Update all materials with the solid color and clear texture maps so color applies cleanly
  if (jsonChunk.materials && jsonChunk.materials.length > 0) {
    jsonChunk.materials.forEach((material: any) => {
      if (!material.pbrMetallicRoughness) {
        material.pbrMetallicRoughness = {};
      }
      material.pbrMetallicRoughness.baseColorFactor = rgba;
      material.pbrMetallicRoughness.roughnessFactor = 0.85;
      material.pbrMetallicRoughness.metallicFactor = 0.0;

      // Remove texture overrides so the flat solid color takes full effect
      delete material.pbrMetallicRoughness.baseColorTexture;
      delete material.normalTexture;
      delete material.emissiveTexture;
      materialCount++;
    });
  } else {
    throw new Error("No materials found in input GLB JSON.");
  }

  // Re-encode JSON and pad with spaces (0x20) to ensure 4-byte boundary alignment required by GLB spec
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
  outputBuffer.writeUInt32LE(0x4E4F534A, writeOffset);
  writeOffset += 4;
  newJsonBuffer.copy(outputBuffer, writeOffset);
  writeOffset += newJsonBuffer.length;

  if (binChunkBuffer) {
    outputBuffer.writeUInt32LE(binChunkBuffer.length, writeOffset);
    writeOffset += 4;
    outputBuffer.writeUInt32LE(0x004E4942, writeOffset);
    writeOffset += 4;
    binChunkBuffer.copy(outputBuffer, writeOffset);
    writeOffset += binChunkBuffer.length;
  }

  // Save to output destination
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, outputBuffer);

  console.log(`Applied solid colour ${colour} to ${materialCount} materials.`);
  console.log(`Saved GLB instantly to ${outputPath}`);

  return outputBuffer;
}