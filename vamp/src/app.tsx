import Router, { Route, route } from 'preact-router';
import { signal } from '@preact/signals';
import { CharacterList } from './pages/CharacterList';
import { CharacterSheet } from './pages/CharacterSheet';
import { CharacterViewer } from './pages/CharacterViewer';
import { CoterieCharacterRoute } from './pages/CoterieCharacterRoute';
import { StDashboard } from './pages/StDashboard';
import { AddTilePicker, StRollModeToggle } from './components/st/StCanvas';
import { stDashboardActive } from './state/stState';
import { EyeToggle } from './components/EyeToggle';
import { TextRocker } from './components/TextRocker';
import { EmailLinkPrompt } from './components/EmailLinkPrompt';
import { SettingsDrawer } from './components/SettingsDrawer';
import { CreationProgress } from './components/creation/CreationProgress';
import { SiteSearch } from './components/SiteSearch';
import { initCustomThemeLifecycle } from './themes/customThemeLifecycle';
import { DiceOverlay } from './dice/DiceOverlay';
import { ToastStack } from './components/ToastStack';
import { VampDialog } from './components/VampDialog';
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

initCustomThemeLifecycle();

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

/* Neon-sign startup flicker, capped to once per 3s; re-hovers inside the
   cooldown get the plain hover glow */
let lastTitleFlicker = -Infinity;
function titleNeonFlicker(e: MouseEvent) {
  /* reduced-motion disables the animation, so animationend would never clear the class */
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const now = performance.now();
  if (now - lastTitleFlicker < 3000) return;
  lastTitleFlicker = now;
  (e.currentTarget as HTMLElement).classList.add('vamp-header__title--flicker');
}

export function App() {
  return (
    <div class="vamp-app">
      <div class="ambient-blob ambient-blob--top" aria-hidden="true" />
      <div class="ambient-blob ambient-blob--bottom" aria-hidden="true" />
      <div class="ambient-smoke" aria-hidden="true" />
      <header class={`vamp-header ${stDashboardActive.value ? 'vamp-header--st' : ''}`}>
        <a class="vamp-brand" href="https://coterie.zip/" title="Go to Coterie.zip">
          <span class="vamp-brand__icon" aria-hidden="true" />
          Coterie.zip
        </a>
        <span class="vamp-brand__presents">presents</span>
        <a
          class="vamp-header__title"
          href="/vamp/"
          title="Back to your characters"
          onMouseEnter={titleNeonFlicker}
          onAnimationEnd={e => (e.currentTarget as HTMLElement).classList.remove('vamp-header__title--flicker')}
        >Vamp</a>
        <div class="vamp-header__spacer" />
        <SiteSearch />
        <div class="vamp-header__spacer" />
        {creationMode.value && <CreationProgress />}
        <div class={`vamp-header__controls ${guideActive.value && currentGuideStep.value?.zone === 'header' ? 'guide-spotlight' : ''}`}>
          {stDashboardActive.value && (
            <div class="vamp-header__st">
              <a
                class="vamp-header__st-home"
                href="/vamp/"
                onClick={(e) => { e.preventDefault(); route('/vamp/'); }}
              >Your Chronicles</a>
              <StRollModeToggle />
              <AddTilePicker />
            </div>
          )}
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
          {!viewingOtherSheet.value && <SettingsDrawer />}
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
            <Route path="/vamp/:coterieCode/st" component={StDashboard} />
            <Route path="/vamp/:coterieCode/:charSlug" component={CoterieCharacterRoute} />
            <Route path="/vamp/:slug" component={CharacterSheet} />
          </Router>
        )}
      </main>
      <DiceOverlay />
      <ToastStack />
      <VampDialog />
    </div>
  );
}
