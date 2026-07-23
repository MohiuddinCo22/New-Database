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

export const FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
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
