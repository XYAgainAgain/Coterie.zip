import { useEffect, useRef, useCallback } from 'preact/hooks';
import { useSignal } from '@preact/signals';
import { updateCharacter, type Portrait } from '../state/character';
import { editMode } from '../state/ui';
import { creationMode, creationStep } from '../state/creation';

const CYCLE_MS = 59_000;
const FADE_MS = 1_000;

function validateImageUrl(url: string): Promise<boolean> {
  return new Promise(resolve => {
    if (!url.trim()) { resolve(false); return; }
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

interface Props {
  portraits: Portrait[];
  name: string;
}

export function PortraitEditor({ portraits, name }: Props) {
  const editing = useSignal(false);
  const activeIndex = useSignal(0);
  const fading = useSignal(false);

  const isEdit = editMode.value;
  const isCreationName = creationMode.value && creationStep.value === 'name';
  const showForm = editing.value || isEdit || isCreationName;

  useEffect(() => {
    if (portraits.length < 2) return;
    let fadeTimer: ReturnType<typeof setTimeout> | null = null;
    const timer = setInterval(() => {
      fading.value = true;
      fadeTimer = setTimeout(() => {
        activeIndex.value = (activeIndex.value + 1) % portraits.length;
        fading.value = false;
      }, FADE_MS);
    }, CYCLE_MS);
    return () => {
      clearInterval(timer);
      if (fadeTimer) clearTimeout(fadeTimer);
    };
  }, [portraits]);

  if (showForm) {
    return (
      <div class="vamp-identity__portrait">
        <PortraitUrlForm portraits={portraits} onDone={() => { editing.value = false; }} />
      </div>
    );
  }

  const idx = activeIndex.value % Math.max(1, portraits.length);
  const current = portraits[idx];

  return (
    <div
      class="vamp-identity__portrait"
      onDblClick={() => { editing.value = true; }}
    >
      {current ? (
        <img
          class={`vamp-identity__portrait-img ${fading.value ? 'vamp-identity__portrait-img--fading' : ''}`}
          src={current.url}
          alt={name}
          style={`object-position: ${current.x}% ${current.y}%`}
        />
      ) : (
        <span
          class="vamp-identity__portrait-placeholder"
          onClick={() => { editing.value = true; }}
        >Click to add an image URL</span>
      )}
    </div>
  );
}

function PortraitUrlForm({ portraits, onDone }: { portraits: Portrait[]; onDone: () => void }) {
  const urls = portraits.map(p => p.url);
  const drafts = useSignal<string[]>([...urls, '']);
  const validity = useSignal<Record<number, boolean | null>>({});
  const listRef = useRef<HTMLDivElement>(null);

  const validate = useCallback(async (idx: number, url: string) => {
    if (!url.trim()) {
      validity.value = { ...validity.value, [idx]: null };
      return;
    }
    const ok = await validateImageUrl(url);
    validity.value = { ...validity.value, [idx]: ok };
  }, []);

  function handleInput(idx: number, value: string) {
    const next = [...drafts.value];
    next[idx] = value;
    if (idx === next.length - 1 && value.trim()) {
      next.push('');
    }
    drafts.value = next;
    validate(idx, value);
  }

  function save() {
    const valid = drafts.value
      .filter(u => u.trim())
      .map(url => {
        const existing = portraits.find(p => p.url === url);
        return existing ?? { url, x: 50, y: 50, scale: 1 };
      });
    updateCharacter({ portraits: valid });
    onDone();
  }

  function handleKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      save();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      drafts.value = [...urls, ''];
      validity.value = {};
      onDone();
    }
  }

  function removeUrl(idx: number) {
    const next = drafts.value.filter((_, i) => i !== idx);
    if (next.length === 0 || next[next.length - 1].trim()) next.push('');
    drafts.value = next;
    const v: Record<number, boolean | null> = {};
    for (const [k, val] of Object.entries(validity.value)) {
      const n = Number(k);
      if (n < idx) v[n] = val;
      else if (n > idx) v[n - 1] = val;
    }
    validity.value = v;
  }

  return (
    <div class="vamp-portrait-form" ref={listRef}>
      {drafts.value.map((url, i) => {
        const valid = validity.value[i];
        const isInvalid = valid === false;
        const isEmpty = !url.trim();
        const isLast = i === drafts.value.length - 1;
        return (
          <div class={`vamp-portrait-form__row ${isInvalid ? 'vamp-portrait-form__row--invalid' : ''}`} key={i}>
            <input
              class="vamp-input vamp-portrait-form__input"
              type="url"
              placeholder={isLast ? 'Paste image URL...' : `Image ${i + 1}`}
              value={url}
              onInput={e => handleInput(i, (e.target as HTMLInputElement).value)}
              onKeyDown={handleKey}
              onBlur={() => validate(i, url)}
              autoFocus={isLast && i === 0}
            />
            {!isEmpty && !isLast && (
              <button
                class="vamp-portrait-form__remove"
                onClick={() => removeUrl(i)}
                aria-label={`Remove image ${i + 1}`}
              >&times;</button>
            )}
          </div>
        );
      })}
    </div>
  );
}
