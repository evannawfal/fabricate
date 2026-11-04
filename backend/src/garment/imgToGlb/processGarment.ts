import sharp from "sharp";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { removeBackground } from "@imgly/background-removal-node";
import { applySolidColour } from "./applySolidColor.js";
import { MESHES_CATEGORIES } from "../../config/constants.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type GarmentType = keyof typeof MESHES_CATEGORIES;

interface ProcessGarmentOptions {
  frontImageBuffer: Buffer;
  category: GarmentType;
  baseMeshesDir: string;
  outputPath: string;
}

/**
 * Extracts the primary/dominant colour from an image Buffer (ignoring transparent backgrounds).
 */
export async function extractPrimaryColourFromBuffer(
  imageBuffer: Buffer
): Promise<string> {
  const imageInput = new Blob([new Uint8Array(imageBuffer)], {
    type: "image/png",
  });

  const bgRemovedBlob = await removeBackground(imageInput, {
    output: {
      format: "image/png",
    },
  });

  const transparentPngBuffer = Buffer.from(
    await bgRemovedBlob.arrayBuffer()
  );

  const { data, info } = await sharp(transparentPngBuffer)
    .resize(50, 50, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // // --- VISUALIZATION DEBUG STEP --- for development
  // const debugOutputDir = path.join(__dirname, "output");
  // await fs.mkdir(debugOutputDir, { recursive: true }); // Ensure directory exists!
  
  // console.log({
  //   blobType: bgRemovedBlob.type,
  //   blobSize: bgRemovedBlob.size,
  //   signature: transparentPngBuffer.subarray(0, 8).toString("hex"),
  // });

  // await sharp(data, {
  //   raw: {
  //     width: info.width,
  //     height: info.height,
  //     channels: 4,
  //   },
  // }).toFile(path.join(debugOutputDir, "debug_thumbnail.png"));
  // // ---------------------------------
  
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let count = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    const a = data[i + 3] ?? 255;

    // Ignore fully or mostly transparent background pixels
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

  return "#" + [avgR, avgG, avgB].map(x => x.toString(16).padStart(2, "0")).join("").toUpperCase();
}

/**
 * Maps category to base mesh, extracts color from buffer, and generates the customized GLB.
 */
export async function processAndApplyGarment({
  frontImageBuffer,
  category,
  baseMeshesDir,
  outputPath,
}: ProcessGarmentOptions): Promise<{ category: GarmentType; colour: string; outputPath: string }> {

  const meshFilename = MESHES_CATEGORIES[category];
  if (!meshFilename) {
    throw new Error(`Unsupported garment category: ${category}`);
  }

  const inputPath = path.join(baseMeshesDir, meshFilename);

  const colour = await extractPrimaryColourFromBuffer(frontImageBuffer);
  console.log(`[Pipeline] Extracted primary color ${colour} for category '${category}'`);

  await applySolidColour({
    inputPath,
    outputPath,
    colour,
  });

  return { category, colour, outputPath };
}