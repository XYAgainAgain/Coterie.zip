import * as THREE from 'three/webgpu';
import { DiceRenderer } from './DiceRenderer';
import { DicePhysics } from './DicePhysics';
import { DiceAudio } from './DiceAudio';
import { DiceEffects } from './DiceEffects';
import { generateDiceTextures, disposeDiceTextures, getDiceMetalness, getCurrentTheme, FACE_VALUES, type FaceMaps } from './DiceTextures';
import { getRollSpeed, rollMode } from './diceConfig';

export class DiceEngine {
  private renderer: DiceRenderer;
  private physics: DicePhysics;
  private audio: DiceAudio;
  private effects: DiceEffects;
  private running = false;
  private disposed = false;
  private startTime = 0;
  private lastFrameTime = 0;
  private faceTextures: FaceMaps[] = [];
  private themeObserver: MutationObserver | null = null;
  private currentBatchId = 0;
  private currentBatchCount = 0;
  private batchImpacted = false;
  private fadeTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private fadeCancelled = { flag: false };
  private physicsAccumulator = 0;
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private diceThemeTimer: ReturnType<typeof setTimeout> | null = null;
  private onDiceThemeEvent = () => {
    if (this.disposed) return;
    if (this.diceThemeTimer) clearTimeout(this.diceThemeTimer);
    this.diceThemeTimer = setTimeout(() => { if (!this.disposed) this.onThemeChange(); }, 80);
  };

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new DiceRenderer(canvas);
    this.physics = new DicePhysics();
    this.audio = new DiceAudio();
    this.effects = new DiceEffects();

    const w = canvas.clientWidth || canvas.width || 800;
    const h = canvas.clientHeight || canvas.height || 600;
    this.physics.setAspect(w / h);

    this.physics.onFirstImpact = (_dieId: number) => {
      if (this.batchImpacted) return;
      this.batchImpacted = true;
      this.audio.playRoll(this.currentBatchCount, undefined, getRollSpeed());
    };

    this.physics.onCollision = (event) => {
      this.audio.playImpact(event.volume);
    };

    console.log('[Dice] Engine created, canvas %d\xD7%d', canvas.width, canvas.height);
  }

  async init(): Promise<void> {
    const backend = 'gpu' in navigator ? 'WebGPU' : 'WebGL2';
    console.log('[Dice] Initializing renderer (%s)...', backend);
    await Promise.all([
      this.renderer.init(),
      this.audio.init(),
    ]);
    console.log('[Dice] Renderer + audio ready');
  }

  async initDemo(): Promise<void> {
    await document.fonts.ready;
    const theme = getCurrentTheme();
    this.faceTextures = generateDiceTextures(theme);
    this.renderer.setLightingTheme(theme);

    this.renderer.createSpinnerCube(this.faceTextures);
    this.renderer.setDieFaceMaps(this.faceTextures);
    this.renderer.warmDiePipelines();
    const pos = this.renderer.getSpinnerWorldPosition();
    console.log('[Dice] Spinner + %d face textures ready (%s theme, world %.1f,%.1f,%.1f)',
      this.faceTextures.length, theme, pos?.x, pos?.y, pos?.z);

    this.themeObserver = new MutationObserver(() => this.onThemeChange());
    this.themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    /* Custom-theme accent/font/metalness edits don't move data-theme, so they re-skin via
       this event instead. Debounced because a color-picker drag fires it rapidly. */
    window.addEventListener('vamp-dice-theme', this.onDiceThemeEvent);

    this.startTime = performance.now() / 1000;
    if (this.reducedMotion || rollMode.value === 'no3d') this.renderer.freezeSpinnerRandom();
    this.start();
    console.log('[Dice] Demo running — click the spinner to spawn dice');
  }

  private onThemeChange(): void {
    const theme = getCurrentTheme();
    console.log('[Dice] Theme changed to %s — regenerating textures', theme);

    const oldTextures = this.faceTextures;
    this.faceTextures = generateDiceTextures(theme);
    this.renderer.setLightingTheme(theme);

    /* Swap materials onto new textures before disposing old ones — avoids
       a one-frame window where RAF renders with disposed GPU resources.
       The shared die set covers every live die in one pass. */
    this.renderer.reskinSpinnerCube(this.faceTextures);
    this.renderer.setDieFaceMaps(this.faceTextures);

    this.renderer.updateMetalness(getDiceMetalness());
    disposeDiceTextures(oldTextures);
  }

  private evictForRoom(needed: number): void {
    const max = this.physics.getMaxDice();
    const current = this.physics.getDiceCount();
    const overflow = current + needed - max;
    if (overflow <= 0) return;

    this.physics.removeOldest(overflow);
    this.renderer.removeOldestCubes(overflow);
    console.log('[Dice] Evicted %d oldest dice to stay at cap %d', overflow, max);
  }

  async spawnFromSpinner(count = 1): Promise<void> {
    if (this.faceTextures.length === 0) return;

    this.audio.resume();
    this.evictForRoom(count);
    /* An interrupted fade leaves the shared materials translucent */
    this.renderer.setDiceOpacity(1);

    this.currentBatchId++;
    this.currentBatchCount = count;
    this.batchImpacted = false;
    const batchId = this.currentBatchId;

    const hand = this.physics.getSpawnPosition();

    const spawnOne = (index: number) => {
      if (this.disposed || this.faceTextures.length === 0) return;
      if (this.currentBatchId !== batchId) return;

      const x = hand.x + (Math.random() - 0.5) * 1.2;
      const z = hand.z + (Math.random() - 0.5) * 1.2;
      const y = hand.y + (Math.random() - 0.5) * 0.5;
      this.physics.spawnDie(x, z, undefined, y);
      this.renderer.createDie();
      /* Mark the shadow dirty on the spawn frame so the first die isn't shadowless for a frame. */
      this.renderer.requestShadowUpdate();
      console.log('[Dice] Spawned die %d/%d (batch #%d), total %d/%d',
        index + 1, count, batchId, this.physics.getDiceCount(), this.physics.getMaxDice());
    };

    if (count <= 3) {
      for (let i = 0; i < count; i++) spawnOne(i);
    } else {
      spawnOne(0);
      await new Promise<void>(resolve => {
        let spawned = 1;
        for (let i = 1; i < count; i++) {
          const delay = (50 + Math.random() * 50) * i;
          setTimeout(() => {
            spawnOne(i);
            if (++spawned === count) resolve();
          }, delay);
        }
      });
    }
  }

  fixDieResults(desiredValues: number[]): void {
    if (this.faceTextures.length === 0) return;

    const saved = this.physics.saveBodyStates();
    this.physics.presimulate();
    const upIndices = this.physics.getUpFaceIndices();
    this.physics.restoreBodyStates(saved);

    const cubes = this.renderer.getCubes();
    for (let i = 0; i < Math.min(cubes.length, desiredValues.length, upIndices.length); i++) {
      const cube = cubes[i];
      if (!Array.isArray(cube.material)) continue;

      const upIdx = upIndices[i];
      const desired = desiredValues[i];
      const currentValueAtUp = FACE_VALUES[upIdx];
      if (currentValueAtUp === desired) continue;

      const desiredIdx = FACE_VALUES.indexOf(desired);
      if (desiredIdx < 0) continue;

      const mats = cube.material as THREE.MeshStandardMaterial[];
      const tmp = mats[upIdx];
      mats[upIdx] = mats[desiredIdx];
      mats[desiredIdx] = tmp;
    }
  }

  fadeDiceOut(delayMs = 3000, durationMs = 600): void {
    this.fadeCancelled = { flag: false };
    const cancel = this.fadeCancelled;

    this.fadeTimeoutId = setTimeout(() => {
      if (cancel.flag || this.disposed) return;
      /* Dice materials are transparent from creation, so the fade is a pure opacity
         (uniform) ramp. The old per-frame needsUpdate forced a material rebuild +
         pipeline compile every frame — the post-roll freeze. */
      const start = performance.now();
      const fade = () => {
        if (cancel.flag || this.disposed) return;
        const t = Math.min(1, (performance.now() - start) / durationMs);
        this.renderer.setDiceOpacity(1 - t);
        if (t < 1) {
          requestAnimationFrame(fade);
        } else {
          this.clearDice();
        }
      };
      requestAnimationFrame(fade);
    }, delayMs);
  }

  clearDice(): void {
    this.fadeCancelled.flag = true;
    if (this.fadeTimeoutId !== null) {
      clearTimeout(this.fadeTimeoutId);
      this.fadeTimeoutId = null;
    }
    this.effects.clear();
    this.physics.clear();
    this.renderer.clearCubes();
    /* One last shadow pass with no casters, or the final shadow freezes on the floor. */
    this.renderer.requestShadowUpdate();
    console.log('[Dice] All dice cleared');
  }

  playRollAudio(diceCount: number): void {
    /* Wait out a suspended context or the first roll plays into silence */
    this.audio.resume().then(() => {
      if (!this.disposed) this.audio.playRoll(diceCount, undefined, getRollSpeed());
    });
  }

  waitForSettle(): Promise<void> {
    return this.physics.waitForSettle();
  }

  getSpinnerScreenPosition(): { x: number; y: number } | null {
    return this.renderer.getSpinnerScreenPosition(
      this.canvas.clientWidth || this.canvas.width,
      this.canvas.clientHeight || this.canvas.height,
    );
  }

  start(): void {
    if (this.running || this.disposed) return;
    this.running = true;
    this.lastFrameTime = performance.now();
    /* Let the WebGPU renderer drive the loop (frame pacing synced to the device). */
    this.renderer.setAnimationLoop(this.loop);
  }

  stop(): void {
    this.running = false;
    this.renderer.setAnimationLoop(null);
  }

  private loop = (): void => {
    if (!this.running || this.disposed) {
      this.renderer.setAnimationLoop(null);
      return;
    }

    const now = performance.now();
    const dt = now - this.lastFrameTime;
    this.lastFrameTime = now;

    const elapsed = now / 1000 - this.startTime;
    if (!this.reducedMotion && rollMode.value !== 'no3d') {
      this.renderer.updateSpinner(elapsed);
    }
    this.renderer.updateLightOrbit(elapsed);

    this.physicsAccumulator += getRollSpeed();
    while (this.physicsAccumulator >= 1) {
      this.physics.step();
      this.physicsAccumulator -= 1;
    }

    this.renderer.syncWithPhysics(this.physics.getBodyTransforms());
    /* Shadows are off-by-default; refresh only while dice are on screen (the spinner casts
       none). Keeps the idle loop free of a per-frame depth pass. */
    if (this.physics.getDiceCount() > 0) this.renderer.requestShadowUpdate();
    this.effects.tick(dt);
    this.renderer.render();
  };

  handleResize(width: number, height: number): void {
    this.renderer.handleResize(width, height);
    this.physics.setAspect(width / height);
  }

  reset(): void {
    this.stop();
    this.effects.clear();
    this.physics.clear();
    this.renderer.clearCubes();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    /* Cancel any in-flight fade before tearing down GPU resources */
    this.fadeCancelled.flag = true;
    if (this.fadeTimeoutId !== null) {
      clearTimeout(this.fadeTimeoutId);
      this.fadeTimeoutId = null;
    }
    this.themeObserver?.disconnect();
    this.themeObserver = null;
    window.removeEventListener('vamp-dice-theme', this.onDiceThemeEvent);
    if (this.diceThemeTimer) { clearTimeout(this.diceThemeTimer); this.diceThemeTimer = null; }
    this.effects.clear();
    disposeDiceTextures(this.faceTextures);
    this.faceTextures = [];
    this.physics.clear();
    this.renderer.dispose();
    this.audio.dispose();
    console.log('[Dice] Engine disposed');
  }
}
