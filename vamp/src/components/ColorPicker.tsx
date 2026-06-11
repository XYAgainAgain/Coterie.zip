import { useRef } from 'preact/hooks';

/* In-panel HSV color picker: a saturation/value field plus a hue strip, fully themeable
   (no native OS picker). Emits "#rrggbb" on every drag. The hex text field lives in the
   parent so this stays focused on the visual pick. */

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

function hexToHsv(hex: string): [number, number, number] {
  const raw = hex.replace('#', '');
  const r = parseInt(raw.slice(0, 2), 16) / 255;
  const g = parseInt(raw.slice(2, 4), 16) / 255;
  const b = parseInt(raw.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return [h, s * 100, max * 100];
}

function hsvToHex(h: number, s: number, v: number): string {
  s /= 100;
  v /= 100;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

export function ColorPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const svRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const [h, s, v] = hexToHsv(value);

  function pickSV(e: PointerEvent) {
    const r = svRef.current?.getBoundingClientRect();
    if (!r) return;
    const sat = clamp01((e.clientX - r.left) / r.width) * 100;
    const val = (1 - clamp01((e.clientY - r.top) / r.height)) * 100;
    onChange(hsvToHex(h, sat, val));
  }

  function pickHue(e: PointerEvent) {
    const r = hueRef.current?.getBoundingClientRect();
    if (!r) return;
    const hue = clamp01((e.clientX - r.left) / r.width) * 360;
    onChange(hsvToHex(hue, s, v));
  }

  /* setPointerCapture keeps move events flowing even when the cursor leaves the element. */
  function dragStart(handler: (e: PointerEvent) => void) {
    return (e: PointerEvent) => {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      handler(e);
    };
  }

  function dragMove(handler: (e: PointerEvent) => void) {
    return (e: PointerEvent) => { if (e.buttons) handler(e); };
  }

  function dragEnd(e: PointerEvent) {
    const el = e.currentTarget as HTMLElement;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
  }

  return (
    <div class="vamp-cp">
      <div
        class="vamp-cp__sv"
        ref={svRef}
        style={{ background: `hsl(${h} 100% 50%)` }}
        onPointerDown={dragStart(pickSV)}
        onPointerMove={dragMove(pickSV)}
        onPointerUp={dragEnd}
        onPointerCancel={dragEnd}
      >
        <div class="vamp-cp__sv-white" />
        <div class="vamp-cp__sv-black" />
        <div class="vamp-cp__thumb" style={{ left: `${s}%`, top: `${100 - v}%` }} />
      </div>
      <div
        class="vamp-cp__hue"
        ref={hueRef}
        onPointerDown={dragStart(pickHue)}
        onPointerMove={dragMove(pickHue)}
        onPointerUp={dragEnd}
        onPointerCancel={dragEnd}
      >
        <div class="vamp-cp__hue-thumb" style={{ left: `${(h / 360) * 100}%` }} />
      </div>
    </div>
  );
}
