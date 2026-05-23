import { tourMode, currentTourStep, tourProgress, nextTourStop, prevTourStop, skipTour } from '../../state/tour';

export function TourOverlay() {
  if (!tourMode.value) return null;

  const step = currentTourStep.value;
  const { current, total } = tourProgress.value;

  return (
    <div class={`tour-card tour-card--${step.zone}`}>
      <div class="tour-card__header">
        <span class="tour-card__label">{step.label}</span>
        <span class="tour-card__count">{current} / {total}</span>
      </div>
      <div class="tour-card__body">{step.message}</div>
      <div class="tour-card__nav">
        {current > 1 && (
          <button class="vamp-btn tour-card__btn" onClick={prevTourStop}>Back</button>
        )}
        <button class="vamp-btn tour-card__btn tour-card__btn--next" onClick={nextTourStop}>
          {current === total ? 'Finish' : 'Next'}
        </button>
        <button class="tour-card__skip" onClick={skipTour}>Skip Tour</button>
      </div>
    </div>
  );
}
