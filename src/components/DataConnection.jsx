import React, { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheck,
  faLink,
  faPlus,
  faServer,
  faSliders,
  faTrash,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import session from "../solidSession";
import {
  loadHomeAssistantEntities,
  testHomeAssistantConnection,
} from "../homeAssistantApi";
import {
  deleteCustomConnection,
  deleteHomeAssistantConnection,
  getHomeAssistantEntitiesDocumentUrl,
  getHomeAssistantSolidSyncDocumentUrl,
  HOME_ASSISTANT_DATA_MODELS,
  isSolidSyncJsonDataModel,
  loadConnectionLastSync,
  loadCustomConnections,
  loadHomeAssistantConnections,
  saveCustomConnection,
  saveHomeAssistantConnection,
} from "../solidConnections";
import { getSyncWorkerConfig } from "../config/runtimeConfig";
import { loadCredentialToken } from "../solidCredentialToken";
import { registerSyncWorkerParticipant } from "../syncWorkerRegistration";
import "./DataConnection.css";

const HOME_ASSISTANT_LOGO =
  "https://brands.home-assistant.io/homeassistant/icon.png";

const emptyCustomConnection = () => ({
  id: "",
  name: "",
  description: "",
  url: "",
  storageDocumentUrl: "",
  method: "GET",
  authType: "none",
  authSecret: "",
  authHeader: "X-API-Key",
  headersJson: "",
});

const WORKER_SYNC_INTERVAL_MINUTES = "5";
const SYNC_WORKER_HEALTH = {
  CHECKING: "checking",
  ONLINE: "online",
  OFFLINE: "offline",
};

const formatBackgroundSync = (syncWorkerConfig) =>
  syncWorkerConfig.enabled
    ? `Worker sync every ${syncWorkerConfig.intervalMinutes || 5} min`
    : "Background worker not configured";

const connectionSyncKey = (type, id) => `${type}:${id || ""}`;

const formatLastUpdate = (value) => {
  if (!value) return "Last update: never";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Last update: never";
  return `Last update: ${date.toLocaleString([], {
    dateStyle: "short",
    timeStyle: "short",
  })}`;
};

const normalizeWorkerApiUrl = (apiUrl) =>
  String(apiUrl || "")
    .trim()
    .replace(/\/+$/, "");

async function loadSyncWorkerHealth(syncWorkerConfig, signal) {
  if (!syncWorkerConfig.enabled) return SYNC_WORKER_HEALTH.OFFLINE;

  const apiUrl = normalizeWorkerApiUrl(syncWorkerConfig.apiUrl);
  if (!apiUrl) return SYNC_WORKER_HEALTH.OFFLINE;

  const response = await window.fetch(`${apiUrl}/health`, {
    headers: { Accept: "application/json" },
    signal,
  });
  const payload = await response.json().catch(() => ({}));

  return response.ok && payload?.ok
    ? SYNC_WORKER_HEALTH.ONLINE
    : SYNC_WORKER_HEALTH.OFFLINE;
}

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

function AddConnectionModal({ open, onClose, onHomeAssistant, onCustom }) {
  if (!open) return null;

  return (
    <ModalFrame
      title="New Data Connection"
      icon={faPlus}
      onClose={onClose}
      compact
    >
      <div className="data-connection-typeGrid">
        <button
          type="button"
          className="data-connection-typeCard"
          onClick={onHomeAssistant}
        >
          <span className="data-connection-typeCard__icon">
            <img src={HOME_ASSISTANT_LOGO} alt="" aria-hidden="true" />
          </span>
          <span>
            <strong>Home Assistant</strong>
            <small>Load entities through the Home Assistant REST API.</small>
          </span>
        </button>

        <button
          type="button"
          className="data-connection-typeCard"
          onClick={onCustom}
        >
          <span className="data-connection-typeCard__icon">
            <FontAwesomeIcon icon={faSliders} />
          </span>
          <span>
            <strong>Custom API</strong>
            <small>Store a generic endpoint with optional authentication.</small>
          </span>
        </button>
      </div>
    </ModalFrame>
  );
}

function HomeAssistantModal({
  open,
  url,
  port,
  accessToken,
  storageDocumentUrl,
  dataModel,
  entities,
  selectedEntities,
  entitySearch,
  domainFilter,
  saving,
  testing,
  loadingEntities,
  error,
  testResult,
  syncWorkerHealth,
  onUrlChange,
  onPortChange,
  onAccessTokenChange,
  onStorageDocumentUrlChange,
  onDataModelChange,
  onEntitySearchChange,
  onDomainFilterChange,
  onToggleEntity,
  onSelectEntities,
  onClearSelection,
  onTest,
  onLoadEntities,
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
  const syncWorkerOnline = syncWorkerHealth === SYNC_WORKER_HEALTH.ONLINE;
  const syncWorkerLabel = syncWorkerOnline
    ? "Background sync worker is reachable"
    : syncWorkerHealth === SYNC_WORKER_HEALTH.CHECKING
      ? "Checking background sync worker"
      : "Background sync worker is not reachable";
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
      title="Home Assistant"
      icon={HOME_ASSISTANT_LOGO}
      onClose={onClose}
      saving={saving}
    >
      <form className="data-connection-form" onSubmit={onSubmit}>
        <label>
          <span>URL</span>
          <input
            type="text"
            value={url}
            onChange={(event) => onUrlChange(event.target.value)}
            placeholder="https://homeassistant.example or 192.168.1.50"
            autoComplete="url"
            autoFocus
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
            placeholder="443"
            disabled={saving}
          />
        </label>

        <label>
          <span>Access token</span>
          <input
            type="password"
            value={accessToken}
            onChange={(event) => onAccessTokenChange(event.target.value)}
            placeholder="Long-lived access token"
            autoComplete="off"
            disabled={saving || testing}
          />
        </label>

        <label>
          <span>Pod storage document</span>
          <input
            type="text"
            value={storageDocumentUrl}
            onChange={(event) => onStorageDocumentUrlChange(event.target.value)}
            placeholder={
              isSolidSyncJsonDataModel(dataModel)
                ? "connections/homeassistant-solid-sync.json"
                : "connections/homeassistant-entities.ttl"
            }
            disabled={saving}
          />
        </label>

        <div className="data-connection-form__split data-connection-form__split--wide">
          <label>
            <span>Data model</span>
            <select
              value={dataModel}
              onChange={(event) => onDataModelChange(event.target.value)}
              disabled={saving}
            >
              {HOME_ASSISTANT_DATA_MODELS.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
            </select>
          </label>
          <div
            className={`data-connection-form__managedSync data-connection-form__managedSync--${syncWorkerOnline ? "online" : "offline"}`}
          >
            <span>Background sync</span>
            <strong title={syncWorkerLabel} aria-label={syncWorkerLabel}>
              <FontAwesomeIcon icon={syncWorkerOnline ? faCheck : faXmark} />
            </strong>
          </div>
        </div>

        <div className="data-connection-form__test">
          <button
            type="button"
            className="data-connection-btn data-connection-btn--secondary"
            onClick={onTest}
            disabled={
              saving || testing || loadingEntities || !url || !port || !accessToken
            }
          >
            {testing ? "Testing..." : "Test"}
          </button>
          <button
            type="button"
            className="data-connection-btn data-connection-btn--secondary"
            onClick={onLoadEntities}
            disabled={
              saving ||
              testing ||
              loadingEntities ||
              !url ||
              !port ||
              !accessToken
            }
          >
            {loadingEntities ? "Loading..." : "Load entities"}
          </button>
          {testResult ? (
            <span className="data-connection-form__result">{testResult}</span>
          ) : null}
        </div>

        {entities.length > 0 ? (
          <div className="data-connection-entities">
            <div className="data-connection-entities__head">
              <strong>Entities</strong>
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
                  <label key={entity.entityId} className="data-connection-entity">
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
  syncWorkerHealth,
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

  const update = (key, value) => onChange({ ...values, [key]: value });
  const syncWorkerOnline = syncWorkerHealth === SYNC_WORKER_HEALTH.ONLINE;
  const syncWorkerLabel = syncWorkerOnline
    ? "Background sync worker is reachable"
    : syncWorkerHealth === SYNC_WORKER_HEALTH.CHECKING
      ? "Checking background sync worker"
      : "Background sync worker is not reachable";

  return (
    <ModalFrame
      title={values.id ? "Edit Custom API" : "Custom API"}
      icon={faSliders}
      onClose={onClose}
      saving={saving}
    >
      <form className="data-connection-form" onSubmit={onSubmit}>
        <div className="data-connection-form__split">
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

          <label>
            <span>Default method</span>
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
        </div>

        <label>
          <span>URL</span>
          <input
            type="text"
            value={values.url}
            onChange={(event) => update("url", event.target.value)}
            placeholder="https://api.example.org/data or 192.168.1.20:8080"
            autoComplete="url"
            disabled={saving}
          />
        </label>

        <div className="data-connection-form__split data-connection-form__split--wide">
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
          <div
            className={`data-connection-form__managedSync data-connection-form__managedSync--${syncWorkerOnline ? "online" : "offline"}`}
          >
            <span>Background sync</span>
            <strong title={syncWorkerLabel} aria-label={syncWorkerLabel}>
              <FontAwesomeIcon icon={syncWorkerOnline ? faCheck : faXmark} />
            </strong>
          </div>
        </div>

        <label>
          <span>Description</span>
          <textarea
            value={values.description}
            onChange={(event) => update("description", event.target.value)}
            placeholder="Optional note for this connection"
            rows={3}
            disabled={saving}
          />
        </label>

        <div className="data-connection-form__split">
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
        </div>

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

function DeleteConnectionModal({ target, saving, onCancel, onConfirm }) {
  if (!target) return null;

  const connection = target.connection || {};
  const isHomeAssistant = target.type === "home-assistant";
  const label = isHomeAssistant
    ? "Home Assistant"
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

function DataConnection({ webId }) {
  const syncWorkerConfig = getSyncWorkerConfig();
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [homeAssistantOpen, setHomeAssistantOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [url, setUrl] = useState("");
  const [port, setPort] = useState("443");
  const [accessToken, setAccessToken] = useState("");
  const [storageDocumentUrl, setStorageDocumentUrl] = useState("");
  const [dataModel, setDataModel] = useState("sdm-entity-snapshot");
  const [homeAssistantConnections, setHomeAssistantConnections] = useState([]);
  const [activeHomeAssistantId, setActiveHomeAssistantId] = useState("");
  const [entities, setEntities] = useState([]);
  const [selectedEntities, setSelectedEntities] = useState([]);
  const [entitySearch, setEntitySearch] = useState("");
  const [domainFilter, setDomainFilter] = useState("all");
  const [customConnections, setCustomConnections] = useState([]);
  const [customValues, setCustomValues] = useState(emptyCustomConnection());

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [loadingEntities, setLoadingEntities] = useState(false);
  const [error, setError] = useState("");
  const [testResult, setTestResult] = useState("");
  const [syncStatuses, setSyncStatuses] = useState({});
  const [lastSyncByConnection, setLastSyncByConnection] = useState({});
  const [syncWorkerHealth, setSyncWorkerHealth] = useState(
    syncWorkerConfig.enabled
      ? SYNC_WORKER_HEALTH.CHECKING
      : SYNC_WORKER_HEALTH.OFFLINE
  );

  useEffect(() => {
    let cancelled = false;

    const loadConnections = async () => {
      if (!webId) return;

      setError("");
      try {
        const [loadedHomeAssistantConnections, loadedCustom] = await Promise.all([
          loadHomeAssistantConnections(webId, session.fetch),
          loadCustomConnections(webId, session.fetch),
        ]);
        if (!cancelled) {
          setHomeAssistantConnections(loadedHomeAssistantConnections);
          setActiveHomeAssistantId("");
          setUrl("");
          setPort("443");
          setAccessToken("");
          setStorageDocumentUrl("");
          setDataModel("sdm-entity-snapshot");
          setSelectedEntities([]);
          setSyncStatuses({});
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
  }, [webId]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    if (!syncWorkerConfig.enabled || !syncWorkerConfig.apiUrl) {
      setSyncWorkerHealth(SYNC_WORKER_HEALTH.OFFLINE);
      return undefined;
    }

    setSyncWorkerHealth(SYNC_WORKER_HEALTH.CHECKING);
    loadSyncWorkerHealth(syncWorkerConfig, controller.signal)
      .then((status) => {
        if (!cancelled) {
          setSyncWorkerHealth(status);
        }
      })
      .catch((err) => {
        if (!cancelled && err?.name !== "AbortError") {
          setSyncWorkerHealth(SYNC_WORKER_HEALTH.OFFLINE);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [syncWorkerConfig]);

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
      if (!webId || connections.length === 0) {
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
  }, [webId, homeAssistantConnections, customConnections]);

  const resetHomeAssistantForm = () => {
    setActiveHomeAssistantId("");
    setUrl("");
    setPort("443");
    setAccessToken("");
    setStorageDocumentUrl("");
    setDataModel("sdm-entity-snapshot");
    setEntities([]);
    setSelectedEntities([]);
    setEntitySearch("");
    setDomainFilter("all");
  };

  const openNewHomeAssistant = () => {
    setAddModalOpen(false);
    setError("");
    setTestResult("");
    resetHomeAssistantForm();
    setHomeAssistantOpen(true);
  };

  const openExistingHomeAssistant = (connection) => {
    setAddModalOpen(false);
    setError("");
    setTestResult("");
    setActiveHomeAssistantId(connection.id || "");
    setUrl(connection.url || "");
    setPort(connection.port || "443");
    setAccessToken(connection.accessToken || "");
    setStorageDocumentUrl(connection.storageDocumentUrl || "");
    setDataModel(connection.dataModel || "sdm-entity-snapshot");
    setSelectedEntities(connection.selectedEntities || []);
    setEntities([]);
    setEntitySearch("");
    setDomainFilter("all");
    setHomeAssistantOpen(true);
  };

  const openNewCustom = () => {
    setAddModalOpen(false);
    setError("");
    setCustomValues(emptyCustomConnection());
    setCustomOpen(true);
  };

  const openExistingCustom = (connection) => {
    setError("");
    setCustomValues({
      id: connection.id,
      name: connection.name || "",
      description: connection.description || "",
      url: connection.url || "",
      storageDocumentUrl: connection.storageDocumentUrl || "",
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
    setTestResult("");
  };

  const closeCustom = () => {
    if (saving) return;
    setCustomOpen(false);
    setError("");
  };

  const handleDataModelChange = (nextDataModel) => {
    setDataModel(nextDataModel);
    if (!webId || !activeHomeAssistantId) return;

    const ttlDocumentUrl = getHomeAssistantEntitiesDocumentUrl(
      webId,
      activeHomeAssistantId
    );
    const solidSyncDocumentUrl = getHomeAssistantSolidSyncDocumentUrl(
      webId,
      activeHomeAssistantId
    );

    if (
      isSolidSyncJsonDataModel(nextDataModel) &&
      (!storageDocumentUrl || storageDocumentUrl === ttlDocumentUrl)
    ) {
      setStorageDocumentUrl(solidSyncDocumentUrl);
      return;
    }

    if (
      !isSolidSyncJsonDataModel(nextDataModel) &&
      storageDocumentUrl === solidSyncDocumentUrl
    ) {
      setStorageDocumentUrl(ttlDocumentUrl);
    }
  };

  const handleTestHomeAssistant = async () => {
    setError("");
    setTestResult("");

    try {
      setTesting(true);
      const result = await testHomeAssistantConnection({
        url,
        port,
        accessToken,
      });
      setTestResult(`Connection OK via ${result.endpoint}.`);
    } catch (err) {
      setError(err?.message || "Home Assistant connection test failed.");
    } finally {
      setTesting(false);
    }
  };

  const handleLoadHomeAssistantEntities = async () => {
    setError("");
    setTestResult("");

    try {
      setLoadingEntities(true);
      const loadedEntities = await loadHomeAssistantEntities({
        url,
        port,
        accessToken,
      });
      setEntities(loadedEntities);
      setTestResult(`${loadedEntities.length} entities loaded.`);
    } catch (err) {
      setEntities([]);
      setError(err?.message || "Home Assistant entities could not be loaded.");
    } finally {
      setLoadingEntities(false);
    }
  };

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
        url,
        port,
        accessToken,
        storageDocumentUrl,
        dataModel,
        syncIntervalMinutes: WORKER_SYNC_INTERVAL_MINUTES,
        selectedEntities,
      });
      const credentialToken = await loadCredentialToken(webId, session.fetch);
      const registration = await registerSyncWorkerParticipant({
        webId,
        credentialToken,
        storageDocumentUrl: connection?.storageDocumentUrl || storageDocumentUrl,
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
      setUrl(connection?.url || url);
      setPort(connection?.port || port);
      setAccessToken(connection?.accessToken || accessToken);
      setStorageDocumentUrl(connection?.storageDocumentUrl || storageDocumentUrl);
      setDataModel(connection?.dataModel || dataModel);
      setSelectedEntities(connection?.selectedEntities || selectedEntities);
      if (registration.registered) {
        setSyncStatuses((current) => ({
          ...current,
          [connection.id]: `Worker registered every ${
            registration.payload?.syncIntervalMinutes || 5
          } min`,
        }));
      }
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
      const registration = await registerSyncWorkerParticipant({
        webId,
        credentialToken,
        storageDocumentUrl:
          saved?.storageDocumentUrl || customValues.storageDocumentUrl,
        solidFetch: session.fetch,
      });
      setCustomConnections((current) => {
        const withoutOld = current.filter((item) => item.id !== saved.id);
        return [...withoutOld, saved].sort((a, b) => a.name.localeCompare(b.name));
      });
      if (registration.registered) {
        setSyncStatuses((current) => ({
          ...current,
          [saved.id]: `Worker registered every ${
            registration.payload?.syncIntervalMinutes || 5
          } min`,
        }));
      }
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
        setSyncStatuses((current) => {
          const next = { ...current };
          delete next[targetConnection.id];
          return next;
        });
        if (activeHomeAssistantId === targetConnection.id) {
          resetHomeAssistantForm();
        }
        setHomeAssistantOpen(false);
      } else {
        await deleteCustomConnection(webId, session.fetch, targetConnection.id);
        setCustomConnections((current) =>
          current.filter((connection) => connection.id !== targetConnection.id)
        );
        setSyncStatuses((current) => {
          const next = { ...current };
          delete next[targetConnection.id];
          return next;
        });
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
                  <strong>Home Assistant</strong>
                  <span>{connection.selectedEntities.length} selected entities</span>
                  <span>
                    {syncStatuses[connection.id] ||
                      formatBackgroundSync(syncWorkerConfig)}
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
                aria-label="Delete Home Assistant connection"
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
                  <span>{connection.authType === "none" ? "No auth" : connection.authType}</span>
                  <span>
                    {syncStatuses[connection.id] ||
                      formatBackgroundSync(syncWorkerConfig)}
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
            onClick={() => setAddModalOpen(true)}
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

      <AddConnectionModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onHomeAssistant={openNewHomeAssistant}
        onCustom={openNewCustom}
      />

      <HomeAssistantModal
        open={homeAssistantOpen}
        url={url}
        port={port}
        accessToken={accessToken}
        storageDocumentUrl={storageDocumentUrl}
        dataModel={dataModel}
        entities={entities}
        selectedEntities={selectedEntities}
        entitySearch={entitySearch}
        domainFilter={domainFilter}
        saving={saving}
        testing={testing}
        loadingEntities={loadingEntities}
        error={error}
        testResult={testResult}
        syncWorkerHealth={syncWorkerHealth}
        onUrlChange={setUrl}
        onPortChange={setPort}
        onAccessTokenChange={setAccessToken}
        onStorageDocumentUrlChange={setStorageDocumentUrl}
        onDataModelChange={handleDataModelChange}
        onEntitySearchChange={setEntitySearch}
        onDomainFilterChange={setDomainFilter}
        onToggleEntity={toggleEntity}
        onSelectEntities={selectEntities}
        onClearSelection={() => setSelectedEntities([])}
        onTest={handleTestHomeAssistant}
        onLoadEntities={handleLoadHomeAssistantEntities}
        onClose={closeHomeAssistant}
        onSubmit={handleSaveHomeAssistant}
      />

      <CustomConnectionModal
        open={customOpen}
        values={customValues}
        saving={saving}
        error={error}
        syncWorkerHealth={syncWorkerHealth}
        onChange={setCustomValues}
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
