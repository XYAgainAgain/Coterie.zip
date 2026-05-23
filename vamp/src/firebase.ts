import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';

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

/* Resolves with the user's UID once anonymous auth completes.
   If a session already exists (browser remembers the anon account), it reuses it. */
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
