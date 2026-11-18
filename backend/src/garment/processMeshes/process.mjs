import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';

const [,, input, output] = process.argv;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);

for (const mat of doc.getRoot().listMaterials()) {
  mat.setBaseColorFactor([0.8, 0.8, 0.8, 1]);
  mat.setBaseColorTexture(null);
  mat.setEmissiveTexture(null);
  mat.setMetallicRoughnessTexture(null);
  mat.setOcclusionTexture(null);
  mat.setNormalTexture(null); // drop this line if you want to keep normal maps
}
for (const mesh of doc.getRoot().listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    prim.setAttribute('COLOR_0', null);
    prim.setAttribute('TEXCOORD_0', null); // UVs are useless without textures
    prim.setAttribute('TEXCOORD_1', null);
  }
}
await doc.transform(prune()); // removes the now-orphaned textures/accessors
await io.write(output, doc);