/**
 * Radiant Queen · Web Google Sign-In (Firebase Auth)
 * Brand: RADIANT QUEEN · PASIYA MAX
 *
 * BEFORE IT WORKS — Firebase Console:
 * 1) Project: strideclub-auth-platform (or your Firebase project)
 * 2) Authentication → Sign-in method → Google → Enable
 * 3) Authentication → Settings → Authorized domains → Add:
 *      radiant-queen-pasiya-max-v2.vercel.app
 *      localhost  (for local test)
 */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

// Same Firebase web app used for StrideClub / Radiant Queen auth
const firebaseConfig = {
  apiKey: 'AIzaSyCjxVU7E3HkXUsGS7hX7md8EHlypgUgkDs',
  authDomain: 'strideclub-auth-platform.firebaseapp.com',
  projectId: 'strideclub-auth-platform',
  storageBucket: 'strideclub-auth-platform.firebasestorage.app',
  messagingSenderId: '1041645392707',
  appId: '1:1041645392707:web:690f685174f0d149edd5f6',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

const BOT = 'https://t.me/PasiyaMaxQueen_bot';
const STORAGE_KEY = 'rq_web_user';

function saveUser(u) {
  try {
    if (!u) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        uid: u.uid,
        email: u.email || '',
        name: u.displayName || '',
        photo: u.photoURL || '',
      })
    );
  } catch (_) {}
}

function renderBar(user) {
  const el = document.getElementById('rq-auth-bar');
  if (!el) return;
  if (user) {
    const name = user.displayName || user.email || 'Member';
    const photo = user.photoURL
      ? `<img src="${user.photoURL}" alt="" style="width:28px;height:28px;border-radius:50%;border:1px solid #e8c56a" />`
      : '';
    el.innerHTML = `
      <div class="rq-auth-inner">
        ${photo}
        <span class="rq-auth-name">${escapeHtml(name)}</span>
        <span class="rq-auth-pill">Signed in</span>
        <button type="button" class="rq-auth-btn ghost" id="rq-signout">Sign out</button>
        <a class="rq-auth-btn" href="${BOT}" target="_blank" rel="noopener">Open Bot</a>
      </div>`;
    document.getElementById('rq-signout')?.addEventListener('click', async () => {
      await signOut(auth);
    });
  } else {
    el.innerHTML = `
      <div class="rq-auth-inner">
        <span class="rq-auth-hint">Official web hub · Google account</span>
        <button type="button" class="rq-auth-btn" id="rq-signin">Sign in with Google</button>
        <a class="rq-auth-btn ghost" href="${BOT}" target="_blank" rel="noopener">Telegram bot</a>
      </div>`;
    document.getElementById('rq-signin')?.addEventListener('click', doSignIn);
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function doSignIn() {
  const errEl = document.getElementById('rq-auth-error');
  if (errEl) errEl.textContent = '';
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    // Popup blocked on some mobile browsers → redirect
    if (e?.code === 'auth/popup-blocked' || e?.code === 'auth/popup-closed-by-user') {
      try {
        await signInWithRedirect(auth, provider);
        return;
      } catch (e2) {
        showErr(e2);
        return;
      }
    }
    showErr(e);
  }
}

function showErr(e) {
  const msg =
    e?.code === 'auth/unauthorized-domain'
      ? 'Add this domain in Firebase → Authentication → Authorized domains: radiant-queen-pasiya-max-v2.vercel.app'
      : e?.message || String(e);
  const errEl = document.getElementById('rq-auth-error');
  if (errEl) errEl.textContent = msg;
  else console.error(msg);
}

getRedirectResult(auth).catch(() => {});

onAuthStateChanged(auth, (user) => {
  saveUser(user);
  renderBar(user);
  window.dispatchEvent(new CustomEvent('rq-auth', { detail: { user } }));
});

window.RadiantQueenAuth = { auth, signIn: doSignIn, signOut: () => signOut(auth) };
