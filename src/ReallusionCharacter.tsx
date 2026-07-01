import { useEffect, useMemo, useRef } from 'react';
import { useAnimations, useGLTF } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { CoachId } from './coachConfig';
import {
  applyCC4LipsyncFrame,
  bindCC4LipsyncMeshes,
  createCC4LipsyncState,
  decayCC4LipsyncMorphs,
  reapplyCC4LipsyncFrame,
  reapplyCC4JawMotion,
  snapCC4LipsyncNeutral,
  updatePortraitOralVisibility,
  LIPSYNC_PROFILES,
} from './cc4Lipsync';
import { chessConvai } from './convaiManager';
import { debugLog } from './debugLog';
import { isMobilePortrait } from './isMobilePortrait';
import {
  collectMaterialInventory,
  getPortraitDebugFlag,
  logPortraitDelayedProbe,
  logPortraitFrameProbe,
  logPortraitFrustum,
  logPortraitMaterialTune,
  probePortraitCenterPixel,
} from './portraitDebug';
import { applyPortraitBlink, createPortraitBlinkState, resetPortraitBlinkMorphs } from './portraitBlink';
import { sanitizePortraitIdleClip } from './sanitizeIdleClip';

const MATERIAL_TUNING = {
  hairAlphaTest: 0.16,
  roughnessClamp: 0.92,
  envMapIntensity: 0.48,
  skinMetalnessClamp: 0.15,
} as const;

const HAIR_NAME_PATTERN = /hair|lash|brow|beard|scalp|fur/i;
const LIPSYNC_LOG_INTERVAL_MS = 2000;
const PROBE_FRAMES = new Set([5, 20, 60]);
const DELAYED_PROBE_MS = [1000, 3000] as const;

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
    summaries.push(
      `${mesh.name}:morphs=${mesh.morphTargetInfluences.length},dict=${Object.keys(dict).length},Jaw_Open=${dict.Jaw_Open ?? 'missing'},V_Open=${dict.V_Open ?? 'missing'}`,
    );
  });
  debugLog('Lipsync', `Mesh inventory coach=${coachId} — ${summaries.join(' | ')}`);
}

function isHairLikeMesh(mesh: THREE.Mesh, material: THREE.Material): boolean {
  const meshName = mesh.name || '';
  const materialName = material.name || '';
  return HAIR_NAME_PATTERN.test(meshName) || HAIR_NAME_PATTERN.test(materialName) || Boolean((material as THREE.MeshStandardMaterial).transparent);
}

function isSkinLikeMesh(mesh: THREE.Mesh, material: THREE.Material): boolean {
  const meshName = mesh.name || '';
  const materialName = material.name || '';
  return /skin|head|face|body|scalp/i.test(meshName) || /skin|head|face|body/i.test(materialName);
}

function tuneCharacterMaterials(root: THREE.Object3D, mobilePortrait: boolean) {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((material) => {
      if (!material) return;

      const standard = material as THREE.MeshStandardMaterial;
      const hairLike = isHairLikeMesh(mesh, standard);
      const skinLike = isSkinLikeMesh(mesh, standard);
      const anisotropy = mobilePortrait ? 4 : 8;

      if ('map' in standard && standard.map) {
        standard.map.colorSpace = THREE.SRGBColorSpace;
        standard.map.anisotropy = anisotropy;
        standard.map.needsUpdate = true;
      }
      if ('normalMap' in standard && standard.normalMap) standard.normalMap.anisotropy = anisotropy;
      if ('roughnessMap' in standard && standard.roughnessMap) standard.roughnessMap.anisotropy = anisotropy;
      if ('metalnessMap' in standard && standard.metalnessMap) standard.metalnessMap.anisotropy = anisotropy;
      if ('envMapIntensity' in standard) standard.envMapIntensity = MATERIAL_TUNING.envMapIntensity;
      if ('roughness' in standard) standard.roughness = Math.min(standard.roughness, MATERIAL_TUNING.roughnessClamp);
      if (mobilePortrait && skinLike && 'metalness' in standard) {
        standard.metalness = Math.min(standard.metalness, MATERIAL_TUNING.skinMetalnessClamp);
      }
      if (hairLike) {
        standard.transparent = true;
        standard.alphaTest = MATERIAL_TUNING.hairAlphaTest;
        standard.depthWrite = false;
        standard.depthTest = true;
        standard.side = THREE.DoubleSide;
        mesh.renderOrder = 2;
      } else if (skinLike) {
        mesh.renderOrder = 1;
      }
      standard.needsUpdate = true;
    });
  });
}

function applyBasicMaterialDebugSwap(root: THREE.Object3D): void {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const swapped = materials.map((material) => {
      if (!material || !isSkinLikeMesh(mesh, material)) return material;
      const basic = new THREE.MeshBasicMaterial({ map: (material as THREE.MeshStandardMaterial).map });
      basic.name = `${material.name}_debug_basic`;
      return basic;
    });
    mesh.material = Array.isArray(mesh.material) ? swapped : swapped[0];
  });
}

type Props = {
  coachId: CoachId;
  assetName: string;
  charUrl: string;
  animUrl: string;
  bgColor: string;
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

export default function ReallusionCharacter({
  coachId,
  assetName,
  charUrl,
  animUrl,
  bgColor,
  framing,
  onReady,
}: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const lipsyncRef = useRef(createCC4LipsyncState());
  const hadLipsyncRef = useRef(false);
  const wasDecayingRef = useRef(false);
  const lipsyncLogAtRef = useRef(0);
  const noFrameLogAtRef = useRef(0);
  const blinkRef = useRef(createPortraitBlinkState(0, Number.POSITIVE_INFINITY));
  const portraitLiveRef = useRef(false);
  const frameCountRef = useRef(0);
  const probedFramesRef = useRef(new Set<number>());
  const delayedProbeTimersRef = useRef<number[]>([]);
  const materialsTunedRef = useRef(false);
  const mobilePortrait = isMobilePortrait();
  const { camera, gl } = useThree();
  const gltf = useGLTF(charUrl) as any;
  const { scene } = gltf;
  const { animations } = useGLTF(animUrl);
  const portraitAnimations = useMemo(
    () => animations.map((clip) => sanitizePortraitIdleClip(clip, assetName)),
    [animations, assetName],
  );
  const { actions } = useAnimations(portraitAnimations, groupRef);

  useEffect(() => {
    if (!scene || materialsTunedRef.current) return;
    if (gltf?.parser?.json) recoverMorphTargetNames(scene, gltf.parser.json);

    logPortraitMaterialTune('before', collectMaterialInventory(scene), mobilePortrait);
    tuneCharacterMaterials(scene, mobilePortrait);
    if (getPortraitDebugFlag() === 'basic') {
      applyBasicMaterialDebugSwap(scene);
      debugLog('PortraitDebug', 'basic material swap applied to skin meshes');
    }
    logPortraitMaterialTune('after', collectMaterialInventory(scene), mobilePortrait);
    materialsTunedRef.current = true;

    lipsyncRef.current = createCC4LipsyncState();
    const bound = bindCC4LipsyncMeshes(lipsyncRef.current, scene);
    if (LIPSYNC_PROFILES[assetName]?.hideOralUntilOpen || LIPSYNC_PROFILES[assetName]?.hideOralMeshesAlways) {
      updatePortraitOralVisibility(scene, 0, LIPSYNC_PROFILES[assetName]);
    }
    inspectLipsyncMeshes(scene, coachId);
    debugLog('Lipsync', `Bound ${bound} lipsync mesh(es) for coach=${coachId} asset=${assetName}`);
  }, [gltf, scene, coachId, assetName, mobilePortrait]);

  useEffect(() => {
    materialsTunedRef.current = false;
    probedFramesRef.current.clear();
    frameCountRef.current = 0;
    delayedProbeTimersRef.current.forEach((id) => window.clearTimeout(id));
    delayedProbeTimersRef.current = [];
  }, [charUrl]);

  useEffect(() => () => {
    delayedProbeTimersRef.current.forEach((id) => window.clearTimeout(id));
    delayedProbeTimersRef.current = [];
  }, []);

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
    logPortraitFrustum(groupRef.current, camera);
    debugLog('ReallusionCharacter', `onReady firing for coachId=${coachId}`);
    onReady?.();

    delayedProbeTimersRef.current.forEach((id) => window.clearTimeout(id));
    delayedProbeTimersRef.current = DELAYED_PROBE_MS.map((delayMs) => window.setTimeout(() => {
      const probe = probePortraitCenterPixel(gl, bgColor);
      if (!probe) return;
      const info = gl.info?.render;
      logPortraitDelayedProbe(
        delayMs,
        probe,
        info ? { triangles: info.triangles, calls: info.calls } : undefined,
        gl.domElement,
      );
    }, delayMs));
  }, [scene, framing, onReady, coachId, assetName, camera, gl, bgColor]);

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

    if (chessConvai.consumeLipsyncNormalize(coachId)) {
      snapCC4LipsyncNeutral(lipsyncRef.current, groupRef.current, assetName);
      hadLipsyncRef.current = false;
      wasDecayingRef.current = false;
    }

    const speaking = chessConvai.getIsSpeaking(coachId);
    const frame = chessConvai.getLipsyncFrame(coachId);

    if (frame) {
      const stats = applyCC4LipsyncFrame(lipsyncRef.current, groupRef.current, frame, assetName);
      hadLipsyncRef.current = true;
      wasDecayingRef.current = false;

      const now = performance.now();
      if (now - lipsyncLogAtRef.current >= LIPSYNC_LOG_INTERVAL_MS) {
        lipsyncLogAtRef.current = now;
        debugLog(
          'Lipsync',
          `coach=${coachId} asset=${assetName} arkitJaw=${stats.jawArkit.toFixed(3)} targets=${stats.morphTargets} bodyApplied=${stats.appliedOnBody} bodyJawOpen=${stats.bodyJawOpen.toFixed(3)} bodyVOpen=${stats.bodyVOpen.toFixed(3)} bodyVLipOpen=${stats.bodyVLipOpen.toFixed(3)} jawBone=${lipsyncRef.current.jawOpenSmooth.toFixed(3)} speaking=${speaking}`,
        );
      }
    } else if (speaking) {
      const now = performance.now();
      if (now - noFrameLogAtRef.current >= LIPSYNC_LOG_INTERVAL_MS) {
        noFrameLogAtRef.current = now;
        debugLog('Lipsync', `coach=${coachId} speaking=true but no blendshape frame this tick`);
      }
    } else if ((hadLipsyncRef.current || wasDecayingRef.current) && !chessConvai.isCoachLipsyncActive(coachId)) {
      decayCC4LipsyncMorphs(lipsyncRef.current, groupRef.current, assetName);
      hadLipsyncRef.current = false;
      wasDecayingRef.current = true;
    }

    if (portraitLiveRef.current) {
      applyPortraitBlink(groupRef.current, performance.now(), blinkRef.current);
    }
  });

  useFrame(() => {
    if (!groupRef.current || !lipsyncRef.current.isActive) return;
    reapplyCC4LipsyncFrame(lipsyncRef.current, groupRef.current, assetName);
  }, 1);

  useFrame(() => {
    if (!groupRef.current) return;
    reapplyCC4JawMotion(lipsyncRef.current, groupRef.current, assetName);
  }, 2);

  useFrame(() => {
    frameCountRef.current += 1;
    const frame = frameCountRef.current;
    if (!PROBE_FRAMES.has(frame) || probedFramesRef.current.has(frame)) return;
    probedFramesRef.current.add(frame);

    const probe = probePortraitCenterPixel(gl, bgColor);
    if (!probe) return;
    const info = gl.info?.render;
    logPortraitFrameProbe(
      frame,
      probe,
      info ? { triangles: info.triangles, calls: info.calls } : undefined,
      gl.domElement,
    );
  }, -1);

  return (
    <group ref={groupRef} dispose={null}>
      <primitive object={scene} />
    </group>
  );
}
