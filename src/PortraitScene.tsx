import { Environment } from '@react-three/drei';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import { useThree } from '@react-three/fiber';
import { useEffect, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { logPortraitEnvironment, warnPortraitEnvironmentMissing } from './portraitDebug';

type Props = {
  bgColor: string;
  enablePostProcessing?: boolean;
  enableEnvironment?: boolean;
  children: ReactNode;
};

function propagateEnvMap(scene: THREE.Scene): void {
  if (!scene.environment) return;
  scene.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (!material) continue;
      const std = material as THREE.MeshStandardMaterial;
      if (!std.isMeshStandardMaterial && !(std as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial) continue;
      std.envMap = scene.environment;
      std.needsUpdate = true;
    }
  });
}

export default function PortraitScene({
  bgColor,
  enablePostProcessing = true,
  enableEnvironment = true,
  children,
}: Props) {
  const { gl, scene } = useThree();
  const envLoggedRef = useRef(false);
  const envPropagatedRef = useRef(false);

  useEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 0.94;
    scene.environmentIntensity = 0.14;
  }, [gl, scene]);

  useEffect(() => {
    envLoggedRef.current = false;
    envPropagatedRef.current = false;

    const tick = () => {
      if (!enableEnvironment) {
        if (!envLoggedRef.current) {
          envLoggedRef.current = true;
          logPortraitEnvironment({
            hasEnvironment: false,
            environmentIntensity: scene.environmentIntensity,
            enablePostProcessing,
            enableEnvironment,
          });
        }
        return;
      }

      if (scene.environment && !envPropagatedRef.current) {
        envPropagatedRef.current = true;
        propagateEnvMap(scene);
      }

      if (scene.environment && !envLoggedRef.current) {
        envLoggedRef.current = true;
        logPortraitEnvironment({
          hasEnvironment: true,
          environmentIntensity: scene.environmentIntensity,
          enablePostProcessing,
          enableEnvironment,
        });
      }
    };

    const interval = window.setInterval(tick, 200);
    const timeout = window.setTimeout(() => {
      if (!envLoggedRef.current && enableEnvironment) {
        warnPortraitEnvironmentMissing();
      }
    }, 2000);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [scene, enablePostProcessing, enableEnvironment]);

  return (
    <>
      <color attach="background" args={[bgColor]} />
      <hemisphereLight args={['#e8e4de', '#6a645c', 0.34]} />
      <directionalLight position={[0.6, 1.8, 1.4]} intensity={0.62} color="#f5f0ea" />
      <directionalLight position={[-1.2, 1.1, 0.8]} intensity={0.22} color="#d4dce8" />
      <directionalLight position={[0, 1.4, -1.8]} intensity={0.14} color="#c8d0dc" />
      {enableEnvironment && <Environment preset="apartment" />}
      {children}
      {enablePostProcessing && (
        <EffectComposer multisampling={4}>
          <Bloom luminanceThreshold={0.94} luminanceSmoothing={0.25} intensity={0.05} mipmapBlur />
          <Vignette eskil={false} offset={0.22} darkness={0.52} />
        </EffectComposer>
      )}
    </>
  );
}
