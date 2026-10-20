# Avatar Generator

Procedural generation of a simplified, smooth 3D human avatar. The avatar is generated programmatically using Three.js, without requiring external 3D modeling software.

## Directory Structure

```text
avatar/
├── sdf.ts              # Defines the avatar using signed distance fields
├── meshGenerator.ts    # Samples the SDF and generates a triangle mesh
├── exportAvatar.ts     # Exports the generated avatar as a GLB file
└── README.md
```

## How It Works

The avatar generation pipeline consists of three stages:

1. **Shape definition (`sdf.ts`)**
   - Defines body parts using signed distance functions, including ellipsoids, capsules, and rounded boxes.
   - Combines shapes using smooth minimum operations to create a continuous-looking surface.
   - Exposes parameters to customize the mannequin's dimensions.

2. **Mesh generation (`meshGenerator.ts`)**
   - Samples the SDF over a 3D grid.
   - Uses marching tetrahedra to extract a triangle mesh from the zero-level surface.
   - Converts the generated vertices and triangles into a Three.js `BufferGeometry`.
   - Controls mesh detail through the grid resolution.

3. **GLB export (`exportAvatar.ts`)**
   - Creates a Three.js mesh with a material.
   - Uses `GLTFExporter` to export the avatar in GLB format.
   - Writes the resulting model to a file for use in other 3D applications or downstream workflows.

## Requirements

- Node.js
- Three.js
- The `three` package must be installed in the project.

Install the dependency if it is not already installed:

```bash
npm install -D @types/three                 
```

The project must support ES modules for the `import` and `export` syntax used by these files.

## Configuration

The generator accepts parameters to control the mannequin's dimensions.

| Parameter | Description |
|---|---|
| `height` | Overall mannequin height |
| `shoulderWidth` | Shoulder width |
| `chestWidth` | Chest width |
| `waistWidth` | Waist width |
| `hipWidth` | Hip width |


Example configuration in `exportAvatar.ts`:

```ts
const options = {
  height: 1.85,
  shoulderWidth: 0.40,
  chestWidth: 0.35,
  waistWidth: 0.30,
  hipWidth: 0.32,
};
```

Dimensions are expressed in **meters**.

## Usage

Run the export script from the project root:

```bash
node src/avatar/exportAvatar.ts
```

The script generates a GLB file according to the output path configured in `exportAvatar.js`.

A `avatar.glb` file will be generated, which can be uploaded to and viewed with this web page `https://sandbox.babylonjs.com/`
