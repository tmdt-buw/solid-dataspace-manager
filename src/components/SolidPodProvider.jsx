import React, { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faDatabase,
  faEnvelope,
  faIdCard,
  faKey,
  faServer,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import {
  getSolidDataset,
  getStringNoLocale,
  getThing,
  getUrl,
} from "@inrupt/solid-client";
import { FOAF, VCARD } from "@inrupt/vocab-common-rdf";
import session from "../solidSession";
import { getPodRoot } from "../solidCatalog";
import {
  clearRememberedAccountLogin,
  readRememberedAccountLogin,
  storeRememberedAccountLogin,
} from "../cssAccountApi";
import "./SolidPodProvider.css";

const PIM_STORAGE = "http://www.w3.org/ns/pim/space#storage";
const SOLID_OIDC_ISSUER = "http://www.w3.org/ns/solid/terms#oidcIssuer";

const emptyAccount = {
  controls: {},
  passwordLogins: [],
  pods: [],
  webIds: [],
  clientCredentials: [],
  endpointErrors: [],
  authorized: false,
};

function getProfileDocUrl(webId) {
  return webId ? webId.split("#")[0] : "";
}

function getOriginUrl(value) {
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

function getAccountIndexUrl(issuerOrWebId) {
  const origin = getOriginUrl(issuerOrWebId);
  return origin ? `${origin}/.account/` : "";
}

function getAccountStorageKey(accountIndexUrl) {
  const origin = getOriginUrl(accountIndexUrl);
  return origin ? `sdm-css-account-token:${origin}` : "";
}

function readStoredAccountToken(accountIndexUrl) {
  if (typeof window === "undefined") return "";
  const key = getAccountStorageKey(accountIndexUrl);
  if (!key) return "";

  return (
    window.localStorage.getItem(key) ||
    window.sessionStorage.getItem(key) ||
    ""
  );
}

function storeAccountToken(accountIndexUrl, token, { remember = false } = {}) {
  if (typeof window === "undefined") return;
  const key = getAccountStorageKey(accountIndexUrl);
  if (key && token) {
    const targetStorage = remember ? window.localStorage : window.sessionStorage;
    const otherStorage = remember ? window.sessionStorage : window.localStorage;

    targetStorage.setItem(key, token);
    otherStorage.removeItem(key);
  }
}

function clearStoredAccountToken(accountIndexUrl) {
  if (typeof window === "undefined") return;
  const key = getAccountStorageKey(accountIndexUrl);
  if (key) {
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  }
}

function safeGetPodRoot(webId) {
  try {
    return webId ? getPodRoot(webId) : "";
  } catch {
    return "";
  }
}

function extractControls(payload) {
  if (payload?.controls) return payload.controls;
  if (payload?.main || payload?.account || payload?.password || payload?.html) return payload;
  return {};
}

function objectEntries(value) {
  return value && typeof value === "object" ? Object.entries(value) : [];
}

function resolvePasswordLoginUrl(controls, accountIndexUrl) {
  if (controls?.password?.login) return controls.password.login;
  try {
    return new URL("login/password/", accountIndexUrl).href;
  } catch {
    return "";
  }
}

async function fetchJson(url, { method = "GET", body, accountToken } = {}) {
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

async function readEndpoint(label, url, accountToken) {
  if (!url) return { label, data: null, error: null };

  try {
    return { label, data: await fetchJson(url, { accountToken }), error: null };
  } catch (err) {
    return { label, data: null, error: err?.message || "Request failed" };
  }
}

function toLoginRows(payload) {
  return objectEntries(payload?.passwordLogins).map(([email, resourceUrl]) => ({
    email,
    resourceUrl,
  }));
}

function toWebIdRows(payload) {
  return objectEntries(payload?.webIdLinks).map(([webId, resourceUrl]) => ({
    webId,
    resourceUrl,
  }));
}

async function toPodRows(payload, accountToken) {
  const rows = objectEntries(payload?.pods).map(([podUrl, resourceUrl]) => ({
    podUrl,
    resourceUrl,
    owners: [],
  }));

  return Promise.all(
    rows.map(async (row) => {
      try {
        const detail = await fetchJson(row.resourceUrl, { accountToken });
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

async function toCredentialRows(payload, accountToken) {
  const rows = objectEntries(payload?.clientCredentials).map(([name, resourceUrl]) => ({
    name,
    resourceUrl,
    webId: "",
  }));

  return Promise.all(
    rows.map(async (row) => {
      try {
        const detail = await fetchJson(row.resourceUrl, { accountToken });
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

function EmptyState({ children }) {
  return <div className="spp-empty">{children}</div>;
}

function LinkList({ items, getKey, renderItem }) {
  if (!items.length) return <EmptyState>No entries found.</EmptyState>;

  return (
    <ul className="spp-list">
      {items.map((item) => (
        <li key={getKey(item)}>{renderItem(item)}</li>
      ))}
    </ul>
  );
}

function AccountSection({ icon, title, description, actionHref, actionLabel, children }) {
  return (
    <section className="spp-section">
      <div className="spp-section__head">
        <div className="spp-section__titleBlock">
          <h3>
            <FontAwesomeIcon icon={icon} />
            <span>{title}</span>
            {actionHref ? (
              <a
                className="spp-action"
                href={actionHref}
                target="_blank"
                rel="noopener noreferrer"
              >
                {actionLabel}
              </a>
            ) : null}
          </h3>
          <p>{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

export default function SolidPodProvider({ webId }) {
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [profile, setProfile] = useState({
    name: "",
    podUrl: "",
    issuer: "",
    accountIndexUrl: "",
  });
  const [account, setAccount] = useState(emptyAccount);
  const [accountError, setAccountError] = useState("");
  const [accountAuth, setAccountAuth] = useState({ token: "", storageKey: "" });
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginRemember, setLoginRemember] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");

  const loginApiUrl = useMemo(
    () => resolvePasswordLoginUrl(account.controls, profile.accountIndexUrl),
    [account.controls, profile.accountIndexUrl]
  );

  useEffect(() => {
    const rememberedLogin = readRememberedAccountLogin(profile.accountIndexUrl);
    setLoginEmail(rememberedLogin.email);
    setLoginRemember(Boolean(rememberedLogin.email));
  }, [profile.accountIndexUrl]);

  useEffect(() => {
    let cancelled = false;

    async function loadAccount() {
      setLoading(true);
      setAccountError("");
      setAccount(emptyAccount);

      try {
        const profileDocUrl = getProfileDocUrl(webId);
        let nextProfile = {
          name: "",
          podUrl: "",
          issuer: "",
          accountIndexUrl: "",
        };

        if (webId && profileDocUrl) {
          try {
            const dataset = await getSolidDataset(profileDocUrl, { fetch: session.fetch });
            const me = getThing(dataset, webId);
            const name =
              (me && getStringNoLocale(me, VCARD.fn)) ||
              (me && getStringNoLocale(me, FOAF.name)) ||
              "";

            nextProfile = {
              name,
              podUrl: (me && getUrl(me, PIM_STORAGE)) || safeGetPodRoot(webId),
              issuer: (me && getUrl(me, SOLID_OIDC_ISSUER)) || getOriginUrl(webId),
              accountIndexUrl: "",
            };
          } catch {
            nextProfile = {
              name: "",
              podUrl: safeGetPodRoot(webId),
              issuer: getOriginUrl(webId),
              accountIndexUrl: "",
            };
          }
        }

        nextProfile.accountIndexUrl = getAccountIndexUrl(nextProfile.issuer || webId);

        if (!cancelled) {
          setProfile(nextProfile);
        }

        if (!nextProfile.accountIndexUrl) {
          throw new Error("No account API URL could be derived from the current WebID.");
        }

        const storageKey = getAccountStorageKey(nextProfile.accountIndexUrl);
        const storedToken = readStoredAccountToken(nextProfile.accountIndexUrl);
        const effectiveAccountToken =
          accountAuth.storageKey === storageKey && accountAuth.token
            ? accountAuth.token
            : storedToken;

        if (
          storedToken &&
          (!accountAuth.token || accountAuth.storageKey !== storageKey) &&
          !cancelled
        ) {
          setAccountAuth({ token: storedToken, storageKey });
        }

        const indexPayload = await fetchJson(nextProfile.accountIndexUrl, {
          accountToken: effectiveAccountToken,
        });
        const controls = extractControls(indexPayload);
        const authorized = Boolean(
          controls?.account?.webId ||
            controls?.account?.pod ||
            controls?.account?.clientCredentials ||
            controls?.password?.create
        );

        if (!authorized) {
          if (effectiveAccountToken) {
            clearStoredAccountToken(nextProfile.accountIndexUrl);
          }

          if (!cancelled) {
            if (effectiveAccountToken) {
              setAccountAuth({ token: "", storageKey });
            }

            setAccount({
              ...emptyAccount,
              controls,
              authorized: false,
            });
            setAccountError(
              effectiveAccountToken
                ? "The stored account login is no longer accepted by the provider account API."
                : ""
            );
          }
          return;
        }

        const [loginsResult, podsResult, webIdsResult, credentialsResult] =
          await Promise.all([
            readEndpoint(
              "Email/password logins",
              controls?.password?.create,
              effectiveAccountToken
            ),
            readEndpoint("Pods", controls?.account?.pod, effectiveAccountToken),
            readEndpoint("Registered Web IDs", controls?.account?.webId, effectiveAccountToken),
            readEndpoint(
              "Credential tokens",
              controls?.account?.clientCredentials,
              effectiveAccountToken
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
          toPodRows(podsResult.data, effectiveAccountToken),
          toCredentialRows(credentialsResult.data, effectiveAccountToken),
        ]);

        if (!cancelled) {
          setAccount({
            controls,
            passwordLogins: toLoginRows(loginsResult.data),
            pods,
            webIds: toWebIdRows(webIdsResult.data),
            clientCredentials,
            endpointErrors,
            authorized: true,
          });
        }
      } catch (err) {
        if (!cancelled) {
          setAccountError(err?.message || "Account information could not be loaded.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadAccount();

    return () => {
      cancelled = true;
    };
  }, [webId, refreshKey, accountAuth]);

  const handleAccountLogin = async (event) => {
    event.preventDefault();
    setLoginError("");

    if (!loginApiUrl) {
      setLoginError("No account login endpoint is available.");
      return;
    }

    const email = loginEmail.trim();

    if (!email || !loginPassword) {
      setLoginError("Email and password are required.");
      return;
    }

    try {
      setLoginLoading(true);
      const response = await fetchJson(loginApiUrl, {
        method: "POST",
        body: {
          email,
          password: loginPassword,
          remember: false,
        },
      });
      const authorization = response?.authorization || "";

      if (!authorization) {
        throw new Error("The provider login succeeded but returned no account token.");
      }

      const storageKey = getAccountStorageKey(profile.accountIndexUrl);
      setAccountAuth({ token: authorization, storageKey });
      storeAccountToken(profile.accountIndexUrl, authorization, {
        remember: false,
      });
      if (loginRemember) {
        storeRememberedAccountLogin(profile.accountIndexUrl, { email });
      } else {
        clearRememberedAccountLogin(profile.accountIndexUrl);
      }
      setLoginPassword("");
      setRefreshKey((value) => value + 1);
    } catch (err) {
      setLoginError(err?.message || "Account login failed.");
    } finally {
      setLoginLoading(false);
    }
  };

  return (
    <div className="solid-pod-provider">
      <div className="toolbar toolbar--title solid-pod-provider__header">
        <div className="crumb">
          <FontAwesomeIcon icon={faServer} className="crumb-icon" />
          <span>Solid Pod Provider</span>
        </div>
      </div>

      <div className="spp-shell">
        <div className="spp-account-card">
          <div className="spp-account-card__title">
            <div>
              <h2>Your account</h2>
            </div>
          </div>

          {loading ? <div className="spp-status">Loading account information...</div> : null}

          {!loading && !account.authorized ? (
            <form className="spp-login" onSubmit={handleAccountLogin}>
              <div className="spp-login__head">
                <div>
                  <h3>Account login</h3>
                  <p>
                    Sign in to the Solid Provider to load account-level pods,
                    WebIDs, and credential tokens.
                  </p>
                </div>
              </div>
              {accountError ? <div className="spp-login__note">{accountError}</div> : null}
              <div className="spp-login__grid">
                <label>
                  <span>Email</span>
                  <input
                    type="email"
                    value={loginEmail}
                    onChange={(event) => setLoginEmail(event.target.value)}
                    autoComplete="username"
                    placeholder="name@example.org"
                  />
                </label>
                <label>
                  <span>Password</span>
                  <input
                    type="password"
                    value={loginPassword}
                    onChange={(event) => setLoginPassword(event.target.value)}
                    autoComplete="current-password"
                    placeholder="Password"
                  />
                </label>
              </div>
              <label className="spp-login__check">
                <input
                  type="checkbox"
                  checked={loginRemember}
                  onChange={(event) => setLoginRemember(event.target.checked)}
                />
                <span>Remember me</span>
              </label>
              {loginError ? <div className="spp-login__error">{loginError}</div> : null}
              <div className="spp-login__actions">
                <button
                  type="submit"
                  className="pill-btn"
                  disabled={loginLoading || !loginApiUrl}
                >
                  {loginLoading ? "Signing in..." : "Sign in to account"}
                </button>
              </div>
            </form>
          ) : null}

          {!loading && account.authorized ? (
            <>
              {accountError ? (
                <div className="spp-warning">
                  <FontAwesomeIcon icon={faTriangleExclamation} />
                  <div>
                    <strong>Account action failed.</strong>
                    <span>{accountError}</span>
                  </div>
                </div>
              ) : null}

              {account.endpointErrors.length ? (
                <div className="spp-warning spp-warning--subtle">
                  <FontAwesomeIcon icon={faTriangleExclamation} />
                  <div>
                    <strong>Some account sections could not be loaded.</strong>
                    {account.endpointErrors.map((message) => (
                      <span key={message}>{message}</span>
                    ))}
                  </div>
                </div>
              ) : null}

              <AccountSection
                icon={faEnvelope}
                title="Email/password logins"
                description="The email/password logins used to identify this account."
              >
                <LinkList
                  items={account.passwordLogins}
                  getKey={(item) => item.resourceUrl || item.email}
                  renderItem={(item) => (
                    <>
                      <span>{item.email}</span>
                      {item.resourceUrl ? (
                        <a href={item.resourceUrl} target="_blank" rel="noopener noreferrer">
                          manage
                        </a>
                      ) : null}
                    </>
                  )}
                />
              </AccountSection>

              <AccountSection
                icon={faDatabase}
                title="Pods"
                description="The pods created by this account."
                actionHref={account.controls?.html?.account?.createPod}
                actionLabel="Create pod"
              >
                <LinkList
                  items={account.pods}
                  getKey={(item) => item.resourceUrl || item.podUrl}
                  renderItem={(item) => (
                    <div className="spp-nested">
                      <div>
                        <a href={item.podUrl} target="_blank" rel="noopener noreferrer">
                          {item.podUrl}
                        </a>
                        {item.resourceUrl ? (
                          <a
                            href={item.resourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            manage
                          </a>
                        ) : null}
                      </div>
                      {item.owners.length ? (
                        <div className="spp-owner-list">
                          {item.owners.map((owner) => (
                            <span key={`${item.podUrl}-${owner.webId}`}>
                              {owner.webId}
                              {owner.visible ? " - visible" : ""}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  )}
                />
              </AccountSection>

              <AccountSection
                icon={faIdCard}
                title="Registered Web IDs"
                description="These are the WebIDs you can authenticate as using this account."
                actionHref={account.controls?.html?.account?.linkWebId}
                actionLabel="Link WebID"
              >
                <LinkList
                  items={account.webIds}
                  getKey={(item) => item.resourceUrl || item.webId}
                  renderItem={(item) => (
                    <>
                      <a href={item.webId} target="_blank" rel="noopener noreferrer">
                        {item.webId}
                      </a>
                      {item.resourceUrl ? (
                        <a href={item.resourceUrl} target="_blank" rel="noopener noreferrer">
                          manage
                        </a>
                      ) : null}
                    </>
                  )}
                />
              </AccountSection>

              <AccountSection
                icon={faKey}
                title="Credential tokens"
                description="The tokens created by this account. Secrets are never shown here."
                actionHref={account.controls?.html?.account?.createClientCredentials}
                actionLabel="Create token"
              >
                <LinkList
                  items={account.clientCredentials}
                  getKey={(item) => item.resourceUrl || item.name}
                  renderItem={(item) => (
                    <div className="spp-nested">
                      <div>
                        <span>{item.name}</span>
                        {item.resourceUrl ? (
                          <a
                            href={item.resourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            manage
                          </a>
                        ) : null}
                      </div>
                      {item.webId ? (
                        <span className="spp-token-webid">{item.webId}</span>
                      ) : null}
                    </div>
                  )}
                />
              </AccountSection>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
