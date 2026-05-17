import * as THREE from 'three/webgpu';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { DICE_MATERIAL } from './DiceTextures';

export class DiceRenderer {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGPURenderer;
  private cubes: THREE.Mesh[] = [];
  private spinnerCube: THREE.Mesh | null = null;
  private shadowFloor: THREE.Mesh | null = null;
  private sun: THREE.DirectionalLight | null = null;
  private fill: THREE.DirectionalLight | null = null;
  private ambient: THREE.AmbientLight | null = null;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement) {
    this.scene = new THREE.Scene();

    const w = canvas.clientWidth || canvas.width || 800;
    const h = canvas.clientHeight || canvas.height || 600;

    this.camera = new THREE.PerspectiveCamera(24, w / h, 0.1, 100);
    this.camera.position.set(0, 40, 0);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGPURenderer({
      canvas,
      alpha: true,
      premultipliedAlpha: false,
      antialias: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.setupLighting();
    this.setupShadowFloor();
  }

  async init(): Promise<void> {
    await this.renderer.init();
    /* Force PSO compilation so the first real roll has no hitch */
    this.renderer.render(this.scene, this.camera);
  }

  private setupLighting(): void {
    this.sun = new THREE.DirectionalLight(0xffffff, 1.0);
    this.sun.position.set(-5, 20, -6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -20;
    this.sun.shadow.camera.right = 20;
    this.sun.shadow.camera.top = 12;
    this.sun.shadow.camera.bottom = -12;
    this.sun.shadow.camera.near = 0.5;
    this.sun.shadow.camera.far = 100;
    this.sun.shadow.bias = -0.0001;
    this.scene.add(this.sun);

    this.fill = new THREE.DirectionalLight(0xffffff, 0.3);
    this.fill.position.set(5, 15, 8);
    this.scene.add(this.fill);

    this.ambient = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(this.ambient);
  }

  setLightingTheme(theme: string): void {
    if (!this.sun || !this.fill || !this.ambient) return;
    switch (theme) {
      case 'sunset':
        this.sun.color.set(0xfffaf6);
        this.sun.intensity = 1.1;
        this.fill.color.set(0xfff6f0);
        this.fill.intensity = 0.3;
        this.ambient.color.set(0xfff8f4);
        this.ambient.intensity = 0.35;
        break;
      case 'abyss':
        this.sun.color.set(0xf0f0ff);
        this.sun.intensity = 1.2;
        this.fill.color.set(0xeeeef8);
        this.fill.intensity = 0.15;
        this.ambient.color.set(0xe8e8f0);
        this.ambient.intensity = 0.25;
        break;
      default:
        this.sun.color.set(0xfffbf2);
        this.sun.intensity = 1.1;
        this.fill.color.set(0xfff8ee);
        this.fill.intensity = 0.3;
        this.ambient.color.set(0xfffaf5);
        this.ambient.intensity = 0.35;
    }
  }

  /* Orbit the sun gently for shifting gleams on metallic surfaces */
  updateLightOrbit(elapsed: number): void {
    if (!this.sun) return;
    const angle = (elapsed / 60) * Math.PI * 2;
    const radius = 6;
    this.sun.position.x = -5 + Math.cos(angle) * radius;
    this.sun.position.z = -6 + Math.sin(angle) * radius;
  }

  private setupShadowFloor(): void {
    const geometry = new THREE.PlaneGeometry(50, 50);
    const material = new THREE.ShadowMaterial({ opacity: 0.4 });
    this.shadowFloor = new THREE.Mesh(geometry, material);
    this.shadowFloor.rotation.x = -Math.PI / 2;
    this.shadowFloor.position.y = -0.05;
    this.shadowFloor.receiveShadow = true;
    this.scene.add(this.shadowFloor);
  }

  createSpinnerCube(faceMaps: Array<{ color: THREE.Texture; bump: THREE.Texture; roughness: THREE.Texture }>): void {
    const geometry = new RoundedBoxGeometry(1, 1, 1, 4, 0.1);
    const materials = faceMaps.map(face =>
      new THREE.MeshStandardMaterial({
        map: face.color,
        bumpMap: face.bump,
        bumpScale: DICE_MATERIAL.bumpScale,
        roughnessMap: face.roughness,
        metalness: DICE_MATERIAL.metalness,
      }),
    );
    this.spinnerCube = new THREE.Mesh(geometry, materials);
    this.positionSpinnerInCorner();
    this.scene.add(this.spinnerCube);
  }

  reskinSpinnerCube(faceMaps: Array<{ color: THREE.Texture; bump: THREE.Texture; roughness: THREE.Texture }>): void {
    if (!this.spinnerCube || !Array.isArray(this.spinnerCube.material)) return;
    this.spinnerCube.material.forEach((mat, i) => {
      const maps = faceMaps[i];
      if (!maps || !(mat instanceof THREE.MeshStandardMaterial)) return;
      mat.map = maps.color;
      mat.bumpMap = maps.bump;
      mat.roughnessMap = maps.roughness;
      mat.needsUpdate = true;
    });
  }

  private positionSpinnerInCorner(): void {
    if (!this.spinnerCube) return;
    const vFov = this.camera.fov * Math.PI / 180;
    const halfH = Math.tan(vFov / 2) * this.camera.position.y;
    const halfW = halfH * this.camera.aspect;
    this.spinnerCube.position.set(-halfW + 1.8, 0.3, -halfH + 0.45);
    this.spinnerCube.scale.setScalar(0.4);
  }

  updateSpinner(elapsed: number): void {
    if (!this.spinnerCube) return;
    this.spinnerCube.rotation.y = elapsed * 0.5;
    this.spinnerCube.rotation.x = elapsed * 0.31;
    this.spinnerCube.rotation.z = elapsed * 0.17;
  }

  getSpinnerWorldPosition(): THREE.Vector3 | null {
    return this.spinnerCube?.position ?? null;
  }

  /* Returns CSS pixel coordinates of the spinner cube on screen */
  getSpinnerScreenPosition(canvasWidth: number, canvasHeight: number): { x: number; y: number } | null {
    if (!this.spinnerCube) return null;
    const pos = this.spinnerCube.position.clone();
    pos.project(this.camera);
    return {
      x: (pos.x * 0.5 + 0.5) * canvasWidth,
      y: (-pos.y * 0.5 + 0.5) * canvasHeight,
    };
  }

  createCube(texture: THREE.Texture): THREE.Mesh {
    const geometry = new RoundedBoxGeometry(1, 1, 1, 4, 0.1);
    const material = new THREE.MeshStandardMaterial({ map: texture });
    const cube = new THREE.Mesh(geometry, material);
    cube.castShadow = true;
    cube.receiveShadow = true;
    this.scene.add(cube);
    this.cubes.push(cube);
    return cube;
  }

  createDie(faceMaps: Array<{ color: THREE.Texture; bump: THREE.Texture; roughness: THREE.Texture }>): THREE.Mesh {
    const geometry = new RoundedBoxGeometry(1, 1, 1, 4, 0.1);
    const materials = faceMaps.map(face =>
      new THREE.MeshStandardMaterial({
        map: face.color,
        bumpMap: face.bump,
        bumpScale: DICE_MATERIAL.bumpScale,
        roughnessMap: face.roughness,
        metalness: DICE_MATERIAL.metalness,
      }),
    );
    const die = new THREE.Mesh(geometry, materials);
    die.castShadow = true;
    die.receiveShadow = true;
    this.scene.add(die);
    this.cubes.push(die);
    return die;
  }

  syncWithPhysics(transforms: Array<{ position: { x: number; y: number; z: number }; quaternion: { x: number; y: number; z: number; w: number } }>): void {
    for (let i = 0; i < Math.min(this.cubes.length, transforms.length); i++) {
      const cube = this.cubes[i];
      const { position, quaternion } = transforms[i];
      cube.position.set(position.x, position.y, position.z);
      cube.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
    }
  }

  render(): void {
    if (this.disposed) return;
    this.renderer.render(this.scene, this.camera);
  }

  handleResize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.positionSpinnerInCorner();
  }

  getCubes(): THREE.Mesh[] {
    return this.cubes;
  }

  private disposeMesh(mesh: THREE.Mesh): void {
    mesh.geometry.dispose();
    const mat = mesh.material;
    if (Array.isArray(mat)) {
      for (const m of mat) m.dispose();
    } else if (mat instanceof THREE.Material) {
      mat.dispose();
    }
    this.scene.remove(mesh);
  }

  removeOldestCubes(count: number): void {
    const toRemove = this.cubes.splice(0, count);
    for (const cube of toRemove) this.disposeMesh(cube);
  }

  clearCubes(): void {
    for (const cube of this.cubes) this.disposeMesh(cube);
    this.cubes = [];
  }

  dispose(): void {
    this.disposed = true;
    if (this.spinnerCube) {
      this.disposeMesh(this.spinnerCube);
      this.spinnerCube = null;
    }
    if (this.shadowFloor) {
      this.disposeMesh(this.shadowFloor);
      this.shadowFloor = null;
    }
    this.clearCubes();
    this.renderer.dispose();
  }
}
