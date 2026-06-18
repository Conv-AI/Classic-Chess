import { Environment } from '@react-three/drei';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import { useThree } from '@react-three/fiber';
import { useEffect, type ReactNode } from 'react';
import * as THREE from 'three';

type Props = {
  bgColor: string;
  enablePostProcessing?: boolean;
  children: ReactNode;
};

export default function PortraitScene({ bgColor, enablePostProcessing = true, children }: Props) {
  const { gl, scene } = useThree();

  useEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 0.94;
    scene.environmentIntensity = 0.14;
  }, [gl, scene]);

  return (
    <>
      <color attach="background" args={[bgColor]} />
      <hemisphereLight args={['#e8e4de', '#6a645c', 0.34]} />
      <directionalLight position={[0.6, 1.8, 1.4]} intensity={0.62} color="#f5f0ea" />
      <directionalLight position={[-1.2, 1.1, 0.8]} intensity={0.22} color="#d4dce8" />
      <directionalLight position={[0, 1.4, -1.8]} intensity={0.14} color="#c8d0dc" />
      <Environment preset="apartment" />
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
