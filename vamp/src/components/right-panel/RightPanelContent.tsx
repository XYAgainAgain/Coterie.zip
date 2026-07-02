import { useEffect } from 'preact/hooks';
import { RPANEL_TABS, TAB_TOOLTIPS, activeRightTab, switchTab, type RPanelTab } from '../../state/panel';
import { currentBloodlineUrl } from '../../state/derived';
import { CoteriePanel } from './CoteriePanel';
import { CharacterPanel } from './CharacterPanel';
import { MovesPanel } from './MovesPanel';
import { AdvancementPanel } from './AdvancementPanel';
import { RulesPanel } from './RulesPanel';

const TAB_SVGS: Partial<Record<RPanelTab, string>> = {
  coterie: '/assets/images/vamp/group.svg',
  moves: '/assets/images/vamp/2d6.svg',
  advancement: '/assets/images/vamp/upgrade.svg',
  rules: '/assets/images/vamp/rulebook.svg',
};

function TabBar() {
  const current = activeRightTab.value;
  const idx = RPANEL_TABS.indexOf(current);
  const bloodlineUrl = currentBloodlineUrl.value;

  useEffect(() => {
    if (!bloodlineUrl) return;
    const existing = document.querySelector(`link[rel="preload"][href="${bloodlineUrl}"]`);
    if (existing) return;
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = bloodlineUrl;
    document.head.appendChild(link);
    return () => { link.remove(); };
  }, [bloodlineUrl]);

  return (
    <nav
      class="vamp-rpanel-bar"
      role="tablist"
      style={`--tab-count: ${RPANEL_TABS.length}; --tab-active-idx: ${idx}`}
    >
      {RPANEL_TABS.map(id => (
        <button
          key={id}
          role="tab"
          aria-selected={current === id}
          class={`vamp-rpanel-bar__tab ${current === id ? 'vamp-rpanel-bar__tab--active' : ''}`}
          data-tab={id}
          onClick={() => switchTab(id)}
          title={TAB_TOOLTIPS[id]}
        >
          {id === 'character' && bloodlineUrl ? (
            <img
              class="vamp-rpanel-bar__playbook-img"
              src={bloodlineUrl}
              alt={TAB_TOOLTIPS[id]}
              loading="eager"
            />
          ) : TAB_SVGS[id] ? (
            <span
              class="vamp-rpanel-bar__icon"
              style={`-webkit-mask-image: url(${TAB_SVGS[id]}); mask-image: url(${TAB_SVGS[id]})`}
            />
          ) : (
            '?'
          )}
        </button>
      ))}
    </nav>
  );
}

export function RightPanelContent() {
  const current = activeRightTab.value;

  return (
    <>
      <TabBar />
      {current === 'coterie' && <CoteriePanel />}
      {current === 'character' && <CharacterPanel />}
      {current === 'moves' && <MovesPanel />}
      {current === 'advancement' && <AdvancementPanel />}
      {current === 'rules' && <RulesPanel />}
    </>
  );
}

