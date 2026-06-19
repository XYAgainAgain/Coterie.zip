import { useEffect, useRef } from 'preact/hooks';
import { theme, setDeviceTheme, THEMES, type Theme } from '../state/theme';
import { customThemeActive, type EyeAnim } from '../themes/customTheme';
import { sweepThemes } from '../state/themeSweep';
import { character } from '../state/character';
import { activeCharacterId } from '../state/persistence';
import { viewingOtherSheet } from '../state/ui';

type Position = Theme | 'custom';

const POSITION_LABEL: Record<Position, string> = {
  sunset: 'Sunset',
  night: 'Night',
  abyss: 'Abyss',
  custom: 'Custom',
};

/* Cached eye element refs -- avoids querySelectorAll on every blink/rotation tick */
let cachedBlinkEyes: NodeListOf<Element> | null = null;

function getBlinkEyes(btn: HTMLButtonElement): NodeListOf<Element> {
  /* All eye images; the hidden ones (opacity 0 in some layouts) just don't show the flicker. */
  if (!cachedBlinkEyes || !cachedBlinkEyes[0]?.parentNode) {
    cachedBlinkEyes = btn.querySelectorAll('.eye-toggle__eye');
  }
  return cachedBlinkEyes;
}

export function EyeToggle() {
  const btnRef = useRef<HTMLButtonElement>(null);
  const blinkTid = useRef<number | null>(null);
  const rotateTid = useRef<number | null>(null);

  /* The custom position is only offered on an owned sheet whose character has a saved theme. */
  const customTheme = character.value.customTheme;
  const hasCustom = !!customTheme && !!activeCharacterId.value && !viewingOtherSheet.value;
  const isCustom = customThemeActive.value && hasCustom;
  const eyeAnim: EyeAnim = customTheme?.eyeAnim ?? 'heartbeat';

  function cycle() {
    if (!hasCustom) {
      const idx = THEMES.indexOf(theme.value);
      customThemeActive.value = false;
      setDeviceTheme(THEMES[(idx + 1) % THEMES.length]);
      return;
    }
    const positions: Position[] = [...THEMES, 'custom'];
    const current: Position = customThemeActive.value ? 'custom' : theme.value;
    const next = positions[(positions.indexOf(current) + 1) % positions.length];
    if (next === 'custom') {
      sweepThemes();
      customThemeActive.value = true; /* lifecycle effect applies the palette */
    } else {
      customThemeActive.value = false;
      setDeviceTheme(next);
    }
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
    if (isCustom) {
      /* Keep the abyss 3-eye shuffle on abyss-based customs; run the blink timer when chosen.
         The chosen glow is pure CSS (eye-anim-* class). */
      if (customTheme?.base === 'abyss') scheduleRotation();
      if (eyeAnim === 'blink') scheduleBlink();
      return;
    }
    if (theme.value === 'night') scheduleBlink();
    if (theme.value === 'abyss') scheduleRotation();
  }

  useEffect(() => {
    startBehavior();
    return stopTimers;
  }, [theme.value, isCustom, eyeAnim, customTheme?.base]);

  const current: Position = isCustom ? 'custom' : theme.value;
  const positions: Position[] = hasCustom ? [...THEMES, 'custom'] : [...THEMES];
  const next = positions[(positions.indexOf(current) + 1) % positions.length];
  const src = isCustom ? '/assets/images/eye-inverted.svg' : '/assets/images/eye.svg';

  return (
    <button
      ref={btnRef}
      class={`eye-toggle ${isCustom ? `eye-toggle--custom eye-anim-${eyeAnim}` : ''}`}
      type="button"
      aria-label={`Switch to ${POSITION_LABEL[next]}`}
      onClick={cycle}
    >
      <img src={src} alt="" class="eye-toggle__eye eye-toggle__eye--1" aria-hidden="true" />
      <img src={src} alt="" class="eye-toggle__eye eye-toggle__eye--2" aria-hidden="true" />
      <img src={src} alt="" class="eye-toggle__eye eye-toggle__eye--3" aria-hidden="true" />
    </button>
  );
}
