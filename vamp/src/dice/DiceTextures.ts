import * as THREE from 'three/webgpu';

const TEX_SIZE = 256;

/* Top-level material tuning — tweak these to adjust the feel */
export const DICE_MATERIAL = {
  bumpScale: 0.18,
  metalness: 0.3,
  bodyRoughness: 0.69,
  numeralRoughness: 0.10,
  bumpNeutral: 0x80,
  bumpEdge: 0x99,
  bumpNumeral: 0xe8,
  edgeInsetRatio: 0.06,
  cornerRadius: 0.08,
} as const;

const FALLBACKS: Record<string, { body: string; numeral: string; font: string }> = {
  night:  { body: '#96031a', numeral: '#faa916', font: 'Metamorphous, serif' },
  sunset: { body: '#53354A', numeral: '#ff7a6b', font: '"IM Fell English SC", serif' },
  abyss:  { body: '#070707', numeral: '#A88BFF', font: 'Sinistre, fantasy' },
};

export const FACE_VALUES = [2, 5, 1, 6, 3, 4];

interface ResolvedTheme {
  bodyColor: string;
  numeralColor: string;
  fontFamily: string;
}

function resolveTheme(themeName: string): ResolvedTheme {
  const fallback = FALLBACKS[themeName] ?? FALLBACKS.night;
  const styles = getComputedStyle(document.documentElement);
  const body = styles.getPropertyValue('--v-dice-body').trim();
  const numeral = styles.getPropertyValue('--v-dice-numeral').trim();
  return {
    bodyColor: body || fallback.body,
    numeralColor: numeral || fallback.numeral,
    fontFamily: fallback.font,
  };
}

export function getCurrentTheme(): string {
  return document.documentElement.getAttribute('data-theme') ?? 'night';
}

function fontSpec(theme: ResolvedTheme): string {
  return `bold ${Math.floor(TEX_SIZE * 0.55)}px ${theme.fontFamily}`;
}

function drawNumeral(ctx: CanvasRenderingContext2D, value: number, font: string): void {
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const yNudge = TEX_SIZE * 0.55 * 0.04;
  ctx.fillText(String(value), TEX_SIZE / 2, TEX_SIZE / 2 + yNudge);
}

function createColorCanvas(value: number, theme: ResolvedTheme): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = TEX_SIZE;
  canvas.height = TEX_SIZE;
  const ctx = canvas.getContext('2d')!;
  const M = DICE_MATERIAL;

  ctx.fillStyle = theme.numeralColor;
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);

  const inset = TEX_SIZE * M.edgeInsetRatio;
  const r = TEX_SIZE * M.cornerRadius;
  ctx.fillStyle = theme.bodyColor;
  ctx.beginPath();
  ctx.roundRect(inset, inset, TEX_SIZE - inset * 2, TEX_SIZE - inset * 2, r);
  ctx.fill();

  ctx.fillStyle = theme.numeralColor;
  drawNumeral(ctx, value, fontSpec(theme));

  return canvas;
}

function createBumpCanvas(value: number, theme: ResolvedTheme): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = TEX_SIZE;
  canvas.height = TEX_SIZE;
  const ctx = canvas.getContext('2d')!;
  const M = DICE_MATERIAL;

  const hex = (v: number) => `rgb(${v},${v},${v})`;

  ctx.fillStyle = hex(M.bumpEdge);
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);

  const inset = TEX_SIZE * M.edgeInsetRatio;
  const r = TEX_SIZE * M.cornerRadius;
  ctx.fillStyle = hex(M.bumpNeutral);
  ctx.beginPath();
  ctx.roundRect(inset, inset, TEX_SIZE - inset * 2, TEX_SIZE - inset * 2, r);
  ctx.fill();

  ctx.fillStyle = hex(M.bumpNumeral);
  drawNumeral(ctx, value, fontSpec(theme));

  return canvas;
}

function createRoughnessCanvas(value: number, theme: ResolvedTheme): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = TEX_SIZE;
  canvas.height = TEX_SIZE;
  const ctx = canvas.getContext('2d')!;
  const M = DICE_MATERIAL;

  const bodyHex = Math.round(M.bodyRoughness * 255);
  const numeralHex = Math.round(M.numeralRoughness * 255);

  ctx.fillStyle = `rgb(${bodyHex},${bodyHex},${bodyHex})`;
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);

  ctx.fillStyle = `rgb(${numeralHex},${numeralHex},${numeralHex})`;
  drawNumeral(ctx, value, fontSpec(theme));

  return canvas;
}

function canvasToTexture(canvas: HTMLCanvasElement, srgb: boolean): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

export interface FaceMaps {
  color: THREE.CanvasTexture;
  bump: THREE.CanvasTexture;
  roughness: THREE.CanvasTexture;
}

export function generateDiceTextures(themeName?: string): FaceMaps[] {
  const theme = resolveTheme(themeName ?? getCurrentTheme());

  return FACE_VALUES.map(value => ({
    color: canvasToTexture(createColorCanvas(value, theme), true),
    bump: canvasToTexture(createBumpCanvas(value, theme), false),
    roughness: canvasToTexture(createRoughnessCanvas(value, theme), false),
  }));
}

export function disposeDiceTextures(textures: FaceMaps[]): void {
  for (const t of textures) {
    t.color.dispose();
    t.bump.dispose();
    t.roughness.dispose();
  }
}
