import * as THREE from "three";

// Articulation remains per character; mesh parts share GPU draw calls across the squad.
export class ModelBatch {
  constructor(capacity = 512) {
    this.root = new THREE.Group();
    this.capacity = capacity;
    this.batches = new Map();
  }
  update(models) {
    for (const batch of this.batches.values()) batch.count = 0;
    for (const model of models) {
      if (!model.root.visible) continue;
      model.root.updateMatrixWorld(true);
      model.root.traverse(object => {
        if (!object.isMesh || !object.visible) return;
        const key = `${object.geometry.uuid}:${object.material.uuid}`;
        let batch = this.batches.get(key);
        if (!batch) {
          const mesh = new THREE.InstancedMesh(object.geometry, object.material, this.capacity);
          mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          mesh.castShadow = mesh.receiveShadow = true;
          mesh.frustumCulled = false;
          this.root.add(mesh);
          batch = { mesh, count: 0 };
          this.batches.set(key, batch);
        }
        if (batch.count >= batch.mesh.instanceMatrix.count) {
          const previous = batch.mesh;
          batch.mesh = new THREE.InstancedMesh(object.geometry, object.material, previous.instanceMatrix.count * 2);
          batch.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          batch.mesh.instanceMatrix.array.set(previous.instanceMatrix.array);
          batch.mesh.castShadow = batch.mesh.receiveShadow = true;
          batch.mesh.frustumCulled = false;
          this.root.remove(previous); previous.dispose(); this.root.add(batch.mesh);
        }
        batch.mesh.setMatrixAt(batch.count++, object.matrixWorld);
      });
    }
    for (const { mesh, count } of this.batches.values()) {
      mesh.count = count;
      mesh.visible = count > 0;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
  dispose() { for (const { mesh } of this.batches.values()) mesh.dispose(); this.batches.clear(); this.root.clear(); }
}
