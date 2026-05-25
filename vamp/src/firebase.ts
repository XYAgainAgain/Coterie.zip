import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import {
  getAuth, signInAnonymously, onAuthStateChanged,
  sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink,
  EmailAuthProvider, linkWithCredential,
} from 'firebase/auth';

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
   For anonymous users, links the email credential to preserve the existing UID. */
export async function handleEmailLinkRedirect(): Promise<boolean> {
  if (!isSignInWithEmailLink(auth, window.location.href)) return false;

  let email = localStorage.getItem(EMAIL_STORAGE_KEY);
  if (!email) {
    email = window.prompt('Confirm your email address for sign-in:');
    if (!email) return false;
  }

  const credential = EmailAuthProvider.credentialWithLink(email, window.location.href);

  if (auth.currentUser?.isAnonymous) {
    await linkWithCredential(auth.currentUser, credential);
  } else {
    await signInWithEmailLink(auth, email, window.location.href);
  }

  localStorage.removeItem(EMAIL_STORAGE_KEY);
  refreshLinkedEmail();
  window.history.replaceState(null, '', '/vamp/');
  return true;
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
