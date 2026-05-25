import { allStepsComplete } from '../../state/creation';
import { guideActive, isCreationPhase } from '../../state/guide';

export function SpotlightOverlay() {
  if (!guideActive.value) return null;

  return (
    <div
      class={`spotlight-overlay ${allStepsComplete.value && isCreationPhase.value ? 'spotlight-overlay--fading' : ''}`}
    />
  );
}
