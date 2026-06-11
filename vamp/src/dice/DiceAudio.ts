/*
 * Plays full roll clips from /assets/audio/dice/{surface}/.
 * Files: {1..6}d6-{a,b,c}.ogg + manyd6-{a,b,c}.ogg
 * Triggered on first surface impact; playbackRate can be matched
 * to pre-simulated roll duration for automatic tonal variation.
 *
 * Volume, mute, and surface are driven by device-tier signals in state/settings.ts.
 * Import direction: dice imports from state, never the reverse, so lazy-loading holds.
 */

import { effect } from '@preact/signals';
import { diceVolume, diceMuted, diceSurface, type DiceSurface } from '../state/settings';

const FALLBACK_SURFACE: DiceSurface = 'hardwood';
const surfacePath = (s: DiceSurface) => `/assets/audio/dice/${s}/`;

const VARIANTS = ['a', 'b', 'c'] as const;
const TIERS = [1, 2, 3, 4, 5, 6, 'many'] as const;
type Tier = (typeof TIERS)[number];

function tierForCount(n: number): Tier {
  if (n >= 7) return 'many';
  if (n < 1) return 1;
  return n as 1 | 2 | 3 | 4 | 5 | 6;
}

export class DiceAudio {
  private ctx: AudioContext | null = null;
  private masterGain!: GainNode;
  private sfxGain!: GainNode;
  private compressor!: DynamicsCompressorNode;

  /* Keyed by "3d6-b" etc. */
  private buffers = new Map<string, AudioBuffer>();

  private loaded = false;
  private disposed = false;
  private loadedSurface: DiceSurface | null = null;
  private disposers: Array<() => void> = [];

  async init(): Promise<void> {
    if (this.ctx) return; /* guard against a double init double-registering effects */
    this.ctx = new AudioContext();

    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -12;
    this.compressor.knee.value = 6;
    this.compressor.ratio.value = 4;
    this.compressor.connect(this.ctx.destination);

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = diceMuted.value ? 0 : diceVolume.value;
    this.masterGain.connect(this.compressor);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 1;
    this.sfxGain.connect(this.masterGain);

    const initialSurface = diceSurface.value;
    await this.loadBuffers(initialSurface);
    /* If the user switched surface while the first load was in flight, honor the latest.
       Compared against the captured initial value (not loadedSurface) so a hardwood
       fallback can't spin into a reload loop. */
    if (!this.disposed && diceSurface.value !== initialSurface) {
      await this.loadBuffers(diceSurface.value);
    }

    /* Live volume/mute: master gain follows the signals mid-session. */
    this.disposers.push(effect(() => {
      const g = diceMuted.value ? 0 : diceVolume.value;
      if (this.masterGain) this.masterGain.gain.value = g;
    }));

    /* Surface swap: reload buffers lazily when the selection changes. The first run sees
       the already-loaded surface and skips. */
    this.disposers.push(effect(() => {
      const s = diceSurface.value;
      if (!this.disposed && this.loadedSurface !== null && this.loadedSurface !== s) {
        void this.loadBuffers(s);
      }
    }));

    console.log('[Dice Audio] Initialized — %d clips loaded (%s)', this.buffers.size, this.loadedSurface);
  }

  private async loadBuffers(surface: DiceSurface): Promise<void> {
    if (!this.ctx) return;

    const entries: Array<{ key: string; file: string }> = [];
    for (const tier of TIERS) {
      for (const v of VARIANTS) {
        const key = `${tier}d6-${v}`;
        entries.push({ key, file: `${key}.ogg` });
      }
    }

    const path = surfacePath(surface);
    const results = await Promise.all(
      entries.map(async ({ key, file }) => {
        try {
          const res = await fetch(path + file);
          if (!res.ok) return null;
          const buf = await this.ctx!.decodeAudioData(await res.arrayBuffer());
          return { key, buf };
        } catch {
          return null;
        }
      }),
    );

    if (this.disposed) return;

    const next = new Map<string, AudioBuffer>();
    for (const r of results) {
      if (r) next.set(r.key, r.buf);
    }

    /* Surface assets missing entirely → fall back to hardwood (safety net; all six ship). */
    if (next.size === 0 && surface !== FALLBACK_SURFACE) {
      console.warn('[Dice Audio] No clips for surface "%s"; falling back to %s', surface, FALLBACK_SURFACE);
      await this.loadBuffers(FALLBACK_SURFACE);
      return;
    }

    this.buffers = next;
    this.loadedSurface = surface;
    this.loaded = true;
    console.log('[Dice Audio] Loaded %d clips for surface "%s"', next.size, surface);
  }

  /* Returns the resume promise so playback can wait for a suspended
     context (autoplay policy) instead of silently dropping the first roll */
  resume(): Promise<void> {
    if (this.ctx?.state === 'suspended') return this.ctx.resume();
    return Promise.resolve();
  }

  /**
   * Play a roll clip matched to dice count.
   * If rollDuration is provided (from pre-simulation), playbackRate
   * is adjusted so the clip matches the physics timing.
   * Without it, a random rate variation is applied.
   */
  playRoll(diceCount: number, rollDuration?: number, speedMultiplier = 1): void {
    if (!this.loaded || !this.ctx) return;

    const tier = tierForCount(diceCount);
    const variant = VARIANTS[Math.floor(Math.random() * VARIANTS.length)];
    const key = `${tier}d6-${variant}`;
    const buffer = this.buffers.get(key);
    if (!buffer) return;

    let rate: number;
    if (rollDuration && rollDuration > 0) {
      rate = (buffer.duration / rollDuration) * speedMultiplier;
    } else {
      rate = (0.85 + Math.random() * 0.3) * speedMultiplier;
    }
    rate = Math.max(0.7, Math.min(2.0, rate));

    this.playBuffer(buffer, 0.8, rate);
    console.log('[Dice Audio] Playing %s (rate %.2f, speed %.1f×)', key, rate, speedMultiplier);
  }

  private playBuffer(buffer: AudioBuffer, volume: number, pitch: number): void {
    if (this.disposed || !this.ctx) return;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = pitch;

    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(this.sfxGain);

    source.start(this.ctx.currentTime);
  }

  /* Per-impact sounds for individual dice-to-surface/dice-to-dice collisions.
     Requires impact clips; stubbed until organized. */
  playImpact(volume: number): void {
    if (!this.loaded || !this.ctx) return;
    // TODO: load and play individual impact clips when available
    void volume;
  }

  dispose(): void {
    this.disposed = true;
    for (const d of this.disposers) d();
    this.disposers = [];
    this.ctx?.close();
    this.ctx = null;
    this.buffers.clear();
    console.log('[Dice Audio] Disposed');
  }
}
