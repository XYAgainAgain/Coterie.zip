/* Creation guide messages are hardcoded trusted content from creation.ts */

import {
  creationMode, creationStep, STEP_LABELS, STEP_MESSAGES, STEP_ZONE,
  CREATION_STEPS, nextStep, prevStep,
  namePromptAnswered, currentStepWarning, incompleteSteps,
} from '../../state/creation';
import { character, updateCharacter } from '../../state/character';
import { startTour } from '../../state/tour';
import { showToast, forceToast } from '../../state/toasts';
import { renderGameMarkdown } from '../../data/transforms';

export function CreationOverlay() {
  if (!creationMode.value) return null;

  const step = creationStep.value;
  const zone = STEP_ZONE[step] ?? 'content';
  const idx = CREATION_STEPS.indexOf(step);
  const isFirst = idx === 0;
  const isLast = idx === CREATION_STEPS.length - 1;
  const isNamePrompt = step === 'name'
    && !namePromptAnswered.value
    && character.value.name.trim() === '';

  function handleNext() {
    if (isLast) {
      handleFinish();
      return;
    }
    const warning = currentStepWarning();
    if (warning) {
      showToast(`${warning} You can come back to this step anytime.`, 'warning');
    }
    nextStep();
  }

  function handleFinish() {
    const missing = incompleteSteps();
    if (missing.length > 0) {
      showToast(`Still incomplete: ${missing.join(', ')}`, 'warning');
      return;
    }
    updateCharacter({ creationComplete: true });
    creationMode.value = false;
    startTour();
    forceToast('Character created! Here\'s a quick tour of your sheet.', 'success');
  }

  function handleYes() {
    namePromptAnswered.value = true;
    const input = document.querySelector('.vamp-identity__name-input') as HTMLInputElement | null;
    input?.focus();
  }

  function handleNotYet() {
    namePromptAnswered.value = true;
    nextStep();
  }

  return (
    <div class={`creation-guide creation-guide--${zone}`}>
      <div class="creation-guide__header">
        <span class="creation-guide__label">{STEP_LABELS[step]}</span>
        <span class="creation-guide__count">{idx + 1} / {CREATION_STEPS.length}</span>
      </div>
      <div
        class="creation-guide__body"
        dangerouslySetInnerHTML={{ __html: renderGameMarkdown(STEP_MESSAGES[step]) }}
      />
      <div class="creation-guide__nav">
        {isNamePrompt ? (
          <>
            <div class="creation-guide__nav-left" />
            <div class="creation-guide__nav-right creation-guide__nav-right--prompt">
              <button class="vamp-btn creation-guide__btn" onClick={handleYes}>
                Yes, I do
              </button>
              <button class="vamp-btn creation-guide__btn" onClick={handleNotYet}>
                Not yet
              </button>
            </div>
          </>
        ) : (
          <>
            <div class="creation-guide__nav-left">
              {!isFirst && (
                <button class="vamp-btn creation-guide__btn" onClick={prevStep}>Back</button>
              )}
            </div>
            <div class="creation-guide__nav-right">
              <button
                class="vamp-btn creation-guide__btn creation-guide__btn--next"
                onClick={handleNext}
              >
                {isLast ? 'Finish' : 'Next'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
