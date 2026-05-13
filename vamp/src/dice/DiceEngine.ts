import * as THREE from 'three/webgpu';
import { DiceRenderer } from './DiceRenderer';
import { DicePhysics } from './DicePhysics';
import { DiceAudio } from './DiceAudio';
import { DiceEffects } from './DiceEffects';
import { generateDiceTextures, disposeDiceTextures, getCurrentTheme, type FaceMaps } from './DiceTextures';

export class DiceEngine {
  private renderer: DiceRenderer;
  private physics: DicePhysics;
  private audio: DiceAudio;
  private effects: DiceEffects;
  private running = false;
  private disposed = false;
  private animationFrameId: number | null = null;
  private startTime = 0;
  private lastFrameTime = 0;
  private faceTextures: FaceMaps[] = [];
  private themeObserver: MutationObserver | null = null;
  private currentBatchId = 0;
  private currentBatchCount = 0;
  private batchImpacted = false;

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
      this.audio.playRoll(this.currentBatchCount);
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
    const pos = this.renderer.getSpinnerWorldPosition();
    console.log('[Dice] Spinner + %d face textures ready (%s theme, world %.1f,%.1f,%.1f)',
      this.faceTextures.length, theme, pos?.x, pos?.y, pos?.z);

    this.themeObserver = new MutationObserver(() => this.onThemeChange());
    this.themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    this.startTime = performance.now() / 1000;
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
       a one-frame window where RAF renders with disposed GPU resources */
    this.renderer.reskinSpinnerCube(this.faceTextures);
    for (const die of this.renderer.getCubes()) {
      if (!Array.isArray(die.material)) continue;
      die.material.forEach((mat, i) => {
        const maps = this.faceTextures[i];
        if (!maps || !(mat instanceof THREE.MeshStandardMaterial)) return;
        mat.map = maps.color;
        mat.bumpMap = maps.bump;
        mat.roughnessMap = maps.roughness;
        mat.needsUpdate = true;
      });
    }

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

  spawnFromSpinner(count = 1): void {
    if (this.faceTextures.length === 0) return;

    this.audio.resume();
    this.evictForRoom(count);

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
      this.renderer.createDie(this.faceTextures);
      console.log('[Dice] Spawned die %d/%d (batch #%d), total %d/%d',
        index + 1, count, batchId, this.physics.getDiceCount(), this.physics.getMaxDice());
    };

    if (count <= 3) {
      for (let i = 0; i < count; i++) spawnOne(i);
    } else {
      spawnOne(0);
      for (let i = 1; i < count; i++) {
        const delay = 50 + Math.random() * 50;
        setTimeout(() => spawnOne(i), delay * i);
      }
    }
  }

  clearDice(): void {
    this.effects.clear();
    this.physics.clear();
    this.renderer.clearCubes();
    console.log('[Dice] All dice cleared');
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
    this.loop();
  }

  stop(): void {
    this.running = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private loop = (): void => {
    if (!this.running || this.disposed) return;

    const now = performance.now();
    const dt = now - this.lastFrameTime;
    this.lastFrameTime = now;

    const elapsed = now / 1000 - this.startTime;
    this.renderer.updateSpinner(elapsed);
    this.renderer.updateLightOrbit(elapsed);
    this.physics.step();
    this.renderer.syncWithPhysics(this.physics.getBodyTransforms());
    this.effects.tick(dt);
    this.renderer.render();

    this.animationFrameId = requestAnimationFrame(this.loop);
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
    this.themeObserver?.disconnect();
    this.themeObserver = null;
    this.effects.clear();
    disposeDiceTextures(this.faceTextures);
    this.faceTextures = [];
    this.physics.clear();
    this.renderer.dispose();
    this.audio.dispose();
    console.log('[Dice] Engine disposed');
  }
}
