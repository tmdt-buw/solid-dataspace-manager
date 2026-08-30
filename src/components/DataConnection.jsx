import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faLink,
  faFolderOpen,
  faKey,
  faPlus,
  faServer,
  faSliders,
  faTrash,
  faUserGear,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import session from "../solidSession";
import { loadHomeAssistantEntities } from "../homeAssistantApi";
import {
  deleteCustomConnection,
  deleteHomeAssistantConnection,
  getHomeAssistantSolidSyncDocumentUrl,
  loadConnectionLastSync,
  loadCustomConnections,
  loadHomeAssistantConnections,
  saveCustomConnection,
  saveHomeAssistantConnection,
} from "../solidConnections";
import { loadCredentialToken } from "../solidCredentialToken";
import { getPodRoot } from "../solidCatalog";
import { registerSyncWorkerParticipant } from "../syncWorkerRegistration";
import { prepareDataConnectionSetup } from "../dataConnectionSetup";
import ContentLoadingState from "./ContentLoadingState";
import "./DataConnection.css";

const HOME_ASSISTANT_LOGO =
  "https://brands.home-assistant.io/homeassistant/icon.png";

const emptyCustomConnection = () => ({
  id: "",
  name: "",
  description: "",
  url: "",
  port: "",
  sourceEndpoint: "/",
  storageDocumentUrl: "",
  method: "GET",
  authType: "none",
  authSecret: "",
  authHeader: "X-API-Key",
  headersJson: "",
});

const WORKER_SYNC_INTERVAL_MINUTES = "10";
const HOME_ASSISTANT_DATA_MODEL = "solid-sync-json";

const EMPTY_SETUP_STATUS = {
  webId: "",
  phase: "checking",
  connectionsReady: false,
  credentialReady: false,
  workerRegistered: false,
  workerReason: "",
  error: "",
};

const connectionSyncKey = (type, id) => `${type}:${id || ""}`;

const formatAuthType = (authType) => {
  if (authType === "bearer") return "Bearer token";
  if (authType === "api-key") return "API key";
  return "No auth";
};

const formatLastUpdate = (value) => {
  if (!value) return "Last update: never";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Last update: never";
  return `Last update: ${date.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })}`;
};

const hasUrlScheme = (value) => /^[a-z][a-z\d+.-]*:/i.test(String(value || ""));

const toPodRelativeDocumentUrl = (webId, value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const podRoot = getPodRoot(webId);
  return podRoot && raw.startsWith(podRoot)
    ? raw.slice(podRoot.length).replace(/^\/+/, "")
    : raw;
};

const toAbsolutePodDocumentUrl = (webId, value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";

  try {
    const parsed = hasUrlScheme(raw)
      ? new URL(raw)
      : new URL(raw.replace(/^\/+/, ""), getPodRoot(webId));
    parsed.hash = "";
    return parsed.href;
  } catch {
    return raw;
  }
};

const getCustomSourceEndpointPath = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";

  try {
    const parsed = new URL(hasUrlScheme(raw) ? raw : `http://${raw}`);
    const path = parsed.pathname && parsed.pathname !== "/" ? parsed.pathname : "/";
    return `${path}${parsed.search || ""}`;
  } catch {
    return "";
  }
};

const getCustomBaseUrl = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";

  try {
    const parsed = new URL(hasUrlScheme(raw) ? raw : `http://${raw}`);
    return hasUrlScheme(raw) ? parsed.origin : parsed.host;
  } catch {
    return raw;
  }
};

async function registerExistingConnectionsForWorker(webId, connections) {
  if (!webId || !connections.length) return;
  const credentialToken = await loadCredentialToken(webId, session.fetch);

  const storageDocumentUrls = Array.from(
    new Set(
      connections
        .map((connection) => connection?.storageDocumentUrl)
        .filter(Boolean)
    )
  );

  for (const storageDocumentUrl of storageDocumentUrls) {
    await registerSyncWorkerParticipant({
      webId,
      credentialToken,
      storageDocumentUrl,
      solidFetch: session.fetch,
    });
  }
}

function ModalFrame({ title, icon, children, onClose, saving, compact = false }) {
  return (
    <div className="data-connection-modalOverlay" role="presentation">
      <div
        className={`data-connection-modal${compact ? " data-connection-modal--compact" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="data-connection-modal-title"
      >
        <div className="data-connection-modal__head">
          <div className="data-connection-modal__title">
            {typeof icon === "string" ? (
              <img src={icon} alt="" aria-hidden="true" />
            ) : (
              <span className="data-connection-modal__titleIcon">
                <FontAwesomeIcon icon={icon} />
              </span>
            )}
            <h2 id="data-connection-modal-title">{title}</h2>
          </div>
          <button
            type="button"
            className="data-connection-modal__close"
            onClick={onClose}
            title="Close"
            aria-label="Close"
            disabled={saving}
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ConnectionTypeSelector({ value, onChange, disabled }) {
  return (
    <div className="data-connection-typeSwitch" aria-label="Connection type">
      <button
        type="button"
        className={`data-connection-typeSwitch__option${
          value === "home-assistant"
            ? " data-connection-typeSwitch__option--active"
            : ""
        }`}
        onClick={() => onChange("home-assistant")}
        disabled={disabled}
      >
        <span className="data-connection-typeSwitch__icon">
          <img src={HOME_ASSISTANT_LOGO} alt="" aria-hidden="true" />
        </span>
        <span>
          <strong>Home Assistant</strong>
          <small>Entity selection</small>
        </span>
      </button>

      <button
        type="button"
        className={`data-connection-typeSwitch__option${
          value === "custom" ? " data-connection-typeSwitch__option--active" : ""
        }`}
        onClick={() => onChange("custom")}
        disabled={disabled}
      >
        <span className="data-connection-typeSwitch__icon">
          <FontAwesomeIcon icon={faSliders} />
        </span>
        <span>
          <strong>Custom API</strong>
          <small>HTTP endpoint</small>
        </span>
      </button>
    </div>
  );
}

function HomeAssistantModal({
  open,
  name,
  url,
  port,
  accessToken,
  storageDocumentUrl,
  entities,
  selectedEntities,
  entitySearch,
  domainFilter,
  saving,
  loadingEntities,
  error,
  showTypeSelector,
  onTypeChange,
  onNameChange,
  onUrlChange,
  onPortChange,
  onAccessTokenChange,
  onStorageDocumentUrlChange,
  onEntitySearchChange,
  onDomainFilterChange,
  onToggleEntity,
  onSelectEntities,
  onClearSelection,
  onClose,
  onSubmit,
}) {
  const domains = useMemo(
    () => Array.from(new Set(entities.map((entity) => entity.domain))).sort(),
    [entities]
  );
  const selectedSet = useMemo(
    () => new Set(selectedEntities),
    [selectedEntities]
  );
  const filteredEntities = useMemo(() => {
    const query = entitySearch.trim().toLowerCase();
    return entities.filter((entity) => {
      const domainMatch = domainFilter === "all" || entity.domain === domainFilter;
      const searchMatch =
        !query ||
        entity.entityId.toLowerCase().includes(query) ||
        entity.friendlyName.toLowerCase().includes(query) ||
        String(entity.state || "").toLowerCase().includes(query);
      return domainMatch && searchMatch;
    });
  }, [domainFilter, entities, entitySearch]);

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
    <ModalFrame
      title={showTypeSelector ? "Add Data Connection" : "Edit Home Assistant"}
      icon={HOME_ASSISTANT_LOGO}
      onClose={onClose}
      saving={saving}
    >
      <form className="data-connection-form" onSubmit={onSubmit}>
        {showTypeSelector ? (
          <ConnectionTypeSelector
            value="home-assistant"
            onChange={onTypeChange}
            disabled={saving}
          />
        ) : null}

        <FormSection title="Connection">
          <label>
            <span>Name</span>
            <input
              type="text"
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              placeholder="Home Assistant"
              autoFocus
              disabled={saving}
            />
          </label>

          <div className="data-connection-form__split data-connection-form__split--sourceRequest">
            <label>
              <span>URL</span>
              <input
                type="text"
                value={url}
                onChange={(event) => onUrlChange(event.target.value)}
                placeholder="https://homeassistant.example or 192.168.1.50"
                autoComplete="url"
                disabled={saving}
              />
            </label>

            <label>
              <span>Port</span>
              <input
                type="number"
                min="1"
                max="65535"
                value={port}
                onChange={(event) => onPortChange(event.target.value)}
                placeholder="8123"
                disabled={saving}
              />
            </label>
          </div>
        </FormSection>

        <FormSection title="Source request">
          <div className="data-connection-form__split">
            <label>
              <span>Request method</span>
              <input
                className="data-connection-form__lockedInput"
                type="text"
                value="GET"
                readOnly
              />
            </label>

            <label>
              <span>Source endpoint</span>
              <input
                className="data-connection-form__lockedInput"
                type="text"
                value="/api/states"
                readOnly
              />
            </label>
          </div>
        </FormSection>

        <FormSection title="Authentication">
          <label>
            <span>Long-lived access token</span>
            <input
              type="password"
              value={accessToken}
              onChange={(event) => onAccessTokenChange(event.target.value)}
              placeholder="Home Assistant token"
              autoComplete="off"
              disabled={saving}
            />
          </label>
        </FormSection>

        <FormSection title="Storage">
          <label>
            <span>Pod storage document</span>
            <input
              type="text"
              value={storageDocumentUrl}
              onChange={(event) =>
                onStorageDocumentUrlChange(event.target.value)
              }
              placeholder="connections/homeassistant-solid-sync.json"
              disabled={saving}
            />
          </label>
        </FormSection>

        <FormSection title="Entities">
          {loadingEntities ? (
            <ContentLoadingState
              title="Data Connection"
              message="Loading your available entities …"
              icon={faLink}
              variant="compact"
            />
          ) : null}

          {entities.length > 0 ? (
            <div className="data-connection-entities">
              <div className="data-connection-entities__head">
                <span>{selectedEntities.length} selected</span>
              </div>

              <div className="data-connection-entities__filters">
                <input
                  type="search"
                  value={entitySearch}
                  onChange={(event) => onEntitySearchChange(event.target.value)}
                  placeholder="Search entities"
                  disabled={saving}
                />
                <select
                  value={domainFilter}
                  onChange={(event) => onDomainFilterChange(event.target.value)}
                  disabled={saving}
                >
                  <option value="all">All domains</option>
                  {domains.map((domain) => (
                    <option key={domain} value={domain}>
                      {domain}
                    </option>
                  ))}
                </select>
              </div>

              <div className="data-connection-entities__actions">
                <button
                  type="button"
                  className="data-connection-miniBtn"
                  onClick={() =>
                    onSelectEntities([
                      ...selectedEntities,
                      ...filteredEntities.map((entity) => entity.entityId),
                    ])
                  }
                  disabled={saving || filteredEntities.length === 0}
                >
                  Select visible
                </button>
                <button
                  type="button"
                  className="data-connection-miniBtn"
                  onClick={onClearSelection}
                  disabled={saving || selectedEntities.length === 0}
                >
                  Clear
                </button>
              </div>

              <div className="data-connection-entities__list">
                {filteredEntities.length > 0 ? (
                  filteredEntities.map((entity) => (
                    <label
                      key={entity.entityId}
                      className="data-connection-entity"
                    >
                      <input
                        type="checkbox"
                        checked={selectedSet.has(entity.entityId)}
                        onChange={() => onToggleEntity(entity.entityId)}
                        disabled={saving}
                      />
                      <span className="data-connection-entity__main">
                        <span className="data-connection-entity__name">
                          {entity.friendlyName}
                        </span>
                        <code>{entity.entityId}</code>
                      </span>
                      <span className="data-connection-entity__state">
                        {entity.state}
                        {entity.unit ? ` ${entity.unit}` : ""}
                      </span>
                    </label>
                  ))
                ) : (
                  <div className="data-connection-entities__empty">
                    No entities match the current filter.
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </FormSection>

        {error ? <div className="data-connection-form__error">{error}</div> : null}

        <div className="data-connection-form__footer">
          <div />
          <div className="data-connection-form__actions">
            <button
              type="button"
              className="data-connection-btn data-connection-btn--secondary"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="data-connection-btn data-connection-btn--primary"
              disabled={saving}
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </form>
    </ModalFrame>
  );
}

function CustomConnectionModal({
  open,
  values,
  saving,
  error,
  showTypeSelector,
  onChange,
  onTypeChange,
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

  const update = (key, value) => onChange({ ...values, [key]: value });
  const updateUrl = (value) => {
    const nextValues = { ...values, url: getCustomBaseUrl(value) || value };
    const endpointPath = getCustomSourceEndpointPath(value);
    if (
      endpointPath &&
      endpointPath !== "/" &&
      (!values.sourceEndpoint || values.sourceEndpoint === "/")
    ) {
      nextValues.sourceEndpoint = endpointPath;
    }
    onChange(nextValues);
  };

  return (
    <ModalFrame
      title={showTypeSelector ? "Add Data Connection" : "Edit Custom API"}
      icon={faSliders}
      onClose={onClose}
      saving={saving}
    >
      <form className="data-connection-form" onSubmit={onSubmit}>
        {showTypeSelector ? (
          <ConnectionTypeSelector
            value="custom"
            onChange={onTypeChange}
            disabled={saving}
          />
        ) : null}

        <FormSection title="Connection">
          <label>
            <span>Name</span>
            <input
              type="text"
              value={values.name}
              onChange={(event) => update("name", event.target.value)}
              placeholder="Building API"
              autoFocus
              disabled={saving}
            />
          </label>

          <div className="data-connection-form__split">
            <label>
              <span>URL</span>
              <input
                type="text"
                value={values.url}
                onChange={(event) => updateUrl(event.target.value)}
                placeholder="https://api.example.org or 192.168.1.20"
                autoComplete="url"
                disabled={saving}
              />
            </label>

            <label>
              <span>Port</span>
              <input
                type="number"
                min="1"
                max="65535"
                value={values.port}
                onChange={(event) => update("port", event.target.value)}
                placeholder="443"
                disabled={saving}
              />
            </label>
          </div>

        </FormSection>

        <FormSection title="Source request">
          <div className="data-connection-form__split data-connection-form__split--sourceRequest">
            <label>
              <span>Request method</span>
              <select
                value={values.method}
                onChange={(event) => update("method", event.target.value)}
                disabled={saving}
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="PATCH">PATCH</option>
                <option value="DELETE">DELETE</option>
              </select>
            </label>

            <label>
              <span>Source endpoint</span>
              <input
                type="text"
                value={values.sourceEndpoint || ""}
                onChange={(event) => update("sourceEndpoint", event.target.value)}
                placeholder="/data"
                disabled={saving}
              />
            </label>
          </div>
        </FormSection>

        <FormSection title="Authentication">
          <label>
            <span>Authentication</span>
            <select
              value={values.authType}
              onChange={(event) => update("authType", event.target.value)}
              disabled={saving}
            >
              <option value="none">None</option>
              <option value="bearer">Bearer token</option>
              <option value="api-key">API key header</option>
            </select>
          </label>

          {values.authType === "api-key" ? (
            <label>
              <span>Header name</span>
              <input
                type="text"
                value={values.authHeader}
                onChange={(event) => update("authHeader", event.target.value)}
                placeholder="X-API-Key"
                disabled={saving}
              />
            </label>
          ) : null}

          {values.authType !== "none" ? (
            <label>
              <span>{values.authType === "bearer" ? "Token" : "API key"}</span>
              <input
                type="password"
                value={values.authSecret}
                onChange={(event) => update("authSecret", event.target.value)}
                placeholder="Secret"
                autoComplete="off"
                disabled={saving}
              />
            </label>
          ) : null}

          <label>
            <span>Additional headers JSON</span>
            <textarea
              value={values.headersJson}
              onChange={(event) => update("headersJson", event.target.value)}
              placeholder='{"Accept": "application/json"}'
              rows={4}
              disabled={saving}
            />
          </label>
        </FormSection>

        <FormSection title="Storage">
          <label>
            <span>Pod storage document</span>
            <input
              type="text"
              value={values.storageDocumentUrl}
              onChange={(event) =>
                update("storageDocumentUrl", event.target.value)
              }
              placeholder="connections/custom-api-sync.json"
              disabled={saving}
            />
          </label>
        </FormSection>

        {error ? <div className="data-connection-form__error">{error}</div> : null}

        <div className="data-connection-form__footer">
          <div />
          <div className="data-connection-form__actions">
            <button
              type="button"
              className="data-connection-btn data-connection-btn--secondary"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="data-connection-btn data-connection-btn--primary"
              disabled={saving}
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </form>
    </ModalFrame>
  );
}

function FormSection({ title, aside, children }) {
  return (
    <section className="data-connection-formSection">
      <div className="data-connection-formSection__head">
        <h3>{title}</h3>
        {aside || null}
      </div>
      <div className="data-connection-formSection__body">{children}</div>
    </section>
  );
}

function DeleteConnectionModal({ target, saving, onCancel, onConfirm }) {
  if (!target) return null;

  const connection = target.connection || {};
  const isHomeAssistant = target.type === "home-assistant";
  const label = isHomeAssistant
    ? connection.name || "Home Assistant"
    : connection.name || connection.id || "Custom API";
  const detail = isHomeAssistant
    ? connection.endpoint || connection.storageDocumentUrl || connection.id
    : connection.url || connection.endpoint || connection.id;

  return (
    <ModalFrame
      title="Delete Data Connection"
      icon={faTrash}
      onClose={onCancel}
      saving={saving}
      compact
    >
      <div className="data-connection-confirm">
        <div className="data-connection-confirm__icon">
          <FontAwesomeIcon icon={faTrash} />
        </div>
        <div className="data-connection-confirm__copy">
          <strong>{label}</strong>
          {detail ? <span>{detail}</span> : null}
          <p>
            This connection and its stored configuration will be permanently
            removed from your Pod.
          </p>
        </div>
        <div className="data-connection-confirm__actions">
          <button
            type="button"
            className="data-connection-btn data-connection-btn--secondary"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="data-connection-btn data-connection-btn--danger"
            onClick={onConfirm}
            disabled={saving}
          >
            {saving ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </ModalFrame>
  );
}

function DataConnectionSetupItem({ icon, title, description, ready, checking }) {
  const stateLabel = checking ? "Checking..." : ready ? "Ready" : "Required";
  return (
    <div className="data-connection-setup__item">
      <span className="data-connection-setup__itemIcon" aria-hidden="true">
        <FontAwesomeIcon icon={icon} />
      </span>
      <span className="data-connection-setup__itemCopy">
        <strong>{title}</strong>
        <span>{description}</span>
      </span>
      <span
        className={`data-connection-setup__state${
          ready ? " data-connection-setup__state--ready" : ""
        }`}
      >
        {stateLabel}
      </span>
    </div>
  );
}

function DataConnectionSetupScreen({ status, onSetup }) {
  const checking = status.phase === "checking";
  const saving = status.phase === "saving";
  const busy = checking || saving;

  return (
    <div className="data-connection">
      <div className="toolbar toolbar--title data-connection__header">
        <div className="crumb">
          <FontAwesomeIcon icon={faLink} className="crumb-icon" />
          <span>Data Connection</span>
        </div>
      </div>

      <div className="data-connection__shell data-connection__shell--setup">
        <section className="data-connection-setup" aria-busy={busy}>
          <div className="data-connection-setup__head">
            <span className="data-connection-setup__heroIcon" aria-hidden="true">
              <FontAwesomeIcon icon={faLink} />
            </span>
            <div>
              <h2>Set up Data Connection</h2>
              <p>
                Prepare the private Pod folder, credential token, and background
                worker access required for automated data connections.
              </p>
            </div>
          </div>

          <div className="data-connection-setup__list">
            <DataConnectionSetupItem
              icon={faFolderOpen}
              title="Connections folder"
              description="Stores connection settings privately in your Solid Pod."
              ready={status.connectionsReady}
              checking={checking}
            />
            <DataConnectionSetupItem
              icon={faKey}
              title="Credential token"
              description="Lets the background worker authenticate as your WebID."
              ready={status.credentialReady}
              checking={checking}
            />
            <DataConnectionSetupItem
              icon={faUserGear}
              title="Background sync worker"
              description="Registers the participant and grants access only to connection data."
              ready={status.workerRegistered}
              checking={checking}
            />
          </div>

          {status.error ? (
            <div className="data-connection-setup__error" role="alert">
              {status.error}
            </div>
          ) : null}

          <div className="data-connection-setup__actions">
            <button
              type="button"
              className="data-connection-btn data-connection-btn--primary"
              onClick={onSetup}
              disabled={busy}
            >
              {checking
                ? "Checking setup..."
                : saving
                ? "Setting up..."
                : status.error
                ? "Retry setup"
                : "Set up Data Connection"}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function DataConnection({ webId }) {
  const [setupStatus, setSetupStatus] = useState(() => ({
    ...EMPTY_SETUP_STATUS,
    webId: webId || "",
  }));
  const [newConnectionType, setNewConnectionType] = useState("home-assistant");
  const [homeAssistantOpen, setHomeAssistantOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [homeAssistantName, setHomeAssistantName] = useState("");
  const [url, setUrl] = useState("");
  const [port, setPort] = useState("443");
  const [accessToken, setAccessToken] = useState("");
  const [storageDocumentUrl, setStorageDocumentUrl] = useState("");
  const [homeAssistantConnections, setHomeAssistantConnections] = useState([]);
  const [activeHomeAssistantId, setActiveHomeAssistantId] = useState("");
  const [entities, setEntities] = useState([]);
  const [selectedEntities, setSelectedEntities] = useState([]);
  const [entitySearch, setEntitySearch] = useState("");
  const [domainFilter, setDomainFilter] = useState("all");
  const [customConnections, setCustomConnections] = useState([]);
  const [customValues, setCustomValues] = useState(emptyCustomConnection());

  const [saving, setSaving] = useState(false);
  const [loadingEntities, setLoadingEntities] = useState(false);
  const [error, setError] = useState("");
  const [lastSyncByConnection, setLastSyncByConnection] = useState({});

  const setupReady =
    setupStatus.phase === "ready" && setupStatus.webId === webId;

  const applySetupResult = useCallback(
    (result, phaseWhenIncomplete = "required") => {
      setSetupStatus({
        ...EMPTY_SETUP_STATUS,
        ...result,
        webId: webId || "",
        phase: result?.ready ? "ready" : phaseWhenIncomplete,
      });
    },
    [webId]
  );

  useEffect(() => {
    let cancelled = false;
    setSetupStatus({
      ...EMPTY_SETUP_STATUS,
      webId: webId || "",
      phase: "checking",
    });

    if (!webId) {
      setSetupStatus({
        ...EMPTY_SETUP_STATUS,
        webId: "",
        phase: "required",
        error: "A WebID is required for Data Connection setup.",
      });
      return undefined;
    }

    prepareDataConnectionSetup({
      webId,
      solidFetch: session.fetch,
      provision: false,
    }).then((result) => {
      if (!cancelled) applySetupResult(result);
    });

    return () => {
      cancelled = true;
    };
  }, [applySetupResult, webId]);

  const handleSetup = async () => {
    setSetupStatus((current) => ({
      ...current,
      webId: webId || "",
      phase: "saving",
      error: "",
    }));
    const result = await prepareDataConnectionSetup({
      webId,
      solidFetch: session.fetch,
      provision: true,
    });
    applySetupResult(result);
  };

  useEffect(() => {
    let cancelled = false;

    const loadConnections = async () => {
      if (!webId || !setupReady) return;

      setError("");
      try {
        const [loadedHomeAssistantConnections, loadedCustom] = await Promise.all([
          loadHomeAssistantConnections(webId, session.fetch),
          loadCustomConnections(webId, session.fetch),
        ]);
        if (!cancelled) {
          setHomeAssistantConnections(loadedHomeAssistantConnections);
          setActiveHomeAssistantId("");
          setHomeAssistantName("");
          setUrl("");
          setPort("443");
          setAccessToken("");
          setStorageDocumentUrl("");
          setSelectedEntities([]);
          setCustomConnections(loadedCustom);
          setEntities([]);
        }
        try {
          await registerExistingConnectionsForWorker(webId, [
            ...loadedHomeAssistantConnections,
            ...loadedCustom,
          ]);
        } catch (registrationError) {
          if (!cancelled) {
            setError(
              registrationError?.message ||
                "Sync worker access could not be refreshed."
            );
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || "Connections could not be loaded.");
        }
      }
    };

    loadConnections();

    return () => {
      cancelled = true;
    };
  }, [setupReady, webId]);

  useEffect(() => {
    let cancelled = false;

    const connections = [
      ...homeAssistantConnections.map((connection) => ({
        type: "home-assistant",
        connection,
      })),
      ...customConnections.map((connection) => ({
        type: "custom",
        connection,
      })),
    ];

    const loadLastSyncs = async () => {
      if (!webId || !setupReady || connections.length === 0) {
        if (!cancelled) setLastSyncByConnection({});
        return;
      }

      const entries = await Promise.all(
        connections.map(async ({ type, connection }) => {
          const key = connectionSyncKey(type, connection.id);
          try {
            const lastSyncAt = await loadConnectionLastSync(
              connection.storageDocumentUrl,
              session.fetch
            );
            return [key, lastSyncAt ? lastSyncAt.toISOString() : ""];
          } catch {
            return [key, ""];
          }
        })
      );

      if (!cancelled) {
        setLastSyncByConnection(Object.fromEntries(entries));
      }
    };

    loadLastSyncs();
    const timer = window.setInterval(loadLastSyncs, 60000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [webId, setupReady, homeAssistantConnections, customConnections]);

  const resetHomeAssistantForm = () => {
    setActiveHomeAssistantId("");
    setHomeAssistantName("");
    setUrl("");
    setPort("443");
    setAccessToken("");
    setStorageDocumentUrl("");
    setEntities([]);
    setSelectedEntities([]);
    setEntitySearch("");
    setDomainFilter("all");
  };

  const openAddConnection = () => {
    setError("");
    setNewConnectionType("home-assistant");
    resetHomeAssistantForm();
    setCustomValues(emptyCustomConnection());
    setCustomOpen(false);
    setHomeAssistantOpen(true);
  };

  const switchNewConnectionType = (type) => {
    if (saving || type === newConnectionType) return;
    setNewConnectionType(type);
    setError("");
    if (type === "home-assistant") {
      setCustomOpen(false);
      setHomeAssistantOpen(true);
    } else {
      setHomeAssistantOpen(false);
      setCustomOpen(true);
    }
  };

  const openExistingHomeAssistant = (connection) => {
    setError("");
    setNewConnectionType("home-assistant");
    setCustomOpen(false);
    setActiveHomeAssistantId(connection.id || "");
    setHomeAssistantName(connection.name || "Home Assistant");
    setUrl(connection.url || "");
    setPort(connection.port || "443");
    setAccessToken(connection.accessToken || "");
    const storageUrl =
      connection.dataModel === HOME_ASSISTANT_DATA_MODEL &&
      connection.storageDocumentUrl
        ? connection.storageDocumentUrl
        : getHomeAssistantSolidSyncDocumentUrl(webId, connection.id || "");
    setStorageDocumentUrl(
      toPodRelativeDocumentUrl(webId, storageUrl)
    );
    setSelectedEntities(connection.selectedEntities || []);
    setEntities([]);
    setEntitySearch("");
    setDomainFilter("all");
    setHomeAssistantOpen(true);
  };

  const openExistingCustom = (connection) => {
    setError("");
    setNewConnectionType("custom");
    setHomeAssistantOpen(false);
    setCustomValues({
      id: connection.id,
      name: connection.name || "",
      description: connection.description || "",
      url: getCustomBaseUrl(connection.url || connection.endpoint || ""),
      port: connection.port || "443",
      sourceEndpoint:
        connection.sourceEndpoint ||
        getCustomSourceEndpointPath(connection.endpoint || connection.url) ||
        "/",
      storageDocumentUrl: toPodRelativeDocumentUrl(
        webId,
        connection.storageDocumentUrl
      ),
      method: connection.method || "GET",
      authType: connection.authType || "none",
      authSecret: connection.authSecret || "",
      authHeader: connection.authHeader || "X-API-Key",
      headersJson: connection.headersJson || "",
    });
    setCustomOpen(true);
  };

  const closeHomeAssistant = () => {
    if (saving) return;
    setHomeAssistantOpen(false);
    setError("");
  };

  const closeCustom = () => {
    if (saving) return;
    setCustomOpen(false);
    setError("");
  };

  useEffect(() => {
    if (!homeAssistantOpen || saving) return undefined;

    const hasConnectionInput = url.trim() && String(port).trim() && accessToken.trim();
    if (!hasConnectionInput) {
      setEntities([]);
      setLoadingEntities(false);
      return undefined;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      setError("");
      setLoadingEntities(true);

      try {
        const loadedEntities = await loadHomeAssistantEntities({
          url,
          port,
          accessToken,
        });
        if (cancelled) return;

        setEntities(loadedEntities);
      } catch (err) {
        if (cancelled) return;

        setEntities([]);
        setError(err?.message || "Home Assistant entities could not be loaded.");
      } finally {
        if (!cancelled) {
          setLoadingEntities(false);
        }
      }
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [accessToken, homeAssistantOpen, port, saving, url]);

  const toggleEntity = (entityId) => {
    setSelectedEntities((current) => {
      const next = new Set(current);
      if (next.has(entityId)) {
        next.delete(entityId);
      } else {
        next.add(entityId);
      }
      return Array.from(next).sort((a, b) => a.localeCompare(b));
    });
  };

  const selectEntities = (entityIds) => {
    setSelectedEntities(
      Array.from(new Set(entityIds.filter(Boolean))).sort((a, b) =>
        a.localeCompare(b)
      )
    );
  };

  const handleSaveHomeAssistant = async (event) => {
    event.preventDefault();
    setError("");

    try {
      setSaving(true);
      const connection = await saveHomeAssistantConnection(webId, session.fetch, {
        id: activeHomeAssistantId,
        name: homeAssistantName,
        url,
        port,
        accessToken,
        storageDocumentUrl,
        dataModel: HOME_ASSISTANT_DATA_MODEL,
        syncIntervalMinutes: WORKER_SYNC_INTERVAL_MINUTES,
        selectedEntities,
      });
      const credentialToken = await loadCredentialToken(webId, session.fetch);
      await registerSyncWorkerParticipant({
        webId,
        credentialToken,
        storageDocumentUrl:
          connection?.storageDocumentUrl ||
          toAbsolutePodDocumentUrl(webId, storageDocumentUrl),
        solidFetch: session.fetch,
      });
      if (
        entities.length > 0 &&
        selectedEntities.length > 0 &&
        !entities.some((entity) => selectedEntities.includes(entity.entityId))
      ) {
        throw new Error("No selected Home Assistant entities were found.");
      }
      setHomeAssistantConnections((current) => {
        const withoutOld = current.filter((item) => item.id !== connection.id);
        return [connection, ...withoutOld].sort((a, b) => {
          const left = a.modifiedAt?.getTime?.() || a.createdAt?.getTime?.() || 0;
          const right = b.modifiedAt?.getTime?.() || b.createdAt?.getTime?.() || 0;
          return right - left || a.id.localeCompare(b.id);
        });
      });
      setActiveHomeAssistantId(connection.id);
      setHomeAssistantName(connection?.name || homeAssistantName);
      setUrl(connection?.url || url);
      setPort(connection?.port || port);
      setAccessToken(connection?.accessToken || accessToken);
      setStorageDocumentUrl(
        toPodRelativeDocumentUrl(
          webId,
          connection?.storageDocumentUrl ||
            toAbsolutePodDocumentUrl(webId, storageDocumentUrl)
        )
      );
      setSelectedEntities(connection?.selectedEntities || selectedEntities);
      setHomeAssistantOpen(false);
    } catch (err) {
      setError(err?.message || "Connection could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCustom = async (event) => {
    event.preventDefault();
    setError("");

    try {
      setSaving(true);
      const saved = await saveCustomConnection(webId, session.fetch, customValues);
      const credentialToken = await loadCredentialToken(webId, session.fetch);
      await registerSyncWorkerParticipant({
        webId,
        credentialToken,
        storageDocumentUrl:
          saved?.storageDocumentUrl ||
          toAbsolutePodDocumentUrl(webId, customValues.storageDocumentUrl),
        solidFetch: session.fetch,
      });
      setCustomConnections((current) => {
        const withoutOld = current.filter((item) => item.id !== saved.id);
        return [...withoutOld, saved].sort((a, b) => a.name.localeCompare(b.name));
      });
      setCustomOpen(false);
    } catch (err) {
      setError(err?.message || "Custom connection could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteHomeAssistant = (targetConnection) => {
    if (!targetConnection?.id) return;
    setError("");
    setDeleteTarget({
      type: "home-assistant",
      connection: targetConnection,
    });
  };

  const handleDeleteCustom = (targetConnection = customValues) => {
    if (!targetConnection?.id) return;
    setError("");
    setDeleteTarget({
      type: "custom",
      connection: targetConnection,
    });
  };

  const closeDeleteModal = () => {
    if (saving) return;
    setDeleteTarget(null);
  };

  const confirmDeleteConnection = async () => {
    const targetConnection = deleteTarget?.connection;
    if (!targetConnection?.id) return;

    setError("");
    try {
      setSaving(true);

      if (deleteTarget.type === "home-assistant") {
        await deleteHomeAssistantConnection(
          webId,
          session.fetch,
          targetConnection.id
        );
        setHomeAssistantConnections((current) =>
          current.filter((connection) => connection.id !== targetConnection.id)
        );
        if (activeHomeAssistantId === targetConnection.id) {
          resetHomeAssistantForm();
        }
        setHomeAssistantOpen(false);
      } else {
        await deleteCustomConnection(webId, session.fetch, targetConnection.id);
        setCustomConnections((current) =>
          current.filter((connection) => connection.id !== targetConnection.id)
        );
        if (customValues.id === targetConnection.id) {
          setCustomOpen(false);
          setCustomValues(emptyCustomConnection());
        }
      }

      setDeleteTarget(null);
    } catch (err) {
      setError(err?.message || "Connection could not be deleted.");
    } finally {
      setSaving(false);
    }
  };

  if (!setupReady) {
    return (
      <DataConnectionSetupScreen
        status={setupStatus}
        onSetup={handleSetup}
      />
    );
  }

  const hasConnections = homeAssistantConnections.length > 0 || customConnections.length > 0;

  return (
    <div className="data-connection">
      <div className="toolbar toolbar--title data-connection__header">
        <div className="crumb">
          <FontAwesomeIcon icon={faLink} className="crumb-icon" />
          <span>Data Connection</span>
        </div>
      </div>

      <div className="data-connection__shell">
        <div className="data-connection__grid">
          {homeAssistantConnections.map((connection) => (
            <div className="data-connection-cardShell" key={connection.id}>
              <button
                type="button"
                className="data-connection-card data-connection-card--withAction"
                onClick={() => openExistingHomeAssistant(connection)}
                title={connection.endpoint || "Home Assistant"}
              >
                <span className="data-connection-card__icon">
                  <img src={HOME_ASSISTANT_LOGO} alt="Home Assistant logo" />
                </span>
                <span className="data-connection-card__copy">
                  <strong>{connection.name || "Home Assistant"}</strong>
                  <span className="data-connection-card__endpoint">
                    {connection.endpoint || connection.url}
                  </span>
                  <span className="data-connection-card__badges">
                    <span>{connection.selectedEntities.length} entities</span>
                  </span>
                  <span className="data-connection-card__lastUpdate">
                    {formatLastUpdate(
                      lastSyncByConnection[
                        connectionSyncKey("home-assistant", connection.id)
                      ]
                    )}
                  </span>
                </span>
              </button>
              <button
                type="button"
                className="data-connection-card__delete"
                onClick={() => handleDeleteHomeAssistant(connection)}
                title="Delete Home Assistant connection"
                aria-label={`Delete ${connection.name || "Home Assistant"}`}
                disabled={saving}
              >
                <FontAwesomeIcon icon={faTrash} />
              </button>
            </div>
          ))}

          {customConnections.map((connection) => (
            <div className="data-connection-cardShell" key={connection.id}>
              <button
                type="button"
                className="data-connection-card data-connection-card--withAction"
                onClick={() => openExistingCustom(connection)}
                title={connection.name}
              >
                <span className="data-connection-card__icon data-connection-card__icon--custom">
                  <FontAwesomeIcon icon={faServer} />
                </span>
                <span className="data-connection-card__copy">
                  <strong>{connection.name}</strong>
                  <span className="data-connection-card__endpoint">
                    {connection.endpoint || connection.url}
                  </span>
                  <span className="data-connection-card__badges">
                    <span>{connection.method || "GET"}</span>
                    <span>{formatAuthType(connection.authType)}</span>
                  </span>
                  <span className="data-connection-card__lastUpdate">
                    {formatLastUpdate(
                      lastSyncByConnection[
                        connectionSyncKey("custom", connection.id)
                      ]
                    )}
                  </span>
                </span>
              </button>
              <button
                type="button"
                className="data-connection-card__delete"
                onClick={() => handleDeleteCustom(connection)}
                title={`Delete ${connection.name}`}
                aria-label={`Delete ${connection.name}`}
                disabled={saving}
              >
                <FontAwesomeIcon icon={faTrash} />
              </button>
            </div>
          ))}

          <button
            type="button"
            className={`data-connection-card data-connection-card--add${
              hasConnections ? "" : " data-connection-card--empty"
            }`}
            onClick={openAddConnection}
            title="Add data connection"
          >
            <span className="data-connection-card__icon">
              <FontAwesomeIcon icon={faPlus} />
            </span>
            <span className="data-connection-card__copy">
              <strong>Add connection</strong>
              <span>Home Assistant or custom API</span>
            </span>
          </button>
        </div>
      </div>

      <HomeAssistantModal
        open={homeAssistantOpen}
        name={homeAssistantName}
        url={url}
        port={port}
        accessToken={accessToken}
        storageDocumentUrl={storageDocumentUrl}
        entities={entities}
        selectedEntities={selectedEntities}
        entitySearch={entitySearch}
        domainFilter={domainFilter}
        saving={saving}
        loadingEntities={loadingEntities}
        error={error}
        showTypeSelector={!activeHomeAssistantId}
        onTypeChange={switchNewConnectionType}
        onNameChange={setHomeAssistantName}
        onUrlChange={setUrl}
        onPortChange={setPort}
        onAccessTokenChange={setAccessToken}
        onStorageDocumentUrlChange={(value) =>
          setStorageDocumentUrl(toPodRelativeDocumentUrl(webId, value))
        }
        onEntitySearchChange={setEntitySearch}
        onDomainFilterChange={setDomainFilter}
        onToggleEntity={toggleEntity}
        onSelectEntities={selectEntities}
        onClearSelection={() => setSelectedEntities([])}
        onClose={closeHomeAssistant}
        onSubmit={handleSaveHomeAssistant}
      />

      <CustomConnectionModal
        open={customOpen}
        values={customValues}
        saving={saving}
        error={error}
        showTypeSelector={!customValues.id}
        onChange={(values) =>
          setCustomValues({
            ...values,
            storageDocumentUrl: toPodRelativeDocumentUrl(
              webId,
              values.storageDocumentUrl
            ),
          })
        }
        onTypeChange={switchNewConnectionType}
        onClose={closeCustom}
        onSubmit={handleSaveCustom}
      />

      <DeleteConnectionModal
        target={deleteTarget}
        saving={saving}
        onCancel={closeDeleteModal}
        onConfirm={confirmDeleteConnection}
      />
    </div>
  );
}

export default DataConnection;
