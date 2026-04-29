import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import ReallusionCharacter from './ReallusionCharacter';

const DEFAULT_CHARACTER_ASSET_BASE = 'https://huggingface.co/sponge/Orca/resolve/main/';
const CHARACTER_ASSET_BASE = import.meta.env.VITE_CHARACTER_ASSET_BASE_URL || DEFAULT_CHARACTER_ASSET_BASE;
const assetUrl = (fileName: string) => `${CHARACTER_ASSET_BASE.replace(/\/?$/, '/')}${fileName}`;

const DANIELLE_MODEL = assetUrl('danielle.glb');
const DANIELLE_IDLE = assetUrl('danielle-idle.glb');
const DANIELLE_BG = '#d4dce8';

useGLTF.preload(DANIELLE_MODEL);
useGLTF.preload(DANIELLE_IDLE);

type Props = {
  status: string;
};

export default function DanielleCoach({ status }: Props) {
  return (
    <section className="coach-card character-card" aria-label="Danielle chess coach">
      <div className="character-window">
        <Canvas
          camera={{ position: [0, 1.4, 0.9], fov: 35 }}
          dpr={[1.5, 2.5]}
          gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
          style={{ background: DANIELLE_BG }}
          onCreated={({ camera, gl, scene }) => {
            camera.lookAt(0, 1.4, 0);
            scene.background = null;
            gl.setClearColor(DANIELLE_BG, 1);
            gl.toneMappingExposure = 1.08;
          }}
        >
          <ambientLight intensity={0.9} />
          <directionalLight position={[1, 2, 2]} intensity={1.1} />
          <directionalLight position={[-1, 1, 0]} intensity={0.45} />
          <pointLight position={[0, 1.5, 1]} intensity={0.35} color="#ffe0c0" />
          <Suspense fallback={null}>
            <ReallusionCharacter charUrl={DANIELLE_MODEL} animUrl={DANIELLE_IDLE} />
          </Suspense>
        </Canvas>
      </div>
      <div className="character-caption">
        <strong>Danielle</strong>
        <span>{status}</span>
      </div>
    </section>
  );
}
