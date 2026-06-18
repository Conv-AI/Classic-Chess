import * as THREE from 'three';
import { debugLog } from './debugLog';

const BONE_ROOT = 'CC_Base_BoneRoot';
const EYE_BONE = /^CC_Base_(L_|R_)Eye$/i;
const HEAD_BONE = /^CC_Base_Head$/i;

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

function freezeQuaternionToFirstFrame(track: THREE.QuaternionKeyframeTrack): THREE.QuaternionKeyframeTrack {
  const values = track.values.slice();
  const q0 = [values[0], values[1], values[2], values[3]];
  for (let i = 1; i < track.times.length; i++) {
    values[i * 4] = q0[0];
    values[i * 4 + 1] = q0[1];
    values[i * 4 + 2] = q0[2];
    values[i * 4 + 3] = q0[3];
  }
  return new THREE.QuaternionKeyframeTrack(track.name, track.times.slice(), values);
}

function freezeVectorToFirstFrame(track: THREE.VectorKeyframeTrack, stride: number): THREE.VectorKeyframeTrack {
  const values = track.values.slice();
  const first = values.slice(0, stride);
  for (let i = 1; i < track.times.length; i++) {
    for (let j = 0; j < stride; j++) values[i * stride + j] = first[j];
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
 *
 * Visible pupils live on CC_Base_EyeOcclusion and are driven by morph targets, not
 * eye-bone lookAt. Lock head/eye bones to their opening pose so she faces forward
 * without corrupting the rig.
 */
export function sanitizePortraitIdleClip(clip: THREE.AnimationClip, assetName?: string): THREE.AnimationClip {
  const removed: string[] = [];
  const modified: string[] = [];

  const tracks = clip.tracks.flatMap((track) => {
    const { nodeName, property } = splitTrackName(track.name);

    if (EYE_BONE.test(nodeName) && property === 'quaternion' && track instanceof THREE.QuaternionKeyframeTrack) {
      modified.push(`${nodeName}.quaternion (locked to frame 0)`);
      return [freezeQuaternionToFirstFrame(track)];
    }

    if (EYE_BONE.test(nodeName) && property === 'rotation' && track instanceof THREE.VectorKeyframeTrack) {
      modified.push(`${nodeName}.rotation (locked to frame 0)`);
      return [freezeVectorToFirstFrame(track, 3)];
    }

    if (property === 'position' && track instanceof THREE.VectorKeyframeTrack) {
      if (EYE_BONE.test(nodeName)) {
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
    }

    if (HEAD_BONE.test(nodeName) && property === 'quaternion' && track instanceof THREE.QuaternionKeyframeTrack) {
      modified.push(`${nodeName}.quaternion (locked to frame 0)`);
      return [freezeQuaternionToFirstFrame(track)];
    }

    if (HEAD_BONE.test(nodeName) && property === 'rotation' && track instanceof THREE.VectorKeyframeTrack) {
      modified.push(`${nodeName}.rotation (locked to frame 0)`);
      return [freezeVectorToFirstFrame(track, 3)];
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
