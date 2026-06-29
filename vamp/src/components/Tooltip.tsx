import { useSignal } from '@preact/signals';
import { useRef } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import type { ComponentChildren, JSX } from 'preact';
import { renderGameMarkdown, renderUserMarkdown } from '../data/transforms';

const TINT_VARS = ['--tip-bg', '--tip-fg', '--tip-border'] as const;
const HOVER_DELAY_MS = 250;
let tipCounter = 0;

/* Reusable hover/focus tooltip, seed of the deferred sitewide framework. Portals to
   body so the scrolling panel's overflow and the glass panels' backdrop-filter (which
   would trap position:fixed) can't clip or mislocate it. Touch (tap-to-pin) deferred. */
export function Tooltip({ content, children, anchorClass, userContent }: {
  content: string;
  children: ComponentChildren;
  anchorClass?: string;
  userContent?: boolean;
}) {
  const open = useSignal(false);
  const coords = useSignal<{ left: number; top: number; below: boolean }>({ left: 0, top: 0, below: false });
  /* The portal sits outside the anchor's cascade, so copy its --tip-* palette across by hand. */
  const tint = useSignal<Record<string, string>>({});
  const ref = useRef<HTMLSpanElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const focused = useRef(false);
  const idRef = useRef('');
  if (!idRef.current) idRef.current = `vamp-tip-${++tipCounter}`;

  function show() {
    const el = ref.current;
    if (!el || !content) return;
    const r = el.getBoundingClientRect();
    const below = r.top < 96; /* not enough room above; flip under the anchor */
    const left = Math.min(Math.max(r.left + r.width / 2, 150), window.innerWidth - 150);
    coords.value = { left, top: below ? r.bottom + 8 : r.top - 8, below };
    const cs = getComputedStyle(el);
    const vars: Record<string, string> = {};
    for (const v of TINT_VARS) {
      const val = cs.getPropertyValue(v).trim();
      if (val) vars[v] = val;
    }
    tint.value = vars;
    open.value = true;
  }

  /* Mouse gets a brief hover-intent delay; keyboard focus opens at once. */
  function scheduleShow() {
    clearTimeout(timer.current);
    timer.current = window.setTimeout(show, HOVER_DELAY_MS);
  }
  function hide() {
    clearTimeout(timer.current);
    open.value = false;
  }

  return (
    <span
      ref={ref}
      class={`vamp-tip-anchor ${anchorClass ?? ''}`}
      tabIndex={0}
      aria-describedby={open.value ? idRef.current : undefined}
      onMouseEnter={scheduleShow}
      onMouseLeave={() => { if (!focused.current) hide(); }}
      onFocus={() => { focused.current = true; show(); }}
      onBlur={(e) => { if (!ref.current?.contains(e.relatedTarget as Node)) { focused.current = false; hide(); } }}
    >
      {children}
      {open.value && content && createPortal(
        <div
          class={`vamp-tip ${coords.value.below ? 'vamp-tip--below' : ''}`}
          role="tooltip"
          id={idRef.current}
          style={{ left: `${coords.value.left}px`, top: `${coords.value.top}px`, ...tint.value } as JSX.CSSProperties}
          dangerouslySetInnerHTML={{ __html: userContent ? renderUserMarkdown(content) : renderGameMarkdown(content) }}
        />,
        document.body,
      )}
    </span>
  );
}
