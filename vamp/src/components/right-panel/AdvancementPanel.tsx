import { useEffect } from 'preact/hooks';
import { useSignal } from '@preact/signals';
import { switchContentTab } from '../../state/panel';
import { currentPlaybook, gameData, statCap, parseXPValue, xpRange, grantedBaneXP } from '../../state/derived';
import { character, setXP, updateCharacter, addPendingUpgrade, buyAdvancedMove, type CharacterState } from '../../state/character';
import { editMode, enterDisciplineBuyMode } from '../../state/ui';
import { creationMode, creationStep } from '../../state/creation';
import { renderGameMarkdown } from '../../data/transforms';
import { STAT_NAMES } from '../../data/types';
import type { StatName, Merit, Flaw } from '../../data/types';
import { CollapsibleSection } from './shared';

function groupByCategory<T extends { category: string }>(items: T[]): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const list = map.get(item.category);
    if (list) list.push(item);
    else map.set(item.category, [item]);
  }
  return [...map.entries()];
}

/* Ascending XP (cost for Merits, gain for Flaws), then A→Z. */
function sortByXPThenName<T extends { name: string }>(items: T[], xpOf: (item: T) => string): T[] {
  return [...items].sort((a, b) =>
    (parseXPValue(xpOf(a)) - parseXPValue(xpOf(b))) || a.name.localeCompare(b.name),
  );
}

function checkLimitEligibility(
  limit: string,
  char: CharacterState,
): boolean {
  if (limit === '—' || limit === '—') return true;

  /* "Requires X access" */
  const reqAccess = limit.match(/^Requires\s+(.+?)\s+access$/i);
  if (reqAccess) {
    const disc = reqAccess[1].toLowerCase().replace(/\s+/g, '-');
    return char.unlockedDisciplines.some(d => d.toLowerCase().replace(/\s+/g, '-') === disc);
  }

  /* "BP N or lower" / "BP N or higher" / "BP N+" */
  const bpLow = limit.match(/^BP\s+(\d+)\s+or\s+lower$/i);
  if (bpLow) return char.bp <= parseInt(bpLow[1]);
  const bpHigh = limit.match(/^BP\s+(\d+)(?:\s+or\s+higher|\+)$/i);
  if (bpHigh) return char.bp >= parseInt(bpHigh[1]);

  /* "Unavailable to X" (Playbook or Predator Type name) */
  const unavail = limit.match(/^Unavailable to\s+(.+)$/i);
  if (unavail) {
    const targets = unavail[1].split(/(?:,\s*|\s+(?:and|&)\s+)/i)
      .map(s => s.replace(/\*/g, '').replace(/\s+Predator\s+Type$/i, '').trim());
    for (const t of targets) {
      if (t.toLowerCase() === char.playbook.toLowerCase()) return false;
      if (t.toLowerCase() === char.predatorType.toLowerCase()) return false;
      /* "Nosferatu with *Monstrous Visage* Bane" — the named Bane may be the
         clan's standard Bane or its variant; resolve via clanBaneVariants. */
      const withBane = t.match(/^(.+?)\s+with\s+(?:the\s+)?(.+?)\s+(?:Variant\s+)?Bane$/i);
      if (withBane) {
        const pb = withBane[1].trim();
        const baneName = withBane[2].replace(/\*/g, '').trim().toLowerCase();
        if (pb.toLowerCase() === char.playbook.toLowerCase()) {
          const variantName = gameData.value?.optionalExtras?.clanBaneVariants
            .find(v => v.clan.toLowerCase() === pb.toLowerCase())?.baneName.toLowerCase();
          const hasNamedBane = baneName === variantName
            ? char.baneChoice === 'variant' || char.baneChoice === 'both'
            : char.baneChoice === 'standard' || char.baneChoice === 'both';
          if (hasNamedBane) return false;
        }
      }
      /* "anyone incapable of the Embrace" */
      if (/incapable of the Embrace/i.test(t)) {
        if (['Ghoul', 'Thin-Blood', 'Osirian'].includes(char.playbook)) return false;
      }
    }
    return true;
  }

  /* "Requires *X* or *Y* Predator Type" */
  const reqPT = limit.match(/^Requires\s+(.+?)\s+Predator\s+Type$/i);
  if (reqPT) {
    const pts = reqPT[1].split(/(?:,\s*|\s+or\s+)/i).map(s => s.replace(/\*/g, '').trim());
    return pts.some(p => p.toLowerCase() === char.predatorType.toLowerCase());
  }

  /* "Requires Toreador or Daughter of Cacophony" (Playbook requirement) */
  const reqPB = limit.match(/^Requires\s+(.+)$/i);
  if (reqPB && !reqPB[1].includes('access') && !reqPB[1].includes('Predator')) {
    const pbs = reqPB[1].split(/(?:,\s*|\s+or\s+)/i).map(s => s.replace(/\*/g, '').trim());
    return pbs.some(p => p.toLowerCase() === char.playbook.toLowerCase());
  }

  /* "X Only" or "Only X" (data uses plural like "Only Ghouls" for Playbook "Ghoul") */
  const onlyMatch = limit.match(/^(.+?)\s+Only$/i) ?? limit.match(/^Only\s+(.+)$/i);
  if (onlyMatch) {
    const target = onlyMatch[1].replace(/\*/g, '').trim().toLowerCase();
    const pb = char.playbook.toLowerCase();
    return target === pb || target === pb + 's';
  }

  /* "Can't have *X* Merit/Flaw" */
  const cantHave = limit.match(/^Can'?t\s+have\s+\*?(.+?)\*?\s+(?:Merit|Flaw)$/i);
  if (cantHave) {
    const name = cantHave[1].trim();
    return !char.merits.some(m => m.name === name) && !char.flaws.some(f => f.name === name);
  }

  /* "Requires *X*" (prerequisite: another Merit, Flaw, or Folkloric Bane) */
  const reqItem = limit.match(/^Requires\s+\*(.+?)\*(?:\s+Folkloric\s+Bane)?$/i);
  if (reqItem) {
    const name = reqItem[1].trim();
    return char.merits.some(m => m.name === name)
      || char.flaws.some(f => f.name === name)
      || char.folkloricBanes.some(b => b.baneName === name);
  }

  /* Combined rules like "BP 3+, unavailable to *Orbiter* Predator Type" */
  if (limit.includes(',')) {
    return limit.split(',').map(s => s.trim()).every(part => checkLimitEligibility(part, char));
  }

  return true;
}

function checkMeritEligibility(merit: Merit, char: CharacterState): boolean {
  return checkLimitEligibility(merit.limit, char);
}

function checkFlawEligibility(flaw: Flaw, char: CharacterState): boolean {
  return checkLimitEligibility(flaw.limit, char);
}

const CLAN_PLAYBOOKS = [
  'Banu Haqim', 'Brujah', 'Gangrel', 'Hecata', 'Lasombra', 'Malkavian',
  'The Ministry', 'Nosferatu', 'Ravnos', 'Salubri', 'Toreador', 'Tremere',
  'Tzimisce', 'Ventrue',
];

type SubSelectionDef = { options: string[] | ((char: CharacterState) => string[]) };

const SUB_SELECTIONS: Record<string, SubSelectionDef> = {
  'Fight or Flight': { options: ['Fight', 'Flight'] },
  'Peculiarly Off-Putting': { options: (char) => CLAN_PLAYBOOKS.filter(c => c !== char.playbook) },
  'Inherited Bane': { options: (char) => CLAN_PLAYBOOKS.filter(c => c !== char.playbook) },
  'Narrow Appetence': { options: ['Choleric', 'Melancholic', 'Sanguine', 'Phlegmatic'] },
  'Baneful Blood': { options: [...CLAN_PLAYBOOKS] },
};

function getSubSelectionOptions(name: string, char: CharacterState): string[] | null {
  const def = SUB_SELECTIONS[name];
  if (!def) return null;
  return typeof def.options === 'function' ? def.options(char) : def.options;
}

/* All rendered markdown here is from Coterie's verified JSON parsers (trusted content) */
export function AdvancementPanel() {
  const data = gameData.value;
  const char = character.value;
  const pb = currentPlaybook.value;
  const isCreation = creationMode.value && creationStep.value === 'xp';
  const isEdit = editMode.value;
  const cap = statCap.value;

  /* Snapshot starting Disciplines + set initial XP on first visit to XP step.
     Uses startingDisciplines as the persistence guard so remounting the panel
     (switching tabs) doesn't clobber XP. Reset when Playbook changes. */
  useEffect(() => {
    if (!isCreation) return;
    const cur = character.value;
    if (cur.startingDisciplines.length === 0 && cur.unlockedDisciplines.length > 0) {
      /* Granted Banes (Baali) exist before this snapshot, so fold their XP in here;
         user-chosen extras come later and adjust XP imperatively */
      const base = Math.min(10, Math.max(1, cur.bp) * 2 + grantedBaneXP(cur.folkloricBanes));
      updateCharacter({
        startingDisciplines: [...cur.unlockedDisciplines],
        xp: base,
      });
    }
  }, [isCreation, char.unlockedDisciplines.length]);

  /* Display-only formula breakdown (XP itself is managed imperatively by each toggle/purchase) */
  const bpBase = Math.max(1, char.bp) * 2;
  const flawXP = char.flaws.reduce((sum, f) => sum + parseXPValue(f.xpGain), 0);
  const baneXP = char.folkloricBanes.filter(b => !b.fromPlaybookBane)
    .reduce((sum, b) => sum + parseXPValue(b.xpGain), 0) + grantedBaneXP(char.folkloricBanes);
  const variantXP = char.baneChoice === 'both' ? 5 : 0;
  const rawStarting = bpBase + flawXP + baneXP + variantXP;
  const startingXP = Math.min(10, rawStarting);

  /* Merits + Flaws combined cap: 2 + max(1, BP) during creation */
  const meritFlawCap = 2 + Math.max(1, char.bp);
  const meritFlawCount = char.merits.length + char.flaws.length;
  const atMeritFlawCap = isCreation && meritFlawCount >= meritFlawCap;

  /* Folkloric Bane cap: 3 user-chosen (Baali auto-grants don't count) */
  const isBaali = char.playbook === 'Baali';
  const userBaneCount = char.folkloricBanes.filter(b => !b.fromPlaybookBane).length;
  const atBaneCap = isCreation && userBaneCount >= 3;

  const isClan = pb?.category === 'clan';
  const optExtras = data?.optionalExtras;

  /* All handlers read fresh signal values to avoid stale-closure bugs on rapid clicks */

  function toggleMerit(name: string, xpCost: string, chosenXP?: string) {
    const effectiveCost = chosenXP ?? xpCost;
    const cost = parseXPValue(effectiveCost);
    const cur = character.value;
    const existing = cur.merits.find(m => m.name === name);
    if (existing) {
      const refund = parseXPValue(existing.xpCost);
      updateCharacter({
        merits: cur.merits.filter(m => m.name !== name),
        ...(isCreation ? { xp: Math.min(10, cur.xp + refund) } : {}),
      });
    } else {
      if (isCreation && cur.xp < cost) return;
      updateCharacter({
        merits: [...cur.merits, { name, xpCost: effectiveCost }],
        ...(isCreation ? { xp: cur.xp - cost } : {}),
      });
    }
  }

  function toggleFlaw(name: string, xpGain: string, chosenXP?: string) {
    const effectiveGain = chosenXP ?? xpGain;
    const gain = parseXPValue(effectiveGain);
    const cur = character.value;
    const existing = cur.flaws.find(f => f.name === name);
    if (existing) {
      const storedGain = parseXPValue(existing.xpGain);
      if (isCreation && cur.xp < storedGain) return;
      updateCharacter({
        flaws: cur.flaws.filter(f => f.name !== name),
        ...(isCreation ? { xp: Math.max(0, cur.xp - storedGain) } : {}),
      });
    } else {
      /* Baneful Blood inherits a declared NPC patron's bloodline as its starting pick */
      const seed = name === 'Baneful Blood' && cur.ghoulPatron?.bloodline
        ? { selection: cur.ghoulPatron.bloodline } : {};
      updateCharacter({
        flaws: [...cur.flaws, { name, xpGain: effectiveGain, ...seed }],
        ...(isCreation ? { xp: Math.min(10, cur.xp + gain) } : {}),
      });
    }
  }

  function setMeritSelection(name: string, selection: string) {
    const cur = character.value;
    updateCharacter({ merits: cur.merits.map(m => m.name === name ? { ...m, selection } : m) });
  }

  function setFlawSelection(name: string, selection: string) {
    const cur = character.value;
    updateCharacter({ flaws: cur.flaws.map(f => f.name === name ? { ...f, selection } : f) });
  }

  function toggleFolkloricBane(baneName: string, xpGain: string) {
    const gain = parseXPValue(xpGain);
    const cur = character.value;
    const existing = cur.folkloricBanes.find(b => b.baneName === baneName);
    /* Auto-granted (Baali) Banes are mandatory; no UI path reaches here, but stay safe */
    if (existing?.fromPlaybookBane) return;
    if (existing) {
      if (isCreation && cur.xp < gain) return;
      updateCharacter({
        folkloricBanes: cur.folkloricBanes.filter(b => b.baneName !== baneName),
        ...(isCreation ? { xp: Math.max(0, cur.xp - gain) } : {}),
      });
    } else {
      updateCharacter({
        folkloricBanes: [
          ...cur.folkloricBanes,
          { baneName, xpGain, fromPlaybookBane: false },
        ],
        ...(isCreation ? { xp: Math.min(10, cur.xp + gain) } : {}),
      });
    }
  }

  function setLocalBaneChoice(choice: 'standard' | 'variant' | 'both') {
    const cur = character.value;
    const oldBonus = cur.baneChoice === 'both' ? 5 : 0;
    const newBonus = choice === 'both' ? 5 : 0;
    const delta = newBonus - oldBonus;
    if (isCreation && delta < 0 && cur.xp < Math.abs(delta)) return;
    updateCharacter({
      baneChoice: choice,
      ...(isCreation && delta !== 0 ? { xp: Math.min(10, Math.max(0, cur.xp + delta)) } : {}),
    });
  }

  function purchaseStat(stat: StatName) {
    const cur = character.value;
    if (cur.xp < 8 || cur.stats[stat] >= cap) return;
    updateCharacter({
      stats: { ...cur.stats, [stat]: cur.stats[stat] + 1 },
      xp: cur.xp - 8,
    });
  }

  function purchaseBP() {
    const cur = character.value;
    if (cur.xp < 10 || cur.bp >= 5 || cur.hunger !== 0) return;
    if (isCreation) {
      updateCharacter({ bp: Math.min(5, cur.bp + 1), xp: cur.xp - 10 });
    } else {
      setXP(cur.xp - 10);
      addPendingUpgrade({ type: 'bp', xpCost: 10 });
    }
  }

  function handleUnlockAccess() {
    enterDisciplineBuyMode();
    switchContentTab('disciplines');
  }

  const basicMoves = data?.basicMoves ?? [];

  return (
    <div class="vamp-rpanel-scroll">
      {isCreation && (
        <div class="vamp-advancement-creation">
          <p class="vamp-advancement-creation__title">Starting XP</p>
          <p class="vamp-advancement-creation__formula">
            {(() => {
              const hasExtras = flawXP > 0 || baneXP > 0 || variantXP > 0;
              return <>
                BP {char.bp}{char.bp === 0 ? ' (min 1)' : ''} × 2
                {hasExtras ? <> = {bpBase}</> : null}
                {flawXP > 0 && <> + {flawXP} Flaws</>}
                {baneXP > 0 && <> + {baneXP} Banes</>}
                {variantXP > 0 && <> + {variantXP} Both Banes</>}
                {' '}= <strong>{startingXP} XP</strong>
                {rawStarting > 10 && <span class="vamp-advancement-creation__cap"> (capped at 10)</span>}
              </>;
            })()}
          </p>
          <p class="vamp-advancement-creation__hint">
            Spend your starting XP below. Anything unspent carries over into play.
          </p>
        </div>
      )}

      <div class="vamp-advancement-xp">
        <span class="vamp-advancement-xp__label">Available XP</span>
        <span class="vamp-advancement-xp__value">{char.xp}</span>
      </div>

      {char.pendingUpgrades.length > 0 && (
        <CollapsibleSection title="Pending (New Night)" defaultOpen>
          <div class="vamp-adv-pending">
            {char.pendingUpgrades.map(u => (
              <div key={u.id} class="vamp-adv-pending__item">
                <span>{u.type === 'bp' ? 'Blood Potency +1' : u.type === 'discipline-access' ? `Unlock ${u.slug}` : `Learn ${u.powerName}`}</span>
                <span class="vamp-adv-pending__cost">{u.xpCost} XP</span>
              </div>
            ))}
            <p class="vamp-adv-pending__note">These apply when you click New Night.</p>
          </div>
        </CollapsibleSection>
      )}

      {isClan && (isCreation || isEdit) && optExtras && (
        <CollapsibleSection title="Clan Bane" pill={char.baneChoice === 'both' ? '+5 XP' : char.baneChoice} defaultOpen={isCreation}>
          <div class="vamp-adv-bane-variant">
            {(['standard', 'variant', 'both'] as const).map(opt => {
              const variant = optExtras.clanBaneVariants.find(v => v.clan === char.playbook);
              const label = opt === 'standard' ? 'Standard Bane'
                : opt === 'variant' ? (variant?.baneName ?? 'Variant Bane')
                : 'Both (+5 XP)';
              return (
                <label key={opt} class={`vamp-adv-radio ${char.baneChoice === opt ? 'vamp-adv-radio--active' : ''}`}>
                  <input
                    type="radio"
                    name="bane-variant"
                    checked={char.baneChoice === opt}
                    onChange={() => setLocalBaneChoice(opt)}
                  />
                  {label}
                </label>
              );
            })}
            {char.baneChoice === 'variant' || char.baneChoice === 'both' ? (() => {
              const variant = optExtras.clanBaneVariants.find(v => v.clan === char.playbook);
              if (!variant) return null;
              return (
                <div class="vamp-adv-bane-variant__desc"
                  dangerouslySetInnerHTML={{ __html: renderGameMarkdown(variant.consequences) }}
                />
              );
            })() : null}
          </div>
        </CollapsibleSection>
      )}

      {(isCreation || isEdit) && optExtras && (
        <CollapsibleSection title="Folkloric Banes" pill={`${userBaneCount} chosen`} defaultOpen={isCreation}>
          <div class="vamp-adv-extras-list">
            {isCreation && (
              <p class="vamp-adv-extras-list__cap">
                {userBaneCount}/3 chosen {isBaali && '(auto-granted Banes give half XP and don’t count)'}
              </p>
            )}
            {char.predatorType === 'Cucuy' && (
              <p class="vamp-adv-extras-list__note">Required: at least 1 Folkloric Bane worth 2 XP or more.</p>
            )}
            {optExtras.folkloricBanes.map(bane => {
              const selected = char.folkloricBanes.some(b => b.baneName === bane.baneName);
              const granted = char.folkloricBanes.some(b => b.baneName === bane.baneName && b.fromPlaybookBane);
              const disabled = !selected && atBaneCap;
              return (
                <FolkloricBaneRow
                  key={bane.baneName}
                  bane={bane}
                  selected={selected}
                  granted={granted}
                  disabled={disabled}
                  onToggle={() => toggleFolkloricBane(bane.baneName, bane.xpGain)}
                />
              );
            })}
          </div>
        </CollapsibleSection>
      )}

      {(isCreation || isEdit) && optExtras && (
        <CollapsibleSection title="Merits" pill={`${char.merits.length} chosen`} defaultOpen={isCreation}>
          <div class="vamp-adv-extras-list">
            {isCreation && (
              <p class="vamp-adv-extras-list__cap">
                {meritFlawCount}/{meritFlawCap} Merits + Flaws combined
              </p>
            )}
            {groupByCategory(optExtras.merits).map(([cat, items]) => {
              const visible = sortByXPThenName(
                items.filter(m =>
                  char.merits.some(x => x.name === m.name) || checkMeritEligibility(m, char),
                ),
                m => m.xpCost,
              );
              if (visible.length === 0) return null;
              return (
                <div key={cat} class="vamp-adv-category-group">
                  <div class="vamp-adv-category-group__heading">{cat}</div>
                  {visible.map(merit => {
                    const sel = char.merits.find(m => m.name === merit.name);
                    const selected = !!sel;
                    const eligible = checkMeritEligibility(merit, char);
                    const disabled = !selected && (!eligible || atMeritFlawCap || (isCreation && char.xp < parseXPValue(merit.xpCost)));
                    const opts = getSubSelectionOptions(merit.name, char);
                    return (
                      <MeritRow
                        key={merit.name}
                        merit={merit}
                        selected={selected}
                        disabled={disabled}
                        onToggle={(chosen) => toggleMerit(merit.name, merit.xpCost, chosen)}
                        subOptions={opts}
                        selection={sel?.selection}
                        onSelectionChange={(v) => setMeritSelection(merit.name, v)}
                        storedXP={sel?.xpCost}
                        xpAvailable={isCreation ? char.xp : undefined}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </CollapsibleSection>
      )}

      {(isCreation || isEdit) && optExtras && (
        <CollapsibleSection title="Flaws" pill={`${char.flaws.length} chosen`} defaultOpen={isCreation}>
          <div class="vamp-adv-extras-list">
            {isCreation && (
              <p class="vamp-adv-extras-list__cap">
                {meritFlawCount}/{meritFlawCap} Merits + Flaws combined
              </p>
            )}
            {groupByCategory(optExtras.flaws).map(([cat, items]) => {
              const visible = sortByXPThenName(
                items.filter(f =>
                  char.flaws.some(x => x.name === f.name) || checkFlawEligibility(f, char),
                ),
                f => f.xpGain,
              );
              if (visible.length === 0) return null;
              return (
                <div key={cat} class="vamp-adv-category-group">
                  <div class="vamp-adv-category-group__heading">{cat}</div>
                  {visible.map(flaw => {
                    const sel = char.flaws.find(f => f.name === flaw.name);
                    const selected = !!sel;
                    const eligible = checkFlawEligibility(flaw, char);
                    const disabled = !selected && (!eligible || atMeritFlawCap);
                    const opts = getSubSelectionOptions(flaw.name, char);
                    return (
                      <FlawRow
                        key={flaw.name}
                        flaw={flaw}
                        selected={selected}
                        disabled={disabled}
                        onToggle={(chosen) => toggleFlaw(flaw.name, flaw.xpGain, chosen)}
                        subOptions={opts}
                        selection={sel?.selection}
                        onSelectionChange={(v) => setFlawSelection(flaw.name, v)}
                        storedXP={sel?.xpGain}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </CollapsibleSection>
      )}

      <CollapsibleSection title="Discipline Access" pill="3 or 5 XP">
        <p class="vamp-adv-extras-list__hint">
          Unlock new Disciplines on the Disciplines tab.
        </p>
        <button class="vamp-advancement-acquire" onClick={handleUnlockAccess}>
          Unlock Access
        </button>
      </CollapsibleSection>

      <CollapsibleSection title="Stat Increases" pill="8 XP per +1">
        <div class="vamp-adv-stats">
          {STAT_NAMES.map(stat => {
            const val = char.stats[stat];
            const atCap = val >= cap;
            return (
              <button
                key={stat}
                class={`vamp-adv-stat-btn ${atCap ? 'vamp-adv-stat-btn--capped' : ''}`}
                disabled={atCap || char.xp < 8}
                onClick={() => purchaseStat(stat)}
              >
                <span class="vamp-adv-stat-btn__name">{stat}</span>
                <span class="vamp-adv-stat-btn__val">
                  {val >= 0 ? '+' : ''}{val} {atCap ? '(max)' : `→ +${val + 1}`}
                </span>
              </button>
            );
          })}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Advanced Moves" pill="5 XP per Move">
        <div class="vamp-adv-moves">
          {basicMoves.map(move => {
            const unlocked = char.advancedMoves.includes(move.name);
            return (
              <button
                key={move.name}
                class={`vamp-adv-move-btn ${unlocked ? 'vamp-adv-move-btn--unlocked' : ''}`}
                disabled={unlocked || char.xp < 5}
                onClick={() => buyAdvancedMove(move.name)}
              >
                {unlocked && <span class="vamp-adv-move-btn__check">{'✓'}</span>}
                {move.name}
              </button>
            );
          })}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Blood Potency" pill="10 XP">
        <div class="vamp-adv-bp">
          <button
            class="vamp-advancement-acquire"
            disabled={char.xp < 10 || char.bp >= 5 || char.hunger !== 0}
            onClick={purchaseBP}
          >
            Increase to BP {char.bp + 1}
          </button>
          {char.bp >= 5 && <p class="vamp-adv-bp__note">Blood Potency is at maximum.</p>}
          {char.hunger !== 0 && char.bp < 5 && (
            <p class="vamp-adv-bp__note">Requires 0 Hunger.</p>
          )}
          {!isCreation && char.bp < 5 && char.hunger === 0 && char.xp >= 10 && (
            <p class="vamp-adv-bp__note">Applies on New Night.</p>
          )}
        </div>
      </CollapsibleSection>
    </div>
  );
}

function FolkloricBaneRow({ bane, selected, granted, disabled, onToggle }: {
  bane: { baneName: string; consequences: string; xpGain: string };
  selected: boolean;
  granted?: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const expanded = useSignal(false);
  return (
    <div class={`vamp-adv-extra-row ${selected ? 'vamp-adv-extra-row--selected' : ''}`}>
      <div class="vamp-adv-extra-row__header" onClick={() => { expanded.value = !expanded.value; }}>
        <span class={`vamp-disc__bat vamp-disc__bat--sm ${expanded.value ? 'vamp-disc__bat--open' : ''}`} />
        <span class="vamp-adv-extra-row__name">{bane.baneName}</span>
        <span class="vamp-adv-extra-row__cost vamp-adv-extra-row__cost--gain">{bane.xpGain}</span>
        {granted ? (
          <span class="vamp-disc__badge vamp-disc__badge--granted">Granted</span>
        ) : (
          <button
            class={`vamp-btn vamp-btn--sm ${selected ? 'vamp-btn--unselect' : 'vamp-btn--select'}`}
            disabled={disabled && !selected}
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
          >
            {selected ? 'Drop' : 'Take'}
          </button>
        )}
      </div>
      {expanded.value && (
        <div class="vamp-adv-extra-row__body"
          dangerouslySetInnerHTML={{ __html: renderGameMarkdown(bane.consequences) }}
        />
      )}
    </div>
  );
}

function SubSelectionDropdown({ options, selection, onChange }: {
  options: string[];
  selection?: string;
  onChange: (val: string) => void;
}) {
  return (
    <div class="vamp-adv-extra-row__sub-select">
      <select
        class="creation-dropdown creation-dropdown--sm"
        value={selection || ''}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onChange((e.target as HTMLSelectElement).value)}
      >
        <option value="" disabled>Choose...</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function MeritRow({ merit, selected, disabled, onToggle, subOptions, selection, onSelectionChange, storedXP, xpAvailable }: {
  merit: Merit;
  selected: boolean;
  disabled: boolean;
  onToggle: (chosenXP?: string) => void;
  subOptions?: string[] | null;
  selection?: string;
  onSelectionChange?: (val: string) => void;
  storedXP?: string;
  xpAvailable?: number;
}) {
  const expanded = useSignal(false);
  const range = xpRange(merit.xpCost);
  const chosenXP = useSignal(range ? range[0] : 0);

  const displayCost = selected && storedXP ? parseXPValue(storedXP) : null;
  const cantAfford = !selected && !!range && xpAvailable != null && chosenXP.value > xpAvailable;

  return (
    <div class={`vamp-adv-extra-row ${selected ? 'vamp-adv-extra-row--selected' : ''}`}>
      <div class="vamp-adv-extra-row__header" onClick={() => { expanded.value = !expanded.value; }}>
        <span class={`vamp-disc__bat vamp-disc__bat--sm ${expanded.value ? 'vamp-disc__bat--open' : ''}`} />
        <span class="vamp-adv-extra-row__name">
          {merit.name}
          {selected && selection && <span class="vamp-adv-extra-row__selection"> ({selection})</span>}
        </span>
        {range && !selected ? (
          <span class="vamp-adv-extra-row__cost">
            <select
              class="creation-dropdown creation-dropdown--xp"
              value={chosenXP.value}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => { chosenXP.value = parseInt((e.target as HTMLSelectElement).value, 10); }}
            >
              {Array.from({ length: range[1] - range[0] + 1 }, (_, i) => range[0] + i).map(n => (
                <option key={n} value={n}>{n} XP</option>
              ))}
            </select>
          </span>
        ) : (
          <span class="vamp-adv-extra-row__cost">{displayCost ?? merit.xpCost} XP</span>
        )}
        <button
          class={`vamp-btn vamp-btn--sm ${selected ? 'vamp-btn--unselect' : 'vamp-btn--select'}`}
          disabled={(disabled || cantAfford) && !selected}
          onClick={(e) => { e.stopPropagation(); onToggle(range ? String(chosenXP.value) : undefined); }}
        >
          {selected ? 'Drop' : 'Take'}
        </button>
      </div>
      {selected && subOptions && subOptions.length > 0 && onSelectionChange && (
        <SubSelectionDropdown options={subOptions} selection={selection} onChange={onSelectionChange} />
      )}
      {expanded.value && (
        <div class="vamp-adv-extra-row__body">
          {merit.limit !== '—' && (
            <div class="vamp-adv-extra-row__meta">
              <span dangerouslySetInnerHTML={{ __html: renderGameMarkdown(merit.limit) }} />
            </div>
          )}
          <div dangerouslySetInnerHTML={{ __html: renderGameMarkdown(merit.description) }} />
        </div>
      )}
    </div>
  );
}

function FlawRow({ flaw, selected, disabled, onToggle, subOptions, selection, onSelectionChange, storedXP }: {
  flaw: Flaw;
  selected: boolean;
  disabled: boolean;
  onToggle: (chosenXP?: string) => void;
  subOptions?: string[] | null;
  selection?: string;
  onSelectionChange?: (val: string) => void;
  storedXP?: string;
}) {
  const expanded = useSignal(false);
  const range = xpRange(flaw.xpGain);
  const chosenXP = useSignal(range ? range[0] : 0);

  const displayGain = selected && storedXP ? parseXPValue(storedXP) : null;

  return (
    <div class={`vamp-adv-extra-row ${selected ? 'vamp-adv-extra-row--selected' : ''}`}>
      <div class="vamp-adv-extra-row__header" onClick={() => { expanded.value = !expanded.value; }}>
        <span class={`vamp-disc__bat vamp-disc__bat--sm ${expanded.value ? 'vamp-disc__bat--open' : ''}`} />
        <span class="vamp-adv-extra-row__name">
          {flaw.name}
          {selected && selection && <span class="vamp-adv-extra-row__selection"> ({selection})</span>}
        </span>
        {range && !selected ? (
          <span class="vamp-adv-extra-row__cost vamp-adv-extra-row__cost--gain">
            <select
              class="creation-dropdown creation-dropdown--xp"
              value={chosenXP.value}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => { chosenXP.value = parseInt((e.target as HTMLSelectElement).value, 10); }}
            >
              {Array.from({ length: range[1] - range[0] + 1 }, (_, i) => range[0] + i).map(n => (
                <option key={n} value={n}>+{n} XP</option>
              ))}
            </select>
          </span>
        ) : (
          <span class="vamp-adv-extra-row__cost vamp-adv-extra-row__cost--gain">
            +{displayGain != null ? displayGain : flaw.xpGain} XP
          </span>
        )}
        <button
          class={`vamp-btn vamp-btn--sm ${selected ? 'vamp-btn--unselect' : 'vamp-btn--select'}`}
          disabled={disabled && !selected}
          onClick={(e) => { e.stopPropagation(); onToggle(range ? String(chosenXP.value) : undefined); }}
        >
          {selected ? 'Drop' : 'Take'}
        </button>
      </div>
      {selected && subOptions && subOptions.length > 0 && onSelectionChange && (
        <SubSelectionDropdown options={subOptions} selection={selection} onChange={onSelectionChange} />
      )}
      {expanded.value && (
        <div class="vamp-adv-extra-row__body">
          {flaw.limit !== '—' && (
            <div class="vamp-adv-extra-row__meta">
              <span dangerouslySetInnerHTML={{ __html: renderGameMarkdown(flaw.limit) }} />
            </div>
          )}
          <div dangerouslySetInnerHTML={{ __html: renderGameMarkdown(flaw.description) }} />
        </div>
      )}
    </div>
  );
}
