import {
  addUrl,
  createContainerAt,
  createSolidDataset,
  createThing,
  getDatetime,
  getSolidDataset,
  getStringNoLocale,
  getThing,
  getUrl,
  removeAll,
  saveSolidDatasetAt,
  setDatetime,
  setStringNoLocale,
  setThing,
  setUrl,
} from "@inrupt/solid-client";
import { getPodRoot } from "./solidCatalog";

const SDM_NS = "https://w3id.org/solid-dataspace-manager#";
const SDM_DATA_CONNECTION_TYPE = `${SDM_NS}DataConnection`;
const SDM_HOME_ASSISTANT_TYPE = `${SDM_NS}HomeAssistantConnection`;
const SDM_CONNECTION_NAME = `${SDM_NS}connectionName`;
const SDM_CONNECTION_URL = `${SDM_NS}connectionUrl`;
const SDM_CONNECTION_PORT = `${SDM_NS}connectionPort`;
const SDM_CONNECTION_ENDPOINT = `${SDM_NS}connectionEndpoint`;
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const DCTERMS_CREATED = "http://purl.org/dc/terms/created";
const DCTERMS_MODIFIED = "http://purl.org/dc/terms/modified";

export const getConnectionsContainerUrl = (webId) =>
  webId ? `${getPodRoot(webId)}connections/` : "";

export const getHomeAssistantConnectionDocumentUrl = (webId) =>
  webId ? `${getConnectionsContainerUrl(webId)}homeassistant.ttl` : "";

const getHomeAssistantConnectionThingUrl = (webId) => {
  const documentUrl = getHomeAssistantConnectionDocumentUrl(webId);
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

const normalizeUrl = (value) => {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";
  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `http://${trimmed}`;
  const parsed = new URL(withProtocol);
  const pathname = parsed.pathname && parsed.pathname !== "/" ? parsed.pathname : "";
  return `${parsed.protocol}//${parsed.hostname}${pathname}`;
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

export const normalizeHomeAssistantConnection = ({ url, port }) => {
  let parsedUrl;
  const rawUrl = (url || "").trim();
  if (!rawUrl) {
    throw new Error("URL is required.");
  }

  try {
    const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(rawUrl)
      ? rawUrl
      : `http://${rawUrl}`;
    parsedUrl = new URL(withProtocol);
  } catch {
    throw new Error("Enter a valid URL.");
  }

  const normalizedUrl = normalizeUrl(rawUrl);
  const normalizedPort = normalizePort(port || parsedUrl.port || "8123");

  return {
    url: normalizedUrl,
    port: normalizedPort,
    endpoint: buildEndpoint(normalizedUrl, normalizedPort),
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

    if (!url || !port) return null;

    return {
      name: getStringNoLocale(connectionThing, SDM_CONNECTION_NAME) || "Homeassistant",
      url,
      port,
      endpoint,
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

  const normalized = normalizeHomeAssistantConnection(values);
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
  connectionThing = removeAll(connectionThing, DCTERMS_MODIFIED);

  connectionThing = addUrl(connectionThing, RDF_TYPE, SDM_DATA_CONNECTION_TYPE);
  connectionThing = addUrl(connectionThing, RDF_TYPE, SDM_HOME_ASSISTANT_TYPE);
  connectionThing = setStringNoLocale(
    connectionThing,
    SDM_CONNECTION_NAME,
    "Homeassistant"
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

  if (!getDatetime(connectionThing, DCTERMS_CREATED)) {
    connectionThing = setDatetime(connectionThing, DCTERMS_CREATED, new Date());
  }
  connectionThing = setDatetime(connectionThing, DCTERMS_MODIFIED, new Date());

  dataset = setThing(dataset, connectionThing);
  await saveSolidDatasetAt(documentUrl, dataset, { fetch });

  return loadHomeAssistantConnection(webId, fetch);
}
