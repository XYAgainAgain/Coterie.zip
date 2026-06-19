import type { ComponentChildren } from 'preact';
import { useSignal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import {
  settingsOpen, diceVolume, diceMuted, diceSurface, DICE_SURFACES,
  setDiceVolume, toggleDiceMute, setRollMode, setDiceSurface, type DiceSurface,
} from '../state/settings';
import { rollMode } from '../dice/diceConfig';
import type { RollMode } from '../dice/types';
import { theme, setDeviceTheme, type Theme } from '../state/theme';
import { sweepThemes } from '../state/themeSweep';
import { character, setCustomTheme, patchCustomTheme } from '../state/character';
import {
  customThemeActive, normalizeHex, autoAccentB, randomContrastHex, randomAccent,
  DICE_FONTS, DEFAULT_DICE_FONT, DEFAULT_DICE_METALNESS,
  type CustomTheme, type ThemeBase, type EyeAnim,
} from '../themes/customTheme';
import { activeCharacterId, flushSave, stopCoterieListener } from '../state/persistence';
import { linkedEmail, sendEmailLink, signOutUser } from '../firebase';
import { showToast, forceToast } from '../state/toasts';
import { enterCreationMode } from '../state/creation';
import { ColorPicker } from './ColorPicker';

const SETTINGS_TABS = [
  { id: 'theme', label: 'Theme' },
  { id: 'dice', label: 'Dice' },
  { id: 'account', label: 'Account' },
] as const;
type SettingsTab = (typeof SETTINGS_TABS)[number]['id'];

/* Mask-image icons aren't fetched until first referenced, so a freshly-shown state (e.g.
   the mute glyph on first click) can flash blank. Warm the HTTP cache once up front. */
for (const name of ['gear', 'vamp/vol-mute', 'vamp/vol-low', 'vamp/vol-mid', 'vamp/vol-high']) {
  new Image().src = `/assets/images/${name}.svg`;
}

const THEME_TILES: { id: Theme; name: string; swatch: string }[] = [
  { id: 'night', name: 'Night', swatch: '#cc3333' },
  { id: 'sunset', name: 'Sunset', swatch: '#E84545' },
  { id: 'abyss', name: 'Abyss', swatch: '#A88BFF' },
];

/* Starting accent when a character first enables a custom theme, per base. */
const BASE_DEFAULT_ACCENT: Record<ThemeBase, string> = {
  night: '#cc3333',
  sunset: '#E84545',
  abyss: '#A88BFF',
};

const ROLL_MODES: { id: RollMode; label: string }[] = [
  { id: 'standard', label: 'Standard' },
  { id: 'fast', label: 'Fast' },
  { id: 'no3d', label: 'No 3D' },
];

const EYE_ANIMS: { id: EyeAnim; label: string }[] = [
  { id: 'heartbeat', label: 'Heartbeat' },
  { id: 'shimmer', label: 'Shimmer' },
  { id: 'dilate', label: 'Dilate' },
  { id: 'glow', label: 'Glow' },
  { id: 'breathe', label: 'Breathe' },
  { id: 'blink', label: 'Blink' },
];

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function SettingsDrawer() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const activeTab = useSignal<SettingsTab>('theme');

  /* Persistent drawer, stays open until intentionally closed (gear, close button, Escape).
     Escape is stopped from leaking into the sheet's editable-field cancel handlers. */
  useEffect(() => {
    if (!settingsOpen.value) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        settingsOpen.value = false;
      }
    }
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [settingsOpen.value]);

  const activeIdx = SETTINGS_TABS.findIndex(t => t.id === activeTab.value);

  return (
    <div class="vamp-settings-wrap" ref={wrapRef}>
      <button
        class={`vamp-settings-gear ${settingsOpen.value ? 'vamp-settings-gear--active' : ''}`}
        onClick={() => { settingsOpen.value = !settingsOpen.value; }}
        aria-label="Settings"
        aria-expanded={settingsOpen.value}
      >
        <span class="vamp-settings-gear__icon" />
      </button>

      {settingsOpen.value && (
        <div class="vamp-settings" role="dialog" aria-label="Settings">
          <div
            class="vamp-settings__tabs"
            role="tablist"
            style={`--tab-active-idx: ${activeIdx}; --tab-count: ${SETTINGS_TABS.length}`}
          >
            {SETTINGS_TABS.map(tab => (
              <button
                key={tab.id}
                class={`vamp-settings__tab ${activeTab.value === tab.id ? 'vamp-settings__tab--active' : ''}`}
                role="tab"
                aria-selected={activeTab.value === tab.id}
                onClick={() => { activeTab.value = tab.id; }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div class="vamp-settings__body">
            {activeTab.value === 'theme' && <ThemeTab />}
            {activeTab.value === 'dice' && <DiceTab />}
            {activeTab.value === 'account' && <AccountTab />}
          </div>
        </div>
      )}
    </div>
  );
}

function SettingRow({ label, children }: { label: string; children: ComponentChildren }) {
  return (
    <div class="vamp-settings__row">
      <span class="vamp-settings__label">{label}</span>
      <div class="vamp-settings__control">{children}</div>
    </div>
  );
}

function RadioGroup<T extends string>(props: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (id: T) => void;
  disabled?: boolean;
}) {
  return (
    <div class={`vamp-settings-radio ${props.disabled ? 'vamp-settings-radio--disabled' : ''}`}>
      {props.options.map(opt => (
        <button
          key={opt.id}
          class={`vamp-settings-radio__btn ${props.value === opt.id ? 'vamp-settings-radio__btn--active' : ''}`}
          onClick={() => { if (!props.disabled) props.onChange(opt.id); }}
          aria-pressed={props.value === opt.id}
          disabled={props.disabled}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function ThemeTab() {
  const onSheet = !!activeCharacterId.value;
  const ct = character.value.customTheme;

  function activateCustom() {
    if (!character.value.customTheme) {
      const base = theme.value as ThemeBase;
      setCustomTheme({
        base, accent: BASE_DEFAULT_ACCENT[base], eyeAnim: 'heartbeat',
        diceFont: DEFAULT_DICE_FONT, diceMetalness: DEFAULT_DICE_METALNESS,
      });
    }
    sweepThemes();
    customThemeActive.value = true;
  }

  return (
    <>
      <div class="vamp-settings-tiles">
        {THEME_TILES.map(tile => {
          const active = !customThemeActive.value && theme.value === tile.id;
          return (
            <button
              key={tile.id}
              class={`vamp-settings-tile ${active ? 'vamp-settings-tile--active' : ''}`}
              onClick={() => { customThemeActive.value = false; setDeviceTheme(tile.id); }}
            >
              <span class="vamp-settings-tile__swatch" style={{ background: tile.swatch }} />
              <span class="vamp-settings-tile__name">{tile.name}</span>
            </button>
          );
        })}
        {onSheet && (
          <button
            class={`vamp-settings-tile ${customThemeActive.value ? 'vamp-settings-tile--active' : ''}`}
            onClick={activateCustom}
          >
            <span
              class="vamp-settings-tile__swatch vamp-settings-tile__swatch--custom"
              style={ct ? { background: ct.accent } : undefined}
            />
            <span class="vamp-settings-tile__name">Custom</span>
          </button>
        )}
      </div>

      {onSheet && ct && <CustomThemeSection ct={ct} />}
    </>
  );
}

function CustomThemeSection({ ct }: { ct: CustomTheme }) {
  const hexDraft = useSignal(ct.accent);
  const hexFocused = useRef(false);
  const pickerTarget = useSignal<'accent' | 'accent2'>('accent');

  /* Sync the text field when the accent changes from elsewhere (OS picker, cross-device
     sync), but never while the user is mid-edit. hasFocused-ref pattern, not activeElement. */
  useEffect(() => {
    if (!hexFocused.current) hexDraft.value = ct.accent;
  }, [ct.accent]);

  function commitHex() {
    const normalized = normalizeHex(hexDraft.value);
    if (normalized) {
      patchCustomTheme({ accent: normalized });
      hexDraft.value = normalized;
    } else {
      hexDraft.value = ct.accent; /* revert invalid input */
    }
  }

  /* Second accent defaults to the complement; the hex field and randomize button override it. */
  const accent2Value = normalizeHex(ct.accent2 ?? '') ?? autoAccentB(ct.accent);
  const hex2Draft = useSignal(accent2Value);
  const hex2Focused = useRef(false);
  useEffect(() => {
    if (!hex2Focused.current) hex2Draft.value = accent2Value;
  }, [ct.accent2, ct.accent]);

  function commitHex2() {
    const normalized = normalizeHex(hex2Draft.value);
    if (normalized) { patchCustomTheme({ accent2: normalized }); hex2Draft.value = normalized; }
    else { hex2Draft.value = accent2Value; }
  }
  function randomizeAccent2() {
    const c = randomContrastHex(ct.accent);
    hex2Draft.value = c;
    patchCustomTheme({ accent2: c });
  }
  function randomizeAccentA() {
    const c = randomAccent();
    hexDraft.value = c;
    /* Clear accent 2 so it re-derives a fresh coordinated pair from the new accent 1. */
    patchCustomTheme({ accent: c, accent2: undefined });
  }
  const dualOn = ct.accentB !== false;

  return (
    <div class="vamp-settings__sub">
      <div class="vamp-settings__sub-head">
        <span>Custom Theme</span>
        <button
          class="vamp-settings__clear"
          onClick={() => { customThemeActive.value = false; setCustomTheme(null); }}
        >
          Clear
        </button>
      </div>

      <SettingRow label="Base">
        <select
          class="vamp-settings-select"
          value={ct.base}
          onChange={e => patchCustomTheme({ base: (e.target as HTMLSelectElement).value as ThemeBase })}
        >
          <option value="night">Night</option>
          <option value="sunset">Sunset</option>
          <option value="abyss">Abyss</option>
        </select>
      </SettingRow>

      <div class="vamp-settings__accent">
        <ColorPicker
          value={pickerTarget.value === 'accent2' ? accent2Value : (normalizeHex(ct.accent) ?? '#cc3333')}
          onChange={hex => {
            if (pickerTarget.value === 'accent2') { hex2Draft.value = hex; patchCustomTheme({ accent2: hex }); }
            else { hexDraft.value = hex; patchCustomTheme({ accent: hex }); }
          }}
        />
        <div class="vamp-settings__accent-row">
          <span class="vamp-settings__accent-label">ACCENT A:</span>
          <button
            type="button"
            title="Edit accent with the picker"
            class={`vamp-settings__swatch${pickerTarget.value === 'accent' ? ' is-active' : ''}`}
            style={{ background: hexDraft.value }}
            onClick={() => { pickerTarget.value = 'accent'; }}
          />
          <input
            type="text"
            class="vamp-settings-color__hex"
            value={hexDraft.value}
            spellcheck={false}
            onFocus={() => { hexFocused.current = true; }}
            onInput={e => { hexDraft.value = (e.target as HTMLInputElement).value; }}
            onBlur={() => { hexFocused.current = false; commitHex(); }}
            onKeyDown={e => {
              if (e.key === 'Enter') { commitHex(); (e.target as HTMLInputElement).blur(); }
              if (e.key === 'Escape') { hexDraft.value = ct.accent; (e.target as HTMLInputElement).blur(); }
            }}
          />
          <button class="vamp-settings__accent2-rand" type="button" title="Randomize accent A" onClick={randomizeAccentA} />
        </div>
        <div class={`vamp-settings__accent-row${dualOn ? '' : ' is-muted'}`}>
          <span class="vamp-settings__accent-label">ACCENT B:</span>
          <button
            type="button"
            title="Edit alt accent with the picker"
            class={`vamp-settings__swatch${pickerTarget.value === 'accent2' ? ' is-active' : ''}`}
            style={{ background: hex2Draft.value }}
            onClick={() => { pickerTarget.value = 'accent2'; }}
          />
          <input
            type="text"
            class="vamp-settings-color__hex"
            value={hex2Draft.value}
            spellcheck={false}
            onFocus={() => { hex2Focused.current = true; }}
            onInput={e => { hex2Draft.value = (e.target as HTMLInputElement).value; }}
            onBlur={() => { hex2Focused.current = false; commitHex2(); }}
            onKeyDown={e => {
              if (e.key === 'Enter') { commitHex2(); (e.target as HTMLInputElement).blur(); }
              if (e.key === 'Escape') { hex2Draft.value = accent2Value; (e.target as HTMLInputElement).blur(); }
            }}
          />
          <button class="vamp-settings__accent2-rand" type="button" title="Randomize" onClick={randomizeAccent2} />
          <button
            class={`vamp-settings__accent-toggle${dualOn ? '' : ' is-off'}`}
            type="button"
            title={dualOn ? 'Disable second accent' : 'Enable second accent'}
            onClick={() => patchCustomTheme({ accentB: !dualOn })}
          />
        </div>
      </div>

      <SettingRow label="Eye Animation">
        <select
          class="vamp-settings-select"
          value={ct.eyeAnim}
          onChange={e => patchCustomTheme({ eyeAnim: (e.target as HTMLSelectElement).value as EyeAnim })}
        >
          {EYE_ANIMS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
      </SettingRow>

      <SettingRow label="Dice Numerals">
        <select
          class="vamp-settings-select"
          value={ct.diceFont ?? DEFAULT_DICE_FONT}
          onChange={e => patchCustomTheme({ diceFont: (e.target as HTMLSelectElement).value })}
        >
          {DICE_FONTS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
      </SettingRow>

      <SettingRow label="Dice Shine">
        <input
          type="range"
          class="vamp-settings-range"
          min="0"
          max="100"
          step="5"
          value={Math.round((ct.diceMetalness ?? DEFAULT_DICE_METALNESS) * 100)}
          onInput={e => patchCustomTheme({ diceMetalness: parseInt((e.target as HTMLInputElement).value, 10) / 100 })}
        />
      </SettingRow>
    </div>
  );
}

function volIcon(vol: number, muted: boolean): string {
  if (muted || vol <= 0) return 'vol-mute';
  if (vol <= 0.33) return 'vol-low';
  if (vol <= 0.66) return 'vol-mid';
  return 'vol-high';
}

function DiceTab() {
  const surfaceVal = diceSurface.value;
  const vol = diceVolume.value;
  const muted = diceMuted.value;
  const iconMask = `url("/assets/images/vamp/${volIcon(vol, muted)}.svg")`;

  return (
    <>
      <SettingRow label="Roll Mode">
        <RadioGroup<RollMode>
          value={prefersReducedMotion ? 'no3d' : rollMode.value}
          options={ROLL_MODES}
          onChange={setRollMode}
          disabled={prefersReducedMotion}
        />
      </SettingRow>
      {prefersReducedMotion && (
        <p class="vamp-settings__note">Reduced-motion is on, so 3D dice stay off.</p>
      )}

      <SettingRow label="Volume">
        <div class="vamp-settings-vol">
          <button
            class="vamp-settings-vol__icon"
            style={{ '-webkit-mask': `${iconMask} center / contain no-repeat`, mask: `${iconMask} center / contain no-repeat` }}
            onClick={toggleDiceMute}
            aria-label={muted ? 'Unmute dice' : 'Mute dice'}
            aria-pressed={muted}
          />
          <input
            type="range"
            class="vamp-settings-vol__slider"
            min="0"
            max="100"
            step="1"
            value={muted ? 0 : Math.round(vol * 100)}
            onInput={e => setDiceVolume(parseInt((e.target as HTMLInputElement).value, 10) / 100)}
          />
        </div>
      </SettingRow>

      <SettingRow label="Surface">
        <select
          class="vamp-settings-select"
          value={surfaceVal}
          onChange={e => setDiceSurface((e.target as HTMLSelectElement).value as DiceSurface)}
        >
          {DICE_SURFACES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </SettingRow>
    </>
  );
}

function AccountTab() {
  const email = linkedEmail.value;
  const onSheet = !!activeCharacterId.value;

  return (
    <>
      <SettingRow label="Account">
        <span class="vamp-settings__status">{email ?? 'Anonymous'}</span>
      </SettingRow>

      {!email && <LinkEmailRow />}
      {email && <SignOutRow />}
      {onSheet && <RecreateRow />}
    </>
  );
}

function LinkEmailRow() {
  const open = useSignal(false);
  const addr = useSignal('');
  const sending = useSignal(false);

  if (!open.value) {
    return (
      <div class="vamp-settings__sub">
        <p class="vamp-settings__sub-note">Link an email to protect your characters and unlock more slots.</p>
        <button class="vamp-settings__action" onClick={() => { open.value = true; }}>
          Link Email
        </button>
      </div>
    );
  }

  async function send() {
    const value = addr.value.trim();
    if (!value || !value.includes('@')) {
      showToast('Enter a valid email address.', 'error');
      return;
    }
    sending.value = true;
    try {
      await sendEmailLink(value);
      forceToast('Sign-in link sent! Check your email.', 'info', undefined, { bg: 'hsl(120 40% 15%)', border: 'hsl(120 70% 50%)' });
      open.value = false;
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to send email link.', 'error');
    } finally {
      sending.value = false;
    }
  }

  return (
    <div class="vamp-settings__sub">
      <div class="vamp-settings-emailform">
        <input
          class="vamp-settings-emailform__input"
          type="email"
          placeholder="your@email.com"
          value={addr.value}
          onInput={e => { addr.value = (e.target as HTMLInputElement).value; }}
          onKeyDown={e => { if (e.key === 'Enter') send(); }}
          autoFocus
          disabled={sending.value}
        />
        <button class="vamp-settings__action" onClick={send} disabled={sending.value}>
          {sending.value ? '...' : 'Send'}
        </button>
      </div>
    </div>
  );
}

function SignOutRow() {
  const confirm = useSignal(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function onClick() {
    if (!confirm.value) {
      confirm.value = true;
      timer.current = setTimeout(() => { confirm.value = false; }, 3000);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    try {
      await flushSave();
      stopCoterieListener();
      await signOutUser();
    } catch { /* fall through to reload regardless */ }
    /* Reload to /vamp/ so boot re-runs and Firebase mints a fresh anonymous session,
       rather than threading post-signout cleanup through every signal. */
    location.assign('/vamp/');
  }

  return (
    <div class="vamp-settings__sub">
      <button
        class={`vamp-settings__action ${confirm.value ? 'vamp-settings__action--confirm' : ''}`}
        onClick={onClick}
      >
        {confirm.value ? 'Are You Sure?' : 'Sign Out'}
      </button>
    </div>
  );
}

function RecreateRow() {
  const confirm = useSignal(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function onClick() {
    if (!confirm.value) {
      confirm.value = true;
      timer.current = setTimeout(() => { confirm.value = false; }, 3000);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    confirm.value = false;
    settingsOpen.value = false;
    /* Re-enter creation WITHOUT the guide/tour: dropdowns and radios unlock, nothing is
       wiped. The DONE button in CreationProgress exits. */
    enterCreationMode();
  }

  return (
    <div class="vamp-settings__sub">
      <p class="vamp-settings__sub-note">Re-enter creation to change selections. Nothing will be deleted.</p>
      <button
        class={`vamp-settings__action ${confirm.value ? 'vamp-settings__action--confirm' : ''}`}
        onClick={onClick}
      >
        {confirm.value ? 'Re-Enter Creation?' : 'Recreate Character'}
      </button>
    </div>
  );
}
