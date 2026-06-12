import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import {
  getAuth, signInAnonymously, onAuthStateChanged,
  sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink,
  EmailAuthProvider, linkWithCredential, signOut,
} from 'firebase/auth';
import { showToast } from './state/toasts';

const firebaseConfig = {
  apiKey: 'AIzaSyAEHxHwfggbE_O51EAkgTA1tq10aGqR5BU',
  authDomain: 'coterie-ttrpg.firebaseapp.com',
  databaseURL: 'https://coterie-ttrpg-default-rtdb.firebaseio.com',
  projectId: 'coterie-ttrpg',
  storageBucket: 'coterie-ttrpg.firebasestorage.app',
  messagingSenderId: '673995949420',
  appId: '1:673995949420:web:0702b25fb6db7c9acb5f49',
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

/* Resolves with the user's UID once auth completes.
   If a session already exists, it reuses it. Otherwise, signs in anonymously. */
export const authReady: Promise<string> = new Promise((resolve, reject) => {
  const unsub = onAuthStateChanged(auth, user => {
    unsub();
    if (user) {
      resolve(user.uid);
    } else {
      signInAnonymously(auth)
        .then(cred => resolve(cred.user.uid))
        .catch(reject);
    }
  });
});

const EMAIL_STORAGE_KEY = 'vamp-email-for-signin';

const actionCodeSettings = {
  url: typeof window !== 'undefined'
    ? `${window.location.origin}/vamp/`
    : 'https://coterie.zip/vamp/',
  handleCodeInApp: true,
};

/* Send a sign-in link to the given email address */
export async function sendEmailLink(email: string): Promise<void> {
  await sendSignInLinkToEmail(auth, email, actionCodeSettings);
  localStorage.setItem(EMAIL_STORAGE_KEY, email);
}

/* Check if the current URL is an email sign-in link and complete the flow.
   For anonymous users, links the email credential to preserve the existing UID.

   Never throws: a dead link (expired, already used, or invalidated by a newer
   send) used to bubble into the boot promise and brick the app with "Failed to
   load game data" — and since the URL kept the dead code, every reload
   re-failed. Failures now toast and let the app boot normally. */
export async function handleEmailLinkRedirect(): Promise<boolean> {
  if (!isSignInWithEmailLink(auth, window.location.href)) return false;

  /* Once the code has been submitted (consumed, success or not), drop it from the
     URL so a reload can't replay it. A cancelled prompt never submits, so the
     still-valid link must survive for a retry. */
  let codeSubmitted = false;
  try {
    let email = localStorage.getItem(EMAIL_STORAGE_KEY);
    if (!email) {
      email = window.prompt('Confirm your email address for sign-in:');
      if (!email) return false;
    }

    codeSubmitted = true;
    const credential = EmailAuthProvider.credentialWithLink(email, window.location.href);

    if (auth.currentUser?.isAnonymous) {
      try {
        await linkWithCredential(auth.currentUser, credential);
      } catch (err: unknown) {
        const code = err instanceof Error && 'code' in err ? (err as { code: string }).code : '';
        if (code === 'auth/email-already-in-use' || code === 'auth/credential-already-in-use') {
          /* Signing in (not linking) abandons the anon session and its characters */
          const proceed = window.confirm(
            'This email already has an account. Signing in will switch to it, and any '
            + 'characters created in this browser while signed out will be left behind '
            + '(Sam can transfer them later). Continue?',
          );
          if (!proceed) {
            showToast('Sign-in cancelled. You are still on your signed-out session.', 'warning');
            return false;
          }
          await signInWithEmailLink(auth, email, window.location.href);
          showToast('Signed in to your existing account. Any characters created while signed out are not attached to it — tell Sam if one is missing.', 'warning');
        } else {
          throw err;
        }
      }
    } else {
      await signInWithEmailLink(auth, email, window.location.href);
    }

    localStorage.removeItem(EMAIL_STORAGE_KEY);
    refreshLinkedEmail();
    return true;
  } catch (err: unknown) {
    const code = err instanceof Error && 'code' in err ? (err as { code: string }).code : '';
    console.error('[Auth] Email link sign-in failed:', err);
    showToast(
      code === 'auth/invalid-action-code'
        ? 'That sign-in link is expired or already used. Request a fresh one, and only click the newest email.'
        : 'Email sign-in failed. Request a fresh link and try again.',
      'error',
    );
    return false;
  } finally {
    if (codeSubmitted) window.history.replaceState(null, '', '/vamp/');
  }
}

import { signal } from '@preact/signals';

/* Reactive signal: email address if the current user has linked an email identity */
export const linkedEmail = signal<string | null>(null);

function refreshLinkedEmail() {
  const user = auth.currentUser;
  if (!user) { linkedEmail.value = null; return; }
  const emailProvider = user.providerData.find(p => p.providerId === 'password');
  linkedEmail.value = emailProvider?.email ?? null;
}

/* Update after auth resolves */
authReady.then(() => refreshLinkedEmail());

/* Sign out the linked account. Firebase auto-creates a fresh anonymous session on the
   next auth check, so callers should redirect/reload rather than reuse stale state. */
export async function signOutUser(): Promise<void> {
  await signOut(auth);
  linkedEmail.value = null;
}
