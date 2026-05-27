import * as CANNON from 'cannon-es';

const GRAVITY = -55;
const DICE_MASS = 1;
const DICE_SIZE = 1;
const TIMESTEP = 1 / 60;
const SETTLED_THRESHOLD = 0.01;

const DICE_LINEAR_DAMPING = 0.07;
const DICE_ANGULAR_DAMPING = 0.05;

const FLOOR_FRICTION = 0.2;
const FLOOR_RESTITUTION = 0.5;
const DICE_FRICTION = 0.1;
const DICE_RESTITUTION = 0.6;
const WALL_FRICTION = 0.1;
const WALL_RESTITUTION = 0.85;

/* Slightly inside camera frustum (FOV 24° at Y=40 sees ±8.5 units) so bounces are visible */
const FRUSTUM_SIZE = 16.5;
const WALL_HEIGHT = 20;
const WALL_THICKNESS = 2;
const MAX_DICE = 69;

const THROW_SPEED = 18;
const THROW_SPIN = 25;

const COLLIDE_MIN_IMPACT = 1.5;
const COLLIDE_MAX_IMPACT = 12;
const COLLIDE_COOLDOWN_MS = 60;

export interface PhysicsBody {
  body: CANNON.Body;
  id: number;
}

export interface CollisionEvent {
  dieId: number;
  volume: number;
}

export class DicePhysics {
  readonly world: CANNON.World;
  private bodies: PhysicsBody[] = [];
  private nextId = 0;
  private impactedIds = new Set<number>();
  private lastCollideTime = new Map<number, number>();
  private aspect = 16 / 9;

  onFirstImpact: ((dieId: number) => void) | null = null;
  onCollision: ((event: CollisionEvent) => void) | null = null;

  private readonly diceMaterial: CANNON.Material;
  private readonly floorMaterial: CANNON.Material;
  private readonly wallMaterial: CANNON.Material;

  constructor() {
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, GRAVITY, 0) });
    this.world.broadphase = new CANNON.NaiveBroadphase();
    (this.world.solver as CANNON.GSSolver).iterations = 30;
    this.world.allowSleep = true;

    this.diceMaterial = new CANNON.Material('dice');
    this.floorMaterial = new CANNON.Material('floor');
    this.wallMaterial = new CANNON.Material('wall');

    this.world.addContactMaterial(new CANNON.ContactMaterial(
      this.diceMaterial, this.floorMaterial,
      { friction: FLOOR_FRICTION, restitution: FLOOR_RESTITUTION },
    ));
    this.world.addContactMaterial(new CANNON.ContactMaterial(
      this.diceMaterial, this.diceMaterial,
      { friction: DICE_FRICTION, restitution: DICE_RESTITUTION },
    ));
    this.world.addContactMaterial(new CANNON.ContactMaterial(
      this.diceMaterial, this.wallMaterial,
      { friction: WALL_FRICTION, restitution: WALL_RESTITUTION },
    ));

    this.addGround();
    this.addWalls();
  }

  setAspect(aspect: number): void {
    if (aspect === this.aspect) return;
    this.aspect = aspect;
    this.rebuildWalls();
  }

  private rebuildWalls(): void {
    const toRemove: CANNON.Body[] = [];
    for (const body of this.world.bodies) {
      if (body.mass === 0 && body.material === this.wallMaterial) {
        toRemove.push(body);
      }
    }
    for (const body of toRemove) this.world.removeBody(body);
    this.addWalls();
  }

  private addGround(): void {
    const ground = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Plane(),
      material: this.floorMaterial,
    });
    ground.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    this.world.addBody(ground);
  }

  private addWalls(): void {
    const halfH = WALL_HEIGHT / 2;
    const halfT = WALL_THICKNESS / 2;
    const halfFrustum = FRUSTUM_SIZE / 2;
    const halfWidth = halfFrustum * this.aspect;

    const walls: Array<{ pos: [number, number, number]; half: [number, number, number] }> = [
      { pos: [-halfWidth - halfT, halfH, 0], half: [halfT, halfH, halfFrustum] },
      { pos: [halfWidth + halfT, halfH, 0], half: [halfT, halfH, halfFrustum] },
      { pos: [0, halfH, halfFrustum + halfT], half: [halfWidth, halfH, halfT] },
      { pos: [0, halfH, -halfFrustum - halfT], half: [halfWidth, halfH, halfT] },
    ];

    for (const { pos, half } of walls) {
      const wall = new CANNON.Body({
        mass: 0,
        shape: new CANNON.Box(new CANNON.Vec3(...half)),
        material: this.wallMaterial,
      });
      wall.position.set(...pos);
      this.world.addBody(wall);
    }
  }

  spawnDie(
    x: number, z: number,
    velocity?: { x: number; y: number; z: number },
    spawnY?: number,
  ): PhysicsBody {
    const halfSize = DICE_SIZE / 2;
    const body = new CANNON.Body({
      mass: DICE_MASS,
      shape: new CANNON.Box(new CANNON.Vec3(halfSize, halfSize, halfSize)),
      material: this.diceMaterial,
      linearDamping: DICE_LINEAR_DAMPING,
      angularDamping: DICE_ANGULAR_DAMPING,
      allowSleep: true,
      sleepSpeedLimit: 0.1,
      sleepTimeLimit: 0.5,
    });

    body.position.set(x, spawnY ?? 10, z);

    if (velocity) {
      body.velocity.set(velocity.x, velocity.y, velocity.z);
    } else {
      body.velocity.set(
        (0.8 + 0.8 * Math.random()) * THROW_SPEED,
        (0.3 + Math.random() * 0.4) * THROW_SPEED * 0.5,
        (Math.random() - 0.5) * THROW_SPEED,
      );
    }

    body.angularVelocity.set(
      (Math.random() - 0.5) * THROW_SPIN * 1.5,
      (Math.random() - 0.5) * THROW_SPIN * 1.5,
      (Math.random() - 0.5) * THROW_SPIN * 1.5,
    );

    /* Random initial orientation for visual variety */
    const axis = new CANNON.Vec3(Math.random(), Math.random(), Math.random());
    axis.normalize();
    body.quaternion.setFromAxisAngle(axis, Math.random() * Math.PI * 2);

    const dieId = this.nextId++;
    body.addEventListener('collide', (e: { type: string; body: CANNON.Body; contact: CANNON.ContactEquation }) => {
      if (!this.impactedIds.has(dieId)) {
        this.impactedIds.add(dieId);
        this.onFirstImpact?.(dieId);
      }

      const now = performance.now();
      const last = this.lastCollideTime.get(dieId) ?? 0;
      if (now - last < COLLIDE_COOLDOWN_MS) return;

      const impact = Math.abs(e.contact.getImpactVelocityAlongNormal());
      if (impact < COLLIDE_MIN_IMPACT) return;

      this.lastCollideTime.set(dieId, now);
      const volume = Math.min(1, impact / COLLIDE_MAX_IMPACT);
      this.onCollision?.({ dieId, volume });
    });

    this.world.addBody(body);

    const entry: PhysicsBody = { body, id: dieId };
    this.bodies.push(entry);
    return entry;
  }

  step(): void {
    this.world.step(TIMESTEP);
  }

  isSettled(): boolean {
    if (this.bodies.length === 0) return true;
    return this.bodies.every(({ body }) =>
      body.velocity.lengthSquared() < SETTLED_THRESHOLD &&
      body.angularVelocity.lengthSquared() < SETTLED_THRESHOLD,
    );
  }

  waitForSettle(): Promise<void> {
    if (this.isSettled()) return Promise.resolve();
    return new Promise(resolve => {
      const deadline = performance.now() + 8_000;
      const check = () => {
        if (this.isSettled() || performance.now() > deadline) { resolve(); return; }
        requestAnimationFrame(check);
      };
      requestAnimationFrame(check);
    });
  }

  /* Save/restore for pre-simulation: snapshot body states, fast-forward, then rewind */
  saveBodyStates(): Array<{ pos: CANNON.Vec3; vel: CANNON.Vec3; angVel: CANNON.Vec3; quat: CANNON.Quaternion }> {
    return this.bodies.map(({ body }) => ({
      pos: body.position.clone(),
      vel: body.velocity.clone(),
      angVel: body.angularVelocity.clone(),
      quat: body.quaternion.clone(),
    }));
  }

  restoreBodyStates(states: Array<{ pos: CANNON.Vec3; vel: CANNON.Vec3; angVel: CANNON.Vec3; quat: CANNON.Quaternion }>): void {
    for (let i = 0; i < Math.min(this.bodies.length, states.length); i++) {
      const { body } = this.bodies[i];
      const s = states[i];
      body.position.copy(s.pos);
      body.velocity.copy(s.vel);
      body.angularVelocity.copy(s.angVel);
      body.quaternion.copy(s.quat);
      body.wakeUp();
    }
  }

  presimulate(maxSteps = 600): void {
    for (let i = 0; i < maxSteps; i++) {
      this.world.step(TIMESTEP);
      if (this.isSettled()) break;
    }
  }

  getUpFaceIndices(): number[] {
    const FACE_NORMALS = [
      new CANNON.Vec3(1, 0, 0),
      new CANNON.Vec3(-1, 0, 0),
      new CANNON.Vec3(0, 1, 0),
      new CANNON.Vec3(0, -1, 0),
      new CANNON.Vec3(0, 0, 1),
      new CANNON.Vec3(0, 0, -1),
    ];

    return this.bodies.map(({ body }) => {
      let bestIndex = 2;
      let bestDot = -Infinity;
      for (let i = 0; i < 6; i++) {
        const worldNormal = body.quaternion.vmult(FACE_NORMALS[i]);
        if (worldNormal.y > bestDot) {
          bestDot = worldNormal.y;
          bestIndex = i;
        }
      }
      return bestIndex;
    });
  }

  getDiceCount(): number {
    return this.bodies.length;
  }

  getMaxDice(): number {
    return MAX_DICE;
  }

  removeOldest(count: number): void {
    const toRemove = this.bodies.splice(0, count);
    for (const { body, id } of toRemove) {
      this.world.removeBody(body);
      this.impactedIds.delete(id);
      this.lastCollideTime.delete(id);
    }
  }

  clear(): void {
    for (const { body } of this.bodies) {
      this.world.removeBody(body);
    }
    this.bodies = [];
    this.impactedIds.clear();
    this.lastCollideTime.clear();
  }

  getBodyTransforms(): Array<{ position: CANNON.Vec3; quaternion: CANNON.Quaternion }> {
    return this.bodies.map(({ body }) => ({
      position: body.position,
      quaternion: body.quaternion,
    }));
  }

  getSpawnPosition(): { x: number; y: number; z: number } {
    const halfWidth = (FRUSTUM_SIZE / 2) * this.aspect;
    const margin = 2;
    return {
      x: -halfWidth + margin + Math.random() * 4,
      y: 4 + Math.random() * 4,
      z: (Math.random() - 0.5) * FRUSTUM_SIZE * 0.9,
    };
  }
}
