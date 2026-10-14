/**
 * Microsoft sign-in (MSAL, Clarke Lane tenant) and the Supabase session made from it.
 *
 * One click: the sign-in redirect carries sha256(nonce), so the ID token that comes back
 * can open a Supabase session straight away (Supabase checks it against the raw nonce,
 * kept in localStorage across the redirect). Redirects rather than popups: tablets and
 * the shop-floor screen block popups.
 */
import { CONFIG } from './config.js';

const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/+esm';
const NONCE_KEY = 'clj.nonce';

let msal = null, account = null, sb = null;

const redirectUri = () => location.origin + location.pathname.replace(/index\.html$/, '');

async function sha256Hex(text) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}

export async function getSupabase() {
  if (!sb) {
    const { createClient } = await import(SUPABASE_JS);
    sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY,
      { auth: { storageKey: 'clj.supabase', persistSession: true, autoRefreshToken: true } });
  }
  return sb;
}

/**
 * Finish any redirect and return { account, ready } — ready means a Supabase session for
 * this same person exists. Throws only on a real failure, with a readable message.
 */
export async function start() {
  msal = new window.msal.PublicClientApplication({
    auth: { clientId: CONFIG.CLIENT_ID, authority: `https://login.microsoftonline.com/${CONFIG.TENANT_ID}`,
            redirectUri: redirectUri(), navigateToLoginRequestUrl: false },
    cache: { cacheLocation: 'localStorage' },
  });
  await msal.initialize();
  const result = await msal.handleRedirectPromise();
  account = result?.account || msal.getActiveAccount() || msal.getAllAccounts()[0] || null;
  if (account) msal.setActiveAccount(account);
  const client = await getSupabase();

  if (result?.idToken) {
    let nonce = null;
    try { nonce = localStorage.getItem(NONCE_KEY); localStorage.removeItem(NONCE_KEY); } catch { /* blocked */ }
    if (nonce) {
      const { error } = await client.auth.signInWithIdToken({ provider: 'azure', token: result.idToken, nonce });
      if (error) throw new Error('Microsoft sign-in worked but the job board database refused it: ' + error.message);
    }
  }
  if (!account) return { account: null, ready: false };

  let { data: { session } } = await client.auth.getSession();
  // A session left behind by someone else on a shared tablet is not this person's.
  if (session && session.user?.email?.toLowerCase() !== account.username.toLowerCase()) {
    await client.auth.signOut(); session = null;
  }
  if (!session) session = await silentSupabase(client);
  return { account, ready: !!session };
}

async function silentSupabase(client) {
  const nonce = crypto.randomUUID();
  try {
    const r = await msal.ssoSilent({ scopes: ['openid', 'profile', 'email'], loginHint: account.username, nonce: await sha256Hex(nonce) });
    const { data, error } = await client.auth.signInWithIdToken({ provider: 'azure', token: r.idToken, nonce });
    return error ? null : data.session;
  } catch { return null; }
}

/** The sign-in button. Leaves the page; start() finishes the job on the way back. */
export async function signIn() {
  const nonce = crypto.randomUUID();
  try { localStorage.setItem(NONCE_KEY, nonce); } catch { /* storage blocked: sign-in will say so */ }
  await msal.loginRedirect({
    scopes: ['openid', 'profile', 'email', ...CONFIG.GRAPH_SCOPES],
    nonce: await sha256Hex(nonce),
    loginHint: account?.username,
    prompt: account ? undefined : 'select_account',
  });
}

export async function signOut() {
  try { await (await getSupabase()).auth.signOut(); } catch { /* already gone */ }
  await msal.logoutRedirect({ account, postLogoutRedirectUri: redirectUri() });
}

export const currentAccount = () => account;

/** Graph call as the signed-in person. Used only to read Levi's quotes. */
export async function graph(path, { headers = {} } = {}) {
  let token;
  try {
    token = (await msal.acquireTokenSilent({ scopes: CONFIG.GRAPH_SCOPES, account })).accessToken;
  } catch {
    await msal.acquireTokenRedirect({ scopes: CONFIG.GRAPH_SCOPES, account });
    return new Promise(() => {});
  }
  const res = await fetch(path.startsWith('http') ? path : CONFIG.GRAPH + path,
    { headers: { Authorization: `Bearer ${token}`, ...headers } });
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).error?.message || msg; } catch { /* not JSON */ }
    const e = new Error(`SharePoint said: ${msg} (${res.status})`);
    e.status = res.status;
    throw e;
  }
  return res.json();
}
