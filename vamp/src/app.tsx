import Router, { Route } from 'preact-router';
import { signal } from '@preact/signals';
import { CharacterList } from './pages/CharacterList';
import { CharacterSheet } from './pages/CharacterSheet';
import { EyeToggle } from './components/EyeToggle';
import { DiceOverlay } from './dice/DiceOverlay';

const editMode = signal(false);

function toggleEdit() {
  editMode.value = !editMode.value;
  document.documentElement.setAttribute('data-edit-mode', String(editMode.value));
}

export function App() {
  return (
    <div class="vamp-app">
      <div class="ambient-blob ambient-blob--top" aria-hidden="true" />
      <div class="ambient-blob ambient-blob--bottom" aria-hidden="true" />
      <div class="ambient-smoke" aria-hidden="true" />
      <header class="vamp-header">
        <span class="vamp-header__title">Vamp</span>
        <div class="vamp-header__spacer" />
        <button class="vamp-header__btn" onClick={() => {}}>
          New Night
        </button>
        <button class="vamp-header__btn" onClick={() => {}}>
          New Session
        </button>
        <button
          class="vamp-header__lock"
          onClick={toggleEdit}
          aria-label={editMode.value ? 'Lock (switch to viewing)' : 'Unlock (switch to editing)'}
          aria-pressed={editMode.value}
        >
          <span class={`vamp-header__lock-icon ${editMode.value ? 'vamp-header__lock-icon--unlocked' : 'vamp-header__lock-icon--locked'}`} />
        </button>
        <EyeToggle />
      </header>
      <main class="vamp-body">
        <Router>
          <Route path="/vamp/" component={CharacterList} />
          <Route path="/vamp/new" component={CharacterSheet} />
          <Route path="/vamp/:slug" component={CharacterSheet} />
        </Router>
      </main>
      <DiceOverlay />
    </div>
  );
}
