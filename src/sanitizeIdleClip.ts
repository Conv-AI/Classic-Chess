import * as THREE from 'three';
import { debugLog } from './debugLog';

const EYE_BONE = /^CC_Base_(L_|R_)Eye$/i;
/** Portrait idle sways on hip/pelvis translation and spine/waist rotation — lock for stable framing. */
const LOCK_POSITION_BONE = /^(CC_Base_BoneRoot|CC_Base_Hip|CC_Base_Pelvis|CC_Base_JawRoot|CC_Base_UpperJaw|CC_Base_Teeth\d+|CC_Base_Tongue\d+)$/i;
const LOCK_ROTATION_BONE = /^(CC_Base_Head|CC_Base_(Spine\d*|Waist|Pelvis|JawRoot|UpperJaw|Teeth\d+|Tongue\d+))$/i;
const LOCK_SCALE_BONE = /^(CC_Base_JawRoot|CC_Base_UpperJaw|CC_Base_Teeth\d+|CC_Base_Tongue\d+)$/i;
const POSITION_LOCK_MIN_DELTA = 0.01;
const ROTATION_LOCK_MIN_DELTA = 0.01;

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

function trackMaxDelta(values: ArrayLike<number>, stride: number): number {
  let max = 0;
  for (let axis = 0; axis < stride; axis++) {
    max = Math.max(max, trackAxisRange(values, stride, axis));
  }
  return max;
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
  return trackMaxDelta(track.values, 3) >= EYE_TRANSLATION_MIN_DELTA;
}

function shouldLockPositionTrack(track: THREE.VectorKeyframeTrack): boolean {
  return trackMaxDelta(track.values, 3) >= POSITION_LOCK_MIN_DELTA;
}

function shouldLockRotationTrack(track: THREE.VectorKeyframeTrack): boolean {
  return trackMaxDelta(track.values, 3) >= ROTATION_LOCK_MIN_DELTA;
}

function shouldLockQuaternionTrack(track: THREE.QuaternionKeyframeTrack): boolean {
  const values = track.values;
  if (values.length < 8) return false;
  const q0 = [values[0], values[1], values[2], values[3]];
  for (let i = 1; i < track.times.length; i++) {
    const dx = Math.abs(values[i * 4] - q0[0]);
    const dy = Math.abs(values[i * 4 + 1] - q0[1]);
    const dz = Math.abs(values[i * 4 + 2] - q0[2]);
    const dw = Math.abs(values[i * 4 + 3] - q0[3]);
    if (Math.max(dx, dy, dz, dw) >= ROTATION_LOCK_MIN_DELTA) return true;
  }
  return false;
}

/**
 * Portrait-safe idle cleanup for all bundled coach animation GLBs.
 * Locks hip/pelvis translation, spine/waist rotation, and jaw/oral bones so nostrils stay stable.
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

      if (LOCK_POSITION_BONE.test(nodeName)) {
        if (!shouldLockPositionTrack(track)) return [track];
        const delta = trackMaxDelta(track.values, 3);
        modified.push(`${nodeName}.position (locked to frame 0, Δ=${delta.toFixed(2)})`);
        return [freezeVectorToFirstFrame(track, 3)];
      }

      return [track];
    }

    if (LOCK_ROTATION_BONE.test(nodeName) && property === 'quaternion' && track instanceof THREE.QuaternionKeyframeTrack) {
      if (!shouldLockQuaternionTrack(track)) return [track];
      modified.push(`${nodeName}.quaternion (locked to frame 0)`);
      return [freezeQuaternionToFirstFrame(track)];
    }

    if (LOCK_ROTATION_BONE.test(nodeName) && property === 'rotation' && track instanceof THREE.VectorKeyframeTrack) {
      if (!shouldLockRotationTrack(track)) return [track];
      modified.push(`${nodeName}.rotation (locked to frame 0)`);
      return [freezeVectorToFirstFrame(track, 3)];
    }

    if (LOCK_SCALE_BONE.test(nodeName) && property === 'scale' && track instanceof THREE.VectorKeyframeTrack) {
      if (!shouldLockRotationTrack(track)) return [track];
      modified.push(`${nodeName}.scale (locked to frame 0)`);
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
