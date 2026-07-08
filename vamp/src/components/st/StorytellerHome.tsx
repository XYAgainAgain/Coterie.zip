import { useSignal } from '@preact/signals';
import { route } from 'preact-router';
import { claimStoryteller, clearStoryteller, getStClaimStatus, type StClaimStatus } from '../../state/persistence';
import { showToast, forceToast } from '../../state/toasts';

const ST_CODES_KEY = 'vamp-st-codes';
const LEGACY_ST_CODE_KEY = 'vamp-st-code';

/* One account can Storyteller any number of Coteries; each doc's storytellerUid is
   independent, so the only local registry of "my Chronicles" is this code list. It is a
   fallback/discovery aid; the storytellerUid query is the authoritative source on fresh devices. */
export function readStCodes(): string[] {
  let codes: string[] = [];
  try { codes = JSON.parse(localStorage.getItem(ST_CODES_KEY) ?? '[]'); } catch {}
  const legacy = localStorage.getItem(LEGACY_ST_CODE_KEY);
  if (legacy) {
    localStorage.removeItem(LEGACY_ST_CODE_KEY);
    if (!codes.includes(legacy)) codes.push(legacy);
  }
  return codes;
}

export function writeStCodes(codes: string[]): void {
  localStorage.setItem(ST_CODES_KEY, JSON.stringify(codes));
}

function rememberCode(code: string): void {
  const codes = readStCodes();
  if (!codes.includes(code)) writeStCodes([...codes, code]);
}

function forgetCode(code: string): void {
  writeStCodes(readStCodes().filter(c => c !== code));
}

/* Claim (or re-resolve) a Coterie by code. Returns its fresh status card, or throws. */
async function claimByCode(raw: string): Promise<StClaimStatus> {
  const c = raw.trim().toUpperCase();
  if (!c) throw new Error('Enter a Coterie code.');
  const existing = await getStClaimStatus(c);
  if (!existing) throw new Error(`No Coterie found with code "${c}"`);
  if (!existing.isStoryteller) {
    await claimStoryteller(c);
    forceToast('The Storyteller’s seat is yours. Players will be asked to open their sheets to you.', 'success', 'Claimed');
  }
  rememberCode(c);
  return (await getStClaimStatus(c)) ?? existing;
}

function ClaimForm({ onClaimed }: { onClaimed: () => void }) {
  const code = useSignal('');
  const working = useSignal(false);

  async function handleClaim() {
    const c = code.value.trim();
    if (!c || working.value) return;
    working.value = true;
    try {
      await claimByCode(c);
      code.value = '';
      onClaimed();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not claim that Coterie.', 'error');
    }
    working.value = false;
  }

  return (
    <div class="vamp-st-claim__form">
      <input
        class="vamp-input"
        type="text"
        placeholder="Coterie code"
        value={code.value}
        onInput={(e) => { code.value = (e.target as HTMLInputElement).value; }}
        onKeyDown={(e) => { if (e.key === 'Enter') handleClaim(); }}
      />
      <button class="vamp-btn vamp-btn--sm" onClick={handleClaim} disabled={working.value || !code.value.trim()}>
        {working.value ? 'Claiming…' : 'Claim'}
      </button>
    </div>
  );
}

function ChronicleCard({ status, onChange }: { status: StClaimStatus; onChange: () => void }) {
  const confirming = useSignal(false);
  const working = useSignal(false);

  async function handleStepDown() {
    if (working.value) return;
    working.value = true;
    try {
      await clearStoryteller(status.code);
      forgetCode(status.code);
      forceToast('You have stepped down. Player consent clears with you.', 'info');
      onChange();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not step down.', 'error');
    }
    working.value = false;
  }

  return (
    <div class="vamp-st-chronicle">
      <div class="vamp-st-chronicle__title">{status.typeName || 'Your Chronicle'}</div>
      <div class="vamp-st-chronicle__meta">
        Code {status.code} &middot; {status.memberCount} member{status.memberCount === 1 ? '' : 's'} &middot; {status.consented} of {status.memberCount} consented
      </div>
      <div class="vamp-st-chronicle__actions">
        <button class="vamp-btn vamp-btn--sm" onClick={() => route(`/vamp/${status.code}/st`)}>Open Dashboard</button>
        {confirming.value ? (
          <>
            <span class="vamp-st-chronicle__confirm">Step down?</span>
            <button class="vamp-btn vamp-btn--sm" onClick={handleStepDown} disabled={working.value}>Yes</button>
            <button class="vamp-btn vamp-btn--sm" onClick={() => { confirming.value = false; }}>Cancel</button>
          </>
        ) : (
          <button class="vamp-btn vamp-btn--sm" onClick={() => { confirming.value = true; }} disabled={working.value}>Step down</button>
        )}
      </div>
    </div>
  );
}

/* Two-column-home right side: one card per storytold Coterie, plus a claim-another input. */
export function ChroniclesColumn({ chronicles, onChange }: { chronicles: StClaimStatus[]; onChange: () => void }) {
  return (
    <section class="vamp-home__col">
      <h2 class="vamp-home__col-title">Your Chronicles</h2>
      <div class="vamp-st-chronicles">
        {chronicles.map(s => <ChronicleCard status={s} onChange={onChange} key={s.code} />)}
      </div>
      <ClaimForm onClaimed={onChange} />
    </section>
  );
}

/* Non-Storyteller entry: the small collapsible "I'm a Storyteller" first-claim affordance. */
export function StorytellerClaimEntry({ onChange }: { onChange: () => void }) {
  const open = useSignal(false);
  return (
    <div class="vamp-st-claim">
      <button class="vamp-st-claim__toggle" onClick={() => { open.value = !open.value; }}>
        {open.value ? 'Never mind' : "I'm a Storyteller"}
      </button>
      {open.value && (
        <div class="vamp-st-claim__body">
          <ClaimForm onClaimed={onChange} />
        </div>
      )}
    </div>
  );
}
