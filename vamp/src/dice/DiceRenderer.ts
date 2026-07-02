import * as THREE from 'three/webgpu';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { DICE_MATERIAL, getDiceMetalness } from './DiceTextures';

export class DiceRenderer {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGPURenderer;
  private cubes: THREE.Mesh[] = [];
  /* All dice share one geometry; per-die allocation re-uploaded identical vertex data every roll */
  private dieGeometry = new RoundedBoxGeometry(1, 1, 1, 4, 0.1);
  /* All dice also share one 6-material set. Fresh materials per roll meant a node build +
     pipeline compile mid-tumble (the freeze-then-jump hitch, worst on Firefox WebGPU). */
  private dieMaterials: THREE.MeshStandardMaterial[] | null = null;
  private spinnerCube: THREE.Mesh | null = null;
  /* CSS-px x the spinner should center on (tracks the header wordmark); null = corner default */
  private spinnerAnchorX: number | null = null;
  private cssWidth: number;
  private shadowFloor: THREE.Mesh | null = null;
  private sun: THREE.DirectionalLight | null = null;
  private fill: THREE.DirectionalLight | null = null;
  private ambient: THREE.AmbientLight | null = null;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement) {
    this.scene = new THREE.Scene();

    const w = canvas.clientWidth || canvas.width || 800;
    const h = canvas.clientHeight || canvas.height || 600;
    this.cssWidth = w;

    this.camera = new THREE.PerspectiveCamera(24, w / h, 0.1, 100);
    this.camera.position.set(0, 40, 0);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGPURenderer({
      canvas,
      alpha: true,
      premultipliedAlpha: false,
      antialias: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(w, h);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.setupLighting();
    this.setupShadowFloor();
  }

  async init(): Promise<void> {
    await this.renderer.init();
    /* Force PSO compilation so the first real roll has no hitch (incl. one shadow pass,
       since autoUpdate is off and would otherwise compile the shadow pipeline mid-roll). */
    if (this.sun) this.sun.shadow.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);
  }

  private setupLighting(): void {
    this.sun = new THREE.DirectionalLight(0xffffff, 1.0);
    this.sun.position.set(-5, 20, -6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    /* The orbiting sun would otherwise re-render the depth pass every frame. Only the
       (non-shadow-casting) spinner shows at idle, so refresh the map on demand during rolls. */
    this.sun.shadow.autoUpdate = false;
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
    const metalness = getDiceMetalness();
    const materials = faceMaps.map(face =>
      new THREE.MeshStandardMaterial({
        map: face.color,
        bumpMap: face.bump,
        bumpScale: DICE_MATERIAL.bumpScale,
        roughnessMap: face.roughness,
        metalness,
      }),
    );
    this.spinnerCube = new THREE.Mesh(this.dieGeometry, materials);
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

  /* Push a new metalness onto the spinner and every live die (custom-theme edits).
     metalness is a uniform, so no needsUpdate — that would force a shader recompile (stall). */
  updateMetalness(metalness: number): void {
    const apply = (mesh: THREE.Mesh | null) => {
      if (!mesh || !Array.isArray(mesh.material)) return;
      for (const mat of mesh.material) {
        if (mat instanceof THREE.MeshStandardMaterial) mat.metalness = metalness;
      }
    };
    apply(this.spinnerCube);
    /* Live dice all reference the shared set */
    if (this.dieMaterials) {
      for (const mat of this.dieMaterials) mat.metalness = metalness;
    }
  }

  /* WebGPU paces frames through the renderer's own loop; a manual rAF desyncs from the
     device timeline and stutters. Pass null to stop. */
  setAnimationLoop(cb: ((time: number) => void) | null): void {
    this.renderer.setAnimationLoop(cb);
  }

  /* Refresh the shadow depth pass for the next render (called while dice are in motion). */
  requestShadowUpdate(): void {
    if (this.sun) this.sun.shadow.needsUpdate = true;
  }

  private positionSpinnerInCorner(): void {
    if (!this.spinnerCube) return;
    const vFov = this.camera.fov * Math.PI / 180;
    const halfH = Math.tan(vFov / 2) * this.camera.position.y;
    const halfW = halfH * this.camera.aspect;
    /* Anchored: invert the projection at the spinner's own height so world x lands on the CSS px */
    const planeHalfW = Math.tan(vFov / 2) * (this.camera.position.y - 0.3) * this.camera.aspect;
    const x = this.spinnerAnchorX !== null
      ? ((this.spinnerAnchorX / this.cssWidth) * 2 - 1) * planeHalfW
      : -halfW + 1.8;
    this.spinnerCube.position.set(x, 0.3, -halfH + 0.45);
    this.spinnerCube.scale.setScalar(0.4);
  }

  setSpinnerAnchorX(cssX: number | null): void {
    this.spinnerAnchorX = cssX;
    this.positionSpinnerInCorner();
  }

  updateSpinner(elapsed: number): void {
    if (!this.spinnerCube) return;
    this.spinnerCube.rotation.y = elapsed * 0.5;
    this.spinnerCube.rotation.x = elapsed * 0.31;
    this.spinnerCube.rotation.z = elapsed * 0.17;
  }

  freezeSpinnerRandom(): void {
    if (!this.spinnerCube) return;
    this.spinnerCube.rotation.set(
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
    );
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
    const material = new THREE.MeshStandardMaterial({ map: texture });
    const cube = new THREE.Mesh(this.dieGeometry, material);
    cube.castShadow = true;
    cube.receiveShadow = true;
    this.scene.add(cube);
    this.cubes.push(cube);
    return cube;
  }

  /* Create or retarget the shared die material set. transparent: true from birth so the
     fade-out never flips blend state — in WebGPU that's a whole new pipeline compile. */
  setDieFaceMaps(faceMaps: Array<{ color: THREE.Texture; bump: THREE.Texture; roughness: THREE.Texture }>): void {
    if (this.dieMaterials) {
      this.dieMaterials.forEach((mat, i) => {
        const maps = faceMaps[i];
        if (!maps) return;
        mat.map = maps.color;
        mat.bumpMap = maps.bump;
        mat.roughnessMap = maps.roughness;
        mat.needsUpdate = true;
      });
      return;
    }
    const metalness = getDiceMetalness();
    this.dieMaterials = faceMaps.map(face =>
      new THREE.MeshStandardMaterial({
        map: face.color,
        bumpMap: face.bump,
        bumpScale: DICE_MATERIAL.bumpScale,
        roughnessMap: face.roughness,
        metalness,
        transparent: true,
      }),
    );
  }

  /* opacity is a plain uniform; setting needsUpdate here would rebuild every pipeline */
  setDiceOpacity(opacity: number): void {
    if (!this.dieMaterials) return;
    for (const mat of this.dieMaterials) mat.opacity = opacity;
  }

  /* Compile the dice color + shadow pipelines at startup. Without this, the first roll
     stalls mid-tumble on an on-demand pipeline build ("shader compilation stutter"). */
  warmDiePipelines(): void {
    /* Pre-roll only: the opacity dance below would clobber live dice mid-fade */
    if (!this.dieMaterials || this.disposed || this.cubes.length > 0) return;
    const die = new THREE.Mesh(this.dieGeometry, [...this.dieMaterials]);
    die.castShadow = true;
    die.receiveShadow = true;
    /* Sub-pixel and fully transparent: survives frustum culling, draws nothing visible */
    die.scale.setScalar(0.001);
    die.position.set(0, 0.5, 0);
    this.scene.add(die);
    this.setDiceOpacity(0);
    this.requestShadowUpdate();
    this.render();
    this.scene.remove(die);
    this.setDiceOpacity(1);
    this.requestShadowUpdate();
    this.render();
  }

  createDie(): THREE.Mesh {
    /* Each die gets its own copy of the array (not the materials) so fixDieResults can
       reorder faces per die while every die still shares the same compiled pipelines. */
    const materials = this.dieMaterials ? [...this.dieMaterials] : [];
    const die = new THREE.Mesh(this.dieGeometry, materials);
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
    this.cssWidth = width;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.positionSpinnerInCorner();
  }

  getCubes(): THREE.Mesh[] {
    return this.cubes;
  }

  private disposeMesh(mesh: THREE.Mesh): void {
    /* Shared die geometry/materials outlive individual meshes; disposed once in dispose() */
    if (mesh.geometry !== this.dieGeometry) mesh.geometry.dispose();
    const mat = mesh.material;
    if (Array.isArray(mat)) {
      for (const m of mat) {
        if (!this.dieMaterials?.includes(m as THREE.MeshStandardMaterial)) m.dispose();
      }
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
    if (this.dieMaterials) {
      for (const mat of this.dieMaterials) mat.dispose();
      this.dieMaterials = null;
    }
    this.dieGeometry.dispose();
    this.renderer.dispose();
  }
}
