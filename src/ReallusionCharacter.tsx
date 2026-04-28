import { useEffect, useMemo, useRef } from 'react';
import { useAnimations, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { chessConvai } from './convaiManager';

const ARKIT_TO_CC4: Array<[number, string, number]> = [
  [17, 'Jaw_Open', 0.65], [17, 'V_Open', 0.5], [17, 'V_Lip_Open', 0.4],
  [37, 'Mouth_Down_Lower_L', 0.6], [38, 'Mouth_Down_Lower_R', 0.6],
  [39, 'Mouth_Up_Upper_L', 0.5], [40, 'Mouth_Up_Upper_R', 0.5],
  [37, 'Mouth_Drop_Lower', 0.3], [38, 'Mouth_Drop_Lower', 0.3],
  [23, 'Mouth_Smile_L', 1.0], [24, 'Mouth_Smile_R', 1.0],
  [25, 'Mouth_Frown_L', 0.7], [26, 'Mouth_Frown_R', 0.7],
  [33, 'Mouth_Shrug_Lower', 0.5], [34, 'Mouth_Shrug_Upper', 0.5],
  [29, 'Mouth_Stretch_L', 0.7], [30, 'Mouth_Stretch_R', 0.7],
  [29, 'V_Wide', 0.4], [30, 'V_Wide', 0.4],
  [31, 'Mouth_Roll_In_Lower_L', 0.65], [31, 'Mouth_Roll_In_Lower_R', 0.65],
  [32, 'Mouth_Roll_In_Upper_L', 0.65], [32, 'Mouth_Roll_In_Upper_R', 0.65],
  [35, 'Mouth_Press_L', 0.9], [36, 'Mouth_Press_R', 0.9],
  [35, 'V_Explosive', 0.4], [36, 'V_Explosive', 0.4],
  [19, 'Mouth_Funnel_Up_L', 0.5], [19, 'Mouth_Funnel_Up_R', 0.5],
  [19, 'Mouth_Funnel_Down_L', 0.5], [19, 'Mouth_Funnel_Down_R', 0.5],
  [19, 'V_Tight_O', 0.4], [19, 'V_Dental_Lip', 0.3],
  [20, 'Mouth_Pucker_Up_L', 0.7], [20, 'Mouth_Pucker_Up_R', 0.7],
  [20, 'Mouth_Pucker_Down_L', 0.7], [20, 'Mouth_Pucker_Down_R', 0.7],
  [20, 'V_Tight_O', 0.6], [20, 'Mouth_Blow_L', 0.3], [20, 'Mouth_Blow_R', 0.3],
  [0, 'Eye_Blink_L', 1.0], [7, 'Eye_Blink_R', 1.0],
  [5, 'Eye_Squint_L', 0.7], [12, 'Eye_Squint_R', 0.7],
  [6, 'Eye_Wide_L', 0.85], [13, 'Eye_Wide_R', 0.85],
  [41, 'Brow_Drop_L', 0.8], [42, 'Brow_Drop_R', 0.8],
  [43, 'Brow_Raise_Inner_L', 0.7], [43, 'Brow_Raise_Inner_R', 0.7],
  [44, 'Brow_Raise_Outer_L', 0.7], [45, 'Brow_Raise_Outer_R', 0.7],
];

function recoverMorphTargetNames(root: THREE.Object3D, gltfJson: any) {
  if (!gltfJson?.meshes) return;
  gltfJson.meshes.forEach((meshData: any) => {
    const names: string[] | undefined = meshData.extras?.targetNames;
    if (!names?.length) return;
    root.traverse((child) => {
      const mesh = child as THREE.SkinnedMesh;
      if (!mesh.isSkinnedMesh || mesh.name !== meshData.name || !mesh.morphTargetInfluences?.length) return;
      const existing = Object.keys(mesh.morphTargetDictionary || {});
      if (existing.some((key) => Number.isNaN(Number(key)))) return;
      const dict: Record<string, number> = {};
      names.forEach((name, index) => {
        if (index < mesh.morphTargetInfluences!.length) dict[name] = index;
      });
      mesh.morphTargetDictionary = dict;
    });
  });
}

function tuneMaterials(root: THREE.Object3D) {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((material) => {
      const standard = material as THREE.MeshStandardMaterial;
      if (standard.map) {
        standard.map.colorSpace = THREE.SRGBColorSpace;
        standard.map.anisotropy = 8;
      }
      if ('envMapIntensity' in standard) standard.envMapIntensity = 0.85;
      if ('roughness' in standard) standard.roughness = Math.min(standard.roughness, 0.92);
      if (standard.transparent || /hair|lash|brow/i.test(material.name)) {
        standard.alphaTest = 0.35;
        standard.depthWrite = true;
      }
      material.needsUpdate = true;
    });
  });
}

function applyArkitToCC4(frame: Float32Array, root: THREE.Object3D) {
  const accum: Record<string, number> = {};
  for (const [index, name, scale] of ARKIT_TO_CC4) {
    const value = (frame[index] ?? 0) * scale;
    if (value < 0.001) continue;
    accum[name] = Math.min(1, (accum[name] ?? 0) + value);
  }

  root.traverse((child) => {
    const mesh = child as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh || !mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return;
    for (const [name, value] of Object.entries(accum)) {
      const morphIndex = mesh.morphTargetDictionary[name];
      if (morphIndex !== undefined) mesh.morphTargetInfluences[morphIndex] = value;
    }
  });
}

function decayMorphs(root: THREE.Object3D) {
  root.traverse((child) => {
    const mesh = child as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh || !mesh.morphTargetInfluences) return;
    for (let i = 0; i < mesh.morphTargetInfluences.length; i++) {
      mesh.morphTargetInfluences[i] *= 0.8;
      if (mesh.morphTargetInfluences[i] < 0.001) mesh.morphTargetInfluences[i] = 0;
    }
  });
}

type Props = {
  charUrl: string;
  animUrl: string;
};

export default function ReallusionCharacter({ charUrl, animUrl }: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const hadLipsyncRef = useRef(false);
  const wasDecayingRef = useRef(false);
  const gltf = useGLTF(charUrl) as any;
  const { scene } = gltf;
  const { animations } = useGLTF(animUrl);
  const { actions } = useAnimations(animations, groupRef);

  useMemo(() => {
    if (gltf?.parser?.json) recoverMorphTargetNames(scene, gltf.parser.json);
    tuneMaterials(scene);
  }, [gltf, scene]);

  useEffect(() => {
    if (!groupRef.current) return;
    groupRef.current.position.set(0, 0, 0);
    groupRef.current.rotation.set(0, 0, 0);
    groupRef.current.scale.setScalar(1);
    groupRef.current.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(groupRef.current);
    const visibleHalfHeight = Math.tan((36 * Math.PI) / 360) * 0.9;
    const visibleTop = 1.4 + visibleHalfHeight;
    const targetTop = visibleTop - 0.035;
    groupRef.current.position.y = targetTop - box.max.y + 0.02;
    groupRef.current.position.x = 0;
    groupRef.current.updateMatrixWorld(true);
  }, [scene]);

  useEffect(() => {
    const keys = Object.keys(actions);
    const idleName = keys.find((key) => key.toLowerCase().includes('idle')) ?? keys[0];
    const action = idleName ? actions[idleName] : null;
    if (!action) return;
    action.reset().fadeIn(0.3).play();
    return () => {
      action.fadeOut(0.3);
    };
  }, [actions]);

  useFrame(() => {
    if (!groupRef.current) return;
    const frame = chessConvai.getLipsyncFrame();
    if (frame) {
      applyArkitToCC4(frame, groupRef.current);
      hadLipsyncRef.current = true;
      wasDecayingRef.current = false;
    } else if (hadLipsyncRef.current || chessConvai.getIsSpeaking()) {
      decayMorphs(groupRef.current);
      hadLipsyncRef.current = false;
      wasDecayingRef.current = true;
    } else if (wasDecayingRef.current) {
      decayMorphs(groupRef.current);
    }
  });

  return (
    <group ref={groupRef} dispose={null}>
      <primitive object={scene} />
    </group>
  );
}
