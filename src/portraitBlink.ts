import * as THREE from 'three';

const BLINK_MORPHS = ['Eye_Blink_L', 'Eye_Blink_R'] as const;
const CLOSE_MS = 85;
const OPEN_MS = 100;
const MIN_INTERVAL_MS = 2800;
const MAX_INTERVAL_MS = 6800;
const READY_DELAY_MIN_MS = 4500;
const READY_DELAY_SPREAD_MS = 2500;

export type PortraitBlinkState = {
  phase: 'idle' | 'closing' | 'opening';
  phaseStartMs: number;
  nextBlinkMs: number;
};

function smoothstep(t: number): number {
  const x = THREE.MathUtils.clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

function randomBlinkInterval(): number {
  return MIN_INTERVAL_MS + Math.random() * (MAX_INTERVAL_MS - MIN_INTERVAL_MS);
}

export function createPortraitBlinkState(
  now = performance.now(),
  firstBlinkDelayMs = READY_DELAY_MIN_MS + Math.random() * READY_DELAY_SPREAD_MS,
): PortraitBlinkState {
  return {
    phase: 'idle',
    phaseStartMs: now,
    nextBlinkMs: now + firstBlinkDelayMs,
  };
}

export function getPortraitBlinkAmount(now: number, state: PortraitBlinkState): number {
  if (state.phase === 'idle') return 0;
  const elapsed = now - state.phaseStartMs;
  if (state.phase === 'closing') return smoothstep(elapsed / CLOSE_MS);
  return 1 - smoothstep(elapsed / OPEN_MS);
}

export function advancePortraitBlink(now: number, state: PortraitBlinkState): void {
  if (state.phase === 'idle') {
    if (now >= state.nextBlinkMs) {
      state.phase = 'closing';
      state.phaseStartMs = now;
    }
    return;
  }

  const elapsed = now - state.phaseStartMs;
  if (state.phase === 'closing' && elapsed >= CLOSE_MS) {
    state.phase = 'opening';
    state.phaseStartMs = now;
    return;
  }

  if (state.phase === 'opening' && elapsed >= OPEN_MS) {
    state.phase = 'idle';
    state.nextBlinkMs = now + randomBlinkInterval();
  }
}

/** Clears procedural blink morphs on eye meshes (body is driven each frame by applyPortraitBlink). */
export function resetPortraitBlinkMorphs(root: THREE.Object3D): void {
  root.traverse((child) => {
    const mesh = child as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh || !mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return;
    if (/CC_Base_Body/i.test(mesh.name)) return;
    for (const name of BLINK_MORPHS) {
      const index = mesh.morphTargetDictionary[name];
      if (index !== undefined) mesh.morphTargetInfluences[index] = 0;
    }
  });
}

export function applyPortraitBlink(root: THREE.Object3D, now: number, state: PortraitBlinkState): void {
  advancePortraitBlink(now, state);
  const amount = getPortraitBlinkAmount(now, state);

  root.traverse((child) => {
    const mesh = child as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh || !mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return;
    for (const name of BLINK_MORPHS) {
      const index = mesh.morphTargetDictionary[name];
      if (index !== undefined) mesh.morphTargetInfluences[index] = amount;
    }
  });
}
