import * as THREE from 'three';
import { debugLog } from './debugLog';

const BONE_ROOT = 'CC_Base_BoneRoot';
const EYE_TRANSLATION = /^CC_Base_(L_|R_)Eye$/i;

/** Only strip eye slides when the track actually moves (avoids touching static exports). */
const EYE_TRANSLATION_MIN_DELTA = 0.01;

function splitTrackName(name: string): { nodeName: string; property: string } {
  const dot = name.lastIndexOf('.');
  if (dot === -1) return { nodeName: name, property: '' };
  return { nodeName: name.slice(0, dot), property: name.slice(dot + 1) };
}

function trackAxisRange(values: ArrayLike<number>, stride: number, axis: number): number {
  const count = values.length / stride;
  if (!count) return 0;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < count; i++) {
    const value = values[i * stride + axis];
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return max - min;
}

/**
 * Idle GLBs export large CC_Base_BoneRoot travel on X/Z (up to ~30 units on Danielle/Cassandra).
 * Lock those axes to the clip's opening pose so playback stays smooth — every keyframe keeps the
 * same X/Z and the mixer interpolates without snaps. Y is left alone for any subtle bob.
 */
function freezeBoneRootHorizontalTravel(track: THREE.VectorKeyframeTrack): THREE.VectorKeyframeTrack {
  const values = track.values.slice();
  const lockX = values[0];
  const lockZ = values[2];
  for (let i = 0; i < track.times.length; i++) {
    values[i * 3] = lockX;
    values[i * 3 + 2] = lockZ;
  }
  return new THREE.VectorKeyframeTrack(track.name, track.times.slice(), values);
}

function shouldRemoveEyeTranslation(track: THREE.VectorKeyframeTrack): boolean {
  const deltaX = trackAxisRange(track.values, 3, 0);
  const deltaY = trackAxisRange(track.values, 3, 1);
  const deltaZ = trackAxisRange(track.values, 3, 2);
  return Math.max(deltaX, deltaY, deltaZ) >= EYE_TRANSLATION_MIN_DELTA;
}

/**
 * Portrait-safe idle cleanup for all bundled coach animation GLBs:
 * magnus, sofia, arjun, leila (and custom coaches reusing those clips).
 */
export function sanitizePortraitIdleClip(
  clip: THREE.AnimationClip,
  assetName?: string,
): THREE.AnimationClip {
  const removed: string[] = [];
  const modified: string[] = [];

  const tracks = clip.tracks.flatMap((track) => {
    const { nodeName, property } = splitTrackName(track.name);
    if (property !== 'position' || !(track instanceof THREE.VectorKeyframeTrack)) {
      return [track];
    }

    if (EYE_TRANSLATION.test(nodeName)) {
      if (!shouldRemoveEyeTranslation(track)) return [track];
      removed.push(`${nodeName}.position`);
      return [];
    }

    if (nodeName === BONE_ROOT) {
      const deltaX = trackAxisRange(track.values, 3, 0);
      const deltaZ = trackAxisRange(track.values, 3, 2);
      if (deltaX < 0.01 && deltaZ < 0.01) return [track];
      modified.push(`${nodeName}.position (locked X/Z, Δx=${deltaX.toFixed(2)} Δz=${deltaZ.toFixed(2)})`);
      return [freezeBoneRootHorizontalTravel(track)];
    }

    return [track];
  });

  if (removed.length || modified.length) {
    const label = assetName ? `${clip.name} [${assetName}]` : clip.name;
    debugLog(
      'ReallusionCharacter',
      `Sanitized idle ${label} — modified: ${modified.join(', ') || 'none'}; removed: ${removed.join(', ') || 'none'}`,
    );
  }

  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}
