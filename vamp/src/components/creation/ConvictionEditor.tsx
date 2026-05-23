import { character, updateCharacter } from '../../state/character';
import type { Touchstone } from '../../state/character';

export function ConvictionEditor() {
  const convictions = character.value.convictions;
  const touchstones = character.value.touchstones;

  function setConviction(index: number, value: string) {
    const next = [...convictions];
    next[index] = value;
    updateCharacter({ convictions: next });
  }

  function setTouchstone(index: number, patch: Partial<Touchstone>) {
    const next = touchstones.map((t, i) =>
      i === index ? { ...t, ...patch } : t,
    );
    updateCharacter({ touchstones: next });
  }

  function addPair() {
    if (convictions.length >= 3) return;
    updateCharacter({
      convictions: [...convictions, ''],
      touchstones: [...touchstones, { name: '', pronouns: ['', ''], ageBracket: '', description: '' }],
    });
  }

  function removePair(index: number) {
    if (convictions.length <= 1) return;
    updateCharacter({
      convictions: convictions.filter((_, i) => i !== index),
      touchstones: touchstones.filter((_, i) => i !== index),
    });
  }

  return (
    <div class="creation-picker">
      <h3 class="creation-picker__heading">Convictions & Touchstones</h3>
      <p class="creation-picker__hint">
        Each Conviction is a moral line your character won't cross.
        Each Touchstone is a mortal who embodies that belief.
      </p>

      {convictions.map((cv, i) => (
        <div key={i} class="conviction-pair">
          <div class="conviction-pair__conviction">
            <label class="conviction-pair__label">Conviction {i + 1}</label>
            <input
              type="text"
              class="conviction-pair__input"
              placeholder={'"I will never harm an innocent."'}
              value={cv}
              onInput={(e) => setConviction(i, (e.target as HTMLInputElement).value)}
            />
          </div>
          <div class="conviction-pair__touchstone">
            <label class="conviction-pair__label">Touchstone</label>
            <input
              type="text"
              class="conviction-pair__input conviction-pair__input--name"
              placeholder="Name"
              value={touchstones[i]?.name ?? ''}
              onInput={(e) => setTouchstone(i, { name: (e.target as HTMLInputElement).value })}
            />
            <input
              type="text"
              class="conviction-pair__input conviction-pair__input--desc"
              placeholder="Who are they to you?"
              value={touchstones[i]?.description ?? ''}
              onInput={(e) => setTouchstone(i, { description: (e.target as HTMLInputElement).value })}
            />
          </div>
          {convictions.length > 1 && (
            <button
              class="conviction-pair__remove"
              onClick={() => removePair(i)}
              aria-label={`Remove conviction ${i + 1}`}
            >
              Remove
            </button>
          )}
        </div>
      ))}

      {convictions.length < 3 && (
        <button class="creation-picker__add" onClick={addPair}>
          + Add Conviction
        </button>
      )}
    </div>
  );
}
