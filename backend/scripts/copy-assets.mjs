// tsc only compiles .ts files, so the garment base meshes are copied into dist/ for the built server.
import { cpSync } from 'node:fs';

cpSync('src/garment/baseMeshes', 'dist/garment/baseMeshes', { recursive: true });
