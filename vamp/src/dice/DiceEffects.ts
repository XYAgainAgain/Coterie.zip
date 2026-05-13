import * as THREE from 'three/webgpu';

interface ActiveEffect {
  update(dt: number): boolean;
  cleanup(): void;
}

export class DiceEffects {
  private effects: ActiveEffect[] = [];

  glow(mesh: THREE.Mesh, options?: {
    color?: number;
    duration?: number;
    intensity?: number;
  }): void {
    const color = options?.color ?? 0xffd166;
    const duration = options?.duration ?? 900;
    const peak = options?.intensity ?? 1.2;
    const raw = mesh.material;
    if (!raw || Array.isArray(raw) || !(raw instanceof THREE.MeshStandardMaterial)) return;
    const mat = raw;
    const origEmissive = mat.emissive.clone();
    const origIntensity = mat.emissiveIntensity;
    let elapsed = 0;

    this.effects.push({
      update(dt) {
        elapsed += dt;
        const t = Math.min(elapsed / duration, 1);
        /* Fast attack (15%), slow ease-out release */
        const strength = t < 0.15
          ? t / 0.15
          : 1 - ((t - 0.15) / 0.85) ** 2;
        mat.emissive.set(color);
        mat.emissiveIntensity = peak * Math.max(0, strength);
        return t >= 1;
      },
      cleanup() {
        mat.emissive.copy(origEmissive);
        mat.emissiveIntensity = origIntensity;
      },
    });
  }

  scalePulse(mesh: THREE.Mesh, options?: {
    peak?: number;
    duration?: number;
  }): void {
    const peak = options?.peak ?? 1.25;
    const duration = options?.duration ?? 500;
    let elapsed = 0;

    this.effects.push({
      update(dt) {
        elapsed += dt;
        const t = Math.min(elapsed / duration, 1);
        const scale = 1 + (peak - 1) * Math.sin(t * Math.PI);
        mesh.scale.set(scale, scale, scale);
        return t >= 1;
      },
      cleanup() {
        mesh.scale.set(1, 1, 1);
      },
    });
  }

  /* Call once per frame with delta time in ms */
  tick(dt: number): void {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const done = this.effects[i].update(dt);
      if (done) {
        this.effects[i].cleanup();
        this.effects.splice(i, 1);
      }
    }
  }

  clear(): void {
    for (const effect of this.effects) effect.cleanup();
    this.effects = [];
  }

  get activeCount(): number {
    return this.effects.length;
  }
}
