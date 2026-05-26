import { ComponentChildren } from 'preact';
import { useSignal } from '@preact/signals';

interface Props {
  title: string;
  children: ComponentChildren;
  collapsible?: boolean;
  collapsedLabel?: string;
}

export function SectionBox({ title, children, collapsible, collapsedLabel }: Props) {
  const collapsed = useSignal(false);

  return (
    <fieldset class={`vamp-section ${collapsed.value ? 'vamp-section--collapsed' : ''}`}>
      <legend
        class={`vamp-section__legend ${collapsible ? 'vamp-section__legend--collapsible' : ''}`}
        onClick={collapsible ? () => { collapsed.value = !collapsed.value; } : undefined}
      >
        {collapsed.value && collapsedLabel ? collapsedLabel : title}
      </legend>
      {!collapsed.value && children}
    </fieldset>
  );
}

/* Gear SVG preserved for future Settings panel */
export const GearSvg = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);
