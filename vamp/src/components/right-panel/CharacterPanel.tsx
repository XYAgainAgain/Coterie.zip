/* All rendered markdown is from Coterie's verified JSON parsers (trusted content, duh) */

import { useRef, useEffect } from 'preact/hooks';
import { currentPlaybook, currentPredatorType, currentAgeBracket, gameData, baaliGrantedBaneEntries } from '../../state/derived';
import { character, updateCharacter, type GhoulPatron } from '../../state/character';
import { editMode, viewingOtherSheet } from '../../state/ui';
import { creationMode, creationStep } from '../../state/creation';
import { BLANK_CHARACTER } from '../../state/persistence';
import { EditableTextField } from '../EditableTextField';
import { renderGameMarkdown, parseStatString } from '../../data/transforms';
import { STAT_NAMES } from '../../data/types';
import type { StatName } from '../../data/types';

const STAT_ABBREV: Record<string, string> = {
  Blood: 'BLD', Shadow: 'SHA', Resolve: 'RES', Demeanor: 'DEM', Wits: 'WIT',
};

const CUSTOM_SPREAD = [2, 1, 1, 0, -1] as const;

function formatStatChip(name: StatName, val: number): string {
  const sign = val >= 0 ? '+' : '';
  return `${sign}${val} ${STAT_ABBREV[name] ?? name.slice(0, 3).toUpperCase()}`;
}

function CustomStatAllocator() {
  const char = character.value;

  /* Which stat is assigned to each spread slot (index into CUSTOM_SPREAD) */
  const slotAssignments: (StatName | null)[] = CUSTOM_SPREAD.map(() => null);
  for (const stat of STAT_NAMES) {
    const val = char.stats[stat];
    if (isNaN(val)) continue;
    /* Find the first unoccupied slot with this value */
    const idx = CUSTOM_SPREAD.findIndex((sv, i) => sv === val && slotAssignments[i] === null);
    if (idx !== -1) slotAssignments[idx] = stat;
  }

  const assignedStats = new Set(slotAssignments.filter(Boolean) as StatName[]);

  function assignSlot(slotIndex: number, stat: string) {
    const newStats = { ...char.stats };
    const prev = slotAssignments[slotIndex];
    if (prev) newStats[prev] = NaN;
    if (stat) {
      newStats[stat as StatName] = CUSTOM_SPREAD[slotIndex];
    }
    updateCharacter({ stats: newStats });
  }

  return (
    <div class="vamp-custom-allocator" onClick={(e) => e.stopPropagation()}>
      {CUSTOM_SPREAD.map((val, i) => {
        const current = slotAssignments[i];
        return (
          <div class="vamp-custom-allocator__slot" key={i}>
            <span class="vamp-custom-allocator__value">{val >= 0 ? `+${val}` : val}</span>
            <select
              class="creation-dropdown creation-dropdown--stat"
              value={current ?? ''}
              onChange={(e) => assignSlot(i, (e.target as HTMLSelectElement).value)}
            >
              <option value="">Stat</option>
              {STAT_NAMES.map(s => {
                const taken = assignedStats.has(s) && s !== current;
                return !taken && <option key={s} value={s}>{s}</option>;
              })}
            </select>
          </div>
        );
      })}
    </div>
  );
}

/* Everything an Age Bracket pick cascades into: BP, starting XP, and Humanity */
function ageBracketPatch(bracket: { name: string; startingBloodPotency: number; startingHumanity: string }) {
  const h = bracket.startingHumanity.split(/[^0-9]+/).map(Number).filter(n => !isNaN(n));
  const bp = bracket.startingBloodPotency;
  return {
    ageBracket: bracket.name,
    bp,
    xp: Math.min(10, Math.max(1, bp) * 2),
    humanity: h.length > 0 ? Math.max(...h) : 7,
  };
}

const SEMIMORTAL_PLAYBOOKS = new Set(['Ghoul', 'Thin-Blood']);

function PlaybookDropdown() {
  const data = gameData.value;
  const char = character.value;
  if (!data) return null;

  const clanPlaybooks = data.playbooks.filter(p => p.category === 'clan');
  const clanless = data.playbooks.filter(p => p.category === 'clanless');

  return (
    <select
      class="creation-dropdown"
      value={char.playbook}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        const val = (e.target as HTMLSelectElement).value;
        if (val === char.playbook) return;
        /* Auto-set the only legal bracket; leaving the pair invalidates a lingering Semimortal. */
        const semimortal = SEMIMORTAL_PLAYBOOKS.has(val)
          ? data.ageBrackets.find(b => b.name === 'Semimortal')
          : undefined;
        updateCharacter({
          playbook: val,
          archetypeName: '',
          stats: { ...BLANK_CHARACTER.stats },
          predatorType: '',
          unlockedDisciplines: [],
          startingDisciplines: [],
          knownPowers: [],
          knownProjectPowers: [],
          xpTriggers: [],
          merits: [],
          flaws: [],
          folkloricBanes: val === 'Baali' ? baaliGrantedBaneEntries() : [],
          baneChoice: 'standard',
          ...(semimortal ? ageBracketPatch(semimortal)
            : char.ageBracket === 'Semimortal' ? { ageBracket: '' } : {}),
        });
      }}
    >
      <option value="">Choose Playbook</option>
      <optgroup label="Clan Playbooks">
        {clanPlaybooks.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
      </optgroup>
      <optgroup label="Clanless Playbooks">
        {clanless.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
      </optgroup>
    </select>
  );
}

const PATRON_EXCLUDED = new Set(['Ghoul', 'Thin-Blood', 'Devorari', 'Osirian', 'Baali']);

function GhoulPatronPrompt() {
  const char = character.value;
  const patron = char.ghoulPatron;
  const data = gameData.value;
  const allPlaybooks = data?.playbooks ?? [];
  const eligible = allPlaybooks.filter(p => !PATRON_EXCLUDED.has(p.name));

  function setPatronType(type: 'npc' | 'pc') {
    if (patron?.type === type) return;
    updateCharacter({
      ghoulPatron: { type, bloodline: '', bp: 1, vampUrl: '' },
      unlockedDisciplines: [],
      knownPowers: [],
      knownProjectPowers: [],
    });
  }

  function updatePatron(patch: Partial<GhoulPatron>) {
    if (!patron) return;
    updateCharacter({ ghoulPatron: { ...patron, ...patch } });
  }

  return (
    <div class="vamp-ghoul-patron">
      <div class="vamp-ghoul-patron__title">Who's your patron?</div>
      <div class="vamp-ghoul-patron__buttons">
        <button
          class={`vamp-btn ${patron?.type === 'npc' ? 'vamp-btn--active' : ''}`}
          onClick={() => setPatronType('npc')}
        >NPC</button>
        <button
          class={`vamp-btn ${patron?.type === 'pc' ? 'vamp-btn--active' : ''}`}
          onClick={() => setPatronType('pc')}
        >PC</button>
      </div>

      {patron?.type === 'npc' && (
        <div class="vamp-ghoul-patron__fields">
          <label class="vamp-ghoul-patron__label">
            Bloodline
            <select
              class="vamp-input"
              value={patron.bloodline}
              onChange={e => updatePatron({ bloodline: (e.target as HTMLSelectElement).value })}
            >
              <option value="">Choose...</option>
              {eligible.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
            </select>
          </label>
          <label class="vamp-ghoul-patron__label">
            Blood Potency
            <select
              class="vamp-input"
              value={patron.bp}
              onChange={e => updatePatron({ bp: parseInt((e.target as HTMLSelectElement).value, 10) })}
            >
              {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>
      )}

      {patron?.type === 'pc' && (
        <div class="vamp-ghoul-patron__fields">
          <label class="vamp-ghoul-patron__label">
            Patron's Vamp URL
            <input
              class="vamp-input"
              type="text"
              placeholder="Paste URL or invite code..."
              value={patron.vampUrl}
              onInput={e => updatePatron({ vampUrl: (e.target as HTMLInputElement).value })}
            />
          </label>
        </div>
      )}
    </div>
  );
}

function PlaybookSection({ creating, focused }: { creating: boolean; focused: boolean }) {
  const pb = currentPlaybook.value;
  const char = character.value;
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (!creating || !detailsRef.current) return;
    detailsRef.current.open = focused;
  }, [focused, creating]);

  const sectionTitle = creating ? <PlaybookDropdown /> : pb?.name;
  const showContent = creating || !!pb;
  if (!showContent) return null;

  return (
    <details class="vamp-rpanel-section" ref={detailsRef}>
      <summary class="vamp-rpanel-section__bar">
        {sectionTitle}
        <span class="vamp-rpanel-section__pill">Playbook</span>
      </summary>
      <div class="vamp-rpanel-section__content">
        {pb ? (
          <>
            <div class="vamp-rpanel-field__tagline">{pb.tagline}</div>
            <details class="vamp-detail__collapsible" open={creating || undefined}>
              <summary class="vamp-detail__summary">What Are You?</summary>
              <div class="vamp-detail__body" dangerouslySetInnerHTML={{ __html: renderGameMarkdown(pb.whatAreYou) }} />
            </details>
            <div class="vamp-rpanel-field">
              <span class="vamp-rpanel-field__label">Disciplines</span>
              <div class="vamp-rpanel-field__value" dangerouslySetInnerHTML={{ __html: renderGameMarkdown(pb.disciplines) }} />
              {creating && <div class="vamp-rpanel-field__aside">(Click for full details. You'll pick yours soon!)</div>}
            </div>
            <div class="vamp-rpanel-tier vamp-rpanel-tier--flaw">
              <div class="vamp-rpanel-tier__label">Bane: <em>{pb.baneName}</em></div>
              <div class="vamp-rpanel-tier__body" dangerouslySetInnerHTML={{ __html: renderGameMarkdown(pb.baneDescription) }} />
            </div>
            <div class="vamp-rpanel-tier vamp-rpanel-tier--compulsion">
              <div class="vamp-rpanel-tier__label">Compulsion: <em>{pb.compulsionName ?? 'None'}</em></div>
              <div class="vamp-rpanel-tier__body" dangerouslySetInnerHTML={{ __html: renderGameMarkdown(pb.compulsionDescription) }} />
            </div>
            {creating && char.playbook === 'Ghoul' && <GhoulPatronPrompt />}
            {pb.archetypes.length > 0 && (
              <div class="vamp-rpanel-field">
                <span class="vamp-rpanel-field__label">Archetypes</span>
                <div class="vamp-detail__archetypes">
                  {pb.archetypes.map(arch => {
                    const stats = parseStatString(arch.stats);
                    const isActive = char.archetypeName === arch.name;
                    return (
                      <div
                        class={`vamp-archetype ${creating ? 'vamp-archetype--selectable' : ''} ${isActive ? 'vamp-archetype--active' : ''}`}
                        key={arch.name}
                        onClick={creating ? () => updateCharacter({ archetypeName: arch.name, stats: parseStatString(arch.stats) as Record<StatName, number> }) : undefined}
                      >
                        {creating && <input type="radio" name="archetype" checked={isActive} readOnly class="vamp-archetype__radio" />}
                        <div class="vamp-archetype__name">{arch.name}</div>
                        <div class="vamp-archetype__tagline">{arch.tagline}</div>
                        <div class="vamp-archetype__stats">
                          {(Object.entries(stats) as [StatName, number][]).map(([name, val]) => (
                            <span class="vamp-archetype__chip" key={name}>{formatStatChip(name, val)}</span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div
              class={`vamp-archetype ${creating ? 'vamp-archetype--selectable' : ''} ${char.archetypeName === 'Custom' ? 'vamp-archetype--active' : ''}`}
              onClick={creating && char.archetypeName !== 'Custom' ? () => updateCharacter({ archetypeName: 'Custom', stats: { Blood: NaN, Shadow: NaN, Resolve: NaN, Demeanor: NaN, Wits: NaN } }) : undefined}
            >
              {creating && <input type="radio" name="archetype" checked={char.archetypeName === 'Custom'} readOnly class="vamp-archetype__radio" />}
              {char.archetypeName === 'Custom' && !viewingOtherSheet.value && (creating || editMode.value) ? (
                <>
                  <EditableTextField
                    className="vamp-archetype__name"
                    value={char.customArchetypeName}
                    placeholder="Custom Archetype"
                    onSave={(v) => updateCharacter({ customArchetypeName: v })}
                    hideLabel
                  />
                  <EditableTextField
                    className="vamp-archetype__tagline"
                    value={char.customArchetypeTagline}
                    placeholder="Your concept, your spread."
                    onSave={(v) => updateCharacter({ customArchetypeTagline: v })}
                    hideLabel
                  />
                </>
              ) : (
                <>
                  <div class="vamp-archetype__name">{char.customArchetypeName || 'Custom Archetype'}</div>
                  <div class="vamp-archetype__tagline">{char.customArchetypeTagline || 'Your concept, your spread.'}</div>
                </>
              )}
              {creating && char.archetypeName === 'Custom' ? (
                <CustomStatAllocator />
              ) : (
                <div class="vamp-archetype__stats">
                  <span class="vamp-archetype__chip">+2</span>
                  <span class="vamp-archetype__chip">+1</span>
                  <span class="vamp-archetype__chip">+1</span>
                  <span class="vamp-archetype__chip">+0</span>
                  <span class="vamp-archetype__chip">-1</span>
                </div>
              )}
            </div>
          </>
        ) : (
          <div class="vamp-rpanel-field__tagline">Select a Playbook to see its details.</div>
        )}
      </div>
    </details>
  );
}

function AgeBracketSection({ creating, focused }: { creating: boolean; focused: boolean }) {
  const ab = currentAgeBracket.value;
  const data = gameData.value;
  const char = character.value;
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (!creating || !detailsRef.current) return;
    detailsRef.current.open = focused;
  }, [focused, creating]);

  const title = creating ? (
    <select
      class="creation-dropdown"
      value={char.ageBracket}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        const val = (e.target as HTMLSelectElement).value;
        const bracket = data?.ageBrackets.find(b => b.name === val);
        if (!bracket) return;
        updateCharacter({ ...ageBracketPatch(bracket), predatorType: '' });
      }}
    >
      <option value="">Choose Age</option>
      {data?.ageBrackets
        .filter(b => {
          const isSemimortalOnly = char.playbook === 'Ghoul' || char.playbook === 'Thin-Blood';
          if (isSemimortalOnly) return b.name === 'Semimortal';
          if (char.playbook) return b.name !== 'Semimortal';
          return true;
        })
        .map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
    </select>
  ) : ab?.name;

  if (!creating && !ab) return null;

  return (
    <details class="vamp-rpanel-section" ref={detailsRef}>
      <summary class="vamp-rpanel-section__bar">
        {title}
        <span class="vamp-rpanel-section__pill">Age Bracket</span>
      </summary>
      <div class="vamp-rpanel-section__content">
        {ab ? (
          <>
            <div class="vamp-rpanel-field">
              <span class="vamp-rpanel-field__label">Embraced</span>
              <span class="vamp-rpanel-field__value">{ab.embraced}</span>
            </div>
            {ab.flavor && (
              <div class="vamp-rpanel-field__body" dangerouslySetInnerHTML={{ __html: renderGameMarkdown(ab.flavor) }} />
            )}
            <div class="vamp-rpanel-field">
              <span class="vamp-rpanel-field__label">Starting BP/Humanity</span>
              <span class="vamp-rpanel-field__value">BP {ab.startingBloodPotency}/{ab.startingHumanity}</span>
            </div>
            <div class="vamp-rpanel-field">
              <span class="vamp-rpanel-field__label">Advancement</span>
              <span class="vamp-rpanel-field__value">{ab.advancement}</span>
            </div>
            <div class="vamp-rpanel-field">
              <span class="vamp-rpanel-field__label">Narrative Feel</span>
              <span class="vamp-rpanel-field__value">{ab.narrativeFeel}</span>
            </div>
          </>
        ) : (
          <div class="vamp-rpanel-field__tagline">Select an Age Bracket to see its details.</div>
        )}
      </div>
    </details>
  );
}

function PredatorTypeSection({ creating, focused }: { creating: boolean; focused: boolean }) {
  const pt = currentPredatorType.value;
  const data = gameData.value;
  const char = character.value;
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (!creating || !detailsRef.current) return;
    detailsRef.current.open = focused;
  }, [focused, creating]);

  const isGhoul = char.playbook === 'Ghoul';
  const canSkip = char.ageBracket === 'Fledgling' || char.playbook === 'Devorari';

  const title = creating ? (
    <select
      class="creation-dropdown"
      value={char.predatorType}
      disabled={isGhoul}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        updateCharacter({ predatorType: (e.target as HTMLSelectElement).value });
      }}
    >
      <option value="">{isGhoul ? 'None' : canSkip ? 'None (optional)' : 'Choose Predator Type'}</option>
      {!isGhoul && data?.predatorTypes.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
    </select>
  ) : pt?.name;

  if (!creating && !pt) return null;

  return (
    <details class="vamp-rpanel-section" ref={detailsRef}>
      <summary class="vamp-rpanel-section__bar">
        {title}
        <span class="vamp-rpanel-section__pill">Predator Type</span>
      </summary>
      <div class="vamp-rpanel-section__content">
        {pt ? (
          <>
            {pt.description && (
              <div class="vamp-rpanel-field__body" dangerouslySetInnerHTML={{ __html: renderGameMarkdown(pt.description) }} />
            )}
            <div class="vamp-rpanel-field">
              <span class="vamp-rpanel-field__label">Hunting Stat</span>
              <span class="vamp-rpanel-field__value vamp-rpanel-field__value--accent">{pt.huntingStat}</span>
            </div>
            <div class="vamp-rpanel-field">
              <span class="vamp-rpanel-field__label">Discipline</span>
              <span class="vamp-rpanel-field__value vamp-rpanel-field__value--accent">{pt.discipline}</span>
            </div>
            <div class="vamp-rpanel-tier vamp-rpanel-tier--merit">
              <div class="vamp-rpanel-tier__label">Merit: <em>{pt.merit.name}</em></div>
              <div class="vamp-rpanel-tier__body" dangerouslySetInnerHTML={{ __html: renderGameMarkdown(pt.merit.description) }} />
            </div>
            <div class="vamp-rpanel-tier vamp-rpanel-tier--flaw">
              <div class="vamp-rpanel-tier__label">Flaw: <em>{pt.flaw.name}</em></div>
              <div class="vamp-rpanel-tier__body" dangerouslySetInnerHTML={{ __html: renderGameMarkdown(pt.flaw.description) }} />
            </div>
            {pt.humanity && (
              <div class="vamp-rpanel-field">
                <span class="vamp-rpanel-field__label">Humanity</span>
                <span class="vamp-rpanel-field__value">{pt.humanity}</span>
              </div>
            )}
            {pt.feedingRules && (
              <div class="vamp-rpanel-field">
                <span class="vamp-rpanel-field__label">Feeding Rules</span>
                <div class="vamp-rpanel-field__value" dangerouslySetInnerHTML={{ __html: renderGameMarkdown(pt.feedingRules) }} />
              </div>
            )}
          </>
        ) : (
          <div class="vamp-rpanel-field__tagline">Select a Predator Type to see its details.</div>
        )}
      </div>
    </details>
  );
}

export function CharacterPanel() {
  const creating = creationMode.value;
  const step = creationStep.value;

  return (
    <div class="vamp-rpanel-scroll">
      <PlaybookSection creating={creating} focused={creating && step === 'playbook'} />
      <AgeBracketSection creating={creating} focused={creating && step === 'age'} />
      <PredatorTypeSection creating={creating} focused={creating && step === 'predator'} />
    </div>
  );
}
