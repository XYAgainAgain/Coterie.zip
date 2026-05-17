import type { Clock } from '../state/character';

const MQC_RAMP = [
  '#c9b635',
  '#d4a22e',
  '#de8e27',
  '#e67a20',
  '#ec6119',
  '#d94415',
  '#c62d11',
  '#b01a0e',
];

const CX = 50;
const CY = 50;
const R = 44;
const DEG_TO_RAD = Math.PI / 180;

function arcPath(startDeg: number, endDeg: number): string {
  const s = startDeg * DEG_TO_RAD;
  const e = endDeg * DEG_TO_RAD;
  const x1 = CX + R * Math.cos(s);
  const y1 = CY + R * Math.sin(s);
  const x2 = CX + R * Math.cos(e);
  const y2 = CY + R * Math.sin(e);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M${CX},${CY} L${x1},${y1} A${R},${R} 0 ${large} 1 ${x2},${y2} Z`;
}

function segmentFill(index: number, filled: number, gradient: boolean): string {
  if (index >= filled) return 'var(--v-clock-empty)';
  if (!gradient) return 'var(--v-clock-filled)';
  return MQC_RAMP[index] ?? MQC_RAMP[MQC_RAMP.length - 1];
}

function mqcGlowColor(filled: number): string {
  if (filled <= 0) return 'transparent';
  return MQC_RAMP[filled - 1] ?? MQC_RAMP[MQC_RAMP.length - 1];
}

interface Props {
  clock: Clock;
  gradient?: boolean;
  onFill: () => void;
  onUnfill: () => void;
  onRemove?: () => void;
}

export function ClockDisplay({ clock, gradient, onFill, onUnfill, onRemove }: Props) {
  const isFull = clock.filled >= clock.segments;
  const isEmpty = clock.filled <= 0;
  const removable = onRemove && (isFull || isEmpty);

  const slice = 360 / clock.segments;
  /* -90 puts 0° at 12 o'clock; -slice/2 centers first segment there */
  const offset = -90 - slice / 2;

  function handleClick(e: MouseEvent) {
    e.preventDefault();
    onFill();
  }

  function handleContext(e: MouseEvent) {
    e.preventDefault();
    onUnfill();
  }

  const wrapperClass = `vamp-clock${gradient ? ' vamp-clock--mqc' : ''}`;
  const svgClass = `vamp-clock__svg${isFull ? ' vamp-clock__svg--full' : ''}${gradient ? ' vamp-clock__svg--mqc' : ''}`;

  const style: Record<string, string> = {};
  if (gradient) {
    style['--v-mqc-glow'] = mqcGlowColor(clock.filled);
  }

  return (
    <div class={wrapperClass} style={style}>
      {removable && (
        <button
          class="vamp-clock__remove"
          onClick={(e) => { e.stopPropagation(); onRemove!(); }}
          aria-label={`Remove ${clock.name}`}
        >
          <svg viewBox="0 0 12 12" width="10" height="10">
            <line x1="2" y1="2" x2="10" y2="10" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            <line x1="10" y1="2" x2="2" y2="10" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          </svg>
        </button>
      )}
      <svg
        class={svgClass}
        viewBox="0 0 100 100"
        onClick={handleClick}
        onContextMenu={handleContext}
        role="meter"
        aria-label={`${clock.name}: ${clock.filled} of ${clock.segments}`}
        aria-valuenow={clock.filled}
        aria-valuemin={0}
        aria-valuemax={clock.segments}
      >
        {Array.from({ length: clock.segments }, (_, i) => {
          const startDeg = offset + i * slice;
          const endDeg = offset + (i + 1) * slice;
          return (
            <path
              key={i}
              d={arcPath(startDeg, endDeg)}
              fill={segmentFill(i, clock.filled, !!gradient)}
              class="vamp-clock__segment"
            />
          );
        })}
      </svg>
      <span class="vamp-clock__name">{clock.name}</span>
      {clock.condition && (
        <span class="vamp-clock__condition">{clock.condition}</span>
      )}
      <span class="vamp-clock__count">{clock.filled}/{clock.segments}</span>
    </div>
  );
}
