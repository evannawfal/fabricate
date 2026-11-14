import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { calculateAvatarAnchors, calculateBodyDimensions } from "./anchorsAndFitting.js";
import { exportPartGLB, exportSegmentedGLB } from "./exportPrototype.js";
import { PART_METADATA, type BodyPartName } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.VIEWER_PORT || 3030);
const GARMENTS_DIR = path.resolve(__dirname, "../../garment/baseMeshes");
const VIEWER_HTML_PATH = path.join(__dirname, "viewer.html");   // reference point picker  -> /
const FIT_HTML_PATH = path.join(__dirname, "fitViewer.html");   // avatar + garment fitter -> /view

const REQUIRED_POINTS: Record<string, string[]> = {
  top: ["leftShoulder", "rightShoulder", "bottomHem"],
  bottom: ["topHemLeft", "topHemRight", "bottomHemLeft", "bottomHemRight"],
};

function sendJson(res: http.ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(data));
}

function sendHtml(res: http.ServerResponse, filePath: string) {
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(fs.readFileSync(filePath, "utf-8"));
}

function sendBinary(
  res: http.ServerResponse,
  buffer: Uint8Array | Buffer,
  contentType = "model/gltf-binary",
  cache = "public, max-age=3600"
) {
  res.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": buffer.byteLength,
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": cache,
  });
  res.end(Buffer.from(buffer));
}

function readBody(req: http.IncomingMessage, limit = 1_000_000): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("Body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

/** tshirt.glb -> <GARMENTS_DIR>/tshirt.points.json */
function pointsPathFor(glbName: string): string {
  const safe = path.basename(glbName);
  return path.join(GARMENTS_DIR, safe.replace(/\.glb$/i, "") + ".points.json");
}

export function startViewerServer(port = PORT): http.Server {
  const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url || "/", `http://localhost:${port}`);
    const pathname = parsedUrl.pathname;

    // CORS preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      res.end();
      return;
    }

    try {
      // 1a. Reference point picker
      if (pathname === "/" || pathname === "/index.html") {
        sendHtml(res, VIEWER_HTML_PATH);
        return;
      }

      // 1b. Avatar + garment fitting viewer
      if (pathname === "/view" || pathname === "/view/") {
        sendHtml(res, FIT_HTML_PATH);
        return;
      }

      // 2. Metadata API
      if (pathname === "/api/metadata") {
        sendJson(res, PART_METADATA);
        return;
      }

      // 2b. Anchors and Dimensions API (avatar - untouched)
      if (pathname === "/api/anchors") {
        const params = parsedUrl.searchParams;
        const height = Number(params.get("height")) || 1.80;
        const shoulderWidth = Number(params.get("shoulderWidth")) || 0.40;
        const chestWidth = Number(params.get("chestWidth")) || 0.35;
        const waistWidth = Number(params.get("waistWidth")) || 0.30;
        const hipWidth = Number(params.get("hipWidth")) || 0.32;

        const options = { height, shoulderWidth, chestWidth, waistWidth, hipWidth };
        const anchors = calculateAvatarAnchors(options);
        const dimensions = calculateBodyDimensions(options);

        sendJson(res, { anchors, dimensions });
        return;
      }

      // 3. Segmented Avatar GLB API (avatar - untouched)
      if (pathname === "/api/avatar.glb") {
        const params = parsedUrl.searchParams;
        const height = Number(params.get("height")) || 1.80;
        const shoulderWidth = Number(params.get("shoulderWidth")) || 0.40;
        const chestWidth = Number(params.get("chestWidth")) || 0.35;
        const waistWidth = Number(params.get("waistWidth")) || 0.30;
        const hipWidth = Number(params.get("hipWidth")) || 0.32;

        const glb = await exportSegmentedGLB({ height, shoulderWidth, chestWidth, waistWidth, hipWidth });
        sendBinary(res, glb, "model/gltf-binary", "no-store");
        return;
      }

      // 4. Single Part GLB API (avatar - untouched; duplicate block removed)
      if (pathname.startsWith("/api/parts/")) {
        const partName = pathname.replace("/api/parts/", "").replace(".glb", "") as BodyPartName;
        if (!PART_METADATA[partName]) {
          res.writeHead(404).end("Body part not found");
          return;
        }

        const glb = await exportPartGLB(partName, {
          height: 1.80,
          shoulderWidth: 0.40,
          chestWidth: 0.35,
          waistWidth: 0.30,
          hipWidth: 0.32,
        });

        sendBinary(res, glb, "model/gltf-binary");
        return;
      }

      // 5a. List garment meshes
      if (pathname === "/api/garments") {
        const files = fs
          .readdirSync(GARMENTS_DIR)
          .filter((f) => f.toLowerCase().endsWith(".glb"))
          .sort();
        sendJson(res, { files });
        return;
      }

      // 5b. Reference points: GET (load) / POST (save)  ->  /api/garments/<name>.glb/points
      const pointsMatch = pathname.match(/^\/api\/garments\/([^/]+)\/points$/);
      if (pointsMatch) {
        const glbName = path.basename(decodeURIComponent(pointsMatch[1]!));
        if (!fs.existsSync(path.join(GARMENTS_DIR, glbName))) {
          sendJson(res, { error: `Garment ${glbName} not found` }, 404);
          return;
        }
        const file = pointsPathFor(glbName);

        if (req.method === "GET") {
          if (!fs.existsSync(file)) {
            sendJson(res, { error: "No saved points" }, 404);
            return;
          }
          res.writeHead(200, {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-store",
          });
          res.end(fs.readFileSync(file));
          return;
        }

        if (req.method === "POST") {
          const body = JSON.parse(await readBody(req));
          const required = REQUIRED_POINTS[body.type];
          if (!required) {
            sendJson(res, { error: "type must be 'top' or 'bottom'" }, 400);
            return;
          }
          for (const key of required) {
            const p = body.points?.[key];
            if (!p || ![p.x, p.y, p.z].every(Number.isFinite)) {
              sendJson(res, { error: `Missing or invalid point: ${key}` }, 400);
              return;
            }
          }
          const out = {
            garment: glbName,
            type: body.type,
            boundingBox: body.boundingBox,
            points: Object.fromEntries(required.map((k) => [k, body.points[k]])),
            savedAt: new Date().toISOString(),
          };
          fs.writeFileSync(file, JSON.stringify(out, null, 2));
          sendJson(res, { ok: true, savedAs: path.basename(file) });
          return;
        }

        res.writeHead(405).end("Method not allowed");
        return;
      }

      // 5c. Garment GLB files
      if (pathname.startsWith("/api/garments/")) {
        const filename = path.basename(decodeURIComponent(pathname.replace("/api/garments/", "")));
        const filePath = path.join(GARMENTS_DIR, filename);

        if (!fs.existsSync(filePath)) {
          res.writeHead(404).end(`Garment ${filename} not found`);
          return;
        }

        sendBinary(res, fs.readFileSync(filePath), "model/gltf-binary", "no-store");
        return;
      }

      // 404
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
    } catch (err: unknown) {
      console.error("Server error handling", pathname, err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(err) }));
    }
  });

  server.listen(port, () => {
    console.log(`\n======================================================`);
    console.log(`Avatar / garment tools are LIVE!`);
    console.log(`Reference point picker: http://localhost:${port}/`);
    console.log(`Avatar garment fitter:  http://localhost:${port}/view`);
    console.log(`======================================================\n`);
  });

  return server;
}

// Start immediately if executed directly via CLI
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  startViewerServer();
}