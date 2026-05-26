import { useEffect, useRef, useState } from 'preact/hooks';
import { guideStepIndex } from '../../state/guide';

interface CutoutRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function measureSpotlight(): CutoutRect | null {
  const els = document.querySelectorAll('.guide-spotlight');
  if (els.length === 0) return null;
  let t = Infinity, l = Infinity, r = -Infinity, b = -Infinity;
  els.forEach(el => {
    const box = el.getBoundingClientRect();
    t = Math.min(t, box.top);
    l = Math.min(l, box.left);
    r = Math.max(r, box.right);
    b = Math.max(b, box.bottom);
  });
  return { top: t, left: l, width: r - l, height: b - t };
}

export function SpotlightOverlay() {
  const [rect, setRect] = useState<CutoutRect | null>(null);
  const lastRect = useRef<CutoutRect | null>(null);

  useEffect(() => {
    const update = () => {
      const measured = measureSpotlight();
      if (measured) lastRect.current = measured;
      setRect(measured);
    };

    const raf = requestAnimationFrame(update);
    const t1 = setTimeout(update, 200);
    const t2 = setTimeout(update, 600);
    window.addEventListener('resize', update);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener('resize', update);
    };
  }, [guideStepIndex.value]);

  const active = rect ?? lastRect.current;
  if (!active) return <div class="spotlight-overlay" />;

  const pad = 6;
  return (
    <div
      class="spotlight-cutout"
      style={{
        top: `${active.top - pad}px`,
        left: `${active.left - pad}px`,
        width: `${active.width + pad * 2}px`,
        height: `${active.height + pad * 2}px`,
      }}
    />
  );
}
