interface Props {
  count: number;
  filled?: number;
  slashed?: number;
  label?: string;
}

export function TrackerPips({ count, filled = 0, slashed = 0, label }: Props) {
  const pips = [];
  for (let i = 0; i < count; i++) {
    let cls = 'vamp-tracker__pip';
    if (i < filled) cls += ' vamp-tracker__pip--filled';
    else if (i < filled + slashed) cls += ' vamp-tracker__pip--slashed';
    pips.push(<div class={cls} />);
  }

  return (
    <div class="vamp-tracker">
      {pips}
      {label && <span class="vamp-tracker__label">{label}</span>}
    </div>
  );
}
