import * as THREE from "three";
import { RenderResources } from "../../src/three/resources.js";

// Geometry and BVH tests use a real texture without requiring a browser canvas.
export class TestRenderResources extends RenderResources {
  texture(kind) {
    if (!this.textures.has(kind)) {
      const texture = new THREE.DataTexture(new Uint8Array([180, 180, 180, 255]), 1, 1);
      texture.needsUpdate = true;
      this.textures.set(kind, texture);
    }
    return this.textures.get(kind);
  }
}
