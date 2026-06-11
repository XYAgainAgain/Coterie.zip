import {
  CREATION_STEPS, STEP_LABELS,
  creationStep, stepComplete, goToStep, exitCreationMode,
  type CreationStep,
} from '../../state/creation';
import { guideActive } from '../../state/guide';

export function CreationProgress() {
  const current = creationStep.value;
  const complete = stepComplete.value;
  /* First-run creation always runs the guide; recreate mode does not. The DONE button is
     the recreate-mode exit (no completeness gate — the character was already valid). */
  const recreateMode = !guideActive.value;

  return (
    <div class="creation-progress">
      {CREATION_STEPS.map((step, i) => (
        <button
          key={step}
          class={stepClass(step, current, complete)}
          onClick={() => goToStep(step)}
          aria-label={`${STEP_LABELS[step]}${complete[step] ? ' (complete)' : ''}`}
          aria-current={step === current ? 'step' : undefined}
        >
          <span class="creation-progress__dot" />
          <span class="creation-progress__label">{STEP_LABELS[step]}</span>
          {i < CREATION_STEPS.length - 1 && (
            <span class="creation-progress__connector" />
          )}
        </button>
      ))}
      {recreateMode && (
        <button class="creation-progress__done" onClick={exitCreationMode}>
          Done
        </button>
      )}
    </div>
  );
}

function stepClass(
  step: CreationStep,
  current: CreationStep,
  complete: Record<CreationStep, boolean>,
): string {
  const classes = ['creation-progress__step'];
  if (step === current) classes.push('creation-progress__step--active');
  if (complete[step]) classes.push('creation-progress__step--complete');
  return classes.join(' ');
}
