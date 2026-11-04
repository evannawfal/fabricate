import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { processAndApplyGarment, GarmentType } from "./processGarment.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const baseDir = path.resolve(__dirname, "../");
console.log("baseDir: ", baseDir)
async function main() {
  // Simulate inputs received from upstream API/client
  const category: GarmentType = "t-shirt"; // Upstream classified category
  const frontImagePath = path.join(baseDir, "imgToGlb/front.png");
  const outputPath = path.join(baseDir, "imgToGlb/output/processed_tshirt.glb");

  console.log(`Reading image buffer from: ${frontImagePath}`);
  
  try {
    // Read local file into a Buffer to mimic req.file.buffer (e.g. from Multer)
    const frontImageBuffer = await fs.readFile(frontImagePath);

    console.log(`Processing garment category: '${category}'...`);

    const result = await processAndApplyGarment({
      frontImageBuffer,
      category,
      baseMeshesDir: path.join(baseDir, "baseMeshes"),
      outputPath,
    });

    console.log("Success!", result);
  } catch (error) {
    console.error("Pipeline test failed:", error);
  }
}

main();