/* Tour messages are hardcoded trusted content from tour.ts */

import { tourMode, currentTourStep, tourProgress, nextTourStop, prevTourStop, skipTour } from '../../state/tour';
import { forceToast } from '../../state/toasts';
import { renderGameMarkdown } from '../../data/transforms';

export function TourOverlay() {
  if (!tourMode.value) return null;

  const step = currentTourStep.value;
  const { current, total } = tourProgress.value;

  function handleNext() {
    nextTourStop();
    if (current === total) {
      forceToast('Welcome to Vamp! Click any stat button to roll dice, and use the Move Modifiers panel to add bonuses. Have fun!', 'success', 50);
    }
  }

  return (
    <div class={`tour-card tour-card--${step.zone}`}>
      <div class="tour-card__header">
        <span class="tour-card__label">{step.label}</span>
        <span class="tour-card__count">{current} / {total}</span>
      </div>
      <div
        class="tour-card__body"
        dangerouslySetInnerHTML={{ __html: renderGameMarkdown(step.message) }}
      />
      <div class="tour-card__nav">
        <div class="tour-card__nav-left">
          {current > 1 && (
            <button class="vamp-btn tour-card__btn" onClick={prevTourStop}>Back</button>
          )}
        </div>
        <button class="tour-card__skip" onClick={skipTour}>Skip Tour</button>
        <div class="tour-card__nav-right">
          <button class="vamp-btn tour-card__btn tour-card__btn--next" onClick={handleNext}>
            {current === total ? 'Finish' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
