import { useEffect, useMemo, useRef } from 'react';
import { useAnimations, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { CoachId } from './coachConfig';
import { chessConvai } from './convaiManager';
import { applyCC4TeethMotion, decayCC4TeethMotion } from './cc4TeethMotion';
import { debugLog } from './debugLog';
import { applyPortraitBlink, createPortraitBlinkState, resetPortraitBlinkMorphs } from './portraitBlink';
import { sanitizePortraitIdleClip } from './sanitizeIdleClip';

const MATERIAL_TUNING = {
  hairAlphaTest: 0.16,
  roughnessClamp: 0.92,
  envMapIntensity: 0.48,
} as const;

const HAIR_NAME_PATTERN = /hair|lash|brow|beard|scalp|fur/i;

const TEETH_MORPH_ATTENUATION = 0.72;
const TEETH_OPEN_CAP = 0.62;

const LIPSYNC_MESH_PATTERN = /CC_Base_(Body|Teeth|Tongue)/i;
const LIPSYNC_LOG_INTERVAL_MS = 2000;

const LIPSYNC_PROFILES: Record<string, {
  overall: number;
  jawMorph: number;
  jawBone: number;
  openVisemes: number;
  wideVisemes: number;
  smileFrown: number;
  pressPucker: number;
}> = {
  Vincent: { overall: 0.95, jawMorph: 1.3, jawBone: 0, openVisemes: 1.2, wideVisemes: 0.2, smileFrown: 0.25, pressPucker: 0.75 },
  Tyler: { overall: 1.0, jawMorph: 1.15, jawBone: 0, openVisemes: 1.1, wideVisemes: 0.6, smileFrown: 0.5, pressPucker: 0.65 },
  Cassandra: { overall: 0.95, jawMorph: 1.05, jawBone: 0, openVisemes: 0.92, wideVisemes: 0.55, smileFrown: 0.5, pressPucker: 0.65 },
  Danielle: { overall: 1.0, jawMorph: 1.3, jawBone: 0, openVisemes: 1.15, wideVisemes: 0.55, smileFrown: 0.6, pressPucker: 0.55 },
};

const ARKIT_TO_CC4: Array<[number, string, number]> = [
  [17, 'Jaw_Open', 0.78], [17, 'V_Open', 0.62], [17, 'V_Lip_Open', 0.5],
  [37, 'Mouth_Down_Lower_L', 0.6], [38, 'Mouth_Down_Lower_R', 0.6],
  [37, 'Mouth_LowerLip_Depress_L', 0.68], [38, 'Mouth_LowerLip_Depress_R', 0.68],
  [37, 'Mouth_Down', 0.5], [38, 'Mouth_Down', 0.5],
  [39, 'Mouth_Up_Upper_L', 0.5], [40, 'Mouth_Up_Upper_R', 0.5],
  [39, 'Mouth_UpperLip_Raise_L', 0.58], [40, 'Mouth_UpperLip_Raise_R', 0.58],
  [37, 'Mouth_Drop_Lower', 0.3], [38, 'Mouth_Drop_Lower', 0.3],
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
  [46, 'Cheek_Puff_L', 0.8], [46, 'Cheek_Puff_R', 0.8],
  [46, 'Mouth_Cheek_Blow_L', 0.55], [46, 'Mouth_Cheek_Blow_R', 0.55],
  [21, 'Mouth_R', 0.5], [22, 'Mouth_L', 0.5],
  [21, 'Mouth_Right', 0.5], [22, 'Mouth_Left', 0.5],
  [51, 'Tongue_Out', 0.8], [51, 'V_Tongue_Out', 0.5],
];

/** Upper-face ARKit channels are noisy during TTS — keep brows/eyes neutral; blinks are procedural. */
const PORTRAIT_NEUTRAL_MORPHS = [
  'Eye_Squint_L', 'Eye_Squint_R', 'Eye_Wide_L', 'Eye_Wide_R',
  'Brow_Drop_L', 'Brow_Drop_R', 'Brow_Down_L', 'Brow_Down_R',
  'Brow_Raise_Inner_L', 'Brow_Raise_Inner_R', 'Brow_Raise_In_L', 'Brow_Raise_In_R',
  'Brow_Raise_Outer_L', 'Brow_Raise_Outer_R',
  'Nose_Sneer_L', 'Nose_Sneer_R', 'Nose_Nasolabial_Deepen_L', 'Nose_Nasolabial_Deepen_R',
  'Eye_Cheek_Raise_L', 'Eye_Cheek_Raise_R', 'Cheek_Raise_L', 'Cheek_Raise_R',
] as const;

function resetPortraitNeutralMorphs(root: THREE.Object3D): void {
  root.traverse((child) => {
    const mesh = child as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh || !mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return;
    if (!/body/i.test(mesh.name)) return;
    for (const name of PORTRAIT_NEUTRAL_MORPHS) {
      const index = mesh.morphTargetDictionary[name];
      if (index !== undefined) mesh.morphTargetInfluences[index] = 0;
    }
  });
}

function recoverMorphTargetNames(root: THREE.Object3D, gltfJson: any) {
  if (!gltfJson?.meshes) return;
  const meshDataByName = new Map<string, { extras?: { targetNames?: string[] } }>();
  gltfJson.meshes.forEach((meshData: { name?: string; extras?: { targetNames?: string[] } }) => {
    if (meshData.name) meshDataByName.set(meshData.name, meshData);
  });

  root.traverse((child) => {
    const mesh = child as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh || !mesh.morphTargetInfluences?.length) return;
    const names = meshDataByName.get(mesh.name)?.extras?.targetNames;
    if (!names?.length) return;

    const existing = mesh.morphTargetDictionary ?? {};
    if ('Jaw_Open' in existing || 'V_Open' in existing) return;

    const dict: Record<string, number> = {};
    names.forEach((name, index) => {
      if (index < mesh.morphTargetInfluences!.length) dict[name] = index;
    });
    mesh.morphTargetDictionary = dict;
  });
}

function inspectLipsyncMeshes(root: THREE.Object3D, coachId: CoachId): void {
  const summaries: string[] = [];
  root.traverse((child) => {
    const mesh = child as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh || !mesh.morphTargetInfluences?.length) return;
    const dict = mesh.morphTargetDictionary ?? {};
    const jawOpen = dict.Jaw_Open;
    const vOpen = dict.V_Open;
    summaries.push(
      `${mesh.name}:morphs=${mesh.morphTargetInfluences.length},dict=${Object.keys(dict).length},Jaw_Open=${jawOpen ?? 'missing'},V_Open=${vOpen ?? 'missing'},lipsync=${isLipsyncMesh(mesh.name)}`,
    );
  });
  debugLog('Lipsync', `Mesh inventory coach=${coachId} — ${summaries.join(' | ')}`);
}

function isLipsyncMesh(meshName: string): boolean {
  return LIPSYNC_MESH_PATTERN.test(meshName);
}

function getMorphCategoryMultiplier(name: string, profile: typeof LIPSYNC_PROFILES[string]): number {
  if (name === 'Jaw_Open') return profile.jawMorph;
  if (/^V_|Open|Funnel|Drop|Depress/i.test(name)) return profile.openVisemes;
  if (/Wide|Stretch|Dimple|Mouth_R$|Mouth_L$|Corner_Pull|Corner_Wide/i.test(name)) return profile.wideVisemes;
  if (/Smile|Frown|Corner_Down/i.test(name)) return profile.smileFrown;
  if (/Press|Pucker|Shrug|Roll_In|RollIn|Blow|Tight_O|Dental_Lip|Purse|Push_/i.test(name)) return profile.pressPucker;
  return 1;
}

function findJawBone(root: THREE.Object3D): THREE.Object3D | null {
  const jawNames = ['CC_Base_JawRoot', 'CC_Base_Jaw', 'JawRoot', 'Jaw'];
  for (const name of jawNames) {
    const jaw = root.getObjectByName(name);
    if (jaw) return jaw;
  }
  let fallback: THREE.Object3D | null = null;
  root.traverse((child) => {
    if (!fallback && /jaw/i.test(child.name)) fallback = child;
  });
  return fallback;
}

function applyJawBone(root: THREE.Object3D, jawOpen: number, profile: typeof LIPSYNC_PROFILES[string]) {
  if (profile.jawBone === 0) return;
  const jaw = findJawBone(root);
  if (jaw) jaw.rotation.x = jawOpen * profile.jawBone;
}

type LipsyncApplyStats = {
  jawArkit: number;
  morphTargets: number;
  appliedOnBody: number;
  bodyJawOpen: number;
  bodyVOpen: number;
};

function applyArkitToCC4(frame: Float32Array, root: THREE.Object3D, assetName: string): LipsyncApplyStats {
  const profile = LIPSYNC_PROFILES[assetName] ?? LIPSYNC_PROFILES.Danielle;
  resetPortraitNeutralMorphs(root);
  const accum: Record<string, number> = {};
  for (const [index, name, scale] of ARKIT_TO_CC4) {
    const value = (frame[index] ?? 0) * scale * getMorphCategoryMultiplier(name, profile) * profile.overall;
    if (value < 0.001) continue;
    accum[name] = Math.min(1, (accum[name] ?? 0) + value);
  }

  const jawArkit = frame[17] ?? 0;
  const jawOpen = Math.min(1, jawArkit * profile.overall);
  applyJawBone(root, jawOpen, profile);
  applyCC4TeethMotion(root, jawOpen);

  let appliedOnBody = 0;
  let bodyJawOpen = 0;
  let bodyVOpen = 0;

  root.traverse((child) => {
    const mesh = child as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh || !mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return;
    if (!isLipsyncMesh(mesh.name)) return;
    const isBodyMesh = /body/i.test(mesh.name);
    const isTeethMesh = /teeth/i.test(mesh.name);
    for (const [name, value] of Object.entries(accum)) {
      const morphIndex = mesh.morphTargetDictionary[name];
      if (morphIndex !== undefined) {
        let applied = value;
        if (isTeethMesh) {
          applied = Math.min(TEETH_OPEN_CAP, value * TEETH_MORPH_ATTENUATION);
        }
        mesh.morphTargetInfluences[morphIndex] = applied;
        if (isBodyMesh) {
          appliedOnBody++;
          if (name === 'Jaw_Open') bodyJawOpen = applied;
          if (name === 'V_Open') bodyVOpen = applied;
        }
        continue;
      }
      if (isTeethMesh && name === 'V_Dental_Lip') {
        const fallbackIndex = mesh.morphTargetDictionary.V_Open;
        if (fallbackIndex !== undefined) {
          mesh.morphTargetInfluences[fallbackIndex] = Math.max(
            mesh.morphTargetInfluences[fallbackIndex],
            Math.min(TEETH_OPEN_CAP, value * TEETH_MORPH_ATTENUATION),
          );
        }
      }
    }
  });

  return {
    jawArkit,
    morphTargets: Object.keys(accum).length,
    appliedOnBody,
    bodyJawOpen,
    bodyVOpen,
  };
}

function decayMorphs(root: THREE.Object3D) {
  const jaw = findJawBone(root);
  if (jaw) jaw.rotation.x *= 0.75;
  decayCC4TeethMotion(root);
  root.traverse((child) => {
    const mesh = child as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh || !mesh.morphTargetInfluences || !isLipsyncMesh(mesh.name)) return;
    for (let i = 0; i < mesh.morphTargetInfluences.length; i++) {
      mesh.morphTargetInfluences[i] *= 0.8;
      if (mesh.morphTargetInfluences[i] < 0.001) mesh.morphTargetInfluences[i] = 0;
    }
  });
}

function isHairLikeMesh(mesh: THREE.Mesh, material: THREE.Material): boolean {
  const meshName = mesh.name || '';
  const materialName = material.name || '';
  return HAIR_NAME_PATTERN.test(meshName) || HAIR_NAME_PATTERN.test(materialName) || Boolean((material as THREE.MeshStandardMaterial).transparent);
}

function tuneCharacterMaterials(root: THREE.Object3D) {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((material) => {
      if (!material) return;
      const standard = material as THREE.MeshStandardMaterial;
      const hairLike = isHairLikeMesh(mesh, material);
      if ('map' in standard && standard.map) {
        standard.map.colorSpace = THREE.SRGBColorSpace;
        standard.map.anisotropy = 8;
        standard.map.needsUpdate = true;
      }
      if ('normalMap' in standard && standard.normalMap) standard.normalMap.anisotropy = 8;
      if ('roughnessMap' in standard && standard.roughnessMap) standard.roughnessMap.anisotropy = 8;
      if ('metalnessMap' in standard && standard.metalnessMap) standard.metalnessMap.anisotropy = 8;
      if ('envMapIntensity' in standard) standard.envMapIntensity = MATERIAL_TUNING.envMapIntensity;
      if ('roughness' in standard) standard.roughness = Math.min(standard.roughness, MATERIAL_TUNING.roughnessClamp);
      if (hairLike) {
        standard.transparent = true;
        standard.alphaTest = MATERIAL_TUNING.hairAlphaTest;
        standard.depthWrite = false;
        standard.depthTest = true;
        standard.side = THREE.DoubleSide;
        mesh.renderOrder = 2;
      } else if (/skin|head|face|scalp/i.test(mesh.name) || /skin|head|face/i.test(material.name)) {
        mesh.renderOrder = 1;
      }
      material.needsUpdate = true;
    });
  });
}

type Props = {
  coachId: CoachId;
  assetName: string;
  charUrl: string;
  animUrl: string;
  onReady?: () => void;
  framing: {
    cameraZ: number;
    fov: number;
    lookAtY: number;
    topInsetWorld: number;
    portraitCropBias: number;
    horizontalOffset: number;
  };
};

export default function ReallusionCharacter({ coachId, assetName, charUrl, animUrl, framing, onReady }: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const hadLipsyncRef = useRef(false);
  const wasDecayingRef = useRef(false);
  const lipsyncLogAtRef = useRef(0);
  const noFrameLogAtRef = useRef(0);
  const blinkRef = useRef(createPortraitBlinkState(0, Number.POSITIVE_INFINITY));
  const portraitLiveRef = useRef(false);
  const gltf = useGLTF(charUrl) as any;
  const { scene } = gltf;
  const { animations } = useGLTF(animUrl);
  const portraitAnimations = useMemo(
    () => animations.map((clip) => sanitizePortraitIdleClip(clip, assetName)),
    [animations, assetName],
  );
  const { actions } = useAnimations(portraitAnimations, groupRef);

  useMemo(() => {
    if (gltf?.parser?.json) recoverMorphTargetNames(scene, gltf.parser.json);
    tuneCharacterMaterials(scene);
    inspectLipsyncMeshes(scene, coachId);
  }, [gltf, scene, coachId]);

  useEffect(() => {
    portraitLiveRef.current = false;
    if (!groupRef.current) return;
    debugLog('ReallusionCharacter', `Framing character coachId=${coachId} assetName=${assetName}`);
    groupRef.current.position.set(0, 0, 0);
    groupRef.current.rotation.set(0, 0, 0);
    groupRef.current.scale.setScalar(1);
    groupRef.current.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(groupRef.current);
    const visibleHalfHeight = Math.tan((framing.fov * Math.PI) / 360) * framing.cameraZ;
    const visibleTop = framing.lookAtY + visibleHalfHeight;
    const targetTop = visibleTop - framing.topInsetWorld;
    groupRef.current.position.y = targetTop - box.max.y + framing.portraitCropBias;
    groupRef.current.position.x = framing.horizontalOffset;
    groupRef.current.updateMatrixWorld(true);
    resetPortraitBlinkMorphs(groupRef.current);
    blinkRef.current = createPortraitBlinkState();
    portraitLiveRef.current = true;
    debugLog('ReallusionCharacter', `onReady firing for coachId=${coachId}`);
    onReady?.();
  }, [scene, framing, onReady, coachId, assetName]);

  useEffect(() => {
    const keys = Object.keys(actions);
    const idleName = keys.find((key) => key.toLowerCase().includes('idle')) ?? keys[0];
    const action = idleName ? actions[idleName] : null;
    debugLog('ReallusionCharacter', `Playing animation "${idleName ?? 'none'}" for coachId=${coachId}`);
    if (!action) return;
    action.reset().fadeIn(0.3).play();
    return () => {
      action.fadeOut(0.3);
    };
  }, [actions, coachId]);

  useFrame(() => {
    if (!groupRef.current) return;
    const speaking = chessConvai.getIsSpeaking(coachId);
    const frame = chessConvai.getLipsyncFrame(coachId);

    if (frame) {
      const stats = applyArkitToCC4(frame, groupRef.current, assetName);
      hadLipsyncRef.current = true;
      wasDecayingRef.current = false;

      const now = performance.now();
      if (now - lipsyncLogAtRef.current >= LIPSYNC_LOG_INTERVAL_MS) {
        lipsyncLogAtRef.current = now;
        debugLog(
          'Lipsync',
          `coach=${coachId} asset=${assetName} arkitJaw=${stats.jawArkit.toFixed(3)} targets=${stats.morphTargets} bodyApplied=${stats.appliedOnBody} bodyJawOpen=${stats.bodyJawOpen.toFixed(3)} bodyVOpen=${stats.bodyVOpen.toFixed(3)} speaking=${speaking}`,
        );
      }
    } else if (speaking) {
      const now = performance.now();
      if (now - noFrameLogAtRef.current >= LIPSYNC_LOG_INTERVAL_MS) {
        noFrameLogAtRef.current = now;
        debugLog('Lipsync', `coach=${coachId} speaking=true but no blendshape frame this tick`);
      }
    } else if (hadLipsyncRef.current || wasDecayingRef.current) {
      decayMorphs(groupRef.current);
      hadLipsyncRef.current = false;
      wasDecayingRef.current = true;
    }

    if (portraitLiveRef.current) {
      applyPortraitBlink(groupRef.current, performance.now(), blinkRef.current);
    }
  });

  return (
    <group ref={groupRef} dispose={null}>
      <primitive object={scene} />
    </group>
  );
}
