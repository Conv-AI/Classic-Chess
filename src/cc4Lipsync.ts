import * as THREE from 'three';
import { applyCC4Correctives, buildCC4Correctives, type CC4Corrective } from './cc4Correctives';
import { applyCC4BoneMotion, decayCC4BoneMotion, type CC4BoneMotionRefs } from './cc4TeethMotion';

/** Smooth ARKit frames before applying (neurosync default 0.8). */
export const LIPSYNC_LERP_FACTOR = 0.8;
/** Ease jaw bone open/close (neurosync JAW_OPEN_SMOOTH). */
const JAW_OPEN_SMOOTH = 0.35;
/** Attenuate non-mouth-driven morph channels. */
export const NON_MOUTH_ATTENUATION = 0.6;
const TEETH_MORPH_ATTENUATION = 0.72;
const TEETH_OPEN_CAP = 0.62;

const ARKIT_JAW_OPEN = 17;
const ARKIT_MOUTH_CLOSE = 18;

/** Never drive Mouth_Open from the ARKit map on cc-female heads. */
const BLOCKED_FACE_MORPHS = new Set(['Mouth_Open']);

export type LipsyncProfile = {
  overall: number;
  jawMorph: number;
  jawBone: number;
  openVisemes: number;
  wideVisemes: number;
  smileFrown: number;
  pressPucker: number;
  /** Skip C_* corrective morphs (prevents nostril/philtrum artifacts on some CC4 heads). */
  skipCorrectives?: boolean;
  /** Hide teeth/tongue until the mouth opens enough (cc-female nostril holes). */
  hideOralUntilOpen?: boolean;
  /** V_Open deforms nostril geometry on cc-female — use V_Lip_Open only on face. */
  skipVOpen?: boolean;
  /** Face mesh only: block nose-adjacent / funnel morphs; allow the rest of the ARKit map. */
  faceMorphBlocklist?: boolean;
  /** Boost V_Lip_Open drive (Leila). */
  lipOpenGain?: number;
  /** Cap V_Lip_Open on face for nostril stability (Leila). */
  lipOpenCap?: number;
  /** Block Mouth_Close on face — it fights lip/jaw open on cc-female. */
  blockMouthClose?: boolean;
  /** Faster jaw bone smoothing (Leila). */
  jawBoneSmooth?: number;
  /** Never show teeth/tongue in portrait — prevents nostril-hole pink peel (Leila). */
  hideOralMeshesAlways?: boolean;
  /** Max jaw bone Z rotation when jawOpenSmooth=1 (Leila portrait). */
  jawBoneMaxZ?: number;
  /** Minimum V_Lip_Open when jaw is active (thick-lip heads). */
  lipOpenMin?: number;
  /** Per-profile ARKit frame lerp (default LIPSYNC_LERP_FACTOR). */
  lerpFactor?: number;
  /** Multiplier for synthetic lower-lip drive in skipVOpen path. */
  lowerLipDrive?: number;
  /** Allow Mouth_UpperLip_Raise_L/R on face (capped by upperLipRaiseCap). */
  allowUpperLipRaise?: boolean;
  /** Max influence for upper-lip raise morphs on face mesh. */
  upperLipRaiseCap?: number;
  /** Allow V_Wide on face (capped by wideMorphCap). */
  wideMorphCap?: number;
  /** Post-accum multiplier for mouth morph weights (clamped to 1). */
  mouthExpressiveness?: number;
};

/** Leila: block nose-adjacent morphs on face; allow smile/stretch/press/drop/V_Lip_Open. */
function isFaceMorphBlocked(name: string, profile: LipsyncProfile): boolean {
  if (!profile.faceMorphBlocklist) return false;
  if (BLOCKED_FACE_MORPHS.has(name)) return true;
  if (profile.blockMouthClose && name === 'Mouth_Close') return true;
  if (/^Nose_/i.test(name)) return true;
  if (/^Cheek_/i.test(name)) return true;
  if (/^Mouth_Funnel_/i.test(name)) return true;
  if (/^Mouth_UpperLip_/i.test(name)) {
    if (profile.allowUpperLipRaise && /^Mouth_UpperLip_Raise_[LR]$/i.test(name)) return false;
    return true;
  }
  if (/^Mouth_Up_Upper_/i.test(name)) return true;
  if (name === 'Mouth_Down') return true;
  if (/^Mouth_Cheek_/i.test(name)) return true;
  if (name === 'V_Wide' && profile.wideMorphCap !== undefined) return false;
  if (name === 'V_Wide') return true;
  if (/^Mouth_Shrug_/i.test(name)) return true;
  if (/^Tongue_/i.test(name)) return true;
  if (/^V_Tongue_/i.test(name)) return true;
  return false;
}

export const LIPSYNC_PROFILES: Record<string, LipsyncProfile> = {
  Vincent: { overall: 0.95, jawMorph: 1.3, jawBone: 0, openVisemes: 1.2, wideVisemes: 0.6, smileFrown: 0.25, pressPucker: 0.75 },
  Tyler: { overall: 1.0, jawMorph: 1.15, jawBone: 0, openVisemes: 1.1, wideVisemes: 0.6, smileFrown: 0.5, pressPucker: 0.65 },
  Cassandra: { overall: 0.95, jawMorph: 1.05, jawBone: 0, openVisemes: 0.92, wideVisemes: 0.55, smileFrown: 0.5, pressPucker: 0.65 },
  Leila: {
    overall: 1.0,
    jawMorph: 0,
    jawBone: 1.0,
    jawBoneSmooth: 0.72,
    jawBoneMaxZ: 0.78,
    openVisemes: 1.65,
    wideVisemes: 0.8,
    smileFrown: 0.55,
    pressPucker: 0.7,
    skipCorrectives: true,
    hideOralUntilOpen: true,
    hideOralMeshesAlways: true,
    skipVOpen: true,
    faceMorphBlocklist: true,
    lipOpenGain: 2.3,
    lipOpenCap: 0.62,
    lipOpenMin: 0.3,
    blockMouthClose: true,
    lerpFactor: 0.9,
    lowerLipDrive: 1.25,
    allowUpperLipRaise: true,
    upperLipRaiseCap: 0.35,
    wideMorphCap: 0.28,
    mouthExpressiveness: 1.15,
  },
};

const ARKIT_TO_CC4: Array<[number, string, number]> = [
  [17, 'V_Open', 0.62], [17, 'V_Lip_Open', 0.5],
  [18, 'Mouth_Close', 0.4],
  [37, 'Mouth_Down_Lower_L', 0.42], [38, 'Mouth_Down_Lower_R', 0.42],
  [37, 'Mouth_LowerLip_Depress_L', 0.48], [38, 'Mouth_LowerLip_Depress_R', 0.48],
  [37, 'Mouth_Down', 0.35], [38, 'Mouth_Down', 0.35],
  [39, 'Mouth_Up_Upper_L', 0.38], [40, 'Mouth_Up_Upper_R', 0.38],
  [39, 'Mouth_UpperLip_Raise_L', 0.42], [40, 'Mouth_UpperLip_Raise_R', 0.42],
  [37, 'Mouth_Drop_Lower', 0.21], [38, 'Mouth_Drop_Lower', 0.21],
  [23, 'Mouth_Smile_L', 1.0], [24, 'Mouth_Smile_R', 1.0],
  [23, 'Mouth_Corner_Pull_L', 0.85], [24, 'Mouth_Corner_Pull_R', 0.85],
  [25, 'Mouth_Frown_L', 0.7], [26, 'Mouth_Frown_R', 0.7],
  [25, 'Mouth_Corner_Down_L', 0.75], [26, 'Mouth_Corner_Down_R', 0.75],
  [33, 'Mouth_Shrug_Lower', 0.5], [34, 'Mouth_Shrug_Upper', 0.5],
  [33, 'Mouth_Lips_Push_DL', 0.45], [33, 'Mouth_Lips_Push_DR', 0.45],
  [34, 'Mouth_Lips_Push_UL', 0.45], [34, 'Mouth_Lips_Push_UR', 0.45],
  [29, 'Mouth_Stretch_L', 0.55], [30, 'Mouth_Stretch_R', 0.55],
  [29, 'V_Wide', 0.4], [30, 'V_Wide', 0.4],
  [27, 'Mouth_Dimple_L', 0.35], [28, 'Mouth_Dimple_R', 0.35],
  [31, 'Mouth_Roll_In_Lower_L', 0.65], [31, 'Mouth_Roll_In_Lower_R', 0.65],
  [31, 'Mouth_LowerLip_RollIn_L', 0.65], [31, 'Mouth_LowerLip_RollIn_R', 0.65],
  [32, 'Mouth_Roll_In_Upper_L', 0.65], [32, 'Mouth_Roll_In_Upper_R', 0.65],
  [32, 'Mouth_UpperLip_RollIn_L', 0.65], [32, 'Mouth_UpperLip_RollIn_R', 0.65],
  [35, 'Mouth_Press_L', 0.9], [36, 'Mouth_Press_R', 0.9],
  [35, 'Mouth_Lips_Press_L', 0.85], [36, 'Mouth_Lips_Press_R', 0.85],
  [35, 'V_Explosive', 0.4], [36, 'V_Explosive', 0.4],
  [19, 'Mouth_Funnel_Up_L', 0.5], [19, 'Mouth_Funnel_Up_R', 0.5],
  [19, 'Mouth_Funnel_Down_L', 0.5], [19, 'Mouth_Funnel_Down_R', 0.5],
  [19, 'Mouth_Funnel_UL', 0.45], [19, 'Mouth_Funnel_UR', 0.45],
  [19, 'Mouth_Funnel_DL', 0.45], [19, 'Mouth_Funnel_DR', 0.45],
  [19, 'V_Tight_O', 0.4], [19, 'V_Dental_Lip', 0.35],
  [20, 'Mouth_Pucker_Up_L', 0.7], [20, 'Mouth_Pucker_Up_R', 0.7],
  [20, 'Mouth_Pucker_Down_L', 0.7], [20, 'Mouth_Pucker_Down_R', 0.7],
  [20, 'Mouth_Lips_Purse_UL', 0.65], [20, 'Mouth_Lips_Purse_UR', 0.65],
  [20, 'Mouth_Lips_Purse_DL', 0.65], [20, 'Mouth_Lips_Purse_DR', 0.65],
  [20, 'V_Tight_O', 0.6], [20, 'Mouth_Blow_L', 0.3], [20, 'Mouth_Blow_R', 0.3],
  [20, 'Mouth_Lips_Blow_L', 0.3], [20, 'Mouth_Lips_Blow_R', 0.3],
  [46, 'Cheek_Puff_L', 0.48], [46, 'Cheek_Puff_R', 0.48],
  [46, 'Mouth_Cheek_Blow_L', 0.33], [46, 'Mouth_Cheek_Blow_R', 0.33],
  [21, 'Mouth_R', 0.5], [22, 'Mouth_L', 0.5],
  [21, 'Mouth_Right', 0.5], [22, 'Mouth_Left', 0.5],
  [51, 'Tongue_Out', 0.8], [51, 'V_Tongue_Out', 0.5],
];

const PORTRAIT_NEUTRAL_MORPHS = [
  'Eye_Squint_L', 'Eye_Squint_R', 'Eye_Wide_L', 'Eye_Wide_R',
  'Brow_Drop_L', 'Brow_Drop_R', 'Brow_Down_L', 'Brow_Down_R',
  'Brow_Raise_Inner_L', 'Brow_Raise_Inner_R', 'Brow_Raise_In_L', 'Brow_Raise_In_R',
  'Brow_Raise_Outer_L', 'Brow_Raise_Outer_R',
  'Nose_Sneer_L', 'Nose_Sneer_R', 'Nose_Nasolabial_Deepen_L', 'Nose_Nasolabial_Deepen_R',
  'Nose_Nostril_Dilate_L', 'Nose_Nostril_Dilate_R', 'Nose_Nostril_Depress_L', 'Nose_Nostril_Depress_R',
  'Nose_Nostril_Compress_L', 'Nose_Nostril_Compress_R',
  'Eye_Cheek_Raise_L', 'Eye_Cheek_Raise_R', 'Cheek_Raise_L', 'Cheek_Raise_R',
] as const;

const LIPSYNC_MESH_PATTERN = /CC_Base_(Body|Teeth|Tongue)/i;

type MeshBinding = {
  mesh: THREE.SkinnedMesh;
  correctives: CC4Corrective[];
};

export type CC4LipsyncState = {
  bindings: MeshBinding[];
  boneRefs: CC4BoneMotionRefs;
  smoothedFrame: Float32Array | null;
  latestFrame: Float32Array | null;
  jawOpenTarget: number;
  jawOpenSmooth: number;
  isActive: boolean;
  /** Snapshot of morphTargetInfluences after apply — reapply copies these without re-lerping. */
  cachedMorphInfluences: Map<string, Float32Array>;
  cachedOralOpen: number;
};

export function createCC4LipsyncState(): CC4LipsyncState {
  return {
    bindings: [],
    boneRefs: { jaw: null, teeth: null, tongue: null },
    smoothedFrame: null,
    latestFrame: null,
    jawOpenTarget: 0,
    jawOpenSmooth: 0,
    isActive: false,
    cachedMorphInfluences: new Map(),
    cachedOralOpen: 0,
  };
}

function isPrimaryFaceMesh(meshName: string): boolean {
  return /^CC_Base_Body$/i.test(meshName) || /^CC_Base_Body_1$/i.test(meshName);
}

function isLipsyncMesh(meshName: string): boolean {
  return LIPSYNC_MESH_PATTERN.test(meshName);
}

function isMouthMorphName(name: string): boolean {
  return /^(Jaw_|V_|Mouth_|Tongue_|Teeth)/i.test(name);
}

function getMorphCategoryMultiplier(name: string, profile: LipsyncProfile): number {
  if (name === 'Jaw_Open') return profile.jawMorph;
  if (/^V_|Open|Funnel|Drop|Depress/i.test(name)) return profile.openVisemes;
  if (/Wide|Stretch|Dimple|Mouth_R$|Mouth_L$|Corner_Pull|Corner_Wide/i.test(name)) return profile.wideVisemes;
  if (/Smile|Frown|Corner_Down/i.test(name)) return profile.smileFrown;
  if (/Press|Pucker|Shrug|Roll_In|RollIn|Blow|Tight_O|Dental_Lip|Purse|Push_/i.test(name)) return profile.pressPucker;
  return 1;
}

function zeroNoseMorphsOnFace(root: THREE.Object3D): void {
  root.traverse((child) => {
    const mesh = child as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh || !mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return;
    if (!isPrimaryFaceMesh(mesh.name)) return;
    for (const name of Object.keys(mesh.morphTargetDictionary)) {
      if (!/^Nose_/i.test(name)) continue;
      const index = mesh.morphTargetDictionary[name];
      if (index !== undefined) mesh.morphTargetInfluences[index] = 0;
    }
  });
}

function resetPortraitNeutralMorphs(root: THREE.Object3D): void {
  root.traverse((child) => {
    const mesh = child as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh || !mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return;
    if (!isPrimaryFaceMesh(mesh.name)) return;
    for (const name of PORTRAIT_NEUTRAL_MORPHS) {
      const index = mesh.morphTargetDictionary[name];
      if (index !== undefined) mesh.morphTargetInfluences[index] = 0;
    }
  });
  zeroNoseMorphsOnFace(root);
}

function lerpFrame(state: CC4LipsyncState, target: Float32Array, profile: LipsyncProfile): Float32Array {
  const lerp = profile.lerpFactor ?? LIPSYNC_LERP_FACTOR;
  if (!state.smoothedFrame || state.smoothedFrame.length !== target.length) {
    state.smoothedFrame = new Float32Array(target);
    return state.smoothedFrame;
  }
  for (let i = 0; i < target.length; i++) {
    const lerped = state.smoothedFrame[i] + (target[i] - state.smoothedFrame[i]) * lerp;
    state.smoothedFrame[i] = Math.max(0, Math.min(1, lerped));
  }
  return state.smoothedFrame;
}

export function bindCC4LipsyncMeshes(state: CC4LipsyncState, root: THREE.Object3D): number {
  if (state.bindings.length) return state.bindings.length;
  const bindings: MeshBinding[] = [];
  root.traverse((child) => {
    const mesh = child as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh || !mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return;
    if (!isLipsyncMesh(mesh.name)) return;
    bindings.push({
      mesh,
      correctives: buildCC4Correctives(mesh.morphTargetDictionary),
    });
  });
  state.bindings = bindings;
  state.boneRefs = discoverCC4BoneRefs(root);
  return bindings.length;
}

function discoverCC4BoneRefs(root: THREE.Object3D): CC4BoneMotionRefs {
  const refs: CC4BoneMotionRefs = { jaw: null, teeth: null, tongue: null };
  root.traverse((child) => {
    if (!(child instanceof THREE.Bone)) return;
    if (!refs.jaw && /CC_Base_JawRoot|CC_Base_Jaw|JawRoot|^Jaw$/i.test(child.name)) {
      refs.jaw = { bone: child, restX: child.rotation.x, restY: child.rotation.y, restZ: child.rotation.z };
    }
    if (!refs.teeth && /CC_Base_Teeth02|Teeth02|LowerTeeth/i.test(child.name)) {
      refs.teeth = { bone: child, restX: child.rotation.x, restY: child.rotation.y, restZ: child.rotation.z };
    }
    if (!refs.tongue && /CC_Base_Tongue03|Tongue03|^Tongue$/i.test(child.name)) {
      refs.tongue = { bone: child, restX: child.rotation.x, restY: child.rotation.y, restZ: child.rotation.z };
    }
  });
  return refs;
}

function computeJawOpen(frame: Float32Array, profile: LipsyncProfile): number {
  const mouthCloseCancel = profile.jawBone > 0 ? 0.08 : profile.lipOpenGain ? 0.2 : 0.35;
  const mouthClose = (frame[ARKIT_MOUTH_CLOSE] ?? 0) * 0.4;
  const rawJaw = frame[ARKIT_JAW_OPEN] ?? 0;
  const raw = Math.max(0, rawJaw - mouthClose * mouthCloseCancel);
  let jawOpen = Math.min(1, raw * profile.overall * profile.openVisemes);
  if (profile.jawBone > 0) {
    jawOpen = Math.max(jawOpen, rawJaw * 1.05, raw);
  }
  return jawOpen;
}

function buildMorphAccum(frame: Float32Array, profile: LipsyncProfile): Record<string, number> {
  const accum: Record<string, number> = {};
  for (const [index, name, scale] of ARKIT_TO_CC4) {
    if (profile.faceMorphBlocklist && isFaceMorphBlocked(name, profile)) continue;
    let raw = frame[index] ?? 0;
    if (index === ARKIT_MOUTH_CLOSE) raw *= 0.4;
    if (!profile.faceMorphBlocklist && (index === 37 || index === 38)) raw *= 0.7;
    const mouthScale = isMouthMorphName(name) ? 1 : NON_MOUTH_ATTENUATION;
    const value = raw * scale * getMorphCategoryMultiplier(name, profile) * profile.overall * mouthScale;
    if (value < 0.001) continue;
    accum[name] = Math.min(1, (accum[name] ?? 0) + value);
  }

  const jawOpen = computeJawOpen(frame, profile);
  if (profile.skipVOpen) {
    delete accum.V_Open;
    delete accum.Jaw_Open;
    const rawJaw = frame[ARKIT_JAW_OPEN] ?? 0;
    const gain = profile.lipOpenGain ?? 1;
    const cap = profile.lipOpenCap ?? 1;
    const min = profile.lipOpenMin ?? 0;
    const openAmount = Math.max(jawOpen, rawJaw);
    let lipOpen = Math.min(
      cap,
      Math.max(
        accum.V_Lip_Open ?? 0,
        rawJaw * 0.95 * gain * profile.overall,
        jawOpen * 0.92,
      ),
    );
    if (rawJaw > 0.025 && min > 0) lipOpen = Math.max(lipOpen, min);
    accum.V_Lip_Open = lipOpen;
    const lipDrive = profile.lowerLipDrive ?? 1;
    accum.Mouth_Drop_Lower = Math.max(accum.Mouth_Drop_Lower ?? 0, openAmount * 1.2 * lipDrive);
    accum.Mouth_Down_Lower_L = Math.max(accum.Mouth_Down_Lower_L ?? 0, openAmount * 0.72 * lipDrive);
    accum.Mouth_Down_Lower_R = Math.max(accum.Mouth_Down_Lower_R ?? 0, openAmount * 0.72 * lipDrive);
    accum.Mouth_LowerLip_Depress_L = Math.max(accum.Mouth_LowerLip_Depress_L ?? 0, openAmount * 0.68 * lipDrive);
    accum.Mouth_LowerLip_Depress_R = Math.max(accum.Mouth_LowerLip_Depress_R ?? 0, openAmount * 0.68 * lipDrive);
  } else {
    accum.V_Open = Math.max(accum.V_Open ?? 0, jawOpen);
    accum.V_Lip_Open = Math.max(accum.V_Lip_Open ?? 0, jawOpen * (profile.hideOralUntilOpen ? 0.9 : 0.82));
  }

  if (profile.mouthExpressiveness && profile.mouthExpressiveness !== 1) {
    const express = profile.mouthExpressiveness;
    for (const name of Object.keys(accum)) {
      if (!isMouthMorphName(name)) continue;
      accum[name] = Math.min(1, accum[name] * express);
    }
  }

  return accum;
}

function capFaceMorphValue(name: string, value: number, profile: LipsyncProfile): number {
  if (/^Mouth_UpperLip_Raise_[LR]$/i.test(name) && profile.allowUpperLipRaise) {
    return Math.min(value, profile.upperLipRaiseCap ?? 0.35);
  }
  if (name === 'V_Wide' && profile.wideMorphCap !== undefined) {
    return Math.min(value, profile.wideMorphCap);
  }
  return value;
}

export type CC4LipsyncApplyStats = {
  jawArkit: number;
  morphTargets: number;
  appliedOnBody: number;
  bodyJawOpen: number;
  bodyVOpen: number;
  bodyVLipOpen: number;
};

function boneMotionOptions(profile: LipsyncProfile) {
  return {
    jawOnly: profile.hideOralMeshesAlways ?? false,
    jawOpenMaxZ: profile.jawBoneMaxZ,
  };
}

function applyAccumToMeshes(
  state: CC4LipsyncState,
  accum: Record<string, number>,
  jawOpen: number,
  profile: LipsyncProfile,
): CC4LipsyncApplyStats {
  let appliedOnBody = 0;
  let bodyJawOpen = 0;
  let bodyVOpen = 0;
  let bodyVLipOpen = 0;
  const hideOral = profile.hideOralMeshesAlways ?? false;

  for (const { mesh, correctives } of state.bindings) {
    const dict = mesh.morphTargetDictionary!;
    const infl = mesh.morphTargetInfluences!;
    const isBodyMesh = /body/i.test(mesh.name);
    const isFaceMesh = isPrimaryFaceMesh(mesh.name);
    const isTeethMesh = /teeth/i.test(mesh.name);
    const isOralMesh = /teeth|tongue/i.test(mesh.name);

    if (isBodyMesh && !isFaceMesh) continue;

    for (const [name, value] of Object.entries(accum)) {
      if (isFaceMesh && BLOCKED_FACE_MORPHS.has(name)) continue;
      if (isFaceMesh && profile.skipVOpen && (name === 'V_Open' || name === 'Jaw_Open')) continue;
      if (isFaceMesh && isFaceMorphBlocked(name, profile)) continue;
      const morphIndex = dict[name];
      if (morphIndex === undefined) continue;
      let applied = isFaceMesh ? capFaceMorphValue(name, value, profile) : value;
      if (isTeethMesh) applied = Math.min(TEETH_OPEN_CAP, applied * TEETH_MORPH_ATTENUATION);
      infl[morphIndex] = applied;
      if (isFaceMesh) {
        appliedOnBody++;
        if (name === 'Jaw_Open') bodyJawOpen = applied;
        if (name === 'V_Open') bodyVOpen = applied;
        if (name === 'V_Lip_Open') bodyVLipOpen = applied;
      }
    }

    if (isFaceMesh && profile.skipVOpen) {
      if (dict.Jaw_Open !== undefined) {
        infl[dict.Jaw_Open] = 0;
        bodyJawOpen = 0;
      }
      if (dict.V_Open !== undefined) {
        infl[dict.V_Open] = 0;
        bodyVOpen = 0;
      }
    }

    if (isOralMesh && !hideOral && dict.V_Open !== undefined) {
      const teethOpen = Math.min(TEETH_OPEN_CAP, state.jawOpenSmooth * 0.9);
      infl[dict.V_Open] = Math.max(infl[dict.V_Open], teethOpen);
      if (isTeethMesh) bodyVOpen = Math.max(bodyVOpen, teethOpen);
    }

    if (isTeethMesh && !hideOral && dict.V_Open !== undefined && accum.V_Dental_Lip !== undefined) {
      infl[dict.V_Open] = Math.max(
        infl[dict.V_Open],
        Math.min(TEETH_OPEN_CAP, accum.V_Dental_Lip * TEETH_MORPH_ATTENUATION),
      );
    }

    if (!profile.skipCorrectives && correctives.length) applyCC4Correctives(infl, correctives);
  }

  state.jawOpenTarget = jawOpen;
  return {
    jawArkit: jawOpen,
    morphTargets: Object.keys(accum).length,
    appliedOnBody,
    bodyJawOpen,
    bodyVOpen,
    bodyVLipOpen,
  };
}

function snapshotMeshInfluences(state: CC4LipsyncState): void {
  for (const { mesh } of state.bindings) {
    if (!mesh.morphTargetInfluences) continue;
    const key = mesh.uuid;
    const infl = mesh.morphTargetInfluences;
    let snap = state.cachedMorphInfluences.get(key);
    if (!snap || snap.length !== infl.length) {
      snap = new Float32Array(infl);
      state.cachedMorphInfluences.set(key, snap);
    } else {
      snap.set(infl);
    }
  }
}

function restoreMeshInfluences(state: CC4LipsyncState): void {
  for (const { mesh } of state.bindings) {
    const snap = state.cachedMorphInfluences.get(mesh.uuid);
    const infl = mesh.morphTargetInfluences;
    if (!snap || !infl || snap.length !== infl.length) continue;
    for (let i = 0; i < infl.length; i++) infl[i] = snap[i];
  }
}

export function applyCC4LipsyncFrame(
  state: CC4LipsyncState,
  root: THREE.Object3D,
  frame: Float32Array,
  assetName: string,
): CC4LipsyncApplyStats {
  const profile = LIPSYNC_PROFILES[assetName] ?? LIPSYNC_PROFILES.Leila;
  resetPortraitNeutralMorphs(root);
  const smoothed = lerpFrame(state, frame, profile);
  state.latestFrame = smoothed;
  state.isActive = true;

  const accum = buildMorphAccum(smoothed, profile);
  const jawOpen = computeJawOpen(smoothed, profile);
  const jawSmooth = profile.jawBoneSmooth ?? JAW_OPEN_SMOOTH;
  state.jawOpenTarget = jawOpen * profile.jawBone;
  if (profile.jawBone > 0) {
    state.jawOpenSmooth += (state.jawOpenTarget - state.jawOpenSmooth) * jawSmooth;
  } else {
    state.jawOpenSmooth = 0;
  }

  const stats = applyAccumToMeshes(state, accum, jawOpen, profile);

  if (profile.hideOralUntilOpen && !profile.hideOralMeshesAlways) {
    state.cachedOralOpen = state.jawOpenSmooth;
    updatePortraitOralVisibility(root, state.jawOpenSmooth, profile);
  } else if (profile.hideOralMeshesAlways) {
    state.cachedOralOpen = 0;
    updatePortraitOralVisibility(root, 0, profile);
  }

  snapshotMeshInfluences(state);

  return stats;
}

/** Reapply jaw bone rotation after the idle animation mixer (wins over locked idle jaw tracks). */
export function reapplyCC4JawMotion(
  state: CC4LipsyncState,
  root: THREE.Object3D,
  assetName: string,
): void {
  const profile = LIPSYNC_PROFILES[assetName] ?? LIPSYNC_PROFILES.Leila;
  const boneOpts = boneMotionOptions(profile);
  if (!state.isActive || profile.jawBone <= 0) {
    decayCC4BoneMotion(state.boneRefs, root, boneOpts);
    return;
  }
  applyCC4BoneMotion(state.boneRefs, root, state.jawOpenSmooth, boneOpts);
  if (profile.hideOralUntilOpen && !profile.hideOralMeshesAlways) {
    updatePortraitOralVisibility(root, state.jawOpenSmooth, profile);
  }
}

/** Reapply cached morph influences after the idle animation mixer (no second lerp/accum pass). */
export function reapplyCC4LipsyncFrame(
  state: CC4LipsyncState,
  root: THREE.Object3D,
  assetName: string,
): void {
  if (!state.isActive || state.cachedMorphInfluences.size === 0) return;
  const profile = LIPSYNC_PROFILES[assetName] ?? LIPSYNC_PROFILES.Leila;
  resetPortraitNeutralMorphs(root);
  restoreMeshInfluences(state);
  if (profile.hideOralUntilOpen && !profile.hideOralMeshesAlways) {
    updatePortraitOralVisibility(root, state.cachedOralOpen, profile);
  }
}

export function snapCC4LipsyncNeutral(state: CC4LipsyncState, root: THREE.Object3D, assetName?: string): void {
  const profile = assetName ? LIPSYNC_PROFILES[assetName] : undefined;
  state.isActive = false;
  state.latestFrame = null;
  state.smoothedFrame = null;
  state.jawOpenTarget = 0;
  state.jawOpenSmooth = 0;
  state.cachedMorphInfluences.clear();
  state.cachedOralOpen = 0;
  for (const { mesh } of state.bindings) {
    if (!mesh.morphTargetInfluences) continue;
    for (let i = 0; i < mesh.morphTargetInfluences.length; i++) mesh.morphTargetInfluences[i] = 0;
  }
  decayCC4BoneMotion(state.boneRefs, root, profile ? boneMotionOptions(profile) : {});
  if (profile?.hideOralUntilOpen || profile?.hideOralMeshesAlways) {
    updatePortraitOralVisibility(root, 0, profile);
  }
}

export function decayCC4LipsyncMorphs(state: CC4LipsyncState, root: THREE.Object3D, assetName?: string): void {
  const profile = assetName ? LIPSYNC_PROFILES[assetName] : undefined;
  state.jawOpenTarget = 0;
  state.jawOpenSmooth += (0 - state.jawOpenSmooth) * (profile?.jawBoneSmooth ?? JAW_OPEN_SMOOTH);
  if (state.jawOpenSmooth < 0.001) {
    decayCC4BoneMotion(state.boneRefs, root, profile ? boneMotionOptions(profile) : {});
  }
  for (const { mesh } of state.bindings) {
    if (!mesh.morphTargetInfluences) continue;
    for (let i = 0; i < mesh.morphTargetInfluences.length; i++) {
      mesh.morphTargetInfluences[i] *= 0.8;
      if (mesh.morphTargetInfluences[i] < 0.001) mesh.morphTargetInfluences[i] = 0;
    }
  }
  if (state.jawOpenSmooth < 0.001) {
    state.isActive = false;
    state.latestFrame = null;
    state.smoothedFrame = null;
    state.cachedMorphInfluences.clear();
    state.cachedOralOpen = 0;
    if (profile?.hideOralUntilOpen || profile?.hideOralMeshesAlways) {
      updatePortraitOralVisibility(root, 0, profile);
    }
  }
}

/** Teeth/tongue visibility — disabled when hideOralMeshesAlways (cc-female nostril holes). */
export function updatePortraitOralVisibility(
  root: THREE.Object3D,
  mouthOpen: number,
  profile?: LipsyncProfile,
): void {
  if (profile?.hideOralMeshesAlways) {
    root.traverse((child) => {
      if (!/CC_Base_(Teeth|Tongue)/i.test(child.name)) return;
      child.visible = false;
    });
    return;
  }
  const show = mouthOpen > 0.04;
  root.traverse((child) => {
    if (!/CC_Base_(Teeth|Tongue)/i.test(child.name)) return;
    child.visible = show;
  });
}
