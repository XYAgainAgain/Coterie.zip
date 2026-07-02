export function CollapsibleSection({ title, pill, onPillClick, defaultOpen, children }: {
  title: string;
  pill?: string;
  onPillClick?: () => void;
  defaultOpen?: boolean;
  children: preact.ComponentChildren;
}) {
  return (
    <details class="vamp-rpanel-section" open={defaultOpen}>
      <summary class="vamp-rpanel-section__bar">
        {title}
        {pill && (onPillClick
          ? <button type="button" class="vamp-rpanel-section__pill vamp-rpanel-section__pill--action"
              onClick={e => { e.preventDefault(); e.stopPropagation(); onPillClick(); }}>{pill}</button>
          : <span class="vamp-rpanel-section__pill">{pill}</span>)}
      </summary>
      <div class="vamp-rpanel-section__content">{children}</div>
    </details>
  );
}
