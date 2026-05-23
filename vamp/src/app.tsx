import Router, { Route } from 'preact-router';
import { signal } from '@preact/signals';
import { CharacterList } from './pages/CharacterList';
import { CharacterSheet } from './pages/CharacterSheet';
import { EyeToggle } from './components/EyeToggle';
import { CreationProgress } from './components/creation/CreationProgress';
import { DiceOverlay } from './dice/DiceOverlay';
import { ToastStack } from './components/ToastStack';
import { loadAllGameData } from './data/loader';
import { gameData } from './state/derived';
import { editMode, toggleEditMode } from './state/ui';
import { creationMode } from './state/creation';
import { authReady } from './firebase';
import { startAutoSave } from './state/persistence';

const dataReady = signal(false);
const dataError = signal<string | null>(null);

const redirectPath = sessionStorage.getItem('vamp-redirect');
if (redirectPath) {
  sessionStorage.removeItem('vamp-redirect');
  history.replaceState(null, '', redirectPath);
}

Promise.all([
  loadAllGameData(),
  authReady,
])
  .then(([data]) => {
    gameData.value = data;
    startAutoSave();
    dataReady.value = true;
  })
  .catch(err => {
    dataError.value = err instanceof Error ? err.message : String(err);
  });

export function App() {
  return (
    <div class="vamp-app">
      <div class="ambient-blob ambient-blob--top" aria-hidden="true" />
      <div class="ambient-blob ambient-blob--bottom" aria-hidden="true" />
      <div class="ambient-smoke" aria-hidden="true" />
      <header class="vamp-header">
        <span class="vamp-header__title">Vamp</span>
        <div class="vamp-header__spacer" />
        {creationMode.value && <CreationProgress />}
        <button
          class="vamp-header__lock"
          onClick={toggleEditMode}
          aria-label={editMode.value ? 'Lock (switch to viewing)' : 'Unlock (switch to editing)'}
          aria-pressed={editMode.value}
        >
          <span class={`vamp-header__lock-icon ${editMode.value ? 'vamp-header__lock-icon--unlocked' : 'vamp-header__lock-icon--locked'}`} />
        </button>
        <EyeToggle />
      </header>
      <main class="vamp-body">
        {dataError.value ? (
          <div class="vamp-loading vamp-loading--error">
            Failed to load game data: {dataError.value}
          </div>
        ) : !dataReady.value ? (
          <div class="vamp-loading">Materializing...</div>
        ) : (
          <Router>
            <Route path="/vamp/" component={CharacterList} />
            <Route path="/vamp/:slug" component={CharacterSheet} />
          </Router>
        )}
      </main>
      <DiceOverlay />
      <ToastStack />
    </div>
  );
}
