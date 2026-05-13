/// <reference types="vite/client" />

/* three/webgpu re-exports the same API as three with WebGPURenderer */
declare module 'three/webgpu' {
  export * from 'three';
  export class WebGPURenderer {
    constructor(parameters?: {
      canvas?: HTMLCanvasElement;
      alpha?: boolean;
      premultipliedAlpha?: boolean;
      antialias?: boolean;
    });
    shadowMap: {
      enabled: boolean;
      type: import('three').ShadowMapType;
    };
    init(): Promise<void>;
    render(scene: import('three').Scene, camera: import('three').Camera): void;
    setPixelRatio(value: number): void;
    setSize(width: number, height: number): void;
    setClearColor(color: number, alpha: number): void;
    setAnimationLoop(callback: ((time: number) => void) | null): void;
    dispose(): void;
  }
}
