import { creationMode, allStepsComplete } from '../../state/creation';
import { tourMode } from '../../state/tour';

export function SpotlightOverlay() {
  if (!creationMode.value && !tourMode.value) return null;

  return (
    <div
      class={`spotlight-overlay ${allStepsComplete.value && !tourMode.value ? 'spotlight-overlay--fading' : ''}`}
    />
  );
}
