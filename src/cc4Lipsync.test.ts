import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  applyCC4LipsyncFrame,
  bindCC4LipsyncMeshes,
  createCC4LipsyncState,
  LIPSYNC_PROFILES,
  reapplyCC4JawMotion,
  updatePortraitOralVisibility,
} from './cc4Lipsync';

function makeFaceMesh(): THREE.SkinnedMesh {
  const morphNames = [
    'V_Lip_Open',
    'V_Open',
    'V_Wide',
    'Mouth_Drop_Lower',
    'Mouth_Down_Lower_L',
    'Mouth_LowerLip_Depress_L',
    'Mouth_UpperLip_Raise_L',
    'Mouth_UpperLip_Raise_R',
    'Mouth_Smile_L',
    'Mouth_Smile_R',
    'Mouth_Stretch_L',
    'Mouth_Stretch_R',
    'Mouth_Press_L',
    'Mouth_Press_R',
    'Mouth_Corner_Pull_L',
    'Mouth_Corner_Pull_R',
    'Mouth_Funnel_Up_L',
    'Nose_Nostril_Dilate_L',
    'Jaw_Open',
    'Tongue_Out',
  ];
  const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry());
  mesh.name = 'CC_Base_Body_1';
  mesh.morphTargetDictionary = Object.fromEntries(morphNames.map((name, i) => [name, i]));
  mesh.morphTargetInfluences = new Array(morphNames.length).fill(0);
  return mesh;
}

function makeTeethMesh(): THREE.SkinnedMesh {
  const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry());
  mesh.name = 'CC_Base_Teeth';
  mesh.morphTargetDictionary = { V_Open: 0 };
  mesh.morphTargetInfluences = [0];
  return mesh;
}

function makeJawBone(): THREE.Bone {
  const jaw = new THREE.Bone();
  jaw.name = 'CC_Base_JawRoot';
  jaw.rotation.set(0, 0, 0);
  return jaw;
}

describe('cc4Lipsync Leila jaw-bone', () => {
  it('keeps face Jaw_Open/V_Open at zero and boosts safe viseme morphs', () => {
    const root = new THREE.Group();
    root.add(makeFaceMesh());
    root.add(makeTeethMesh());

    const state = createCC4LipsyncState();
    bindCC4LipsyncMeshes(state, root);

    const frame = new Float32Array(52);
    frame[17] = 0.12;
    frame[37] = 0.3;
    frame[38] = 0.3;
    frame[23] = 0.4;
    frame[24] = 0.4;
    frame[29] = 0.3;
    frame[30] = 0.3;
    frame[35] = 0.25;
    frame[36] = 0.25;
    frame[51] = 0.5;

    const stats = applyCC4LipsyncFrame(state, root, frame, 'Leila');

    expect(stats.bodyJawOpen).toBe(0);
    expect(stats.bodyVLipOpen).toBeGreaterThan(0);
    expect(stats.bodyVLipOpen).toBeLessThanOrEqual(0.62);
    expect(stats.appliedOnBody).toBeGreaterThanOrEqual(8);
    expect(state.jawOpenSmooth).toBeGreaterThan(0.08);

    const face = root.children[0] as THREE.SkinnedMesh;
    const dict = face.morphTargetDictionary!;
    expect(face.morphTargetInfluences![dict.Nose_Nostril_Dilate_L]).toBe(0);
    expect(face.morphTargetInfluences![dict.Mouth_Funnel_Up_L]).toBe(0);
    expect(face.morphTargetInfluences![dict.Jaw_Open]).toBe(0);
    expect(face.morphTargetInfluences![dict.V_Open]).toBe(0);
    expect(face.morphTargetInfluences![dict.Tongue_Out]).toBe(0);
    expect(face.morphTargetInfluences![dict.Mouth_Drop_Lower]).toBeGreaterThan(0.05);
    expect(face.morphTargetInfluences![dict.Mouth_Down_Lower_L]).toBeGreaterThan(0);
  });

  it('rotates jaw bone via reapplyCC4JawMotion when lipsync is active', () => {
    const root = new THREE.Group();
    const jaw = makeJawBone();
    root.add(jaw);
    root.add(makeFaceMesh());

    const state = createCC4LipsyncState();
    bindCC4LipsyncMeshes(state, root);
    state.isActive = true;
    state.jawOpenSmooth = 0.15;

    const restZ = jaw.rotation.z;
    reapplyCC4JawMotion(state, root, 'Leila');
    expect(jaw.rotation.z).toBeGreaterThan(restZ);
    expect(jaw.rotation.z - restZ).toBeCloseTo(0.15 * 0.78, 3);
  });

  it('keeps teeth hidden when hideOralMeshesAlways is set', () => {
    const teeth = new THREE.Group();
    teeth.name = 'CC_Base_Teeth';
    teeth.visible = true;
    const root = new THREE.Group();
    root.add(teeth);

    updatePortraitOralVisibility(root, 0.2, LIPSYNC_PROFILES.Leila);
    expect(teeth.visible).toBe(false);
  });

  it('does not drive teeth V_Open morph when hideOralMeshesAlways', () => {
    const root = new THREE.Group();
    root.add(makeFaceMesh());
    const teeth = makeTeethMesh();
    root.add(teeth);

    const state = createCC4LipsyncState();
    bindCC4LipsyncMeshes(state, root);

    const frame = new Float32Array(52);
    frame[17] = 0.15;

    applyCC4LipsyncFrame(state, root, frame, 'Leila');
    expect(teeth.morphTargetInfluences![0]).toBe(0);
  });

  it('caps upper-lip raise and V_Wide on face mesh', () => {
    const root = new THREE.Group();
    root.add(makeFaceMesh());

    const state = createCC4LipsyncState();
    bindCC4LipsyncMeshes(state, root);

    const frame = new Float32Array(52);
    frame[17] = 0.2;
    frame[39] = 0.9;
    frame[40] = 0.9;
    frame[29] = 0.85;
    frame[30] = 0.85;

    applyCC4LipsyncFrame(state, root, frame, 'Leila');

    const face = root.children[0] as THREE.SkinnedMesh;
    const dict = face.morphTargetDictionary!;
    const upperCap = LIPSYNC_PROFILES.Leila.upperLipRaiseCap ?? 0.35;
    const wideCap = LIPSYNC_PROFILES.Leila.wideMorphCap ?? 0.28;

    expect(face.morphTargetInfluences![dict.Mouth_UpperLip_Raise_L]).toBeLessThanOrEqual(upperCap);
    expect(face.morphTargetInfluences![dict.Mouth_UpperLip_Raise_R]).toBeLessThanOrEqual(upperCap);
    expect(face.morphTargetInfluences![dict.V_Wide]).toBeLessThanOrEqual(wideCap);
    expect(face.morphTargetInfluences![dict.Mouth_UpperLip_Raise_L]).toBeGreaterThan(0);
    expect(face.morphTargetInfluences![dict.V_Wide]).toBeGreaterThan(0);
  });
});
