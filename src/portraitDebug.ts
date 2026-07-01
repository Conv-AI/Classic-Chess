import * as THREE from 'three';
import { debugLog } from './debugLog';
import { isMobilePortrait } from './isMobilePortrait';

const SCOPE = 'PortraitDebug';

export type PortraitPixelClass = 'empty_frame' | 'black_frame' | 'visible_frame';

export type MaterialInventory = {
  physical: number;
  standard: number;
  basic: number;
  other: number;
  withMap: number;
  withoutMap: number;
  skinSamples: string[];
};

let canvasMountCount = 0;

export function nextCanvasMountCount(): number {
  canvasMountCount += 1;
  return canvasMountCount;
}

export function getPortraitDebugFlag(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('portraitDebug');
}

export function shouldUseLeilaFallbackModel(coachId: string): boolean {
  return coachId === 'leila' && getPortraitDebugFlag() === 'leila' && isMobilePortrait();
}

export function logPortraitBootstrap(opts: {
  coachId: string;
  modelFile: string;
  mountCount: number;
  isMobile: boolean;
  characterWindowEl: HTMLElement | null;
  canvasEl: HTMLCanvasElement | null;
  characterReady: boolean;
  bgColor: string;
  gl?: THREE.WebGLRenderer;
}): void {
  const { characterWindowEl, canvasEl, gl } = opts;
  const winRect = characterWindowEl?.getBoundingClientRect();
  const canvasRect = canvasEl?.getBoundingClientRect();
  const canvasStyle = canvasEl ? window.getComputedStyle(canvasEl) : null;
  const winClasses = characterWindowEl?.className ?? '';
  const webgl = gl?.getContext();
  const renderer = webgl ? String(webgl.getParameter(webgl.RENDERER)) : 'n/a';
  const maxTex = webgl ? String(webgl.getParameter(webgl.MAX_TEXTURE_SIZE)) : 'n/a';

  const backingW = canvasEl?.width ?? 0;
  const backingH = canvasEl?.height ?? 0;

  debugLog(
    SCOPE,
    `bootstrap coach=${opts.coachId} model=${opts.modelFile} mount=${opts.mountCount} mobile=${opts.isMobile} ` +
    `ready=${opts.characterReady} win=${Math.round(winRect?.width ?? 0)}x${Math.round(winRect?.height ?? 0)} ` +
    `canvas=${Math.round(canvasRect?.width ?? 0)}x${Math.round(canvasRect?.height ?? 0)} ` +
    `backing=${backingW}x${backingH} ` +
    `css opacity=${canvasStyle?.opacity ?? 'n/a'} visibility=${canvasStyle?.visibility ?? 'n/a'} ` +
    `display=${canvasStyle?.display ?? 'n/a'} zIndex=${canvasStyle?.zIndex ?? 'n/a'} ` +
    `classes="${winClasses}" gl="${renderer}" maxTex=${maxTex}`,
  );
}

export function logPortraitWebGLCapabilities(gl: THREE.WebGLRenderer): void {
  const caps = gl.capabilities;
  debugLog(
    SCOPE,
    `webgl isWebGL2=${caps.isWebGL2} maxTextures=${caps.maxTextures} maxVertexTextures=${caps.maxVertexTextures}`,
  );
}

export function attachPortraitWebGLContextListeners(gl: THREE.WebGLRenderer): void {
  const canvas = gl.domElement;
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    debugLog(SCOPE, 'WARN webglcontextlost');
  });
  canvas.addEventListener('webglcontextrestored', () => {
    debugLog(SCOPE, 'webglcontextrestored');
  });
}

export function logPortraitSceneGraph(root: THREE.Object3D): void {
  let meshCount = 0;
  let visibleMeshes = 0;
  let hiddenMeshes = 0;
  let skinWithoutMap = 0;
  let physical = 0;
  let standard = 0;
  let basic = 0;

  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    meshCount += 1;
    if (mesh.visible) visibleMeshes += 1;
    else hiddenMeshes += 1;

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (!material) continue;
      if ((material as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial) physical += 1;
      else if ((material as THREE.MeshStandardMaterial).isMeshStandardMaterial) standard += 1;
      else if ((material as THREE.MeshBasicMaterial).isMeshBasicMaterial) basic += 1;

      const meshName = mesh.name || '';
      const materialName = material.name || '';
      const skinLike = /skin|head|face|body/i.test(meshName) || /skin|head|face|body/i.test(materialName);
      const std = material as THREE.MeshStandardMaterial;
      if (skinLike && !('map' in std && std.map)) skinWithoutMap += 1;
    }
  });

  debugLog(
    SCOPE,
    `sceneGraph meshes=${meshCount} visible=${visibleMeshes} hidden=${hiddenMeshes} ` +
    `physical=${physical} standard=${standard} basic=${basic} skinWithoutMap=${skinWithoutMap}`,
  );
}

export function logPortraitReadyState(opts: {
  coachId: string;
  characterWindowEl: HTMLElement | null;
  characterReady: boolean;
}): void {
  const canvasEl = opts.characterWindowEl?.querySelector('canvas');
  const canvasStyle = canvasEl ? window.getComputedStyle(canvasEl) : null;
  const hasLoading = Boolean(opts.characterWindowEl?.querySelector('.character-loading'));
  debugLog(
    SCOPE,
    `ready coach=${opts.coachId} state=${opts.characterReady} isReadyClass=${opts.characterWindowEl?.classList.contains('is-ready') ?? false} ` +
    `loadingOverlay=${hasLoading} canvasOpacity=${canvasStyle?.opacity ?? 'n/a'}`,
  );
}

export function logPortraitEnvironment(opts: {
  hasEnvironment: boolean;
  environmentIntensity: number;
  enablePostProcessing: boolean;
  enableEnvironment: boolean;
}): void {
  debugLog(
    SCOPE,
    `env loaded=${opts.hasEnvironment} intensity=${opts.environmentIntensity.toFixed(3)} ` +
    `postProcessing=${opts.enablePostProcessing} enableEnvironment=${opts.enableEnvironment}`,
  );
}

export function warnPortraitEnvironmentMissing(): void {
  debugLog(SCOPE, 'WARN env_missing — scene.environment still null after 2s');
}

export function collectMaterialInventory(root: THREE.Object3D): MaterialInventory {
  const inventory: MaterialInventory = {
    physical: 0,
    standard: 0,
    basic: 0,
    other: 0,
    withMap: 0,
    withoutMap: 0,
    skinSamples: [],
  };

  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (!material) continue;
      if ((material as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial) inventory.physical += 1;
      else if ((material as THREE.MeshStandardMaterial).isMeshStandardMaterial) inventory.standard += 1;
      else if ((material as THREE.MeshBasicMaterial).isMeshBasicMaterial) inventory.basic += 1;
      else inventory.other += 1;

      const std = material as THREE.MeshStandardMaterial;
      if ('map' in std && std.map) inventory.withMap += 1;
      else inventory.withoutMap += 1;

      const meshName = mesh.name || '';
      const materialName = material.name || '';
      if (/skin|head|face|body/i.test(meshName) || /skin|head|face|body/i.test(materialName)) {
        if (inventory.skinSamples.length < 3) {
          const emissive = 'emissive' in std ? `#${std.emissive.getHexString()}` : 'n/a';
          const envMap = 'envMapIntensity' in std ? String(std.envMapIntensity) : 'n/a';
          inventory.skinSamples.push(
            `${meshName}:${materialName} em=${emissive} env=${envMap} metal=${'metalness' in std ? std.metalness.toFixed(2) : 'n/a'}`,
          );
        }
      }
    }
  });

  return inventory;
}

export function logPortraitMaterialTune(phase: 'before' | 'after', inventory: MaterialInventory, mobileSafe: boolean): void {
  debugLog(
    SCOPE,
    `materials ${phase} mobile=${mobileSafe} physical=${inventory.physical} standard=${inventory.standard} ` +
    `basic=${inventory.basic} other=${inventory.other} withMap=${inventory.withMap} withoutMap=${inventory.withoutMap} ` +
    `skin=[${inventory.skinSamples.join('; ')}]`,
  );
}

function colorDistance(a: [number, number, number], b: [number, number, number]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

function parseHexColor(hex: string): [number, number, number] | null {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return null;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  if ([r, g, b].some((v) => Number.isNaN(v))) return null;
  return [r, g, b];
}

export function classifyPortraitPixel(rgb: [number, number, number], bgColor: string): PortraitPixelClass {
  if (rgb[0] < 12 && rgb[1] < 12 && rgb[2] < 12) return 'black_frame';
  const bg = parseHexColor(bgColor);
  if (bg && colorDistance(rgb, bg) < 28) return 'empty_frame';
  return 'visible_frame';
}

export function rgbToHex(rgb: [number, number, number]): string {
  return `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export function probePortraitCenterPixel(
  gl: THREE.WebGLRenderer,
  bgColor: string,
): { rgb: [number, number, number]; hex: string; classify: PortraitPixelClass } | null {
  const canvas = gl.domElement;
  const width = canvas.width;
  const height = canvas.height;
  if (width < 2 || height < 2) return null;

  const x = Math.floor(width / 2);
  const y = Math.floor(height / 2);
  const pixelBuffer = new Uint8Array(4);
  const webgl = gl.getContext();
  if (!webgl) return null;
  webgl.readPixels(x, y, 1, 1, webgl.RGBA, webgl.UNSIGNED_BYTE, pixelBuffer);
  const rgb: [number, number, number] = [pixelBuffer[0], pixelBuffer[1], pixelBuffer[2]];
  const hex = rgbToHex(rgb);
  const classify = classifyPortraitPixel(rgb, bgColor);
  return { rgb, hex, classify };
}

function canvasOpacityLabel(canvasEl: HTMLCanvasElement | null | undefined): string {
  if (!canvasEl) return 'n/a';
  return window.getComputedStyle(canvasEl).opacity || 'n/a';
}

export function logPortraitFrameProbe(
  frame: number,
  probe: { hex: string; classify: PortraitPixelClass },
  renderInfo?: { triangles: number; calls: number },
  canvasEl?: HTMLCanvasElement | null,
): void {
  const extra = renderInfo
    ? ` triangles=${renderInfo.triangles} calls=${renderInfo.calls}`
    : '';
  const opacity = canvasOpacityLabel(canvasEl);
  const level = probe.classify === 'visible_frame' ? 'info' : 'warn';
  const prefix = level === 'warn' ? 'WARN ' : '';
  debugLog(SCOPE, `${prefix}frame${frame} classify=${probe.classify} center=${probe.hex} canvasOpacity=${opacity}${extra}`);
}

export function logPortraitDelayedProbe(
  delayMs: number,
  probe: { hex: string; classify: PortraitPixelClass },
  renderInfo?: { triangles: number; calls: number },
  canvasEl?: HTMLCanvasElement | null,
): void {
  const extra = renderInfo
    ? ` triangles=${renderInfo.triangles} calls=${renderInfo.calls}`
    : '';
  const opacity = canvasOpacityLabel(canvasEl);
  const backing = canvasEl ? `${canvasEl.width}x${canvasEl.height}` : 'n/a';
  const prefix = probe.classify === 'visible_frame' ? '' : 'WARN ';
  debugLog(
    SCOPE,
    `${prefix}delayedProbe t=${delayMs}ms classify=${probe.classify} center=${probe.hex} ` +
    `canvasOpacity=${opacity} backing=${backing}${extra}`,
  );
}

export function logPortraitFrustum(
  root: THREE.Object3D,
  camera: THREE.Camera,
): void {
  const box = new THREE.Box3().setFromObject(root);
  const frustum = new THREE.Frustum();
  const matrix = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  frustum.setFromProjectionMatrix(matrix);
  const inFrustum = frustum.intersectsBox(box);
  debugLog(
    SCOPE,
    `frustum inFrustum=${inFrustum} boxMin=(${box.min.x.toFixed(2)},${box.min.y.toFixed(2)},${box.min.z.toFixed(2)}) ` +
    `boxMax=(${box.max.x.toFixed(2)},${box.max.y.toFixed(2)},${box.max.z.toFixed(2)})`,
  );
}

export function isPhysicalMaterial(material: THREE.Material): material is THREE.MeshPhysicalMaterial {
  return (material as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial === true;
}
