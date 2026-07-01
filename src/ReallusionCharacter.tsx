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
  logPortraitFrustum,
  logPortraitMaterialTune,
  logPortraitSceneGraph,
  probePortraitCenterPixel,
} from './portraitDebug';
import { applyPortraitBlink, createPortraitBlinkState, resetPortraitBlinkMorphs } from './portraitBlink';
import { sanitizePortraitIdleClip } from './sanitizeIdleClip';

const MATERIAL_TUNING = {
  hairAlphaTest: 0.16,
  roughnessClamp: 0.92,
  envMapIntensity: 0.48,
} as const;

const HAIR_NAME_PATTERN = /hair|lash|brow|beard|scalp|fur/i;
const LIPSYNC_LOG_INTERVAL_MS = 2000;
const DELAYED_PROBE_MS = [500, 1000, 2000, 3000] as const;
const MOBILE_FALLBACK_PROBE_MS = 2000;
const MOBILE_FALLBACK_RECHECK_MS = 2500;

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

function applyBasicMaterialFallback(root: THREE.Object3D): void {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const swapped = materials.map((material) => {
      if (!material) return material;
      const std = material as THREE.MeshStandardMaterial;
      if (!('map' in std) || !std.map) return material;
      const basic = new THREE.MeshBasicMaterial({ map: std.map });
      basic.name = `${material.name}_mobile_basic`;
      return basic;
    });
    mesh.material = Array.isArray(mesh.material) ? swapped : swapped[0];
  });
}

function applyBasicMaterialDebugSwap(root: THREE.Object3D): void {
  applyBasicMaterialFallback(root);
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
  const delayedProbeTimersRef = useRef<number[]>([]);
  const mobileFallbackAppliedRef = useRef(false);
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

  useMemo(() => {
    if (gltf?.parser?.json) recoverMorphTargetNames(scene, gltf.parser.json);
    logPortraitMaterialTune('before', collectMaterialInventory(scene), mobilePortrait);
    tuneCharacterMaterials(scene);
    if (getPortraitDebugFlag() === 'basic') {
      applyBasicMaterialDebugSwap(scene);
      debugLog('PortraitDebug', 'basic material swap applied via portraitDebug=basic');
    }
    logPortraitMaterialTune('after', collectMaterialInventory(scene), mobilePortrait);
    logPortraitSceneGraph(scene);
    lipsyncRef.current = createCC4LipsyncState();
    const bound = bindCC4LipsyncMeshes(lipsyncRef.current, scene);
    if (LIPSYNC_PROFILES[assetName]?.hideOralUntilOpen || LIPSYNC_PROFILES[assetName]?.hideOralMeshesAlways) {
      updatePortraitOralVisibility(scene, 0, LIPSYNC_PROFILES[assetName]);
    }
    inspectLipsyncMeshes(scene, coachId);
    debugLog('Lipsync', `Bound ${bound} lipsync mesh(es) for coach=${coachId} asset=${assetName}`);
  }, [gltf, scene, coachId, assetName, mobilePortrait]);

  useEffect(() => {
    delayedProbeTimersRef.current.forEach((id) => window.clearTimeout(id));
    delayedProbeTimersRef.current = [];
    mobileFallbackAppliedRef.current = false;
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

    const scheduleProbe = (delayMs: number, onResult?: (classify: string) => void) => {
      const id = window.setTimeout(() => {
        const probe = probePortraitCenterPixel(gl, bgColor);
        if (!probe) return;
        const info = gl.info?.render;
        logPortraitDelayedProbe(
          delayMs,
          probe,
          info ? { triangles: info.triangles, calls: info.calls } : undefined,
          gl.domElement,
        );
        onResult?.(probe.classify);
      }, delayMs);
      delayedProbeTimersRef.current.push(id);
    };

    DELAYED_PROBE_MS.forEach((delayMs) => {
      if (delayMs === MOBILE_FALLBACK_PROBE_MS && mobilePortrait) {
        scheduleProbe(delayMs, (classify) => {
          if (classify !== 'empty_frame' || mobileFallbackAppliedRef.current || !groupRef.current) return;
          mobileFallbackAppliedRef.current = true;
          debugLog('PortraitDebug', 'WARN applying mobile PBR fallback — swapping mapped meshes to MeshBasicMaterial');
          applyBasicMaterialFallback(groupRef.current);
          scheduleProbe(MOBILE_FALLBACK_RECHECK_MS);
        });
        return;
      }
      scheduleProbe(delayMs);
    });
  }, [scene, framing, onReady, coachId, assetName, camera, gl, bgColor, mobilePortrait]);

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

  return (
    <group ref={groupRef} dispose={null}>
      <primitive object={scene} />
    </group>
  );
}
