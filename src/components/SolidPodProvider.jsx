import React, { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faDatabase,
  faIdCard,
  faKey,
  faLink,
  faPlus,
  faServer,
  faTriangleExclamation,
  faTrashCan,
  faUpRightFromSquare,
  faXmark,
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
import ContentLoadingState from "./ContentLoadingState";
import {
  clearRememberedAccountLogin,
  readRememberedAccountLogin,
  storeRememberedAccountLogin,
} from "../cssAccountApi";
import "./SolidPodProvider.css";

const PIM_STORAGE = "http://www.w3.org/ns/pim/space#storage";
const SOLID_OIDC_ISSUER = "http://www.w3.org/ns/solid/terms#oidcIssuer";
const DATASPACE_TOKEN_NAME = "solid-dataspace";

const emptyAccount = {
  controls: {},
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

function formatUrlHost(value) {
  try {
    return new URL(value).host;
  } catch {
    return "";
  }
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

async function createPod(podCreateUrl, { name }, accountToken) {
  return fetchJson(podCreateUrl, {
    method: "POST",
    accountToken,
    body: { name },
  });
}

async function linkWebId(webIdLinkUrl, { webId }, accountToken) {
  return fetchJson(webIdLinkUrl, {
    method: "POST",
    accountToken,
    body: { webId },
  });
}

async function createClientCredential(
  clientCredentialsUrl,
  { name, webId },
  accountToken
) {
  return fetchJson(clientCredentialsUrl, {
    method: "POST",
    accountToken,
    body: { name, webId },
  });
}

async function deleteClientCredential(resourceUrl, accountToken) {
  return fetchJson(resourceUrl, {
    method: "DELETE",
    accountToken,
  });
}

function EmptyState({ children }) {
  return <div className="spp-empty">{children}</div>;
}

function AccountActionModal({ modal, onClose }) {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
  }, [modal?.url]);

  useEffect(() => {
    if (!modal?.url) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [modal?.url, onClose]);

  if (!modal?.url) return null;

  return (
    <div className="spp-modalOverlay" role="presentation">
      <div
        className="spp-modal spp-modal--external"
        role="dialog"
        aria-modal="true"
        aria-labelledby="spp-modal-title"
      >
        <div className="spp-modal__head">
          <div>
            <span className="spp-modal__eyebrow">{formatUrlHost(modal.url)}</span>
            <h2 id="spp-modal-title">{modal.title}</h2>
          </div>
          <div className="spp-modal__actions">
            <a
              className="spp-iconBtn"
              href={modal.url}
              target="_blank"
              rel="noopener noreferrer"
              title="Open in new tab"
              aria-label="Open in new tab"
            >
              <FontAwesomeIcon icon={faUpRightFromSquare} />
            </a>
            <button
              type="button"
              className="spp-iconBtn"
              onClick={onClose}
              title="Close"
              aria-label="Close"
            >
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </div>
        </div>
        <div className="spp-modal__body">
          {!loaded ? (
            <ContentLoadingState
              title="Solid Pod Provider"
              message="Loading your personal provider workspace …"
              appId="pod-provider"
              variant="overlay"
            />
          ) : null}
          <iframe
            src={modal.url}
            title={modal.title}
            onLoad={() => setLoaded(true)}
            referrerPolicy="no-referrer-when-downgrade"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-downloads allow-top-navigation-by-user-activation allow-popups-to-escape-sandbox"
          />
        </div>
      </div>
    </div>
  );
}

function CreatePodModal({
  open,
  value,
  loading,
  error,
  onChange,
  onClose,
  onSubmit,
}) {
  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="spp-modalOverlay" role="presentation">
      <div
        className="spp-modal spp-modal--native"
        role="dialog"
        aria-modal="true"
        aria-labelledby="spp-create-pod-title"
      >
        <div className="spp-modal__head">
          <div>
            <span className="spp-modal__eyebrow">Solid Pod Provider</span>
            <h2 id="spp-create-pod-title">Create pod</h2>
          </div>
          <button
            type="button"
            className="spp-iconBtn"
            onClick={onClose}
            title="Close"
            aria-label="Close"
            disabled={loading}
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <form className="spp-nativeForm" onSubmit={onSubmit}>
          <label>
            <span>Pod name</span>
            <input
              type="text"
              value={value}
              onChange={(event) => onChange(event.target.value)}
              autoComplete="off"
              autoFocus
              placeholder="my-pod"
              disabled={loading}
            />
          </label>

          {error ? <div className="spp-nativeForm__error">{error}</div> : null}

          <div className="spp-nativeForm__actions">
            <button
              type="button"
              className="spp-btn spp-btn--secondary"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="spp-btn spp-btn--primary"
              disabled={loading}
            >
              <FontAwesomeIcon icon={faPlus} />
              <span>{loading ? "Creating..." : "Create pod"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function LinkWebIdModal({
  open,
  value,
  loading,
  error,
  onChange,
  onClose,
  onSubmit,
}) {
  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="spp-modalOverlay" role="presentation">
      <div
        className="spp-modal spp-modal--native"
        role="dialog"
        aria-modal="true"
        aria-labelledby="spp-link-webid-title"
      >
        <div className="spp-modal__head">
          <div>
            <span className="spp-modal__eyebrow">Solid Pod Provider</span>
            <h2 id="spp-link-webid-title">Link WebID</h2>
          </div>
          <button
            type="button"
            className="spp-iconBtn"
            onClick={onClose}
            title="Close"
            aria-label="Close"
            disabled={loading}
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <form className="spp-nativeForm" onSubmit={onSubmit}>
          <label>
            <span>WebID</span>
            <input
              type="url"
              value={value}
              onChange={(event) => onChange(event.target.value)}
              autoComplete="off"
              autoFocus
              placeholder="https://provider.example/profile/card#me"
              disabled={loading}
            />
          </label>

          {error ? <div className="spp-nativeForm__error">{error}</div> : null}

          <div className="spp-nativeForm__actions">
            <button
              type="button"
              className="spp-btn spp-btn--secondary"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="spp-btn spp-btn--primary"
              disabled={loading}
            >
              <FontAwesomeIcon icon={faLink} />
              <span>{loading ? "Linking..." : "Link WebID"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CreateTokenModal({
  open,
  name,
  webId,
  webIdOptions,
  loading,
  error,
  result,
  onNameChange,
  onWebIdChange,
  onClose,
  onSubmit,
}) {
  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="spp-modalOverlay" role="presentation">
      <div
        className="spp-modal spp-modal--native"
        role="dialog"
        aria-modal="true"
        aria-labelledby="spp-create-token-title"
      >
        <div className="spp-modal__head">
          <div>
            <span className="spp-modal__eyebrow">Solid Pod Provider</span>
            <h2 id="spp-create-token-title">Create token</h2>
          </div>
          <button
            type="button"
            className="spp-iconBtn"
            onClick={onClose}
            title="Close"
            aria-label="Close"
            disabled={loading}
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        {result ? (
          <div className="spp-nativeForm">
            <div className="spp-tokenResult">
              <div className="spp-tokenResult__field">
                <span>Token name</span>
                <code>{result.name}</code>
              </div>
              <div className="spp-tokenResult__field">
                <span>WebID</span>
                <code>{result.webId}</code>
              </div>
              <div className="spp-tokenResult__field">
                <span>Client ID</span>
                <code>{result.id}</code>
              </div>
              <div className="spp-tokenResult__field">
                <span>Client secret</span>
                <code>{result.secret}</code>
              </div>
            </div>
            <div className="spp-nativeForm__actions">
              <button
                type="button"
                className="spp-btn spp-btn--primary"
                onClick={onClose}
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form className="spp-nativeForm" onSubmit={onSubmit}>
            <label>
              <span>Token name</span>
              <input
                type="text"
                value={name}
                onChange={(event) => onNameChange(event.target.value)}
                autoComplete="off"
                autoFocus
                placeholder="solid-dataspace"
                disabled={loading}
              />
            </label>

            <label>
              <span>WebID</span>
              {webIdOptions.length ? (
                <select
                  value={webId}
                  onChange={(event) => onWebIdChange(event.target.value)}
                  disabled={loading}
                >
                  {webIdOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="url"
                  value={webId}
                  onChange={(event) => onWebIdChange(event.target.value)}
                  autoComplete="off"
                  placeholder="https://provider.example/profile/card#me"
                  disabled={loading}
                />
              )}
            </label>

            {error ? <div className="spp-nativeForm__error">{error}</div> : null}

            <div className="spp-nativeForm__actions">
              <button
                type="button"
                className="spp-btn spp-btn--secondary"
                onClick={onClose}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="spp-btn spp-btn--primary"
                disabled={loading}
              >
                <FontAwesomeIcon icon={faKey} />
                <span>{loading ? "Creating..." : "Create token"}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function DeleteTokenModal({
  token,
  loading,
  error,
  onClose,
  onConfirm,
}) {
  useEffect(() => {
    if (!token) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [token, onClose]);

  if (!token) return null;

  return (
    <div className="spp-modalOverlay" role="presentation">
      <div
        className="spp-modal spp-modal--native"
        role="dialog"
        aria-modal="true"
        aria-labelledby="spp-delete-token-title"
      >
        <div className="spp-modal__head">
          <div>
            <span className="spp-modal__eyebrow">Credential token</span>
            <h2 id="spp-delete-token-title">Delete token</h2>
          </div>
          <button
            type="button"
            className="spp-iconBtn"
            onClick={onClose}
            title="Close"
            aria-label="Close"
            disabled={loading}
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <div className="spp-nativeForm">
          <div className="spp-deleteSummary">
            <FontAwesomeIcon icon={faTriangleExclamation} />
            <div>
              <strong translate="no">{token.name}</strong>
              {token.webId ? <span>{token.webId}</span> : null}
            </div>
          </div>

          {error ? <div className="spp-nativeForm__error">{error}</div> : null}

          <div className="spp-nativeForm__actions">
            <button
              type="button"
              className="spp-btn spp-btn--secondary"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="button"
              className="spp-btn spp-btn--danger"
              onClick={onConfirm}
              disabled={loading}
            >
              <FontAwesomeIcon icon={faTrashCan} />
              <span>{loading ? "Deleting..." : "Delete token"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function InlineLinkButton({
  href,
  title,
  onOpenModal,
  children,
  className = "",
}) {
  if (!href) return null;

  return (
    <button
      type="button"
      className={`spp-inlineLink${className ? ` ${className}` : ""}`}
      onClick={() => onOpenModal?.(title, href)}
      title={href}
    >
      {children || href}
    </button>
  );
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

function AccountSection({
  icon,
  title,
  meta,
  actionHref,
  actionLabel,
  actionIcon = faPlus,
  onActionClick,
  onOpenModal,
  children,
}) {
  const showAction = Boolean(actionHref || onActionClick);

  return (
    <section className="spp-section">
      <div className="spp-section__head">
        <div className="spp-section__titleBlock">
          <span className="spp-section__icon">
            <FontAwesomeIcon icon={icon} />
          </span>
          <div>
            <h3>{title}</h3>
            {meta ? <p>{meta}</p> : null}
          </div>
        </div>
        {showAction ? (
          <button
            type="button"
            className="spp-action"
            onClick={() =>
              onActionClick ? onActionClick() : onOpenModal(actionLabel, actionHref)
            }
            title={actionHref || actionLabel}
          >
            <FontAwesomeIcon icon={actionIcon} />
            <span>{actionLabel}</span>
          </button>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export default function SolidPodProvider({ webId }) {
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
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
  const [actionModal, setActionModal] = useState(null);
  const [createPodOpen, setCreatePodOpen] = useState(false);
  const [createPodName, setCreatePodName] = useState("");
  const [createPodLoading, setCreatePodLoading] = useState(false);
  const [createPodError, setCreatePodError] = useState("");
  const [linkWebIdOpen, setLinkWebIdOpen] = useState(false);
  const [linkWebIdValue, setLinkWebIdValue] = useState("");
  const [linkWebIdLoading, setLinkWebIdLoading] = useState(false);
  const [linkWebIdError, setLinkWebIdError] = useState("");
  const [createTokenOpen, setCreateTokenOpen] = useState(false);
  const [createTokenName, setCreateTokenName] = useState("solid-dataspace");
  const [createTokenWebId, setCreateTokenWebId] = useState("");
  const [createTokenLoading, setCreateTokenLoading] = useState(false);
  const [createTokenError, setCreateTokenError] = useState("");
  const [createTokenResult, setCreateTokenResult] = useState(null);
  const [deleteTokenTarget, setDeleteTokenTarget] = useState(null);
  const [deleteTokenLoading, setDeleteTokenLoading] = useState(false);
  const [deleteTokenError, setDeleteTokenError] = useState("");

  const loginApiUrl = useMemo(
    () => resolvePasswordLoginUrl(account.controls, profile.accountIndexUrl),
    [account.controls, profile.accountIndexUrl]
  );
  const visibleClientCredentials = useMemo(
    () =>
      account.clientCredentials.filter(
        (credential) => {
          const credentialName = (credential.name || "").trim().toLowerCase();
          return !(
            credentialName === DATASPACE_TOKEN_NAME ||
            credentialName.startsWith(`${DATASPACE_TOKEN_NAME}_`) ||
            credentialName.startsWith(`${DATASPACE_TOKEN_NAME}-`)
          );
        }
      ),
    [account.clientCredentials]
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

        const [podsResult, webIdsResult, credentialsResult] = await Promise.all([
          readEndpoint("Pods", controls?.account?.pod, effectiveAccountToken),
          readEndpoint("Registered Web IDs", controls?.account?.webId, effectiveAccountToken),
          readEndpoint(
            "Credential tokens",
            controls?.account?.clientCredentials,
            effectiveAccountToken
          ),
        ]);

        const endpointErrors = [
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
  }, [webId, reloadKey, accountAuth]);

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
      setReloadKey((value) => value + 1);
    } catch (err) {
      setLoginError(err?.message || "Account login failed.");
    } finally {
      setLoginLoading(false);
    }
  };

  const openActionModal = (title, url) => {
    if (!url) return;
    setActionModal({ title, url });
  };

  const closeActionModal = () => {
    setActionModal(null);
    setReloadKey((value) => value + 1);
  };

  const openCreatePodModal = () => {
    setCreatePodName("");
    setCreatePodError("");
    setCreatePodOpen(true);
  };

  const closeCreatePodModal = () => {
    if (createPodLoading) return;
    setCreatePodOpen(false);
    setCreatePodError("");
  };

  const handleCreatePod = async (event) => {
    event.preventDefault();
    setCreatePodError("");

    const podCreateUrl = account.controls?.account?.pod;
    const accountToken =
      accountAuth.token || readStoredAccountToken(profile.accountIndexUrl);
    const name = createPodName.trim().toLowerCase();

    if (!podCreateUrl) {
      setCreatePodError("No pod creation endpoint is available.");
      return;
    }

    if (!accountToken) {
      setCreatePodError("Account login is required to create a pod.");
      return;
    }

    if (!name) {
      setCreatePodError("Pod name is required.");
      return;
    }

    if (!/^[a-z0-9][a-z0-9_-]*$/.test(name)) {
      setCreatePodError(
        "Use lowercase letters, numbers, dashes, or underscores. Start with a letter or number."
      );
      return;
    }

    try {
      setCreatePodLoading(true);
      await createPod(podCreateUrl, { name }, accountToken);
      setCreatePodName("");
      setCreatePodOpen(false);
      setReloadKey((value) => value + 1);
    } catch (err) {
      setCreatePodError(err?.message || "Pod could not be created.");
    } finally {
      setCreatePodLoading(false);
    }
  };

  const getCurrentAccountToken = () =>
    accountAuth.token || readStoredAccountToken(profile.accountIndexUrl);

  const getDefaultTokenWebId = () => {
    const registeredWebId = account.webIds.find((item) => item.webId === webId)?.webId;
    return registeredWebId || account.webIds[0]?.webId || webId || "";
  };

  const openLinkWebIdModal = () => {
    setLinkWebIdValue("");
    setLinkWebIdError("");
    setLinkWebIdOpen(true);
  };

  const closeLinkWebIdModal = () => {
    if (linkWebIdLoading) return;
    setLinkWebIdOpen(false);
    setLinkWebIdError("");
  };

  const handleLinkWebId = async (event) => {
    event.preventDefault();
    setLinkWebIdError("");

    const webIdLinkUrl = account.controls?.account?.webId;
    const accountToken = getCurrentAccountToken();
    const nextWebId = linkWebIdValue.trim();

    if (!webIdLinkUrl) {
      setLinkWebIdError("No WebID linking endpoint is available.");
      return;
    }

    if (!accountToken) {
      setLinkWebIdError("Account login is required to link a WebID.");
      return;
    }

    if (!nextWebId) {
      setLinkWebIdError("WebID is required.");
      return;
    }

    try {
      new URL(nextWebId);
    } catch {
      setLinkWebIdError("Enter a valid WebID URL.");
      return;
    }

    try {
      setLinkWebIdLoading(true);
      await linkWebId(webIdLinkUrl, { webId: nextWebId }, accountToken);
      setLinkWebIdValue("");
      setLinkWebIdOpen(false);
      setReloadKey((value) => value + 1);
    } catch (err) {
      setLinkWebIdError(err?.message || "WebID could not be linked.");
    } finally {
      setLinkWebIdLoading(false);
    }
  };

  const openCreateTokenModal = () => {
    setCreateTokenName("solid-dataspace");
    setCreateTokenWebId(getDefaultTokenWebId());
    setCreateTokenError("");
    setCreateTokenResult(null);
    setCreateTokenOpen(true);
  };

  const closeCreateTokenModal = () => {
    if (createTokenLoading) return;
    const shouldReload = Boolean(createTokenResult);
    setCreateTokenOpen(false);
    setCreateTokenError("");
    setCreateTokenResult(null);
    if (shouldReload) {
      setReloadKey((value) => value + 1);
    }
  };

  const handleCreateToken = async (event) => {
    event.preventDefault();
    setCreateTokenError("");

    const clientCredentialsUrl = account.controls?.account?.clientCredentials;
    const accountToken = getCurrentAccountToken();
    const name = createTokenName.trim();
    const selectedWebId = createTokenWebId.trim();

    if (!clientCredentialsUrl) {
      setCreateTokenError("No credential token endpoint is available.");
      return;
    }

    if (!accountToken) {
      setCreateTokenError("Account login is required to create a token.");
      return;
    }

    if (!name) {
      setCreateTokenError("Token name is required.");
      return;
    }

    if (!selectedWebId) {
      setCreateTokenError("WebID is required.");
      return;
    }

    try {
      new URL(selectedWebId);
    } catch {
      setCreateTokenError("Enter a valid WebID URL.");
      return;
    }

    try {
      setCreateTokenLoading(true);
      const credential = await createClientCredential(
        clientCredentialsUrl,
        { name, webId: selectedWebId },
        accountToken
      );

      if (!credential?.id || !credential?.secret) {
        throw new Error("The provider did not return a complete credential token.");
      }

      setCreateTokenResult({
        name,
        webId: selectedWebId,
        id: credential.id,
        secret: credential.secret,
      });
    } catch (err) {
      setCreateTokenError(err?.message || "Token could not be created.");
    } finally {
      setCreateTokenLoading(false);
    }
  };

  const openDeleteTokenModal = (token) => {
    if (!token?.resourceUrl) return;
    setDeleteTokenTarget(token);
    setDeleteTokenError("");
  };

  const closeDeleteTokenModal = () => {
    if (deleteTokenLoading) return;
    setDeleteTokenTarget(null);
    setDeleteTokenError("");
  };

  const handleDeleteToken = async () => {
    if (!deleteTokenTarget?.resourceUrl) return;

    setDeleteTokenError("");
    const accountToken = getCurrentAccountToken();

    if (!accountToken) {
      setDeleteTokenError("Account login is required to delete a token.");
      return;
    }

    try {
      setDeleteTokenLoading(true);
      await deleteClientCredential(deleteTokenTarget.resourceUrl, accountToken);
      setDeleteTokenTarget(null);
      setReloadKey((value) => value + 1);
    } catch (err) {
      setDeleteTokenError(err?.message || "Token could not be deleted.");
    } finally {
      setDeleteTokenLoading(false);
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

          {loading ? (
            <ContentLoadingState
              title="Solid Pod Provider"
              message="Loading your personal account information …"
              appId="pod-provider"
              variant="compact"
            />
          ) : null}

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

              <div className="spp-overview" aria-label="Account overview">
                <div className="spp-metric">
                  <FontAwesomeIcon icon={faDatabase} />
                  <span>Pods</span>
                  <strong>{account.pods.length}</strong>
                </div>
                <div className="spp-metric">
                  <FontAwesomeIcon icon={faIdCard} />
                  <span>Registered Web IDs</span>
                  <strong>{account.webIds.length}</strong>
                </div>
                <div className="spp-metric">
                  <FontAwesomeIcon icon={faKey} />
                  <span>Credential Tokens</span>
                  <strong>{visibleClientCredentials.length}</strong>
                </div>
              </div>

              <div className="spp-contentGrid">
                <AccountSection
                  icon={faDatabase}
                  title="Pods"
                  actionHref={account.controls?.account?.pod}
                  actionLabel="Create pod"
                  actionIcon={faPlus}
                  onActionClick={
                    account.controls?.account?.pod ? openCreatePodModal : null
                  }
                  onOpenModal={openActionModal}
                >
                  <LinkList
                    items={account.pods}
                    getKey={(item) => item.resourceUrl || item.podUrl}
                    renderItem={(item) => (
                      <article className="spp-item">
                        <div className="spp-item__main">
                          <span className="spp-item__label">Pod URL</span>
                          <InlineLinkButton
                            href={item.podUrl}
                            title="Pod"
                            onOpenModal={openActionModal}
                            className="spp-urlButton"
                          >
                            {item.podUrl}
                          </InlineLinkButton>
                        </div>
                        {item.owners.length ? (
                          <div className="spp-owner-list">
                            <span>Owners</span>
                            {item.owners.map((owner) => (
                              <InlineLinkButton
                                key={`${item.podUrl}-${owner.webId}`}
                                href={owner.webId}
                                title="Owner WebID"
                                onOpenModal={openActionModal}
                                className="spp-owner"
                              >
                                {owner.webId}
                                {owner.visible ? " - visible" : ""}
                              </InlineLinkButton>
                            ))}
                          </div>
                        ) : null}
                      </article>
                    )}
                  />
                </AccountSection>

                <AccountSection
                  icon={faIdCard}
                  title="Registered Web IDs"
                  actionHref={account.controls?.account?.webId}
                  actionLabel="Link WebID"
                  actionIcon={faLink}
                  onActionClick={
                    account.controls?.account?.webId ? openLinkWebIdModal : null
                  }
                  onOpenModal={openActionModal}
                >
                  <LinkList
                    items={account.webIds}
                    getKey={(item) => item.resourceUrl || item.webId}
                    renderItem={(item) => (
                      <article className="spp-item">
                        <div className="spp-item__main">
                          <span className="spp-item__label">WebID</span>
                          <InlineLinkButton
                            href={item.webId}
                            title="Registered WebID"
                            onOpenModal={openActionModal}
                            className="spp-urlButton"
                          >
                            {item.webId}
                          </InlineLinkButton>
                        </div>
                      </article>
                    )}
                  />
                </AccountSection>

                <AccountSection
                  icon={faKey}
                  title="Credential Tokens"
                  actionHref={account.controls?.account?.clientCredentials}
                  actionLabel="Create token"
                  actionIcon={faPlus}
                  onActionClick={
                    account.controls?.account?.clientCredentials
                      ? openCreateTokenModal
                      : null
                  }
                  onOpenModal={openActionModal}
                >
                  <LinkList
                    items={visibleClientCredentials}
                    getKey={(item) => item.resourceUrl || item.name}
                    renderItem={(item) => (
                      <article className="spp-item spp-item--token">
                        <div className="spp-item__main">
                          <span className="spp-item__label">Token name</span>
                          <strong translate="no">{item.name}</strong>
                        </div>
                        {item.webId ? (
                          <div className="spp-item__main">
                            <span className="spp-item__label">WebID</span>
                            <InlineLinkButton
                              href={item.webId}
                              title="Token WebID"
                              onOpenModal={openActionModal}
                              className="spp-urlButton"
                            >
                              {item.webId}
                            </InlineLinkButton>
                          </div>
                        ) : null}
                        {item.resourceUrl ? (
                          <button
                            type="button"
                            className="spp-deleteIconBtn"
                            onClick={() => openDeleteTokenModal(item)}
                            title="Delete token"
                            aria-label={`Delete token ${item.name}`}
                          >
                            <FontAwesomeIcon icon={faTrashCan} />
                          </button>
                        ) : null}
                      </article>
                    )}
                  />
                </AccountSection>
              </div>
            </>
          ) : null}
        </div>
      </div>
      <AccountActionModal modal={actionModal} onClose={closeActionModal} />
      <CreatePodModal
        open={createPodOpen}
        value={createPodName}
        loading={createPodLoading}
        error={createPodError}
        onChange={setCreatePodName}
        onClose={closeCreatePodModal}
        onSubmit={handleCreatePod}
      />
      <LinkWebIdModal
        open={linkWebIdOpen}
        value={linkWebIdValue}
        loading={linkWebIdLoading}
        error={linkWebIdError}
        onChange={setLinkWebIdValue}
        onClose={closeLinkWebIdModal}
        onSubmit={handleLinkWebId}
      />
      <CreateTokenModal
        open={createTokenOpen}
        name={createTokenName}
        webId={createTokenWebId}
        webIdOptions={account.webIds.map((item) => item.webId)}
        loading={createTokenLoading}
        error={createTokenError}
        result={createTokenResult}
        onNameChange={setCreateTokenName}
        onWebIdChange={setCreateTokenWebId}
        onClose={closeCreateTokenModal}
        onSubmit={handleCreateToken}
      />
      <DeleteTokenModal
        token={deleteTokenTarget}
        loading={deleteTokenLoading}
        error={deleteTokenError}
        onClose={closeDeleteTokenModal}
        onConfirm={handleDeleteToken}
      />
    </div>
  );
}
