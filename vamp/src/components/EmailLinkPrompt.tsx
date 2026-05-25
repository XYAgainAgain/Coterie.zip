import { useSignal } from '@preact/signals';
import { sendEmailLink, linkedEmail } from '../firebase';
import { showToast, forceToast } from '../state/toasts';

export function EmailLinkPrompt() {
  const open = useSignal(false);
  const email = useSignal('');
  const sending = useSignal(false);
  const linked = linkedEmail.value;

  if (linked) {
    return (
      <button
        class="vamp-email-btn vamp-email-btn--linked"
        title={`Linked to ${linked}`}
        aria-label={`Email linked: ${linked}`}
      >
        <span class="vamp-email-btn__icon" />
      </button>
    );
  }

  if (!open.value) {
    return (
      <button
        class="vamp-email-btn"
        onClick={() => { open.value = true; }}
        title="Link email for cross-device access"
        aria-label="Link email"
      >
        <span class="vamp-email-btn__icon" />
      </button>
    );
  }

  async function handleSend() {
    const addr = email.value.trim();
    if (!addr || !addr.includes('@')) {
      showToast('Enter a valid email address.', 'error');
      return;
    }
    sending.value = true;
    try {
      await sendEmailLink(addr);
      forceToast('Sign-in link sent! Check your email.', 'info', 120);
      open.value = false;
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Failed to send email link.',
        'error',
      );
    } finally {
      sending.value = false;
    }
  }

  return (
    <div class="vamp-email-prompt">
      <input
        class="vamp-email-prompt__input"
        type="email"
        placeholder="your@email.com"
        value={email.value}
        onInput={(e) => { email.value = (e.target as HTMLInputElement).value; }}
        onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); if (e.key === 'Escape') open.value = false; }}
        autoFocus
        disabled={sending.value}
      />
      <button
        class="vamp-email-prompt__send"
        onClick={handleSend}
        disabled={sending.value}
      >
        {sending.value ? '...' : 'Link'}
      </button>
      <button
        class="vamp-email-prompt__close"
        onClick={() => { open.value = false; }}
        aria-label="Cancel"
      >&times;</button>
    </div>
  );
}
