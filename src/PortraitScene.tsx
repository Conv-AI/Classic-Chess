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

const MOBILE_LIGHT_BOOST = 0.3;

export default function PortraitScene({
  bgColor,
  enablePostProcessing = true,
  enableEnvironment = true,
  children,
}: Props) {
  const { gl, scene } = useThree();
  const envLoggedRef = useRef(false);
  const lightBoostRef = useRef(false);

  useEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 0.94;
    scene.environmentIntensity = 0.14;
  }, [gl, scene]);

  useEffect(() => {
    envLoggedRef.current = false;
    lightBoostRef.current = false;

    const logEnv = () => {
      if (envLoggedRef.current) return;
      if (!enableEnvironment) {
        envLoggedRef.current = true;
        logPortraitEnvironment({
          hasEnvironment: false,
          environmentIntensity: scene.environmentIntensity,
          enablePostProcessing,
          enableEnvironment,
        });
        return;
      }
      if (scene.environment) {
        envLoggedRef.current = true;
        logPortraitEnvironment({
          hasEnvironment: true,
          environmentIntensity: scene.environmentIntensity,
          enablePostProcessing,
          enableEnvironment,
        });
      }
    };

    const interval = window.setInterval(logEnv, 200);
    const timeout = window.setTimeout(() => {
      if (!envLoggedRef.current && enableEnvironment) {
        warnPortraitEnvironmentMissing();
      }
      if (!scene.environment && enableEnvironment && !lightBoostRef.current) {
        lightBoostRef.current = true;
        scene.traverse((child) => {
          if ((child as THREE.DirectionalLight).isDirectionalLight) {
            const light = child as THREE.DirectionalLight;
            light.intensity += MOBILE_LIGHT_BOOST;
          }
        });
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
