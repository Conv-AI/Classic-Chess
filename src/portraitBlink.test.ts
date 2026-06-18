import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  advancePortraitBlink,
  applyPortraitBlink,
  createPortraitBlinkState,
  getPortraitBlinkAmount,
  resetPortraitBlinkMorphs,
} from './portraitBlink';

describe('portraitBlink', () => {
  it('stays open between scheduled blinks', () => {
    const state = createPortraitBlinkState(0, 5000);
    state.nextBlinkMs = 5000;
    advancePortraitBlink(1000, state);
    expect(state.phase).toBe('idle');
    expect(getPortraitBlinkAmount(1000, state)).toBe(0);
  });

  it('runs a close-open blink cycle', () => {
    const state = createPortraitBlinkState(0, 100);
    state.nextBlinkMs = 100;
    advancePortraitBlink(100, state);
    expect(state.phase).toBe('closing');
    expect(getPortraitBlinkAmount(140, state)).toBeGreaterThan(0.3);

    advancePortraitBlink(200, state);
    expect(state.phase).toBe('opening');
    expect(getPortraitBlinkAmount(250, state)).toBeLessThan(0.75);

    advancePortraitBlink(320, state);
    expect(state.phase).toBe('idle');
    expect(getPortraitBlinkAmount(320, state)).toBe(0);
    expect(state.nextBlinkMs).toBeGreaterThan(320);
  });

  it('keeps body blink in sync with eye meshes so lipsync cannot drag a blink shut', () => {
    const geometry = new THREE.BufferGeometry();
    const body = new THREE.SkinnedMesh(geometry);
    body.name = 'CC_Base_Body';
    body.morphTargetDictionary = { Eye_Blink_L: 0, Eye_Blink_R: 1 };
    body.morphTargetInfluences = [0.85, 0.85];

    const root = new THREE.Group();
    root.add(body);

    const state = createPortraitBlinkState(0, 0);
    state.phase = 'opening';
    state.phaseStartMs = 0;

    applyPortraitBlink(root, 200, state);
    expect(body.morphTargetInfluences[0]).toBe(0);
    expect(body.morphTargetInfluences[1]).toBe(0);
  });

  it('opens eye meshes after a blink instead of leaving them stuck shut', () => {
    const geometry = new THREE.BufferGeometry();
    const lashes = new THREE.SkinnedMesh(geometry);
    lashes.name = 'Lash_Up_Wavy';
    lashes.morphTargetDictionary = { Eye_Blink_L: 0, Eye_Blink_R: 1 };
    lashes.morphTargetInfluences = [1, 1];

    const root = new THREE.Group();
    root.add(lashes);

    const state = createPortraitBlinkState(0, 0);
    state.phase = 'opening';
    state.phaseStartMs = 0;

    applyPortraitBlink(root, 80, state);
    expect(lashes.morphTargetInfluences[0]).toBeLessThan(0.4);
    expect(lashes.morphTargetInfluences[1]).toBeLessThan(0.4);

    applyPortraitBlink(root, 200, state);
    expect(lashes.morphTargetInfluences[0]).toBe(0);
    expect(lashes.morphTargetInfluences[1]).toBe(0);
  });

  it('applies blink morphs on every mesh that exposes them', () => {
    const geometry = new THREE.BufferGeometry();
    const body = new THREE.SkinnedMesh(geometry);
    body.name = 'CC_Base_Body';
    body.morphTargetDictionary = { Eye_Blink_L: 0, Eye_Blink_R: 1 };
    body.morphTargetInfluences = [0, 0];

    const lashes = new THREE.SkinnedMesh(geometry);
    lashes.name = 'Lash_Up_Wavy';
    lashes.morphTargetDictionary = { Eye_Blink_L: 0 };
    lashes.morphTargetInfluences = [0];

    const root = new THREE.Group();
    root.add(body, lashes);

    const state = createPortraitBlinkState(0, 0);
    state.phase = 'closing';
    state.phaseStartMs = 0;

    applyPortraitBlink(root, 50, state);

    expect(body.morphTargetInfluences[0]).toBeGreaterThan(0.2);
    expect(body.morphTargetInfluences[1]).toBeGreaterThan(0.2);
    expect(lashes.morphTargetInfluences[0]).toBeGreaterThan(0.2);
  });

  it('clears eye blink morphs on reset without touching the body mesh', () => {
    const geometry = new THREE.BufferGeometry();
    const body = new THREE.SkinnedMesh(geometry);
    body.name = 'CC_Base_Body';
    body.morphTargetDictionary = { Eye_Blink_L: 0 };
    body.morphTargetInfluences = [0.6];

    const lashes = new THREE.SkinnedMesh(geometry);
    lashes.name = 'Lash_Up_Wavy';
    lashes.morphTargetDictionary = { Eye_Blink_L: 0 };
    lashes.morphTargetInfluences = [0.9];

    const root = new THREE.Group();
    root.add(body, lashes);
    resetPortraitBlinkMorphs(root);

    expect(body.morphTargetInfluences[0]).toBe(0.6);
    expect(lashes.morphTargetInfluences[0]).toBe(0);
  });
});
