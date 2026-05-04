import { Suspense, useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import type { CoachConfig } from './coachConfig';
import { debugLog } from './debugLog';
import ReallusionCharacter from './ReallusionCharacter';

const DEFAULT_CHARACTER_ASSET_BASE = 'https://huggingface.co/sponge/Orca/resolve/main/';
const CHARACTER_ASSET_BASE = import.meta.env.VITE_CHARACTER_ASSET_BASE_URL || DEFAULT_CHARACTER_ASSET_BASE;
const assetUrl = (fileName: string) => `${CHARACTER_ASSET_BASE.replace(/\/?$/, '/')}${fileName}`;

const FRAMING_BY_ASSET: Record<string, {
  topInsetWorld: number;
  portraitCropBias: number;
  horizontalOffset: number;
}> = {
  Vincent: { topInsetWorld: 0.035, portraitCropBias: 0.02, horizontalOffset: 0.07 },
  Tyler: { topInsetWorld: 0.035, portraitCropBias: 0.02, horizontalOffset: 0.07 },
  Cassandra: { topInsetWorld: 0.035, portraitCropBias: 0.02, horizontalOffset: 0 },
  Danielle: { topInsetWorld: 0.035, portraitCropBias: 0.02, horizontalOffset: 0 },
};

type Props = {
  coach: CoachConfig;
  status: string;
  lastLine?: string;
  onReady?: () => void;
};

export default function CoachCard({ coach, status, lastLine, onReady }: Props) {
  const modelUrl = assetUrl(coach.modelFile);
  const idleUrl = assetUrl(coach.idleFile);
  const framing = FRAMING_BY_ASSET[coach.assetName] ?? FRAMING_BY_ASSET.Danielle;
  const lineRef = useRef<HTMLParagraphElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useGLTF.preload(modelUrl);
  useGLTF.preload(idleUrl);
  debugLog('CoachCard', `Rendering coach=${coach.id} model=${coach.modelFile}`);

  useEffect(() => {
    const el = lineRef.current;
    const wrap = wrapRef.current;
    if (!el || !wrap) return;
    const scrollable = el.scrollHeight > el.clientHeight + 2;
    wrap.classList.toggle('is-scrollable', scrollable);
  }, [lastLine]);

  return (
    <section className="coach-card character-card" aria-label={`${coach.name} chess coach`}>
      <div className="character-window">
        <Canvas
          camera={{ position: [0, 1.4, 0.9], fov: 36 }}
          dpr={[1.25, 2]}
          gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
          style={{ background: coach.bgColor }}
          onCreated={({ camera, gl, scene }) => {
            camera.lookAt(0, 1.4, 0);
            scene.background = null;
            gl.setClearColor(coach.bgColor, 1);
            gl.toneMappingExposure = 1.08;
          }}
        >
          <ambientLight intensity={0.9} />
          <directionalLight position={[1, 2, 2]} intensity={1.1} />
          <directionalLight position={[-1, 1, 0]} intensity={0.45} />
          <pointLight position={[0, 1.5, 1]} intensity={0.35} color="#ffe0c0" />
          <Suspense fallback={null}>
            <ReallusionCharacter
              coachId={coach.id}
              assetName={coach.assetName}
              charUrl={modelUrl}
              animUrl={idleUrl}
              onReady={onReady}
              framing={{
                cameraZ: 0.9,
                fov: 36,
                lookAtY: 1.4,
                topInsetWorld: framing.topInsetWorld,
                portraitCropBias: framing.portraitCropBias,
                horizontalOffset: framing.horizontalOffset,
              }}
            />
          </Suspense>
        </Canvas>
      </div>
      <div className="character-caption">
        <strong>{coach.name}</strong>
        <span>{status}</span>
      </div>
      {lastLine && (
        <div ref={wrapRef} className="coach-line-wrap">
          <p ref={lineRef} className="coach-line">{lastLine}</p>
        </div>
      )}
    </section>
  );
}
