// ============================================================================
// AUTH — login, logout, current-user/role state, admin user management
// ============================================================================
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  updatePassword,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc, getDoc, setDoc, updateDoc, collection, onSnapshot, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { auth, db, createSecondaryApp } from "./firebase-config.js";
import { toast } from "./utils.js";

export const state = {
  user: null,        // Firebase Auth user object
  profile: null,      // { role: 'admin'|'user', displayName, active }
};

/** Wire up the login form. Calls onSuccess() once signed in AND profile loaded. */
export function initAuthForm(onSuccess) {
  const form = document.getElementById("loginForm");
  const errEl = document.getElementById("loginError");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errEl.textContent = "";
    const email = form.email.value.trim();
    const password = form.password.value;
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    btn.classList.add("btn--loading");
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged (registered in initAuthListener) will pick this up.
    } catch (err) {
      errEl.textContent = friendlyAuthError(err.code);
    } finally {
      btn.disabled = false;
      btn.classList.remove("btn--loading");
    }
  });
}

function friendlyAuthError(code) {
  switch (code) {
    case "auth/invalid-email": return "That email address doesn't look right.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found": return "Incorrect email or password.";
    case "auth/too-many-requests": return "Too many attempts. Please wait a moment and try again.";
    default: return "Couldn't sign in. Please try again.";
  }
}

/** Listen for auth state changes; loads the Firestore profile & enforces `active`. */
export function initAuthListener({ onLogin, onLogout }) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      state.user = null;
      state.profile = null;
      onLogout();
      return;
    }
    const profileRef = doc(db, "users", user.uid);
    const snap = await getDoc(profileRef);
    if (!snap.exists() || snap.data().active === false) {
      toast("This account has been disabled. Contact your Admin.", "error");
      await signOut(auth);
      return;
    }
    state.user = user;
    state.profile = snap.data();
    onLogin(state.user, state.profile);
  });
}

export function logout() {
  return signOut(auth);
}

export function isAdmin() {
  return state.profile?.role === "admin";
}

// ---------------------------------------------------------------------------
// Admin: user management (max 5 accounts total, enforced in the UI + rules)
// ---------------------------------------------------------------------------

export function watchUsers(callback) {
  return onSnapshot(collection(db, "users"), (snap) => {
    const users = [];
    snap.forEach((d) => users.push({ id: d.id, ...d.data() }));
    users.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
    callback(users);
  });
}

/**
 * Admin-only: creates a brand-new Auth account + Firestore profile using a
 * throwaway secondary Firebase App instance, so the Admin's own session
 * stays intact.
 */
export async function adminCreateUser({ email, password, displayName, role }) {
  const { auth: secAuth, cleanup } = createSecondaryApp();
  try {
    const cred = await createUserWithEmailAndPassword(secAuth, email, password);
    await setDoc(doc(db, "users", cred.user.uid), {
      email,
      displayName: displayName || email.split("@")[0],
      role: role === "admin" ? "admin" : "user",
      active: true,
      createdAt: serverTimestamp(),
    });
    return cred.user.uid;
  } finally {
    await cleanup();
  }
}

export async function adminSetUserActive(uid, active) {
  await updateDoc(doc(db, "users", uid), { active });
}

export async function adminSetUserRole(uid, role) {
  await updateDoc(doc(db, "users", uid), { role });
}

export async function changeOwnPassword(newPassword) {
  if (!auth.currentUser) throw new Error("Not signed in");
  await updatePassword(auth.currentUser, newPassword);
}
