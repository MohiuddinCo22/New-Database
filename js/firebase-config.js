// ============================================================================
// FIREBASE CONFIGURATION
// ----------------------------------------------------------------------------
// 1. Go to https://console.firebase.google.com -> Create a project.
// 2. Add a Web App to the project and copy the config object it gives you
//    into FIREBASE_CONFIG below.
// 3. Enable "Email/Password" under Authentication -> Sign-in method.
// 4. Create Firestore Database (production mode) and paste firestore.rules
//    (in the project root) into Firestore -> Rules.
// 5. Manually create your 5 accounts in Authentication -> Users, then add a
//    matching document for each in the `users` collection (see README.md).
// ============================================================================

import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyAJioek6Swz34T8vKmq6GcNPGivjPYkN6c",
  authDomain: "new-7780e.firebaseapp.com",
  projectId: "new-7780e",
  storageBucket: "new-7780e.firebasestorage.app",
  messagingSenderId: "995398256300",
  appId: "1:995398256300:web:1235bb9b328ef83e824109"
};

// Primary app instance used for the whole session.
export const app = initializeApp(FIREBASE_CONFIG);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Keep the admin logged in until they explicitly log out.
setPersistence(auth, browserLocalPersistence);

// A throwaway secondary app is used when the Admin creates a brand-new user
// account, so that creating the account doesn't sign the Admin themselves
// out (the default Auth SDK behaviour signs in as the newly created user).
export function createSecondaryApp() {
  const name = "Secondary-" + Date.now();
  const secondaryApp = initializeApp(FIREBASE_CONFIG, name);
  return {
    app: secondaryApp,
    auth: getAuth(secondaryApp),
    cleanup: () => deleteApp(secondaryApp),
  };
}
