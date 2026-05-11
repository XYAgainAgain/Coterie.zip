import { signal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';

const THEMES = ['sunset', 'night', 'abyss'] as const;
const LABELS = ['Switch to Night', 'Switch to Abyss', 'Switch to Sunset'];
type Theme = typeof THEMES[number];

function loadTheme(): Theme {
  try {
    const stored = localStorage.getItem('vamp-theme');
    if (stored && THEMES.includes(stored as Theme)) return stored as Theme;
  } catch { /* localStorage blocked */ }
  return 'night';
}

const initial = loadTheme();
document.documentElement.setAttribute('data-theme', initial);
export const theme = signal<Theme>(initial);

// Cached eye element refs -- avoids querySelectorAll on every blink/rotation tick
let cachedBlinkEyes: NodeListOf<Element> | null = null;

function getBlinkEyes(btn: HTMLButtonElement): NodeListOf<Element> {
  if (!cachedBlinkEyes || !cachedBlinkEyes[0]?.parentNode) {
    cachedBlinkEyes = btn.querySelectorAll('.eye-toggle__eye--1, .eye-toggle__eye--2');
  }
  return cachedBlinkEyes;
}

export function EyeToggle() {
  const btnRef = useRef<HTMLButtonElement>(null);
  const blinkTid = useRef<number | null>(null);
  const rotateTid = useRef<number | null>(null);

  function cycle() {
    const idx = THEMES.indexOf(theme.value);
    theme.value = THEMES[(idx + 1) % THEMES.length];
    document.documentElement.setAttribute('data-theme', theme.value);
    try { localStorage.setItem('vamp-theme', theme.value); } catch { /* noop */ }
  }

  function doBlink() {
    const btn = btnRef.current;
    if (!btn) return;
    const eyes = getBlinkEyes(btn);
    const double = Math.random() < 0.35;

    eyes.forEach(e => e.classList.add('eye-toggle__eye--blink'));
    setTimeout(() => {
      eyes.forEach(e => e.classList.remove('eye-toggle__eye--blink'));
      if (double) {
        setTimeout(() => {
          eyes.forEach(e => e.classList.add('eye-toggle__eye--blink'));
          setTimeout(() => eyes.forEach(e => e.classList.remove('eye-toggle__eye--blink')), 150);
        }, 200);
      }
    }, 150);
  }

  function scheduleBlink() {
    blinkTid.current = window.setTimeout(() => {
      doBlink();
      scheduleBlink();
    }, 3000 + Math.random() * 5000);
  }

  function scheduleRotation() {
    const btn = btnRef.current;
    if (!btn) return;
    if (!btn.hasAttribute('data-rotation')) btn.setAttribute('data-rotation', '0');
    function advance() {
      const cur = parseInt(btn!.getAttribute('data-rotation') || '0', 10);
      btn!.setAttribute('data-rotation', String((cur + 1) % 3));
      rotateTid.current = window.setTimeout(advance, 4000 + Math.random() * 4000);
    }
    rotateTid.current = window.setTimeout(advance, 4000 + Math.random() * 4000);
  }

  function stopTimers() {
    if (blinkTid.current) clearTimeout(blinkTid.current);
    if (rotateTid.current) clearTimeout(rotateTid.current);
  }

  function startBehavior() {
    stopTimers();
    if (theme.value === 'night') scheduleBlink();
    if (theme.value === 'abyss') scheduleRotation();
  }

  useEffect(() => {
    startBehavior();
    return stopTimers;
  }, [theme.value]);

  const idx = THEMES.indexOf(theme.value);

  return (
    <button
      ref={btnRef}
      class="eye-toggle"
      type="button"
      aria-label={LABELS[idx]}
      onClick={cycle}
    >
      <img src="/assets/images/eye.svg" alt="" class="eye-toggle__eye eye-toggle__eye--1" aria-hidden="true" />
      <img src="/assets/images/eye.svg" alt="" class="eye-toggle__eye eye-toggle__eye--2" aria-hidden="true" />
      <img src="/assets/images/eye.svg" alt="" class="eye-toggle__eye eye-toggle__eye--3" aria-hidden="true" />
    </button>
  );
}
