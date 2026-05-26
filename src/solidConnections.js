import {
  addStringNoLocale,
  addUrl,
  createContainerAt,
  createSolidDataset,
  createThing,
  deleteFile,
  getDatetime,
  getSolidDataset,
  getContainedResourceUrlAll,
  getStringNoLocale,
  getStringNoLocaleAll,
  getThing,
  getThingAll,
  getUrl,
  getUrlAll,
  removeAll,
  removeThing,
  saveSolidDatasetAt,
  setDatetime,
  setStringNoLocale,
  setThing,
  setUrl,
} from "@inrupt/solid-client";
import { getPodRoot } from "./solidCatalog";
import {
  decryptCredentialSecret,
  encryptCredentialSecret,
} from "./solidCredentialToken";

const SDM_NS = "https://w3id.org/solid-dataspace-manager#";
const SDM_DATA_CONNECTION_TYPE = `${SDM_NS}DataConnection`;
const SDM_HOME_ASSISTANT_TYPE = `${SDM_NS}HomeAssistantConnection`;
const SDM_HOME_ASSISTANT_ENTITY_COLLECTION_TYPE = `${SDM_NS}HomeAssistantEntityCollection`;
const SDM_HOME_ASSISTANT_ENTITY_TYPE = `${SDM_NS}HomeAssistantEntity`;
const SDM_CUSTOM_CONNECTION_TYPE = `${SDM_NS}CustomConnection`;
const SDM_CONNECTION_ID = `${SDM_NS}connectionId`;
const SDM_CONNECTION_NAME = `${SDM_NS}connectionName`;
const SDM_CONNECTION_DESCRIPTION = `${SDM_NS}connectionDescription`;
const SDM_CONNECTION_URL = `${SDM_NS}connectionUrl`;
const SDM_CONNECTION_PORT = `${SDM_NS}connectionPort`;
const SDM_CONNECTION_ENDPOINT = `${SDM_NS}connectionEndpoint`;
const SDM_CONNECTION_STORAGE_DOCUMENT = `${SDM_NS}connectionStorageDocument`;
const SDM_CONNECTION_DATA_MODEL = `${SDM_NS}connectionDataModel`;
const SDM_CONNECTION_SYNC_INTERVAL_MINUTES = `${SDM_NS}syncIntervalMinutes`;
const SDM_CONNECTION_ACCESS_TOKEN = `${SDM_NS}encryptedAccessToken`;
const SDM_CONNECTION_TOKEN_ALGORITHM = `${SDM_NS}tokenEncryptionAlgorithm`;
const SDM_SELECTED_ENTITY = `${SDM_NS}selectedEntity`;
const SDM_CONNECTION_METHOD = `${SDM_NS}connectionMethod`;
const SDM_CONNECTION_AUTH_TYPE = `${SDM_NS}connectionAuthType`;
const SDM_CONNECTION_AUTH_SECRET = `${SDM_NS}encryptedAuthSecret`;
const SDM_CONNECTION_AUTH_HEADER = `${SDM_NS}connectionAuthHeader`;
const SDM_CONNECTION_HEADERS = `${SDM_NS}connectionHeadersJson`;
const SDM_ENTITY_ID = `${SDM_NS}entityId`;
const SDM_ENTITY_DOMAIN = `${SDM_NS}entityDomain`;
const SDM_ENTITY_NAME = `${SDM_NS}entityName`;
const SDM_ENTITY_STATE = `${SDM_NS}entityState`;
const SDM_ENTITY_UNIT = `${SDM_NS}entityUnit`;
const SDM_ENTITY_DEVICE_CLASS = `${SDM_NS}entityDeviceClass`;
const SDM_ENTITY_ATTRIBUTES = `${SDM_NS}entityAttributesJson`;
const SDM_OBSERVED_AT = `${SDM_NS}observedAt`;
const SDM_LAST_CHANGED = `${SDM_NS}lastChanged`;
const SDM_LAST_UPDATED = `${SDM_NS}lastUpdated`;
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const DCTERMS_CREATED = "http://purl.org/dc/terms/created";
const DCTERMS_MODIFIED = "http://purl.org/dc/terms/modified";
const RDFS_LABEL = "http://www.w3.org/2000/01/rdf-schema#label";
const SOSA_NS = "http://www.w3.org/ns/sosa/";
const SOSA_OBSERVATION = `${SOSA_NS}Observation`;
const SOSA_OBSERVABLE_PROPERTY = `${SOSA_NS}ObservableProperty`;
const SOSA_OBSERVED_PROPERTY = `${SOSA_NS}observedProperty`;
const SOSA_HAS_SIMPLE_RESULT = `${SOSA_NS}hasSimpleResult`;
const SOSA_RESULT_TIME = `${SOSA_NS}resultTime`;
const HOME_ASSISTANT_SECRET_NAME = "homeassistant";
const CUSTOM_SECRET_PREFIX = "custom-connection";
const DEMO_ENCRYPTION_ALGORITHM = "demo-xor-v1";
const DEFAULT_HOME_ASSISTANT_DATA_MODEL = "sdm-entity-snapshot";
const SOLID_SYNC_JSON_DATA_MODEL = "solid-sync-json";

export const HOME_ASSISTANT_DATA_MODELS = [
  {
    id: DEFAULT_HOME_ASSISTANT_DATA_MODEL,
    label: "SDM Entity Snapshot",
  },
  {
    id: "sosa-observation",
    label: "SOSA Observation",
  },
  {
    id: SOLID_SYNC_JSON_DATA_MODEL,
    label: "Solid Sync JSON",
  },
];

export const getConnectionsContainerUrl = (webId) =>
  webId ? `${getPodRoot(webId)}connections/` : "";

export const getHomeAssistantConnectionDocumentUrl = (webId) =>
  webId ? `${getConnectionsContainerUrl(webId)}homeassistant.ttl` : "";

export const getHomeAssistantEntitiesDocumentUrl = (webId) =>
  webId ? `${getConnectionsContainerUrl(webId)}homeassistant-entities.ttl` : "";

export const getHomeAssistantSolidSyncDocumentUrl = (webId) =>
  webId ? `${getConnectionsContainerUrl(webId)}homeassistant-solid-sync.json` : "";

const getCustomConnectionDocumentUrl = (webId, id) =>
  webId && id ? `${getConnectionsContainerUrl(webId)}custom-${id}.ttl` : "";

const getHomeAssistantConnectionThingUrl = (webId) => {
  const documentUrl = getHomeAssistantConnectionDocumentUrl(webId);
  return documentUrl ? `${documentUrl}#it` : "";
};

const getHomeAssistantEntityCollectionThingUrlFromDocument = (documentUrl) =>
  documentUrl ? `${documentUrl}#it` : "";

const getHomeAssistantEntityThingUrl = (documentUrl, entityId) => {
  return documentUrl && entityId
    ? `${documentUrl}#${encodeURIComponent(entityId)}`
    : "";
};

const getHomeAssistantObservablePropertyThingUrl = (documentUrl, entityId) => {
  return documentUrl && entityId
    ? `${documentUrl}#property-${encodeURIComponent(entityId)}`
    : "";
};

const getCustomConnectionThingUrl = (webId, id) => {
  const documentUrl = getCustomConnectionDocumentUrl(webId, id);
  return documentUrl ? `${documentUrl}#it` : "";
};

export const connectionContainerExists = async (webId, fetch) => {
  const containerUrl = getConnectionsContainerUrl(webId);
  if (!containerUrl || !fetch) return false;

  try {
    await getSolidDataset(containerUrl, { fetch });
    return true;
  } catch {
    return false;
  }
};

export const ensureConnectionsContainer = async (webId, fetch) => {
  const containerUrl = getConnectionsContainerUrl(webId);
  if (!containerUrl || !fetch) return "";

  try {
    await getSolidDataset(containerUrl, { fetch });
    return containerUrl;
  } catch (err) {
    const status = err?.statusCode || err?.response?.status;
    if (status !== 404) {
      throw err;
    }
  }

  try {
    await createContainerAt(containerUrl, { fetch });
  } catch (err) {
    const status = err?.statusCode || err?.response?.status;
    if (status !== 409 && status !== 412) {
      throw err;
    }
  }

  return containerUrl;
};

const hasProtocol = (value) => /^[a-z][a-z0-9+.-]*:\/\//i.test(value);

const looksLikeRawIpv6Address = (value) => {
  const trimmed = String(value || "").trim();
  return (
    trimmed.includes(":") &&
    trimmed.indexOf(":") !== trimmed.lastIndexOf(":") &&
    !trimmed.startsWith("[") &&
    !trimmed.includes("/") &&
    !hasProtocol(trimmed)
  );
};

const prepareUrl = (value, defaultProtocol = "http") => {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";
  if (hasProtocol(trimmed)) return trimmed;
  if (looksLikeRawIpv6Address(trimmed)) return `${defaultProtocol}://[${trimmed}]`;
  return `${defaultProtocol}://${trimmed}`;
};

const normalizeUrl = (value, defaultProtocol = "http") => {
  const withProtocol = prepareUrl(value, defaultProtocol);
  if (!withProtocol) return "";
  const parsed = new URL(withProtocol);
  const pathname = parsed.pathname && parsed.pathname !== "/" ? parsed.pathname : "";
  return `${parsed.protocol}//${parsed.host}${pathname}`;
};

const normalizePort = (value) => {
  const trimmed = String(value || "").trim();
  const port = Number(trimmed);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Enter a valid port between 1 and 65535.");
  }
  return String(port);
};

const buildEndpoint = (url, port) => {
  const parsed = new URL(url);
  parsed.port = port;
  const pathname = parsed.pathname && parsed.pathname !== "/" ? parsed.pathname : "";
  return `${parsed.origin}${pathname}`;
};

const normalizeDataModel = (value) => {
  const dataModel = String(value || DEFAULT_HOME_ASSISTANT_DATA_MODEL).trim();
  return HOME_ASSISTANT_DATA_MODELS.some((model) => model.id === dataModel)
    ? dataModel
    : DEFAULT_HOME_ASSISTANT_DATA_MODEL;
};

export const isSolidSyncJsonDataModel = (value) =>
  normalizeDataModel(value) === SOLID_SYNC_JSON_DATA_MODEL;

const normalizeSyncIntervalMinutes = (value) => {
  const trimmed = String(value ?? "0").trim();
  if (!trimmed) return "0";
  const interval = Number(trimmed);
  if (!Number.isInteger(interval) || interval < 0 || interval > 1440) {
    throw new Error("Enter a sync interval between 0 and 1440 minutes.");
  }
  return String(interval);
};

const normalizeStorageDocumentUrl = (webId, value) => {
  const raw = String(value || "").trim();
  if (!raw) return getHomeAssistantEntitiesDocumentUrl(webId);

  try {
    const parsed = hasProtocol(raw)
      ? new URL(raw)
      : new URL(raw.replace(/^\/+/, ""), getPodRoot(webId));
    parsed.hash = "";
    return parsed.href;
  } catch {
    throw new Error("Enter a valid Pod storage document URL.");
  }
};

const getContainerUrlForDocument = (documentUrl) => {
  const parsed = new URL(documentUrl);
  parsed.hash = "";
  parsed.search = "";
  parsed.pathname = parsed.pathname.replace(/[^/]*$/, "");
  return parsed.href;
};

const ensureContainerAtUrl = async (containerUrl, fetch) => {
  if (!containerUrl || !fetch) return "";

  try {
    await getSolidDataset(containerUrl, { fetch });
    return containerUrl;
  } catch (err) {
    const status = err?.statusCode || err?.response?.status;
    if (status !== 404) {
      throw err;
    }
  }

  const parentUrl = getContainerUrlForDocument(containerUrl.replace(/\/$/, ""));
  if (parentUrl && parentUrl !== containerUrl) {
    try {
      await getSolidDataset(parentUrl, { fetch });
    } catch (err) {
      const status = err?.statusCode || err?.response?.status;
      if (status === 404) {
        await ensureContainerAtUrl(parentUrl, fetch);
      } else {
        throw err;
      }
    }
  }

  try {
    await createContainerAt(containerUrl, { fetch });
  } catch (err) {
    const status = err?.statusCode || err?.response?.status;
    if (status !== 409 && status !== 412) {
      throw err;
    }
  }

  return containerUrl;
};

const normalizeSelectedEntities = (selectedEntities = []) =>
  Array.from(
    new Set(
      selectedEntities
        .map((entityId) => String(entityId || "").trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));

const slugifyConnectionId = (value) =>
  String(value || "custom")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "custom";

const createConnectionId = (name) =>
  `${slugifyConnectionId(name)}-${Date.now().toString(36)}`;

const normalizeHttpMethod = (value) => {
  const method = String(value || "GET").trim().toUpperCase();
  return ["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)
    ? method
    : "GET";
};

const normalizeAuthType = (value) => {
  const authType = String(value || "none").trim().toLowerCase();
  return ["none", "bearer", "api-key"].includes(authType) ? authType : "none";
};

const normalizeHeadersJson = (value) => {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      throw new Error("Additional headers must be a JSON object.");
    }
    return JSON.stringify(parsed, null, 2);
  } catch (err) {
    throw new Error(err?.message || "Additional headers must be valid JSON.");
  }
};

const setOptionalDatetime = (thing, predicate, value) => {
  if (!value) return thing;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return thing;
  return setDatetime(thing, predicate, date);
};

const stringifyAttributes = (attributes) => {
  try {
    return JSON.stringify(attributes || {});
  } catch {
    return "{}";
  }
};

const normalizeMeasurementKey = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");

const defaultMeasurementKey = (entityId) => {
  const value = String(entityId || "");
  const dotIndex = value.indexOf(".");
  const objectId = dotIndex >= 0 ? value.slice(dotIndex + 1) : value;
  return normalizeMeasurementKey(objectId) || "value";
};

const getUniqueMeasurementKey = (entityId, usedKeys) => {
  const baseKey = defaultMeasurementKey(entityId);
  let key = baseKey;
  let index = 2;
  while (usedKeys.has(key)) {
    key = `${baseKey}_${index}`;
    index += 1;
  }
  usedKeys.add(key);
  return key;
};

const normalizeSolidSyncEntry = (entry) => {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  const capturedAt = String(entry.captured_at || "").trim();
  const measurements = entry.measurements;
  if (!capturedAt || !measurements || typeof measurements !== "object") {
    return null;
  }
  return {
    captured_at: capturedAt,
    measurements,
  };
};

const extractSolidSyncEntries = (existing) => {
  if (!existing) return [];

  if (Array.isArray(existing)) {
    return existing.map(normalizeSolidSyncEntry).filter(Boolean);
  }

  if (typeof existing === "object") {
    if (Array.isArray(existing.entries)) {
      return existing.entries.map(normalizeSolidSyncEntry).filter(Boolean);
    }

    const legacyEntry = normalizeSolidSyncEntry(existing);
    if (legacyEntry) return [legacyEntry];
  }

  throw new Error("Existing Solid Sync resource must be JSON with entries.");
};

const getResourcePathForDocument = (webId, documentUrl) => {
  const podRoot = getPodRoot(webId);
  if (podRoot && documentUrl.startsWith(podRoot)) {
    return documentUrl.slice(podRoot.length).replace(/^\/+/, "");
  }

  try {
    return new URL(documentUrl).pathname.replace(/^\/+/, "");
  } catch {
    return documentUrl;
  }
};

export const normalizeHomeAssistantConnection = ({
  webId,
  url,
  port,
  accessToken,
  storageDocumentUrl,
  dataModel,
  syncIntervalMinutes,
  selectedEntities = [],
}) => {
  let parsedUrl;
  const rawUrl = (url || "").trim();
  if (!rawUrl) {
    throw new Error("URL is required.");
  }

  try {
    parsedUrl = new URL(prepareUrl(rawUrl));
  } catch {
    throw new Error("Enter a valid URL.");
  }

  const normalizedPort = normalizePort(port || parsedUrl.port || "8123");
  const inferredProtocol =
    !hasProtocol(rawUrl) && normalizedPort === "443" ? "https" : "http";
  const normalizedUrl = normalizeUrl(rawUrl, inferredProtocol);
  const normalizedAccessToken = String(accessToken || "").trim();
  if (!normalizedAccessToken) {
    throw new Error("Access token is required.");
  }

  const normalizedDataModel = normalizeDataModel(dataModel);
  const defaultStorageDocumentUrl =
    normalizedDataModel === SOLID_SYNC_JSON_DATA_MODEL
      ? getHomeAssistantSolidSyncDocumentUrl(webId)
      : "";

  return {
    url: normalizedUrl,
    port: normalizedPort,
    endpoint: buildEndpoint(normalizedUrl, normalizedPort),
    storageDocumentUrl: normalizeStorageDocumentUrl(
      webId,
      storageDocumentUrl || defaultStorageDocumentUrl
    ),
    dataModel: normalizedDataModel,
    syncIntervalMinutes: normalizeSyncIntervalMinutes(syncIntervalMinutes),
    accessToken: normalizedAccessToken,
    selectedEntities: normalizeSelectedEntities(selectedEntities),
  };
};

export const normalizeCustomConnection = ({
  id,
  name,
  description,
  url,
  method = "GET",
  authType = "none",
  authSecret = "",
  authHeader = "",
  headersJson = "",
}) => {
  const normalizedName = String(name || "").trim();
  if (!normalizedName) {
    throw new Error("Connection name is required.");
  }

  const rawUrl = String(url || "").trim();
  if (!rawUrl) {
    throw new Error("URL is required.");
  }

  let normalizedUrl;
  try {
    normalizedUrl = normalizeUrl(rawUrl);
  } catch {
    throw new Error("Enter a valid URL.");
  }

  const normalizedAuthType = normalizeAuthType(authType);
  const normalizedAuthSecret = String(authSecret || "").trim();
  const normalizedAuthHeader =
    normalizedAuthType === "api-key"
      ? String(authHeader || "X-API-Key").trim()
      : "";

  if (normalizedAuthType !== "none" && !normalizedAuthSecret) {
    throw new Error("Authentication secret is required.");
  }

  if (normalizedAuthType === "api-key" && !normalizedAuthHeader) {
    throw new Error("API key header name is required.");
  }

  const normalizedHeadersJson = normalizeHeadersJson(headersJson);
  const normalizedId = id ? slugifyConnectionId(id) : createConnectionId(normalizedName);

  return {
    id: normalizedId,
    name: normalizedName,
    description: String(description || "").trim(),
    url: normalizedUrl,
    endpoint: normalizedUrl,
    method: normalizeHttpMethod(method),
    authType: normalizedAuthType,
    authSecret: normalizedAuthSecret,
    authHeader: normalizedAuthHeader,
    headersJson: normalizedHeadersJson,
  };
};

export async function loadHomeAssistantConnection(webId, fetch) {
  const documentUrl = getHomeAssistantConnectionDocumentUrl(webId);
  const thingUrl = getHomeAssistantConnectionThingUrl(webId);
  if (!documentUrl || !thingUrl || !fetch) return null;

  try {
    const dataset = await getSolidDataset(documentUrl, { fetch });
    const connectionThing = getThing(dataset, thingUrl);
    if (!connectionThing) return null;

    const url = getUrl(connectionThing, SDM_CONNECTION_URL) || "";
    const port = getStringNoLocale(connectionThing, SDM_CONNECTION_PORT) || "";
    const endpoint = getUrl(connectionThing, SDM_CONNECTION_ENDPOINT) || "";
    const dataModel = normalizeDataModel(
      getStringNoLocale(connectionThing, SDM_CONNECTION_DATA_MODEL)
    );
    const storageDocumentUrl =
      getUrl(connectionThing, SDM_CONNECTION_STORAGE_DOCUMENT) ||
      (dataModel === SOLID_SYNC_JSON_DATA_MODEL
        ? getHomeAssistantSolidSyncDocumentUrl(webId)
        : getHomeAssistantEntitiesDocumentUrl(webId));
    const syncIntervalMinutes = normalizeSyncIntervalMinutes(
      getStringNoLocale(connectionThing, SDM_CONNECTION_SYNC_INTERVAL_MINUTES)
    );
    const encryptedAccessToken =
      getStringNoLocale(connectionThing, SDM_CONNECTION_ACCESS_TOKEN) || "";
    const selectedEntities =
      getStringNoLocaleAll(connectionThing, SDM_SELECTED_ENTITY) || [];

    if (!url || !port) return null;

    return {
      name:
        getStringNoLocale(connectionThing, SDM_CONNECTION_NAME) ||
        "Home Assistant",
      url,
      port,
      endpoint,
      storageDocumentUrl,
      dataModel,
      syncIntervalMinutes,
      accessToken: encryptedAccessToken
        ? decryptCredentialSecret(
            encryptedAccessToken,
            webId,
            HOME_ASSISTANT_SECRET_NAME
          )
        : "",
      encryptedAccessToken,
      tokenAlgorithm:
        getStringNoLocale(connectionThing, SDM_CONNECTION_TOKEN_ALGORITHM) ||
        DEMO_ENCRYPTION_ALGORITHM,
      selectedEntities: normalizeSelectedEntities(selectedEntities),
      documentUrl,
      createdAt: getDatetime(connectionThing, DCTERMS_CREATED),
      modifiedAt: getDatetime(connectionThing, DCTERMS_MODIFIED),
    };
  } catch (err) {
    const status = err?.statusCode || err?.response?.status;
    if (status === 404) return null;
    throw err;
  }
}

export async function saveHomeAssistantConnection(webId, fetch, values) {
  if (!webId || !fetch) return null;

  const normalized = normalizeHomeAssistantConnection({ ...values, webId });
  await ensureConnectionsContainer(webId, fetch);

  const documentUrl = getHomeAssistantConnectionDocumentUrl(webId);
  const thingUrl = getHomeAssistantConnectionThingUrl(webId);
  let dataset;

  try {
    dataset = await getSolidDataset(documentUrl, { fetch });
  } catch (err) {
    const status = err?.statusCode || err?.response?.status;
    if (status === 404) {
      dataset = createSolidDataset();
    } else {
      throw err;
    }
  }

  let connectionThing = getThing(dataset, thingUrl) || createThing({ url: thingUrl });
  connectionThing = removeAll(connectionThing, RDF_TYPE);
  connectionThing = removeAll(connectionThing, SDM_CONNECTION_NAME);
  connectionThing = removeAll(connectionThing, SDM_CONNECTION_URL);
  connectionThing = removeAll(connectionThing, SDM_CONNECTION_PORT);
  connectionThing = removeAll(connectionThing, SDM_CONNECTION_ENDPOINT);
  connectionThing = removeAll(connectionThing, SDM_CONNECTION_STORAGE_DOCUMENT);
  connectionThing = removeAll(connectionThing, SDM_CONNECTION_DATA_MODEL);
  connectionThing = removeAll(connectionThing, SDM_CONNECTION_SYNC_INTERVAL_MINUTES);
  connectionThing = removeAll(connectionThing, SDM_CONNECTION_ACCESS_TOKEN);
  connectionThing = removeAll(connectionThing, SDM_CONNECTION_TOKEN_ALGORITHM);
  connectionThing = removeAll(connectionThing, SDM_SELECTED_ENTITY);
  connectionThing = removeAll(connectionThing, DCTERMS_MODIFIED);

  connectionThing = addUrl(connectionThing, RDF_TYPE, SDM_DATA_CONNECTION_TYPE);
  connectionThing = addUrl(connectionThing, RDF_TYPE, SDM_HOME_ASSISTANT_TYPE);
  connectionThing = setStringNoLocale(
    connectionThing,
    SDM_CONNECTION_NAME,
    "Home Assistant"
  );
  connectionThing = setUrl(connectionThing, SDM_CONNECTION_URL, normalized.url);
  connectionThing = setStringNoLocale(
    connectionThing,
    SDM_CONNECTION_PORT,
    normalized.port
  );
  connectionThing = setUrl(
    connectionThing,
    SDM_CONNECTION_ENDPOINT,
    normalized.endpoint
  );
  connectionThing = setUrl(
    connectionThing,
    SDM_CONNECTION_STORAGE_DOCUMENT,
    normalized.storageDocumentUrl
  );
  connectionThing = setStringNoLocale(
    connectionThing,
    SDM_CONNECTION_DATA_MODEL,
    normalized.dataModel
  );
  connectionThing = setStringNoLocale(
    connectionThing,
    SDM_CONNECTION_SYNC_INTERVAL_MINUTES,
    normalized.syncIntervalMinutes
  );
  connectionThing = setStringNoLocale(
    connectionThing,
    SDM_CONNECTION_ACCESS_TOKEN,
    encryptCredentialSecret(
      normalized.accessToken,
      webId,
      HOME_ASSISTANT_SECRET_NAME
    )
  );
  connectionThing = setStringNoLocale(
    connectionThing,
    SDM_CONNECTION_TOKEN_ALGORITHM,
    DEMO_ENCRYPTION_ALGORITHM
  );
  normalized.selectedEntities.forEach((entityId) => {
    connectionThing = addStringNoLocale(
      connectionThing,
      SDM_SELECTED_ENTITY,
      entityId
    );
  });

  if (!getDatetime(connectionThing, DCTERMS_CREATED)) {
    connectionThing = setDatetime(connectionThing, DCTERMS_CREATED, new Date());
  }
  connectionThing = setDatetime(connectionThing, DCTERMS_MODIFIED, new Date());

  dataset = setThing(dataset, connectionThing);
  await saveSolidDatasetAt(documentUrl, dataset, { fetch });

  return loadHomeAssistantConnection(webId, fetch);
}

export async function deleteHomeAssistantConnection(webId, fetch) {
  if (!webId || !fetch) return;

  const existingConnection = await loadHomeAssistantConnection(webId, fetch);
  const documentUrls = [
    getHomeAssistantConnectionDocumentUrl(webId),
    getHomeAssistantEntitiesDocumentUrl(webId),
    getHomeAssistantSolidSyncDocumentUrl(webId),
    existingConnection?.storageDocumentUrl,
  ].filter(Boolean);

  for (const documentUrl of Array.from(new Set(documentUrls))) {
    try {
      await deleteFile(documentUrl, { fetch });
    } catch (err) {
      const status = err?.statusCode || err?.response?.status;
      if (status !== 404) {
        throw err;
      }
    }
  }
}

const customConnectionFromThing = (thing, webId, documentUrl) => {
  if (!thing) return null;
  const types = getUrlAll(thing, RDF_TYPE);
  if (!types.includes(SDM_CUSTOM_CONNECTION_TYPE)) return null;

  const id =
    getStringNoLocale(thing, SDM_CONNECTION_ID) ||
    documentUrl.split("/").pop()?.replace(/^custom-/, "").replace(/\.ttl$/, "") ||
    "";
  if (!id) return null;

  const encryptedAuthSecret =
    getStringNoLocale(thing, SDM_CONNECTION_AUTH_SECRET) || "";
  const authType = normalizeAuthType(
    getStringNoLocale(thing, SDM_CONNECTION_AUTH_TYPE) || "none"
  );

  return {
    id,
    kind: "custom",
    name: getStringNoLocale(thing, SDM_CONNECTION_NAME) || "Custom connection",
    description: getStringNoLocale(thing, SDM_CONNECTION_DESCRIPTION) || "",
    url: getUrl(thing, SDM_CONNECTION_URL) || "",
    endpoint: getUrl(thing, SDM_CONNECTION_ENDPOINT) || "",
    method: normalizeHttpMethod(
      getStringNoLocale(thing, SDM_CONNECTION_METHOD) || "GET"
    ),
    authType,
    authSecret:
      encryptedAuthSecret && authType !== "none"
        ? decryptCredentialSecret(
            encryptedAuthSecret,
            webId,
            `${CUSTOM_SECRET_PREFIX}-${id}`
          )
        : "",
    encryptedAuthSecret,
    authHeader: getStringNoLocale(thing, SDM_CONNECTION_AUTH_HEADER) || "",
    headersJson: getStringNoLocale(thing, SDM_CONNECTION_HEADERS) || "",
    documentUrl,
    createdAt: getDatetime(thing, DCTERMS_CREATED),
    modifiedAt: getDatetime(thing, DCTERMS_MODIFIED),
  };
};

export async function loadCustomConnection(webId, fetch, id) {
  const normalizedId = slugifyConnectionId(id);
  const documentUrl = getCustomConnectionDocumentUrl(webId, normalizedId);
  const thingUrl = getCustomConnectionThingUrl(webId, normalizedId);
  if (!documentUrl || !thingUrl || !fetch) return null;

  try {
    const dataset = await getSolidDataset(documentUrl, { fetch });
    const thing = getThing(dataset, thingUrl) || getThingAll(dataset)[0];
    return customConnectionFromThing(thing, webId, documentUrl);
  } catch (err) {
    const status = err?.statusCode || err?.response?.status;
    if (status === 404) return null;
    throw err;
  }
}

export async function loadCustomConnections(webId, fetch) {
  const containerUrl = getConnectionsContainerUrl(webId);
  if (!containerUrl || !fetch) return [];

  let containerDataset;
  try {
    containerDataset = await getSolidDataset(containerUrl, { fetch });
  } catch (err) {
    const status = err?.statusCode || err?.response?.status;
    if (status === 404) return [];
    throw err;
  }

  const resourceUrls = getContainedResourceUrlAll(containerDataset).filter(
    (url) => !url.endsWith("/") && url.includes("/custom-")
  );
  const connections = [];

  for (const resourceUrl of resourceUrls) {
    try {
      const dataset = await getSolidDataset(resourceUrl, { fetch });
      const thing = getThing(dataset, `${resourceUrl}#it`) || getThingAll(dataset)[0];
      const connection = customConnectionFromThing(thing, webId, resourceUrl);
      if (connection) connections.push(connection);
    } catch {
      // Ignore malformed custom connection documents.
    }
  }

  return connections.sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveCustomConnection(webId, fetch, values) {
  if (!webId || !fetch) return null;

  const normalized = normalizeCustomConnection(values);
  await ensureConnectionsContainer(webId, fetch);

  const documentUrl = getCustomConnectionDocumentUrl(webId, normalized.id);
  const thingUrl = getCustomConnectionThingUrl(webId, normalized.id);
  let dataset;

  try {
    dataset = await getSolidDataset(documentUrl, { fetch });
  } catch (err) {
    const status = err?.statusCode || err?.response?.status;
    if (status === 404) {
      dataset = createSolidDataset();
    } else {
      throw err;
    }
  }

  let connectionThing = getThing(dataset, thingUrl) || createThing({ url: thingUrl });
  connectionThing = removeAll(connectionThing, RDF_TYPE);
  connectionThing = removeAll(connectionThing, SDM_CONNECTION_ID);
  connectionThing = removeAll(connectionThing, SDM_CONNECTION_NAME);
  connectionThing = removeAll(connectionThing, SDM_CONNECTION_DESCRIPTION);
  connectionThing = removeAll(connectionThing, SDM_CONNECTION_URL);
  connectionThing = removeAll(connectionThing, SDM_CONNECTION_ENDPOINT);
  connectionThing = removeAll(connectionThing, SDM_CONNECTION_METHOD);
  connectionThing = removeAll(connectionThing, SDM_CONNECTION_AUTH_TYPE);
  connectionThing = removeAll(connectionThing, SDM_CONNECTION_AUTH_SECRET);
  connectionThing = removeAll(connectionThing, SDM_CONNECTION_AUTH_HEADER);
  connectionThing = removeAll(connectionThing, SDM_CONNECTION_HEADERS);
  connectionThing = removeAll(connectionThing, SDM_CONNECTION_TOKEN_ALGORITHM);
  connectionThing = removeAll(connectionThing, DCTERMS_MODIFIED);

  connectionThing = addUrl(connectionThing, RDF_TYPE, SDM_DATA_CONNECTION_TYPE);
  connectionThing = addUrl(connectionThing, RDF_TYPE, SDM_CUSTOM_CONNECTION_TYPE);
  connectionThing = setStringNoLocale(
    connectionThing,
    SDM_CONNECTION_ID,
    normalized.id
  );
  connectionThing = setStringNoLocale(
    connectionThing,
    SDM_CONNECTION_NAME,
    normalized.name
  );
  if (normalized.description) {
    connectionThing = setStringNoLocale(
      connectionThing,
      SDM_CONNECTION_DESCRIPTION,
      normalized.description
    );
  }
  connectionThing = setUrl(connectionThing, SDM_CONNECTION_URL, normalized.url);
  connectionThing = setUrl(
    connectionThing,
    SDM_CONNECTION_ENDPOINT,
    normalized.endpoint
  );
  connectionThing = setStringNoLocale(
    connectionThing,
    SDM_CONNECTION_METHOD,
    normalized.method
  );
  connectionThing = setStringNoLocale(
    connectionThing,
    SDM_CONNECTION_AUTH_TYPE,
    normalized.authType
  );
  if (normalized.authType !== "none") {
    connectionThing = setStringNoLocale(
      connectionThing,
      SDM_CONNECTION_AUTH_SECRET,
      encryptCredentialSecret(
        normalized.authSecret,
        webId,
        `${CUSTOM_SECRET_PREFIX}-${normalized.id}`
      )
    );
    connectionThing = setStringNoLocale(
      connectionThing,
      SDM_CONNECTION_TOKEN_ALGORITHM,
      DEMO_ENCRYPTION_ALGORITHM
    );
  }
  if (normalized.authHeader) {
    connectionThing = setStringNoLocale(
      connectionThing,
      SDM_CONNECTION_AUTH_HEADER,
      normalized.authHeader
    );
  }
  if (normalized.headersJson) {
    connectionThing = setStringNoLocale(
      connectionThing,
      SDM_CONNECTION_HEADERS,
      normalized.headersJson
    );
  }

  if (!getDatetime(connectionThing, DCTERMS_CREATED)) {
    connectionThing = setDatetime(connectionThing, DCTERMS_CREATED, new Date());
  }
  connectionThing = setDatetime(connectionThing, DCTERMS_MODIFIED, new Date());

  dataset = setThing(dataset, connectionThing);
  await saveSolidDatasetAt(documentUrl, dataset, { fetch });

  return loadCustomConnection(webId, fetch, normalized.id);
}

export async function deleteCustomConnection(webId, fetch, id) {
  const normalizedId = slugifyConnectionId(id);
  const documentUrl = getCustomConnectionDocumentUrl(webId, normalizedId);
  if (!documentUrl || !fetch) return;

  try {
    await deleteFile(documentUrl, { fetch });
  } catch (err) {
    const status = err?.statusCode || err?.response?.status;
    if (status !== 404) {
      throw err;
    }
  }
}

async function loadSolidSyncJsonDocument(documentUrl, fetch) {
  const response = await fetch(documentUrl, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  if (response.status === 404 || response.status === 204) {
    return null;
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      body
        ? `Solid Sync JSON could not be loaded (${response.status}): ${body}`
        : `Solid Sync JSON could not be loaded (${response.status}).`
    );
  }

  const body = await response.text();
  if (!body.trim()) return null;

  try {
    return JSON.parse(body);
  } catch {
    throw new Error("Existing Solid Sync resource is not valid JSON.");
  }
}

async function putSolidSyncJsonDocument(documentUrl, fetch, payload) {
  const response = await fetch(documentUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload, null, 2),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      body
        ? `Solid Sync JSON could not be saved (${response.status}): ${body}`
        : `Solid Sync JSON could not be saved (${response.status}).`
    );
  }
}

async function saveHomeAssistantSolidSyncJson(
  webId,
  fetch,
  documentUrl,
  entities,
  observedAt
) {
  const existing = await loadSolidSyncJsonDocument(documentUrl, fetch);
  const entries = extractSolidSyncEntries(existing);
  const usedKeys = new Set();
  const measurements = {};

  entities.forEach((entity) => {
    const key = getUniqueMeasurementKey(entity.entityId, usedKeys);
    measurements[key] = {
      entity_id: entity.entityId,
      state: entity.state ?? "",
      attributes: entity.attributes || {},
      last_changed: entity.lastChanged || null,
      last_updated: entity.lastUpdated || null,
    };
  });

  if (Object.keys(measurements).length > 0) {
    entries.push({
      captured_at: observedAt.toISOString(),
      measurements,
    });
  }

  const payload = {
    profile: "Home Assistant Entities",
    resource_path: getResourcePathForDocument(webId, documentUrl),
    updated_at: observedAt.toISOString(),
    entries,
  };

  await putSolidSyncJsonDocument(documentUrl, fetch, payload);

  return {
    documentUrl,
    count: entities.length,
    observedAt,
    dataModel: SOLID_SYNC_JSON_DATA_MODEL,
  };
}

export async function saveHomeAssistantEntitySnapshots(
  webId,
  fetch,
  entities = [],
  { storageDocumentUrl, dataModel } = {}
) {
  if (!webId || !fetch) return null;

  const cleanedEntities = entities.filter((entity) => entity?.entityId);
  const selectedDataModel = normalizeDataModel(dataModel);
  const defaultStorageDocumentUrl =
    selectedDataModel === SOLID_SYNC_JSON_DATA_MODEL
      ? getHomeAssistantSolidSyncDocumentUrl(webId)
      : "";
  const documentUrl = normalizeStorageDocumentUrl(
    webId,
    storageDocumentUrl || defaultStorageDocumentUrl
  );
  await ensureContainerAtUrl(getContainerUrlForDocument(documentUrl), fetch);

  const collectionThingUrl =
    getHomeAssistantEntityCollectionThingUrlFromDocument(documentUrl);
  const observedAt = new Date();

  if (selectedDataModel === SOLID_SYNC_JSON_DATA_MODEL) {
    return saveHomeAssistantSolidSyncJson(
      webId,
      fetch,
      documentUrl,
      cleanedEntities,
      observedAt
    );
  }

  let dataset;
  try {
    dataset = await getSolidDataset(documentUrl, { fetch });
    getThingAll(dataset)
      .filter((thing) => {
        const types = getUrlAll(thing, RDF_TYPE);
        return (
          thing.url === collectionThingUrl ||
          types.includes(SDM_HOME_ASSISTANT_ENTITY_TYPE) ||
          (types.includes(SOSA_OBSERVATION) &&
            Boolean(getStringNoLocale(thing, SDM_ENTITY_ID))) ||
          (types.includes(SOSA_OBSERVABLE_PROPERTY) &&
            Boolean(getStringNoLocale(thing, SDM_ENTITY_ID)))
        );
      })
      .forEach((thing) => {
        dataset = removeThing(dataset, thing);
      });
  } catch (err) {
    const status = err?.statusCode || err?.response?.status;
    if (status === 404) {
      dataset = createSolidDataset();
    } else {
      throw err;
    }
  }

  let collectionThing = createThing({ url: collectionThingUrl });
  collectionThing = addUrl(
    collectionThing,
    RDF_TYPE,
    SDM_HOME_ASSISTANT_ENTITY_COLLECTION_TYPE
  );
  collectionThing = setStringNoLocale(
    collectionThing,
    SDM_CONNECTION_NAME,
    "Home Assistant Entities"
  );
  collectionThing = setStringNoLocale(
    collectionThing,
    SDM_CONNECTION_DATA_MODEL,
    selectedDataModel
  );
  collectionThing = setDatetime(collectionThing, DCTERMS_MODIFIED, observedAt);
  dataset = setThing(dataset, collectionThing);

  cleanedEntities.forEach((entity) => {
    const thingUrl = getHomeAssistantEntityThingUrl(documentUrl, entity.entityId);
    if (!thingUrl) return;

    let entityThing = createThing({ url: thingUrl });
    entityThing = addUrl(
      entityThing,
      RDF_TYPE,
      selectedDataModel === "sosa-observation"
        ? SOSA_OBSERVATION
        : SDM_HOME_ASSISTANT_ENTITY_TYPE
    );
    entityThing = setStringNoLocale(entityThing, SDM_ENTITY_ID, entity.entityId);
    entityThing = setStringNoLocale(
      entityThing,
      SDM_ENTITY_DOMAIN,
      entity.domain || ""
    );
    entityThing = setStringNoLocale(
      entityThing,
      SDM_ENTITY_NAME,
      entity.friendlyName || entity.entityId
    );
    entityThing = setStringNoLocale(
      entityThing,
      SDM_ENTITY_STATE,
      String(entity.state ?? "")
    );
    if (entity.unit) {
      entityThing = setStringNoLocale(entityThing, SDM_ENTITY_UNIT, entity.unit);
    }
    if (entity.deviceClass) {
      entityThing = setStringNoLocale(
        entityThing,
        SDM_ENTITY_DEVICE_CLASS,
        entity.deviceClass
      );
    }
    entityThing = setStringNoLocale(
      entityThing,
      SDM_ENTITY_ATTRIBUTES,
      stringifyAttributes(entity.attributes)
    );
    entityThing = setDatetime(entityThing, SDM_OBSERVED_AT, observedAt);

    if (selectedDataModel === "sosa-observation") {
      const propertyThingUrl = getHomeAssistantObservablePropertyThingUrl(
        documentUrl,
        entity.entityId
      );
      if (propertyThingUrl) {
        let propertyThing = createThing({ url: propertyThingUrl });
        propertyThing = addUrl(propertyThing, RDF_TYPE, SOSA_OBSERVABLE_PROPERTY);
        propertyThing = setStringNoLocale(
          propertyThing,
          SDM_ENTITY_ID,
          entity.entityId
        );
        propertyThing = setStringNoLocale(
          propertyThing,
          RDFS_LABEL,
          entity.friendlyName || entity.entityId
        );
        if (entity.unit) {
          propertyThing = setStringNoLocale(
            propertyThing,
            SDM_ENTITY_UNIT,
            entity.unit
          );
        }
        dataset = setThing(dataset, propertyThing);
        entityThing = setUrl(
          entityThing,
          SOSA_OBSERVED_PROPERTY,
          propertyThingUrl
        );
      }
      entityThing = setStringNoLocale(
        entityThing,
        SOSA_HAS_SIMPLE_RESULT,
        String(entity.state ?? "")
      );
      entityThing = setDatetime(entityThing, SOSA_RESULT_TIME, observedAt);
    }

    entityThing = setOptionalDatetime(
      entityThing,
      SDM_LAST_CHANGED,
      entity.lastChanged
    );
    entityThing = setOptionalDatetime(
      entityThing,
      SDM_LAST_UPDATED,
      entity.lastUpdated
    );

    dataset = setThing(dataset, entityThing);
  });

  await saveSolidDatasetAt(documentUrl, dataset, { fetch });

  return {
    documentUrl,
    count: cleanedEntities.length,
    observedAt,
    dataModel: selectedDataModel,
  };
}
