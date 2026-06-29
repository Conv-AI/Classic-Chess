import * as THREE from 'three';

const TEETH_MOTION_SCALE = 0.011;
const TEETH_JAW_DRIVE = 0.62;
const JAW_OPEN_MAX_Z = 0.25;
const TEETH_ROT_Z_FACTOR = -0.26 * 2;
const TONGUE_ROT_Z_FACTOR = 0.43;

export type CC4BoneRest = {
  bone: THREE.Bone;
  restX: number;
  restY: number;
  restZ: number;
};

export type CC4BoneMotionRefs = {
  jaw: CC4BoneRest | null;
  teeth: CC4BoneRest | null;
  tongue: CC4BoneRest | null;
};

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

export type CC4BoneMotionOptions = {
  /** Jaw bone only — skip teeth/tongue bones and teeth mesh offset (cc-female portrait). */
  jawOnly?: boolean;
  /** Override max jaw Z rotation (radians at jawOpen=1). */
  jawOpenMaxZ?: number;
};

/** Jaw + teeth/tongue bone rotation and teeth mesh Y offset (neurosync + legacy paths). */
export function applyCC4BoneMotion(
  refs: CC4BoneMotionRefs,
  root: THREE.Object3D,
  jawOpen: number,
  options: CC4BoneMotionOptions = {},
): void {
  const o = Number.isFinite(jawOpen) ? THREE.MathUtils.clamp(jawOpen, 0, 1) : 0;
  const jawOnly = options.jawOnly ?? false;
  const jawMaxZ = options.jawOpenMaxZ ?? JAW_OPEN_MAX_Z;

  if (refs.jaw) {
    refs.jaw.bone.rotation.x = refs.jaw.restX;
    refs.jaw.bone.rotation.y = refs.jaw.restY;
    refs.jaw.bone.rotation.z = refs.jaw.restZ + o * jawMaxZ;
  }

  if (jawOnly) return;

  if (refs.teeth) {
    refs.teeth.bone.rotation.x = refs.teeth.restX;
    refs.teeth.bone.rotation.y = refs.teeth.restY;
    refs.teeth.bone.rotation.z = refs.teeth.restZ + o * TEETH_ROT_Z_FACTOR * 2.2;
  }

  if (refs.tongue) {
    refs.tongue.bone.rotation.x = refs.tongue.restX;
    refs.tongue.bone.rotation.y = refs.tongue.restY;
    refs.tongue.bone.rotation.z = refs.tongue.restZ + o * TONGUE_ROT_Z_FACTOR * 2.2;
  }

  const offset = o * TEETH_JAW_DRIVE * TEETH_MOTION_SCALE;
  root.traverse((child) => {
    const mesh = child as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh || !/teeth/i.test(mesh.name)) return;
    mesh.position.y = getRestY(mesh) + offset * getDirection(mesh.name);
  });
}

export function decayCC4BoneMotion(
  refs: CC4BoneMotionRefs,
  root: THREE.Object3D,
  options: CC4BoneMotionOptions = {},
): void {
  const jawOnly = options.jawOnly ?? false;

  if (refs.jaw) {
    refs.jaw.bone.rotation.z += (refs.jaw.restZ - refs.jaw.bone.rotation.z) * 0.35;
  }
  if (jawOnly) return;

  if (refs.teeth) {
    refs.teeth.bone.rotation.z += (refs.teeth.restZ - refs.teeth.bone.rotation.z) * 0.35;
  }
  if (refs.tongue) {
    refs.tongue.bone.rotation.z += (refs.tongue.restZ - refs.tongue.bone.rotation.z) * 0.35;
  }

  root.traverse((child) => {
    const mesh = child as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh || !/teeth/i.test(mesh.name)) return;
    const restY = getRestY(mesh);
    mesh.position.y += (restY - mesh.position.y) * 0.35;
    if (Math.abs(mesh.position.y - restY) < 0.0001) mesh.position.y = restY;
  });
}

/** @deprecated Use applyCC4BoneMotion */
export const applyCC4TeethMotion = (root: THREE.Object3D, jawOpen: number) => {
  applyCC4BoneMotion({ jaw: null, teeth: null, tongue: null }, root, jawOpen);
};

/** @deprecated Use decayCC4BoneMotion */
export const decayCC4TeethMotion = (root: THREE.Object3D) => {
  decayCC4BoneMotion({ jaw: null, teeth: null, tongue: null }, root);
};
