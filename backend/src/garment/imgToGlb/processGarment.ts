import sharp from "sharp";
import path from "node:path";
import { removeBackground } from "@imgly/background-removal-node";
import { applySolidColour } from "./applySolidColor.js";
import { MESHES_CATEGORIES } from "../../config/constants.js";

export type GarmentType = keyof typeof MESHES_CATEGORIES;

interface ProcessGarmentOptions {
  frontImageBuffer: Buffer;
  backImageBuffer: Buffer | null;
  category: GarmentType;
  baseMeshesDir: string;
}

/**
 * Downsizes the image and strips the background using the quantized model,
 * returning a transparent PNG buffer.
 */
export async function removeGarmentBackground(
  imageBuffer: Buffer
): Promise<Buffer> {
  const downsizedBuffer = await sharp(imageBuffer)
    .resize(256, 256, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();

  const imageInput = new Blob([new Uint8Array(downsizedBuffer)], {
    type: "image/png",
  });

  const bgRemovedBlob = await removeBackground(imageInput, {
    model: "small",
    output: {
      format: "image/png",
    },
  });

  return Buffer.from(await bgRemovedBlob.arrayBuffer());
}

/**
 * Computes the dominant hex colour from a background-removed PNG buffer.
 */
export async function getDominantHexFromTransparentPng(
  transparentPngBuffer: Buffer
): Promise<string> {
  const { data } = await sharp(transparentPngBuffer)
    .resize(50, 50, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let count = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    const a = data[i + 3] ?? 255;

    if (a > 128) {
      rSum += r;
      gSum += g;
      bSum += b;
      count++;
    }
  }

  if (count === 0) {
    return "#FFFFFF";
  }

  const avgR = Math.round(rSum / count);
  const avgG = Math.round(gSum / count);
  const avgB = Math.round(bSum / count);

  return (
    "#" +
    [avgR, avgG, avgB]
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

/**
 * Extracts the primary/dominant colour from an image Buffer (ignoring transparent backgrounds).
 */
export async function extractPrimaryColourFromBuffer(
  imageBuffer: Buffer
): Promise<string> {
  const transparentPngBuffer = await removeGarmentBackground(imageBuffer);
  return getDominantHexFromTransparentPng(transparentPngBuffer);
}

/**
 * Maps category to base mesh, extracts color from buffer, and generates the customized GLB.
 */
export async function processAndApplyGarment({
  frontImageBuffer,
  backImageBuffer,
  category,
  baseMeshesDir,
}: ProcessGarmentOptions): Promise<Uint8Array> {
  const meshFilename = MESHES_CATEGORIES[category];
  if (!meshFilename) {
    throw new Error(`Unsupported garment category: ${category}`);
  }

  const inputPath = path.join(baseMeshesDir, meshFilename);
  const colour = await extractPrimaryColourFromBuffer(frontImageBuffer);
  const colourBack = backImageBuffer ? await extractPrimaryColourFromBuffer(backImageBuffer) : null;
  return await applySolidColour({
    inputPath,
    colour,
  });
}
