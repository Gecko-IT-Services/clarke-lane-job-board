// Smoke-test stand-in for src/auth.js: no Microsoft, no network.
export const start = async () => ({ account: { username: 'levi@clarke-lane.co.uk' }, ready: true });
export const signIn = async () => {}; export const signOut = async () => {};
export const getSupabase = async () => null; export const graph = async () => ({});
