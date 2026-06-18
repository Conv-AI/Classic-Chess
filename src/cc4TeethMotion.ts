import * as THREE from 'three';

const TEETH_MOTION_SCALE = 0.011;
const TEETH_JAW_DRIVE = 0.62;

function getRestY(mesh: THREE.Object3D): number {
  if (typeof mesh.userData.cc4TeethRestY !== 'number') {
    mesh.userData.cc4TeethRestY = mesh.position.y;
  }
  return mesh.userData.cc4TeethRestY;
}

function getDirection(meshName: string): number {
  if (/_2\b/i.test(meshName) || /lower/i.test(meshName)) return -1;
  return 1;
}

export function applyCC4TeethMotion(root: THREE.Object3D, jawOpen: number): void {
  const offset = THREE.MathUtils.clamp(jawOpen * TEETH_JAW_DRIVE, 0, 1) * TEETH_MOTION_SCALE;
  root.traverse((child) => {
    const mesh = child as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh || !/teeth/i.test(mesh.name)) return;
    mesh.position.y = getRestY(mesh) + offset * getDirection(mesh.name);
  });
}

export function decayCC4TeethMotion(root: THREE.Object3D): void {
  root.traverse((child) => {
    const mesh = child as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh || !/teeth/i.test(mesh.name)) return;
    const restY = getRestY(mesh);
    mesh.position.y += (restY - mesh.position.y) * 0.35;
    if (Math.abs(mesh.position.y - restY) < 0.0001) mesh.position.y = restY;
  });
}
