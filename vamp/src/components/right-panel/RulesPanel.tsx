import { useEffect } from 'preact/hooks';
import { useSignal, useSignalEffect } from '@preact/signals';
import { rulesOpenSection, rulesPulse } from '../../state/panel';
import { getCachedRules, getRulesPending, prefetchRules } from '../../utils/rulesCache';

/* Module-scoped so it survives RulesPanel remounts; a per-component ref would reset
   on every tab switch and re-fire the flash without a fresh pill click. */
let lastRulesPulse = 0;

export function RulesPanel() {
  const rules = useSignal(getCachedRules());

  useEffect(() => {
    if (rules.value) return;
    let live = true;
    /* If prefetch failed or hasn't run, retry */
    let p = getRulesPending();
    if (!p) { prefetchRules(); p = getRulesPending(); }
    if (p) p.then(r => { if (live) rules.value = r; });
    return () => { live = false; };
  }, []);

  /* Fired by the Coterie "More Info" pill: once the deep-linked section is rendered open,
     double-pulse its second paragraph. Nonce guard so a manual section toggle never re-pulses. */
  useSignalEffect(() => {
    const nonce = rulesPulse.value;
    const open = rulesOpenSection.value;
    const ready = rules.value;
    if (!nonce || nonce === lastRulesPulse || !ready || open == null) return;
    lastRulesPulse = nonce;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const rafId = requestAnimationFrame(() => {
      const p = document.querySelector('.vamp-rules-body p:nth-of-type(2)') as HTMLElement | null;
      if (!p) return;
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      p.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
      p.classList.add('vamp-rules-pulse');
      timeoutId = setTimeout(() => p.classList.remove('vamp-rules-pulse'), 2600);
    });
    return () => { cancelAnimationFrame(rafId); clearTimeout(timeoutId); };
  });

  if (!rules.value) return <div class="vamp-rpanel-scroll" />;
  const { title, intro, sections } = rules.value;

  return (
    <div class="vamp-rpanel-scroll">
      {title && <div class="vamp-rules-title" dangerouslySetInnerHTML={{ __html: title }} />}
      <div class="vamp-rules-intro" dangerouslySetInnerHTML={{ __html: intro }} />
      {sections.map(s => (
        <div key={s.title} class={`vamp-move-section ${rulesOpenSection.value === s.title ? 'vamp-move-section--open' : ''}`}>
          <div class="vamp-move-section__bar" onClick={() => { rulesOpenSection.value = rulesOpenSection.value === s.title ? null : s.title; }}>
            <span class="vamp-move-section__name">{s.title}</span>
          </div>
          {rulesOpenSection.value === s.title && (
            <div class="vamp-move-section__body vamp-rules-body"
              dangerouslySetInnerHTML={{ __html: s.body }}
            />
          )}
        </div>
      ))}
    </div>
  );
}
