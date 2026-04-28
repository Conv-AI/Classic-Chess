import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import ReallusionCharacter from './ReallusionCharacter';

const DANIELLE_MODEL = `${import.meta.env.BASE_URL}danielle.glb`;
const DANIELLE_IDLE = `${import.meta.env.BASE_URL}danielle-idle.glb`;

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
          camera={{ position: [0, 1.4, 0.9], fov: 36 }}
          dpr={[1.5, 2.5]}
          gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
          onCreated={({ camera, gl }) => {
            camera.lookAt(0, 1.4, 0);
            gl.setClearColor('#e0d5dd');
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
