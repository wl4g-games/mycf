import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the packaged skinned character contains complete geometry, texture images and locomotion clips", () => {
  const bytes = readFileSync(new URL("../assets/models/soldier.glb", import.meta.url));
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  assert.equal(bytes.readUInt32LE(8), bytes.length, "The GLB download must not be truncated");
  const jsonSize = bytes.readUInt32LE(12);
  const document = JSON.parse(bytes.subarray(20, 20 + jsonSize).toString());
  const binaryStart = 28 + jsonSize;
  for (const view of document.bufferViews) assert.ok(binaryStart + (view.byteOffset || 0) + view.byteLength <= bytes.length);
  for (const name of ["Idle", "Walk", "Run"]) assert.ok(document.animations.some(clip => clip.name === name));
  assert.ok(document.meshes.some(mesh => mesh.primitives.some(part => part.attributes.JOINTS_0 !== undefined && part.attributes.WEIGHTS_0 !== undefined)));
  assert.ok(document.images.length >= 2);
  for (const image of document.images) {
    const view = document.bufferViews[image.bufferView];
    assert.equal(bytes.readUInt16BE(binaryStart + view.byteOffset), 0xffd8);
  }
});
