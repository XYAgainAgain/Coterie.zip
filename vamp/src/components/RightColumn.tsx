/* Resizable right panel with drag handle. Ported from Deva's RightColumn. */

import type { ComponentChildren } from 'preact';
import { signal } from '@preact/signals';

export const MIN_WIDTH = 280;
const DEFAULT_WIDTH = 320;

export const rightColumnWidth = signal(DEFAULT_WIDTH);
export const rightColumnMinimized = signal(false);

const RATIO_ANCHORS: [number, number][] = [
  [1280, 0.22],
  [1600, 0.38],
  [1920, 0.46],
  [2560, 0.46],
  [3840, 0.48],
];

function maxWidthRatio(viewport: number): number {
  if (viewport <= RATIO_ANCHORS[0][0]) return RATIO_ANCHORS[0][1];
  for (let i = 0; i < RATIO_ANCHORS.length - 1; i++) {
    const [w1, r1] = RATIO_ANCHORS[i];
    const [w2, r2] = RATIO_ANCHORS[i + 1];
    if (viewport <= w2) {
      const t = (viewport - w1) / (w2 - w1);
      return r1 + t * (r2 - r1);
    }
  }
  return RATIO_ANCHORS[RATIO_ANCHORS.length - 1][1];
}

export function rightColumnMaxWidth(): number {
  return window.innerWidth * maxWidthRatio(window.innerWidth);
}

export function RightColumn({ children, class: extraClass }: { children: ComponentChildren; class?: string }) {
  if (rightColumnMinimized.value) {
    return (
      <aside
        class="vamp-right-col vamp-right-col--minimized"
        onClick={() => { rightColumnMinimized.value = false; }}
      >
        <div class="vamp-right-col__mini-btn">
          <span class="vamp-right-col__mini-chevron">&#9666;</span>
        </div>
      </aside>
    );
  }

  function onPointerDown(e: PointerEvent) {
    e.preventDefault();
    const handle = e.currentTarget as HTMLElement;
    const col = handle.parentElement;
    if (!col) return;
    handle.setPointerCapture(e.pointerId);
    col.classList.add('vamp-right-col--dragging');

    const startX = e.clientX;
    const startWidth = rightColumnWidth.value;
    const maxWidth = window.innerWidth * maxWidthRatio(window.innerWidth);

    function onPointerMove(ev: PointerEvent) {
      const delta = startX - ev.clientX;
      rightColumnWidth.value = Math.min(maxWidth, Math.max(MIN_WIDTH, startWidth + delta));
    }

    function onPointerUp() {
      col?.classList.remove('vamp-right-col--dragging');
      handle.removeEventListener('pointermove', onPointerMove);
      handle.removeEventListener('pointerup', onPointerUp);
      handle.removeEventListener('pointercancel', onPointerUp);
    }

    handle.addEventListener('pointermove', onPointerMove);
    handle.addEventListener('pointerup', onPointerUp);
    handle.addEventListener('pointercancel', onPointerUp);
  }

  return (
    <aside class={`vamp-right-col ${extraClass ?? ''}`} style={{ width: `${rightColumnWidth.value}px` }}>
      <div class="vamp-right-col__handle" onPointerDown={onPointerDown} />
      <div class="vamp-right-col__content">
        {children}
      </div>
    </aside>
  );
}
