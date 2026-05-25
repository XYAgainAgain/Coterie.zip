/* Guide messages are hardcoded trusted content from creation.ts and tour.ts */

import {
  guideActive, currentGuideStep, guideProgress, isCreationPhase,
  nextGuideStep, prevGuideStep, skipGuide, finishCreation,
  currentCreationStepWarning, incompleteCreationSteps,
} from '../../state/guide';
import { namePromptAnswered } from '../../state/creation';
import { character } from '../../state/character';
import { showToast, forceToast } from '../../state/toasts';
import { renderGameMarkdown } from '../../data/transforms';

export function GuideCard() {
  if (!guideActive.value) return null;

  const step = currentGuideStep.value;
  const { current, total } = guideProgress.value;
  const inCreation = isCreationPhase.value;

  const isNamePrompt = inCreation
    && step.creationStep === 'name'
    && !namePromptAnswered.value
    && character.value.name.trim() === '';

  const isLastCreationStep = inCreation
    && step.creationStep === 'xp';

  function handleNext() {
    if (isLastCreationStep) {
      handleFinishCreation();
      return;
    }
    if (inCreation) {
      const warning = currentCreationStepWarning();
      if (warning) {
        showToast(`${warning} You can come back to this step anytime.`, 'warning');
      }
    }
    nextGuideStep();
    if (current === total) {
      forceToast('Welcome to Vamp! Click any stat button to roll dice, and use the Move Modifiers panel to add bonuses. Have fun!', 'success', 50);
    }
  }

  function handleFinishCreation() {
    const missing = incompleteCreationSteps();
    if (missing.length > 0) {
      showToast(`Still incomplete: ${missing.join(', ')}`, 'warning');
      return;
    }
    finishCreation();
    forceToast('Character created! Continuing with a quick tour of your sheet.', 'success', 50);
  }

  function handleYes() {
    namePromptAnswered.value = true;
    const input = document.querySelector('.vamp-identity__name-input') as HTMLInputElement | null;
    input?.focus();
  }

  function handleNotYet() {
    namePromptAnswered.value = true;
    nextGuideStep();
  }

  const buttonLabel = isLastCreationStep
    ? 'Finish Creation'
    : current === total
      ? 'Finish'
      : 'Next';

  return (
    <div class={`guide-card guide-card--${step.zone}`}>
      <div class="guide-card__header">
        <span class="guide-card__label">{step.label}</span>
        <span class="guide-card__count">{current} / {total}</span>
      </div>
      <div
        class="guide-card__body"
        dangerouslySetInnerHTML={{ __html: renderGameMarkdown(step.message) }}
      />
      <div class="guide-card__nav">
        {isNamePrompt ? (
          <>
            <div class="guide-card__nav-left" />
            <div />
            <div class="guide-card__nav-right guide-card__nav-right--prompt">
              <button class="vamp-btn guide-card__btn" onClick={handleYes}>
                Yes, I do
              </button>
              <button class="vamp-btn guide-card__btn" onClick={handleNotYet}>
                Not yet
              </button>
            </div>
          </>
        ) : (
          <>
            <div class="guide-card__nav-left">
              {current > 1 && (
                <button class="vamp-btn guide-card__btn" onClick={prevGuideStep}>Back</button>
              )}
            </div>
            <button class="guide-card__skip" onClick={skipGuide}>
              {inCreation ? 'Skip All' : 'Skip Tour'}
            </button>
            <div class="guide-card__nav-right">
              <button
                class="vamp-btn guide-card__btn guide-card__btn--next"
                onClick={handleNext}
              >
                {buttonLabel}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
