import Router, { Route } from 'preact-router';
import { signal } from '@preact/signals';
import { CharacterList } from './pages/CharacterList';
import { CharacterSheet } from './pages/CharacterSheet';
import { CharacterViewer } from './pages/CharacterViewer';
import { EyeToggle } from './components/EyeToggle';
import { TextRocker } from './components/TextRocker';
import { EmailLinkPrompt } from './components/EmailLinkPrompt';
import { CreationProgress } from './components/creation/CreationProgress';
import { DiceOverlay } from './dice/DiceOverlay';
import { ToastStack } from './components/ToastStack';
import { prefetchRules } from './utils/rulesCache';
import { loadGameDataCached } from './utils/gameDataCache';
import { gameData } from './state/derived';
import { editMode, toggleEditMode, viewingOtherSheet } from './state/ui';
import { creationMode } from './state/creation';
import { guideActive, currentGuideStep } from './state/guide';
import { authReady, handleEmailLinkRedirect } from './firebase';
import { startAutoSave, activeCharacterId } from './state/persistence';

const dataReady = signal(false);
const dataError = signal<string | null>(null);

const redirectPath = sessionStorage.getItem('vamp-redirect');
if (redirectPath) {
  sessionStorage.removeItem('vamp-redirect');
  history.replaceState(null, '', redirectPath);
}

Promise.all([
  loadGameDataCached(),
  authReady,
])
  .then(async ([{ data, refresh }]) => {
    await handleEmailLinkRedirect();
    gameData.value = data;
    prefetchRules();
    startAutoSave();
    dataReady.value = true;
    refresh().then(fresh => {
      if (fresh && !editMode.value && !creationMode.value) gameData.value = fresh;
    });
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
        <div class={`vamp-header__controls ${guideActive.value && currentGuideStep.value?.zone === 'header' ? 'guide-spotlight' : ''}`}>
          <TextRocker />
          {!viewingOtherSheet.value && activeCharacterId.value && (
            <button
              class={`vamp-header__lock ${editMode.value ? 'vamp-header__lock--editing' : ''}`}
              onClick={toggleEditMode}
              aria-label={editMode.value ? 'Lock (switch to playing)' : 'Unlock (switch to editing)'}
              aria-pressed={editMode.value}
            >
              <span class="vamp-header__lock-label">{editMode.value ? 'PLAY' : 'EDIT'}</span>
              <span class={`vamp-header__lock-icon vamp-header__lock-icon--active ${editMode.value ? 'vamp-header__lock-icon--unlocked' : 'vamp-header__lock-icon--locked'}`} />
              <span class={`vamp-header__lock-icon vamp-header__lock-icon--hover ${editMode.value ? 'vamp-header__lock-icon--locked' : 'vamp-header__lock-icon--unlocked'}`} />
            </button>
          )}
          {viewingOtherSheet.value && (
            <span class="vamp-header__viewing-label">Viewing</span>
          )}
          {!viewingOtherSheet.value && <EmailLinkPrompt />}
          <EyeToggle />
        </div>
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
            <Route path="/vamp/view/:charId" component={CharacterViewer} />
            <Route path="/vamp/:coterieCode/:charSlug" component={CharacterViewer} />
            <Route path="/vamp/:slug" component={CharacterSheet} />
          </Router>
        )}
      </main>
      <DiceOverlay />
      <ToastStack />
    </div>
  );
}
