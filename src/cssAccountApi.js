export const emptyAccountDetails = {
  controls: {},
  passwordLogins: [],
  pods: [],
  webIds: [],
  clientCredentials: [],
  endpointErrors: [],
  authorized: false,
};

export function getOriginUrl(value) {
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

export function getAccountIndexUrl(issuerOrWebId) {
  const origin = getOriginUrl(issuerOrWebId);
  return origin ? `${origin}/.account/` : "";
}

export function getAccountStorageKey(accountIndexUrl) {
  const origin = getOriginUrl(accountIndexUrl);
  return origin ? `sdm-css-account-token:${origin}` : "";
}

export function readStoredAccountToken(accountIndexUrl) {
  if (typeof window === "undefined") return "";
  const key = getAccountStorageKey(accountIndexUrl);
  if (!key) return "";

  return (
    window.localStorage.getItem(key) ||
    window.sessionStorage.getItem(key) ||
    ""
  );
}

export function storeAccountToken(accountIndexUrl, token, { remember = false } = {}) {
  if (typeof window === "undefined") return;
  const key = getAccountStorageKey(accountIndexUrl);
  if (key && token) {
    const targetStorage = remember ? window.localStorage : window.sessionStorage;
    const otherStorage = remember ? window.sessionStorage : window.localStorage;

    targetStorage.setItem(key, token);
    otherStorage.removeItem(key);
  }
}

export function clearStoredAccountToken(accountIndexUrl) {
  if (typeof window === "undefined") return;
  const key = getAccountStorageKey(accountIndexUrl);
  if (key) {
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  }
}

export function getRememberedAccountLoginKey(accountIndexUrl) {
  const origin = getOriginUrl(accountIndexUrl);
  return origin ? `sdm-css-account-login:${origin}` : "";
}

export function readRememberedAccountLogin(accountIndexUrl) {
  if (typeof window === "undefined") return { email: "" };
  const key = getRememberedAccountLoginKey(accountIndexUrl);
  if (!key) return { email: "" };

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return { email: "" };

    const parsed = JSON.parse(raw);
    return {
      email: typeof parsed?.email === "string" ? parsed.email : "",
    };
  } catch {
    window.localStorage.removeItem(key);
    return { email: "" };
  }
}

export function storeRememberedAccountLogin(accountIndexUrl, { email }) {
  if (typeof window === "undefined") return;
  const key = getRememberedAccountLoginKey(accountIndexUrl);
  const nextEmail = typeof email === "string" ? email.trim() : "";

  if (!key || !nextEmail) {
    clearRememberedAccountLogin(accountIndexUrl);
    return;
  }

  window.localStorage.setItem(
    key,
    JSON.stringify({
      email: nextEmail,
      storedAt: new Date().toISOString(),
    })
  );
}

export function clearRememberedAccountLogin(accountIndexUrl) {
  if (typeof window === "undefined") return;
  const key = getRememberedAccountLoginKey(accountIndexUrl);
  if (key) {
    window.localStorage.removeItem(key);
  }
}

export function extractControls(payload) {
  if (payload?.controls) return payload.controls;
  if (payload?.main || payload?.account || payload?.password || payload?.html) {
    return payload;
  }
  return {};
}

export function resolvePasswordLoginUrl(controls, accountIndexUrl) {
  if (controls?.password?.login) return controls.password.login;
  try {
    return new URL("login/password/", accountIndexUrl).href;
  } catch {
    return "";
  }
}

export function resolveAccountCreateUrl(controls, accountIndexUrl) {
  if (controls?.account?.create) return controls.account.create;
  try {
    return new URL("account/", accountIndexUrl).href;
  } catch {
    return "";
  }
}

export function resolvePasswordCreateUrl(controls) {
  return controls?.password?.create || "";
}

export function resolvePodCreateUrl(controls) {
  return controls?.account?.pod || "";
}

export function resolveClientCredentialsUrl(controls) {
  return controls?.account?.clientCredentials || "";
}

export function isAccountAuthorized(controls) {
  return Boolean(
    controls?.account?.webId ||
      controls?.account?.pod ||
      controls?.account?.clientCredentials ||
      controls?.password?.create
  );
}

function objectEntries(value) {
  return value && typeof value === "object" ? Object.entries(value) : [];
}

export async function fetchAccountJson(
  url,
  { method = "GET", body, accountToken } = {}
) {
  const headers = {
    Accept: "application/json",
    "Cache-Control": "no-cache",
  };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (accountToken) {
    headers.Authorization = `CSS-Account-Token ${accountToken}`;
  }

  const response = await fetch(url, {
    method,
    credentials: "include",
    cache: "no-store",
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let parsedBody = {};

  if (text) {
    try {
      parsedBody = JSON.parse(text);
    } catch {
      parsedBody = { raw: text };
    }
  }

  if (!response.ok) {
    const detail = parsedBody?.message || parsedBody?.error || response.statusText;
    throw new Error(`${response.status} ${detail}`.trim());
  }

  return parsedBody;
}

export async function readAccountEndpoint(label, url, accountToken) {
  if (!url) return { label, data: null, error: null };

  try {
    return { label, data: await fetchAccountJson(url, { accountToken }), error: null };
  } catch (err) {
    return { label, data: null, error: err?.message || "Request failed" };
  }
}

export function toLoginRows(payload) {
  return objectEntries(payload?.passwordLogins).map(([email, resourceUrl]) => ({
    email,
    resourceUrl,
  }));
}

export function toWebIdRows(payload) {
  return objectEntries(payload?.webIdLinks).map(([webId, resourceUrl]) => ({
    webId,
    resourceUrl,
  }));
}

export function getStoredClientCredentialKey(
  accountIndexUrl,
  webId,
  name = "solid-dataspace"
) {
  const origin = getOriginUrl(accountIndexUrl);
  if (!origin || !webId || !name) return "";

  return [
    "sdm-client-credentials",
    origin,
    encodeURIComponent(webId),
    encodeURIComponent(name),
  ].join(":");
}

export function readStoredClientCredential(
  accountIndexUrl,
  webId,
  name = "solid-dataspace"
) {
  if (typeof window === "undefined") return null;
  const key = getStoredClientCredentialKey(accountIndexUrl, webId, name);
  if (!key) return null;

  const raw = window.localStorage.getItem(key);
  if (!raw) return null;

  try {
    const credential = JSON.parse(raw);
    return credential?.id && credential?.secret ? credential : null;
  } catch {
    window.localStorage.removeItem(key);
    return null;
  }
}

export function storeClientCredential(
  accountIndexUrl,
  { name = "solid-dataspace", webId, id, secret, resource }
) {
  if (typeof window === "undefined") return null;
  const key = getStoredClientCredentialKey(accountIndexUrl, webId, name);
  if (!key || !id || !secret) return null;

  const credential = {
    name,
    webId,
    id,
    secret,
    resource: resource || "",
    accountIndexUrl,
    storedAt: new Date().toISOString(),
  };

  window.localStorage.setItem(key, JSON.stringify(credential));
  return credential;
}

export async function toPodRows(payload, accountToken) {
  const rows = objectEntries(payload?.pods).map(([podUrl, resourceUrl]) => ({
    podUrl,
    resourceUrl,
    owners: [],
  }));

  return Promise.all(
    rows.map(async (row) => {
      try {
        const detail = await fetchAccountJson(row.resourceUrl, { accountToken });
        return {
          ...row,
          podUrl: detail?.baseUrl || row.podUrl,
          owners: Array.isArray(detail?.owners) ? detail.owners : [],
        };
      } catch {
        return row;
      }
    })
  );
}

export async function toCredentialRows(payload, accountToken) {
  const rows = objectEntries(payload?.clientCredentials).map(
    ([name, resourceUrl]) => ({
      name,
      resourceUrl,
      webId: "",
    })
  );

  return Promise.all(
    rows.map(async (row) => {
      try {
        const detail = await fetchAccountJson(row.resourceUrl, { accountToken });
        return {
          ...row,
          webId: detail?.webId || detail?.webID || "",
        };
      } catch {
        return row;
      }
    })
  );
}

export async function loadAccountIndex(accountIndexUrl, accountToken = "") {
  const payload = await fetchAccountJson(accountIndexUrl, { accountToken });
  const controls = extractControls(payload);

  return {
    controls,
    authorized: isAccountAuthorized(controls),
    payload,
  };
}

export async function loadAccountDetails(controls, accountToken = "") {
  const [loginsResult, podsResult, webIdsResult, credentialsResult] =
    await Promise.all([
      readAccountEndpoint("Email/password logins", controls?.password?.create, accountToken),
      readAccountEndpoint("Pods", controls?.account?.pod, accountToken),
      readAccountEndpoint("Registered Web IDs", controls?.account?.webId, accountToken),
      readAccountEndpoint(
        "Credential tokens",
        controls?.account?.clientCredentials,
        accountToken
      ),
    ]);

  const endpointErrors = [
    loginsResult,
    podsResult,
    webIdsResult,
    credentialsResult,
  ]
    .filter((result) => result.error)
    .map((result) => `${result.label}: ${result.error}`);

  const [pods, clientCredentials] = await Promise.all([
    toPodRows(podsResult.data, accountToken),
    toCredentialRows(credentialsResult.data, accountToken),
  ]);

  return {
    controls,
    passwordLogins: toLoginRows(loginsResult.data),
    pods,
    webIds: toWebIdRows(webIdsResult.data),
    clientCredentials,
    endpointErrors,
    authorized: true,
  };
}

export async function loginWithPassword(loginUrl, { email, password, remember }) {
  const response = await fetchAccountJson(loginUrl, {
    method: "POST",
    body: {
      email,
      password,
      remember,
    },
  });

  return response?.authorization || "";
}

export async function createAccount(accountCreateUrl) {
  const response = await fetchAccountJson(accountCreateUrl, {
    method: "POST",
  });

  return {
    authorization: response?.authorization || "",
    controls: extractControls(response),
    payload: response,
  };
}

export async function createPasswordLogin(
  passwordCreateUrl,
  { email, password },
  accountToken
) {
  return fetchAccountJson(passwordCreateUrl, {
    method: "POST",
    accountToken,
    body: {
      email,
      password,
    },
  });
}

export async function createPod(podCreateUrl, { name }, accountToken) {
  return fetchAccountJson(podCreateUrl, {
    method: "POST",
    accountToken,
    body: {
      name,
    },
  });
}

export async function createClientCredential(
  clientCredentialsUrl,
  { name = "solid-dataspace", webId },
  accountToken
) {
  return fetchAccountJson(clientCredentialsUrl, {
    method: "POST",
    accountToken,
    body: {
      name,
      webId,
    },
  });
}
