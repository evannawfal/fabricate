import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  processAndApplyGarment,
  removeGarmentBackground,
  getDominantHexFromTransparentPng,
  GarmentType,
} from "./processGarment.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const baseDir = path.resolve(__dirname, "../");
const GARMENT = "white_shorts"
const CATEGORY: GarmentType = "shorts";

async function saveDebugPreview(rawBuffer: Buffer, outputDir: string) {
  await fs.mkdir(outputDir, { recursive: true });

  // 1. Raw picture
  await sharp(rawBuffer).png().toFile(path.join(outputDir, "1_raw.png"));

  // 2. Background removed
  const bgRemovedBuffer = await removeGarmentBackground(rawBuffer);
  await fs.writeFile(path.join(outputDir, "2_bg_removed.png"), bgRemovedBuffer);

  // 3. Extracted colour swatch
  const hex = await getDominantHexFromTransparentPng(bgRemovedBuffer);
  await sharp({
    create: {
      width: 100,
      height: 100,
      channels: 4,
      background: hex,
    },
  })
    .png()
    .toFile(path.join(outputDir, "3_extracted_color.png"));

  console.log(`[Preview] Extracted Colour: ${hex} -> saved to ${outputDir}`);
}

async function main() {
  const frontImagePath = path.join(baseDir, "imgToGlb/input", GARMENT, "front.png");
  const backImagePath = path.join(baseDir, "imgToGlb/input", GARMENT, "back.png");
  const outputDir = path.join(baseDir, "imgToGlb/output", GARMENT);
  const outputPath = path.join(outputDir, "processed.glb");

  console.log(`Reading image buffer from: ${frontImagePath}`);

  try {
    const frontImageBuffer = await fs.readFile(frontImagePath);
    const backImageBuffer = await fs.readFile(backImagePath);

    await saveDebugPreview(frontImageBuffer, outputDir);

    console.log(`Processing garment category: '${CATEGORY}'...`);
    const result = await processAndApplyGarment({
      frontImageBuffer,
      backImageBuffer,
      category: CATEGORY,
      baseMeshesDir: path.join(baseDir, "baseMeshes"),
    });

    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(outputPath, result);
    console.log("Success! Saved GLB to:", outputPath);
  } catch (error) {
    console.error("Pipeline test failed:", error);
  }
}

main();