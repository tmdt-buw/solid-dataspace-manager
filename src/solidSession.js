import { createSessionRecovery } from "./sessionRecovery";
import { getEnabledProviders } from "./config/runtimeConfig";
import { Session } from "@inrupt/solid-client-authn-browser";

const STORAGE_PREFIX = "solid-dataspace-manager:";
const storageKey = (key) => `${STORAGE_PREFIX}${key}`;

const sessionStorageWrapper = {
  get: async (key) =>
    typeof window === "undefined"
      ? undefined
      : window.sessionStorage.getItem(storageKey(key)) ?? undefined,
  set: async (key, value) => {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(storageKey(key), value);
    }
  },
  delete: async (key) => {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(storageKey(key));
    }
  },
};

const session = new Session(
  {
    secureStorage: sessionStorageWrapper,
    insecureStorage: sessionStorageWrapper,
  },
  "solid-dataspace-manager"
);

const recoveryStorage = (() => { try { return window.sessionStorage; } catch { return undefined; } })();

export const sessionRecovery = createSessionRecovery(session, {
  storage: recoveryStorage,
  location: typeof window === 'undefined' ? { origin: 'https://localhost', href: 'https://localhost/' } : window.location,
  history: typeof window === 'undefined' ? undefined : window.history,
  window: typeof window === 'undefined' ? undefined : window,
  document: typeof document === 'undefined' ? undefined : document,
  resolveIssuer: webId => getEnabledProviders().find(provider => {
    try { return new URL(provider.issuer).origin === new URL(webId).origin; } catch { return false; }
  })?.issuer || ''
});

export async function restoreSession() {
  if (!sessionRecovery.canRestore()) return session;
  await session.handleIncomingRedirect({ restorePreviousSession: true });
  sessionRecovery.restored();
  return session;
}

export default session;
