import path from "node:path";
import fs from "node:fs/promises";
import { applySolidColour } from "./applySolidColor.js";

// Hardcode or resolve explicitly from project root
// Assuming your project root is /Users/macos/CPEN321/fabricate
const projectRoot = path.resolve("/Users/macos/CPEN321/fabricate");

async function main() {
  // const inputPath = path.join(projectRoot, "backend/src/garment/baseMeshes/shirt.glb");
  // const outputPath = path.join(projectRoot, "backend/src/garment/imgToGlb/output/blue_shirt.glb");

  const inputPath = path.join(projectRoot, "backend/src/garment/baseMeshes/hoodie.glb");
  const outputPath = path.join(projectRoot, "backend/src/garment/imgToGlb/output/blue_hoodie.glb");


  console.log("Checking input file at:", inputPath);
  
  try {
    await fs.access(inputPath);
    console.log("Input file found successfully!");
  } catch {
    console.error("ERROR: Input file does not exist at:", inputPath);
    return;
  }

  console.log("Applying solid color...");
  await applySolidColour({
    inputPath,
    outputPath,
    colour: "#0000FF",
  });
  console.log("...");

  // Verify file creation
  try {
    await fs.access(outputPath);
    console.log(`SUCCESS: File verified on disk at ${outputPath}`);
  } catch {
    console.error("ERROR: Script finished, but output file was not found on disk.");
  }
}

main().catch(console.error);