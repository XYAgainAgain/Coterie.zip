import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';

/* OpenDyslexic is deliberately excluded from the swap: its kerning needs layout tuning we haven't done. */

const SCALE_KEY = 'vamp-text-scale';
const SCALE_MIN = 0.8;
const SCALE_MAX = 1.5;
const SCALE_STEP = 0.1;
const SCALE_DEFAULT = 1.0;

const FONT_KEY = 'vamp-font-mode';
type FontMode = 'sans' | 'serif';

function readScale(): number {
  try {
    const v = parseFloat(localStorage.getItem(SCALE_KEY) || '');
    if (!isNaN(v) && v >= SCALE_MIN && v <= SCALE_MAX) return v;
  } catch { /* storage blocked */ }
  return SCALE_DEFAULT;
}

function readFont(): FontMode {
  try {
    if (localStorage.getItem(FONT_KEY) === 'serif') return 'serif';
  } catch { /* storage blocked */ }
  return 'sans';
}

export const textScale = signal(readScale());
export const fontMode = signal<FontMode>(readFont());

function applyScale(v: number) {
  document.documentElement.style.setProperty('--v-text-scale', String(v));
}

function applyFont(m: FontMode) {
  document.documentElement.setAttribute('data-font-mode', m);
}

applyScale(textScale.value);
applyFont(fontMode.value);

function setScale(v: number) {
  const clamped = Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.round(v * 10) / 10));
  textScale.value = clamped;
  applyScale(clamped);
  try { localStorage.setItem(SCALE_KEY, String(clamped)); } catch { /* noop */ }
}

function toggleFont() {
  const next: FontMode = fontMode.value === 'sans' ? 'serif' : 'sans';
  fontMode.value = next;
  applyFont(next);
  try { localStorage.setItem(FONT_KEY, next); } catch { /* noop */ }
}

function isTypingContext(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

export function TextRocker() {
  /* Keyboard shortcuts: -/+ resize, 0 resets, f swaps font. Suppressed while typing. */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey || isTypingContext(e.target)) return;
      switch (e.key) {
        case '-': setScale(textScale.value - SCALE_STEP); break;
        case '+':
        case '=': setScale(textScale.value + SCALE_STEP); break;
        case '0': setScale(SCALE_DEFAULT); break;
        case 'f':
        case 'F': toggleFont(); break;
        default: return;
      }
      e.preventDefault();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const s = textScale.value;
  const nextFont = fontMode.value === 'sans' ? 'Serif' : 'Sans-serif';
  /* Preview the target font on the Tt button so the swap is self-explanatory */
  const ttFamily = fontMode.value === 'sans' ? "'Merriweather', serif" : "'Merriweather Sans', sans-serif";

  return (
    <div class="vamp-rocker" role="group" aria-label="Text size and font">
      <button
        class="vamp-rocker__btn"
        type="button"
        aria-label="Decrease text size"
        title="Decrease text size"
        onClick={() => setScale(textScale.value - SCALE_STEP)}
        disabled={s <= SCALE_MIN}
      >&minus;</button>
      <button
        class="vamp-rocker__btn"
        type="button"
        aria-label="Reset text size"
        title="Reset text size"
        onClick={() => setScale(SCALE_DEFAULT)}
      >Aa</button>
      <button
        class="vamp-rocker__btn vamp-rocker__btn--font"
        type="button"
        aria-label={`Switch to ${nextFont} font`}
        title={`Switch to ${nextFont} font`}
        style={{ fontFamily: ttFamily }}
        onClick={toggleFont}
      >Tt</button>
      <button
        class="vamp-rocker__btn"
        type="button"
        aria-label="Increase text size"
        title="Increase text size"
        onClick={() => setScale(textScale.value + SCALE_STEP)}
        disabled={s >= SCALE_MAX}
      >+</button>
    </div>
  );
}
