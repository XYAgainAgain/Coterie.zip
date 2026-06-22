import { useEffect, useRef, useCallback } from 'preact/hooks';
import { useSignal } from '@preact/signals';
import { updateCharacter, setPortraitCrop, type Portrait } from '../state/character';
import { editMode } from '../state/ui';
import { creationMode, creationStep } from '../state/creation';
import { showToast } from '../state/toasts';

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
  const prevIndex = useSignal(-1);
  const transitioning = useSignal(false);
  const lightbox = useSignal<number | null>(null);

  const isEdit = editMode.value;
  const isCreationName = creationMode.value && creationStep.value === 'name';
  const showForm = editing.value || isEdit || isCreationName;

  useEffect(() => {
    if (portraits.length < 2) return;
    let cancelled = false;
    let fadeTimer: ReturnType<typeof setTimeout>;
    const timer = setInterval(() => {
      const nextIdx = (activeIndex.value + 1) % portraits.length;
      // Decode the next image before swapping so Firefox doesn't briefly
      // paint the raw bitmap at natural size before object-fit settles.
      const next = new Image();
      next.src = portraits[nextIdx].url;
      const swap = () => {
        if (cancelled) return;
        prevIndex.value = activeIndex.value;
        transitioning.value = true;
        activeIndex.value = nextIdx;
        fadeTimer = setTimeout(() => {
          if (cancelled) return;
          transitioning.value = false;
          prevIndex.value = -1;
        }, FADE_MS);
      };
      next.decode ? next.decode().then(swap, swap) : swap();
    }, CYCLE_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
      clearTimeout(fadeTimer);
    };
  }, [portraits]);

  if (showForm) {
    return (
      <div class="vamp-identity__portrait-edit">
        <div class="vamp-identity__portrait">
          <PortraitUrlForm portraits={portraits} onDone={() => { editing.value = false; }} />
        </div>
        {portraits.length > 0 && (
          <div class="vamp-portrait-crops">
            <span class="vamp-portrait-crops__hint">Framing: drag to pan, scroll to zoom</span>
            {portraits.map((p, i) => (
              <PortraitCropFrame key={`${i}:${p.url}`} portrait={p} index={i} name={name} />
            ))}
          </div>
        )}
      </div>
    );
  }

  const idx = activeIndex.value % Math.max(1, portraits.length);
  const current = portraits[idx];
  const prev = prevIndex.value >= 0 ? portraits[prevIndex.value % portraits.length] : null;

  return (
    <div
      class={`vamp-identity__portrait ${current ? 'vamp-identity__portrait--zoomable' : ''}`}
      onClick={current ? () => { lightbox.value = idx; } : undefined}
    >
      {current ? (
        <>
          <img
            class="vamp-identity__portrait-img"
            src={current.url}
            alt={name}
            style={cropStyle(current)}
          />
          {prev && transitioning.value && (
            <img
              class="vamp-identity__portrait-img vamp-identity__portrait-img--outgoing"
              src={prev.url}
              alt=""
              style={cropStyle(prev)}
            />
          )}
        </>
      ) : (
        <span
          class="vamp-identity__portrait-placeholder"
          onClick={() => { editing.value = true; }}
        >Click to add an image URL</span>
      )}
      {lightbox.value !== null && (
        <PortraitLightbox
          portraits={portraits}
          start={lightbox.value}
          name={name}
          onClose={() => { lightbox.value = null; }}
        />
      )}
    </div>
  );
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/* The sheet display and the crop editor share this transform so framing is WYSIWYG.
   transform-origin tracks the focal point so zoom pivots on the chosen spot. */
export function cropStyle(p: Portrait): string {
  return `object-position: ${p.x}% ${p.y}%; transform: scale(${p.scale}); transform-origin: ${p.x}% ${p.y}%;`;
}

function PortraitLightbox({ portraits, start, name, onClose }: { portraits: Portrait[]; start: number; name: string; onClose: () => void }) {
  const dlgRef = useRef<HTMLDialogElement>(null);
  const idx = useSignal(start);

  useEffect(() => {
    const dlg = dlgRef.current;
    if (dlg && !dlg.open) dlg.showModal();
    dlg?.focus(); /* take focus so Arrow keys page rather than scroll the page behind */
  }, []);

  function step(delta: number) {
    idx.value = (idx.value + delta + portraits.length) % portraits.length;
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); step(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); step(-1); }
  }

  const n = portraits.length;
  const cur = portraits[idx.value % n];
  const multi = n > 1;
  return (
    <dialog
      ref={dlgRef}
      class="vamp-portrait-lightbox"
      tabIndex={-1}
      onCancel={e => { e.preventDefault(); onClose(); }}
      onClick={e => { e.stopPropagation(); onClose(); }}
      onKeyDown={onKeyDown}
    >
      <img class="vamp-portrait-lightbox__img" src={cur.url} alt={name} />
      {multi && (
        <>
          <button
            type="button"
            class="vamp-portrait-lightbox__nav vamp-portrait-lightbox__nav--prev"
            aria-label="Previous image"
            onClick={e => { e.stopPropagation(); step(-1); }}
          ><span class="vamp-portrait-lightbox__bat" /></button>
          <button
            type="button"
            class="vamp-portrait-lightbox__nav vamp-portrait-lightbox__nav--next"
            aria-label="Next image"
            onClick={e => { e.stopPropagation(); step(1); }}
          ><span class="vamp-portrait-lightbox__bat" /></button>
          <span class="vamp-portrait-lightbox__counter">{idx.value % n + 1}/{n}</span>
        </>
      )}
    </dialog>
  );
}

function PortraitCropFrame({ portrait, index, name }: { portrait: Portrait; index: number; name: string }) {
  const draft = useSignal({ x: portrait.x, y: portrait.y, scale: portrait.scale });
  const dragging = useRef(false);
  const last = useRef({ px: 0, py: 0 });
  const frameRef = useRef<HTMLDivElement>(null);
  const commitTimer = useRef<ReturnType<typeof setTimeout>>();

  /* Re-sync if the stored crop changes from outside (e.g. a cross-device sync). */
  useEffect(() => {
    draft.value = { x: portrait.x, y: portrait.y, scale: portrait.scale };
  }, [portrait.x, portrait.y, portrait.scale]);

  const commit = () => setPortraitCrop(index, draft.value);

  /* Wheel must be a non-passive native listener: a JSX onWheel is passive, so
     preventDefault() there no-ops and the page scrolls while zooming. The cleanup
     also clears a pending commit so a removed frame can't write a stale index. */
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      draft.value = { ...draft.value, scale: clamp(draft.value.scale * (1 - e.deltaY * 0.0015), 1, 4) };
      clearTimeout(commitTimer.current);
      commitTimer.current = setTimeout(() => setPortraitCrop(index, draft.value), 250);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      clearTimeout(commitTimer.current);
    };
  }, []);

  function onPointerDown(e: PointerEvent) {
    dragging.current = true;
    last.current = { px: e.clientX, py: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragging.current) return;
    const frame = frameRef.current;
    if (!frame) return;
    const w = frame.clientWidth || 1;
    const h = frame.clientHeight || 1;
    const s = draft.value.scale;
    const dx = e.clientX - last.current.px;
    const dy = e.clientY - last.current.py;
    last.current = { px: e.clientX, py: e.clientY };
    /* Dragging the image right reveals its left edge, so the focal % moves opposite;
       divide by scale so panning slows as you zoom in. */
    const nx = clamp(draft.value.x - (dx / w) * 100 / s, 0, 100);
    const ny = clamp(draft.value.y - (dy / h) * 100 / s, 0, 100);
    draft.value = { ...draft.value, x: nx, y: ny };
  }

  function onPointerUp(e: PointerEvent) {
    if (!dragging.current) return;
    dragging.current = false;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    commit();
  }

  function reset() {
    draft.value = { x: 50, y: 50, scale: 1 };
    commit();
  }

  const d = draft.value;
  return (
    <div
      ref={frameRef}
      class="vamp-portrait-crop"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDblClick={reset}
      title="Drag to pan, scroll to zoom, double-click to reset"
    >
      <img
        class="vamp-portrait-crop__img"
        src={portrait.url}
        alt={name}
        draggable={false}
        style={`object-position: ${d.x}% ${d.y}%; transform: scale(${d.scale}); transform-origin: ${d.x}% ${d.y}%;`}
      />
      <div class="vamp-portrait-crop__grid" aria-hidden="true" />
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
    /* Discord CDN links carry expiry params and die within days */
    if (valid.some(p => /(?:media|cdn)\.discordapp\.(?:net|com)/i.test(p.url))) {
      showToast('Discord image links expire after a few days! Re-upload your portrait to a host like Imgur and use that URL instead.', 'warning');
    }
    updateCharacter({ portraits: valid });
    onDone();
  }

  function validateAndSave() {
    const snapshot = drafts.value.filter(u => u.trim());
    if (snapshot.length === 0) { save(); return; }
    Promise.all(snapshot.map(u => validateImageUrl(u))).then(results => {
      const invalid = snapshot.filter((_, i) => !results[i]);
      if (invalid.length > 0) {
        showToast('That portrait URL doesn\'t point to a valid image. Try a different one.', 'error');
        return;
      }
      save();
    });
  }

  function handleKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      validateAndSave();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      drafts.value = [...urls, ''];
      validity.value = {};
      onDone();
    }
  }

  function handleFormBlur(e: FocusEvent) {
    const related = e.relatedTarget as HTMLElement | null;
    const container = (e.currentTarget as HTMLElement);
    if (container.contains(related)) return;
    validateAndSave();
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
    <div class="vamp-portrait-form" ref={listRef} onBlur={handleFormBlur}>
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
