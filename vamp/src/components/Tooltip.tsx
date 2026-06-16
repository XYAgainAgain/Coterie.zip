import { useSignal } from '@preact/signals';
import { useRef } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import type { ComponentChildren } from 'preact';

/* Reusable hover/focus tooltip, seed of the deferred sitewide framework. Portals to
   body so the scrolling panel's overflow and the glass panels' backdrop-filter (which
   would trap position:fixed) can't clip or mislocate it. Touch (tap-to-pin) deferred. */
export function Tooltip({ content, children, anchorClass }: {
  content: string;
  children: ComponentChildren;
  anchorClass?: string;
}) {
  const open = useSignal(false);
  const coords = useSignal<{ left: number; top: number; below: boolean }>({ left: 0, top: 0, below: false });
  const ref = useRef<HTMLSpanElement>(null);

  function show() {
    const el = ref.current;
    if (!el || !content) return;
    const r = el.getBoundingClientRect();
    const below = r.top < 96; /* not enough room above; flip under the anchor */
    const left = Math.min(Math.max(r.left + r.width / 2, 150), window.innerWidth - 150);
    coords.value = { left, top: below ? r.bottom + 8 : r.top - 8, below };
    open.value = true;
  }

  return (
    <span
      ref={ref}
      class={`vamp-tip-anchor ${anchorClass ?? ''}`}
      tabIndex={0}
      onMouseEnter={show}
      onMouseLeave={() => { open.value = false; }}
      onFocus={show}
      onBlur={(e) => { if (!ref.current?.contains(e.relatedTarget as Node)) open.value = false; }}
    >
      {children}
      {open.value && content && createPortal(
        <span
          class={`vamp-tip ${coords.value.below ? 'vamp-tip--below' : ''}`}
          role="tooltip"
          style={{ left: `${coords.value.left}px`, top: `${coords.value.top}px` }}
        >
          {content}
        </span>,
        document.body,
      )}
    </span>
  );
}
