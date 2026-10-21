// All Dataspace embeds share this session. HTTP failures alone never expire it.
const PENDING_KEY = 'solid-dataspace-manager:reauthentication';
const ISSUER_KEY = 'solid-dataspace-manager:login-issuer';
const MAX_AGE = 60 * 60 * 1000;
export class SessionExpiredError extends Error {
  constructor() { super('Your session has expired. Please sign in again.'); this.name = 'SessionExpiredError'; this.code = 'SESSION_EXPIRED'; }
}
export function safeReturnTarget(value, origin) {
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin || url.username || url.password || url.pathname.startsWith('//') || /\\|%5c|%2f/i.test(url.pathname)) return '/';
    if (url.searchParams.has('code') || url.searchParams.has('error')) {
      for (const key of ['code', 'state', 'error', 'error_description', 'iss', 'session_state']) url.searchParams.delete(key);
    }
    return url.pathname + url.search + url.hash;
  } catch { return '/'; }
}
const validIssuer = value => {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash ? url.href : ''; }
  catch { return ''; }
};
export function createSessionRecovery(session, {
  storage, location, history, now = Date.now, resolveIssuer = () => '',
  setInterval: startTimer = setInterval, clearInterval: stopTimer = clearInterval,
  window: browser, document: doc
}) {
  const listeners = new Set();
  const read = key => { try { return storage?.getItem(key); } catch { return null; } };
  const write = (key, value) => { try { storage?.setItem(key, value); return true; } catch { return false; } };
  const remove = key => { try { storage?.removeItem(key); } catch { /* Storage can be disabled by the browser. */ } };
  let pending;
  try { pending = JSON.parse(read(PENDING_KEY)); } catch { /* No recoverable login. */ }
  if (!pending || !Number.isFinite(pending.createdAt) || now() - pending.createdAt > MAX_AGE || pending.createdAt > now() || !['expired', 'login'].includes(pending.phase)) {
    pending = null; remove(PENDING_KEY);
  }
  if (pending) pending.target = safeReturnTarget(pending.target, location.origin);
  let lastWebId = session.info?.isLoggedIn ? session.info.webId : pending?.webId;
  let issuer = validIssuer(pending?.issuer || read(ISSUER_KEY));
  let explicitLogout = false, disposed = false, revision = 0, timer;
  const stopMonitoring = () => { if (timer !== undefined) stopTimer(timer); timer = undefined; };
  const startMonitoring = () => { if (timer === undefined && session.info?.isLoggedIn && !snapshot.expired) timer = startTimer(check, 15000); };
  let snapshot = { expired: Boolean(pending), busy: false, error: '', issuer };
  const update = patch => { snapshot = { ...snapshot, ...patch }; for (const fn of listeners) fn(); };
  const rawFetch = session.fetch.bind(session), rawLogin = session.login.bind(session), rawLogout = session.logout.bind(session);
  function expire() {
    if (disposed || explicitLogout || snapshot.busy || snapshot.expired) return;
    const webId = lastWebId || (session.info?.isLoggedIn ? session.info.webId : '');
    if (!webId) return;
    issuer = issuer || validIssuer(resolveIssuer(webId));
    pending = { phase: 'expired', target: safeReturnTarget(location.href, location.origin), webId, issuer, createdAt: now() };
    write(PENDING_KEY, JSON.stringify(pending));
    stopMonitoring();
    update({ expired: true, busy: false, error: '', issuer });
  }
  function check() {
    const expires = session.info?.expirationDate;
    if (typeof expires === 'number' && Number.isFinite(expires) && expires <= now() && (session.info?.isLoggedIn || lastWebId)) expire();
    return snapshot.expired;
  }
  const guardedFetch = async (...args) => {
    if (check()) throw new SessionExpiredError();
    // Do not replay a request: it could be a write, and 401 may mean resource ACLs.
    return rawFetch(...args);
  };
  session.fetch = guardedFetch;
  session.login = async options => {
    const chosen = validIssuer(options?.oidcIssuer);
    if (chosen) { issuer = chosen; write(ISSUER_KEY, issuer); }
    return rawLogin(options);
  };
  session.logout = async options => {
    explicitLogout = true;
    try {
      const result = await rawLogout(options);
      stopMonitoring(); lastWebId = ''; pending = null; remove(PENDING_KEY); update({ expired: false, busy: false, error: '' });
      return result;
    } finally { explicitLogout = false; }
  };
  const onLogin = () => { lastWebId = session.info?.webId || lastWebId; startMonitoring(); };
  const onLogout = () => {
    if (!snapshot.expired && !snapshot.busy) { lastWebId = ''; pending = null; remove(PENDING_KEY); }
  };
  session.events?.on('sessionExpired', expire);
  session.events?.on('login', onLogin);
  session.events?.on('sessionRestore', onLogin);
  session.events?.on('logout', onLogout);
  startMonitoring();
  browser?.addEventListener('focus', check);
  doc?.addEventListener('visibilitychange', check);
  return {
    getSnapshot: () => snapshot,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    check,
    canRestore() { return !pending || pending.phase === 'login'; },
    restored() {
      if (!session.info?.isLoggedIn) return;
      lastWebId = session.info.webId;
      if (!issuer) issuer = validIssuer(resolveIssuer(lastWebId));
      if (issuer) write(ISSUER_KEY, issuer);
      if (pending?.phase === 'login') {
        history.replaceState(history.state, '', safeReturnTarget(pending.target, location.origin));
        pending = null; remove(PENDING_KEY);
      }
      if (!pending) update({ expired: false, busy: false, error: '', issuer });
      startMonitoring(); check();
    },
    async reauthenticate({ revoke, login, issuer: selectedIssuer }) {
      if (!snapshot.expired || snapshot.busy) return;
      const selected = validIssuer(selectedIssuer || issuer);
      if (!selected) { update({ error: 'Choose your Solid login provider.' }); return; }
      update({ busy: true, error: '' });
      const attempt = ++revision;
      try {
        // Revoke the workspace cookie before clearing local tokens. Failures stay retryable.
        await revoke();
        explicitLogout = true;
        try { await rawLogout({ logoutType: 'app' }); } finally { explicitLogout = false; }
        pending = { ...pending, issuer: selected, phase: 'login', createdAt: now() };
        if (!write(PENDING_KEY, JSON.stringify(pending))) throw Error('Recovery storage unavailable');
        await login(selected);
        // A successful login redirects. Keep the modal blocking until that happens.
      } catch {
        if (attempt !== revision) return;
        if (pending) { pending.phase = 'expired'; write(PENDING_KEY, JSON.stringify(pending)); }
        update({ busy: false, error: 'Sign-in could not be started. Please try again.' });
      }
    },
    dispose() {
      disposed = true; stopMonitoring(); browser?.removeEventListener('focus', check); doc?.removeEventListener('visibilitychange', check);
      session.events?.removeListener('sessionExpired', expire); session.events?.removeListener('login', onLogin);
      session.events?.removeListener('sessionRestore', onLogin); session.events?.removeListener('logout', onLogout); listeners.clear();
    }
  };
}
