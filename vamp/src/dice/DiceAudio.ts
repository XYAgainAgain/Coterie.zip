/*
 * Plays full roll clips from /assets/audio/dice/hardwood/.
 * Files: {1..6}d6-{a,b,c}.ogg + manyd6-{a,b,c}.ogg
 * Triggered on first surface impact; playbackRate can be matched
 * to pre-simulated roll duration for automatic tonal variation.
 */

const ASSET_PATH = '/assets/audio/dice/hardwood/';
const VARIANTS = ['a', 'b', 'c'] as const;
const TIERS = [1, 2, 3, 4, 5, 6, 'many'] as const;
type Tier = (typeof TIERS)[number];

interface AudioPrefs {
  masterVolume: number;
  sfxVolume: number;
  sfxMuted: boolean;
}

const DEFAULT_PREFS: AudioPrefs = {
  masterVolume: 0.8,
  sfxVolume: 1.0,
  sfxMuted: false,
};

function loadPrefs(): AudioPrefs {
  try {
    const raw = localStorage.getItem('coterie-audio-prefs');
    if (!raw) return { ...DEFAULT_PREFS };
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

function savePrefs(prefs: AudioPrefs): void {
  try { localStorage.setItem('coterie-audio-prefs', JSON.stringify(prefs)); } catch {}
}

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

  private prefs: AudioPrefs;
  private loaded = false;
  private disposed = false;

  constructor() {
    this.prefs = loadPrefs();
  }

  async init(): Promise<void> {
    this.ctx = new AudioContext();

    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -12;
    this.compressor.knee.value = 6;
    this.compressor.ratio.value = 4;
    this.compressor.connect(this.ctx.destination);

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.prefs.masterVolume;
    this.masterGain.connect(this.compressor);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = this.prefs.sfxMuted ? 0 : this.prefs.sfxVolume;
    this.sfxGain.connect(this.masterGain);

    await this.loadBuffers();
    console.log('[Dice Audio] Initialized — %d clips loaded', this.buffers.size);
  }

  private async loadBuffers(): Promise<void> {
    if (!this.ctx) return;

    const entries: Array<{ key: string; file: string }> = [];
    for (const tier of TIERS) {
      for (const v of VARIANTS) {
        const key = `${tier}d6-${v}`;
        entries.push({ key, file: `${key}.ogg` });
      }
    }

    const results = await Promise.all(
      entries.map(async ({ key, file }) => {
        try {
          const res = await fetch(ASSET_PATH + file);
          if (!res.ok) return null;
          const buf = await this.ctx!.decodeAudioData(await res.arrayBuffer());
          return { key, buf };
        } catch {
          return null;
        }
      }),
    );

    for (const r of results) {
      if (r) this.buffers.set(r.key, r.buf);
    }
    this.loaded = true;
  }

  resume(): void {
    if (this.ctx?.state === 'suspended') {
      this.ctx.resume();
    }
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
     Requires impact clips in /assets/audio/dice/impacts/ -- stubbed until we have them. */
  playImpact(volume: number): void {
    if (!this.loaded || !this.ctx || this.prefs.sfxMuted) return;
    // TODO: load and play individual impact clips when available
    void volume;
  }

  setMasterVolume(v: number): void {
    this.prefs.masterVolume = v;
    if (this.masterGain) this.masterGain.gain.value = v;
    savePrefs(this.prefs);
  }

  setSfxMuted(muted: boolean): void {
    this.prefs.sfxMuted = muted;
    if (this.sfxGain) this.sfxGain.gain.value = muted ? 0 : this.prefs.sfxVolume;
    savePrefs(this.prefs);
  }

  dispose(): void {
    this.disposed = true;
    this.ctx?.close();
    this.ctx = null;
    this.buffers.clear();
    console.log('[Dice Audio] Disposed');
  }
}
