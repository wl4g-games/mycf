import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

export const WORLD_SCALE = 2.5;
export const EYE_HEIGHT = .68 * WORLD_SCALE;
export const worldPoint = point => new THREE.Vector3(point.x * WORLD_SCALE, (point.z || 0) * WORLD_SCALE, point.y * WORLD_SCALE);
export const noise = (x, y = 0) => {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return value - Math.floor(value);
};

// A renderer owns these shared resources; removing a model never disposes its siblings.
export class RenderResources {
  constructor() {
    this.geometries = new Map();
    this.materials = new Map();
    this.textures = new Map();
  }

  geometry(kind) {
    if (!this.geometries.has(kind)) {
      const factories = {
        box: () => new THREE.BoxGeometry(1, 1, 1),
        sphere: () => new THREE.SphereGeometry(1, 12, 8),
        cylinder: () => new THREE.CylinderGeometry(1, 1, 1, 12),
        cone: () => new THREE.ConeGeometry(1, 1, 9),
        foliage: () => new THREE.ConeGeometry(1, 1, 12, 3),
        rock: () => {
          const geometry = new THREE.IcosahedronGeometry(1, 2);
          const positions = geometry.attributes.position;
          for (let i = 0; i < positions.count; i++) {
            const variation = .85 + noise(positions.getX(i) * 4, positions.getY(i) * 6 + positions.getZ(i)) * .3;
            positions.setXYZ(i, positions.getX(i) * variation, positions.getY(i) * variation, positions.getZ(i) * variation);
          }
          const smooth = mergeVertices(geometry);
          smooth.computeVertexNormals();
          geometry.dispose();
          return smooth;
        },
      };
      this.geometries.set(kind, factories[kind]());
    }
    return this.geometries.get(kind);
  }

  texture(kind) {
    if (this.textures.has(kind)) return this.textures.get(kind);
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d");
    const image = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const grain = noise(x, y);
      let value = 210 + grain * 24;
      if (kind === "asphalt") value = 100 + grain * 75;
      if (kind === "earth") value = 125 + grain * 90 + Math.sin(x * .16) * 12;
      if (kind === "concrete") value -= (y % 64 < 2 ? 55 : 0) + (x % 128 < 2 ? 30 : 0);
      if (kind === "metal") value -= x % 22 < 3 ? 60 : 0;
      const index = (y * size + x) * 4;
      image.data[index] = image.data[index + 1] = image.data[index + 2] = value;
      image.data[index + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    if (kind === "asphalt") {
      ctx.strokeStyle = "#4a4a4a";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(20, 0); ctx.lineTo(76, 62); ctx.lineTo(55, 123); ctx.lineTo(110, 180); ctx.lineTo(89, 256); ctx.stroke();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    this.textures.set(kind, texture);
    return texture;
  }

  material(name, color, roughness = .8, metalness = 0, texture = null, repeat = null) {
    if (!this.materials.has(name)) {
      let map = texture ? this.texture(texture) : null;
      if (map && repeat) {
        map = map.clone();
        map.repeat.set(...repeat);
        this.textures.set(`map:${name}`, map);
      }
      this.materials.set(name, new THREE.MeshStandardMaterial({
        color, roughness, metalness,
        ...(map ? { map, bumpMap: map, bumpScale: .025 } : {}),
      }));
    }
    return this.materials.get(name);
  }

  mesh(parent, kind, material, position, scale, rotation = null) {
    const mesh = new THREE.Mesh(this.geometry(kind), material);
    mesh.position.set(...position);
    mesh.scale.set(...scale);
    if (rotation) mesh.rotation.set(...rotation);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  dispose() {
    for (const collection of [this.geometries, this.materials, this.textures]) {
      for (const resource of collection.values()) resource.dispose();
      collection.clear();
    }
  }
}
