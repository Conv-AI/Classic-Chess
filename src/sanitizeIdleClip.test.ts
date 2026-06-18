import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { sanitizePortraitIdleClip } from './sanitizeIdleClip';

describe('sanitizePortraitIdleClip', () => {
  it('locks BoneRoot X/Z to the opening pose without changing Y', () => {
    const clip = new THREE.AnimationClip('idle', 10, [
      new THREE.VectorKeyframeTrack('CC_Base_BoneRoot.position', [0, 5, 10], [
        0, 0, 0,
        -27, 0.02, -4,
        1.5, 0.04, -1,
      ]),
    ]);

    const sanitized = sanitizePortraitIdleClip(clip, 'Danielle');
    const root = sanitized.tracks.find((track) => track.name === 'CC_Base_BoneRoot.position') as THREE.VectorKeyframeTrack;
    expect(root).toBeTruthy();
    expect(Array.from(root.values).map((v) => Number(v.toFixed(2)))).toEqual([
      0, 0, 0,
      0, 0.02, 0,
      0, 0.04, 0,
    ]);
  });

  it('removes eye translation only when the track moves', () => {
    const clip = new THREE.AnimationClip('idle', 2, [
      new THREE.VectorKeyframeTrack('CC_Base_L_Eye.position', [0, 1], [
        6.75, 7.08, 3.2,
        6.80, 7.08, 3.2,
      ]),
      new THREE.VectorKeyframeTrack('CC_Base_R_Eye.position', [0, 1], [
        6.76, 7.08, -3.2,
        6.76, 7.08, -3.2,
      ]),
    ]);

    const sanitized = sanitizePortraitIdleClip(clip, 'Danielle');
    expect(sanitized.tracks.some((track) => track.name === 'CC_Base_L_Eye.position')).toBe(false);
    expect(sanitized.tracks.some((track) => track.name === 'CC_Base_R_Eye.position')).toBe(true);
  });

  it('leaves hip translation untouched for smooth body sway', () => {
    const hip = new THREE.VectorKeyframeTrack('CC_Base_Hip.position', [0, 1], [
      -0.2, 0, 0.5,
      0.16, 0, -0.9,
    ]);
    const sanitized = sanitizePortraitIdleClip(
      new THREE.AnimationClip('idle', 1, [hip]),
      'Danielle',
    );
    const out = sanitized.tracks[0] as THREE.VectorKeyframeTrack;
    expect(Array.from(out.values)).toEqual(Array.from(hip.values));
  });

  it('locks eye rotation to the opening pose instead of stripping it', () => {
    const clip = new THREE.AnimationClip('idle', 1, [
      new THREE.VectorKeyframeTrack('CC_Base_L_Eye.rotation', [0, 1], [0.1, 0, 0, 0.2, 0, 0]),
      new THREE.QuaternionKeyframeTrack('CC_Base_R_Eye.quaternion', [0, 1], [0, 0, 0, 1, 0.1, 0, 0, 1]),
    ]);
    const sanitized = sanitizePortraitIdleClip(clip, 'Sofia');
    expect(sanitized.tracks).toHaveLength(2);

    const left = sanitized.tracks[0] as THREE.VectorKeyframeTrack;
    expect(Array.from(left.values).map((v) => Number(v.toFixed(2)))).toEqual([0.1, 0, 0, 0.1, 0, 0]);

    const right = sanitized.tracks[1] as THREE.QuaternionKeyframeTrack;
    expect(Array.from(right.values).map((v) => Number(v.toFixed(2)))).toEqual([0, 0, 0, 1, 0, 0, 0, 1]);
  });

  it('locks head rotation to the opening pose', () => {
    const clip = new THREE.AnimationClip('idle', 2, [
      new THREE.VectorKeyframeTrack('CC_Base_Head.rotation', [0, 1], [0, 0.1, 0, 0.5, 0.3, 0]),
    ]);
    const sanitized = sanitizePortraitIdleClip(clip, 'Sofia');
    const head = sanitized.tracks[0] as THREE.VectorKeyframeTrack;
    expect(Array.from(head.values).map((v) => Number(v.toFixed(2)))).toEqual([0, 0.1, 0, 0, 0.1, 0]);
  });
});
