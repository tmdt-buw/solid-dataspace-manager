import {
  createContainerAt,
  createAclFromFallbackAcl,
  getSolidDatasetWithAcl,
  getResourceAcl,
  hasAccessibleAcl,
  hasResourceAcl,
  saveAclFor,
  setAgentDefaultAccess,
  setAgentResourceAccess,
} from "@inrupt/solid-client";
import {
  ensureConnectionsContainer,
  getConnectionsContainerUrl,
} from "./solidConnections";
import { getSyncWorkerConfig } from "./config/runtimeConfig";

const WORKER_ACCESS = {
  read: true,
  append: true,
  write: true,
  control: false,
};
const DEFAULT_REGISTRATION_TIMEOUT_MS = 8000;

const getErrorStatus = (error) =>
  error?.statusCode || error?.response?.status || error?.status;

function normalizeApiUrl(apiUrl) {
  const value = String(apiUrl || "").trim();
  if (!value) return "";
  return value.replace(/\/+$/, "");
}

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_REGISTRATION_TIMEOUT_MS, fetcher = window.fetch.bind(window)) {
  if (typeof AbortController === "undefined" || !timeoutMs) {
    return fetcher(url, options);
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetcher(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Sync worker registration timed out.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function normalizeResourceUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function getContainerUrlForResource(resourceUrl) {
  const normalized = normalizeResourceUrl(resourceUrl);
  if (!normalized) return "";
  if (normalized.endsWith("/")) return normalized;
  return normalized.slice(0, normalized.lastIndexOf("/") + 1);
}

function isJsonResource(resourceUrl) {
  try {
    return new URL(resourceUrl).pathname.toLowerCase().endsWith(".json");
  } catch {
    return false;
  }
}

function issuerFromValue(value) {
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

export function resolveOidcIssuer({ oidcIssuer, accountIndexUrl, webId } = {}) {
  const explicit = issuerFromValue(oidcIssuer);
  if (explicit) return explicit;

  const accountOrigin = issuerFromValue(accountIndexUrl);
  if (accountOrigin) return accountOrigin;

  return issuerFromValue(webId);
}

async function getAclResource(resourceUrl, solidFetch, { createContainer = false } = {}) {
  try {
    return await getSolidDatasetWithAcl(resourceUrl, { fetch: solidFetch });
  } catch (error) {
    if (!createContainer || getErrorStatus(error) !== 404) {
      throw error;
    }

    await createContainerAt(resourceUrl, { fetch: solidFetch });
    return getSolidDatasetWithAcl(resourceUrl, { fetch: solidFetch });
  }
}

async function grantWorkerAccessToResource(
  resourceUrl,
  solidFetch,
  { serviceWebId, defaultAccess = false, createContainer = false, label = "resource" }
) {
  if (!resourceUrl) return null;

  const resource = await getAclResource(resourceUrl, solidFetch, {
    createContainer,
  });

  let acl;
  if (hasResourceAcl(resource)) {
    acl = getResourceAcl(resource);
  } else if (hasAccessibleAcl(resource)) {
    acl = createAclFromFallbackAcl(resource);
  } else {
    throw new Error(`No ACL access for the ${label}.`);
  }

  acl = setAgentResourceAccess(acl, serviceWebId, WORKER_ACCESS);
  if (defaultAccess) {
    acl = setAgentDefaultAccess(acl, serviceWebId, WORKER_ACCESS);
  }
  await saveAclFor(resource, acl, { fetch: solidFetch });

  return resourceUrl;
}

async function grantStorageDocumentAccess(storageDocumentUrl, solidFetch, serviceWebId) {
  const documentUrl = normalizeResourceUrl(storageDocumentUrl);
  const containerUrl = getContainerUrlForResource(documentUrl);
  const granted = [];

  if (!containerUrl) return granted;

  const containerGrant = await grantWorkerAccessToResource(
    containerUrl,
    solidFetch,
    {
      serviceWebId,
      defaultAccess: true,
      createContainer: true,
      label: "storage document container",
    }
  );
  if (containerGrant) granted.push(containerGrant);

  if (isJsonResource(documentUrl)) {
    return granted;
  }

  try {
    const documentGrant = await grantWorkerAccessToResource(documentUrl, solidFetch, {
      serviceWebId,
      defaultAccess: false,
      createContainer: false,
      label: "storage document",
    });
    if (documentGrant) granted.push(documentGrant);
  } catch (error) {
    if (getErrorStatus(error) !== 404) {
      // Container default access is enough for new or inherited-ACL resources.
      // Existing non-RDF resources cannot be loaded as SolidDatasetsWithAcl here.
    }
  }

  return granted;
}

export async function grantSyncWorkerAccess(
  webId,
  solidFetch,
  { storageDocumentUrl } = {}
) {
  const config = getSyncWorkerConfig();
  if (!config.enabled) {
    return { granted: false, reason: "not-configured" };
  }
  if (!config.serviceWebId) {
    throw new Error("Sync worker service WebID is not configured.");
  }

  await ensureConnectionsContainer(webId, solidFetch);
  const containerUrl = getConnectionsContainerUrl(webId);
  const connectionGrant = await grantWorkerAccessToResource(
    containerUrl,
    solidFetch,
    {
      serviceWebId: config.serviceWebId,
      defaultAccess: true,
      createContainer: false,
      label: "connections container",
    }
  );
  const storageGrants = await grantStorageDocumentAccess(
    storageDocumentUrl,
    solidFetch,
    config.serviceWebId
  );

  return {
    granted: true,
    serviceWebId: config.serviceWebId,
    containerUrl,
    resources: [connectionGrant, ...storageGrants].filter(Boolean),
  };
}

export async function registerSyncWorkerParticipant({
  webId,
  oidcIssuer,
  accountIndexUrl,
  credentialToken,
  storageDocumentUrl,
  solidFetch,
  timeoutMs = DEFAULT_REGISTRATION_TIMEOUT_MS,
}) {
  const config = getSyncWorkerConfig();
  const apiUrl = normalizeApiUrl(config.apiUrl);

  if (!config.enabled || !apiUrl) {
    return { registered: false, reason: "not-configured" };
  }
  if (!config.serviceWebId) {
    return { registered: false, reason: "service-webid-missing" };
  }

  const access = await grantSyncWorkerAccess(webId, solidFetch, {
    storageDocumentUrl,
  });
  const issuer = resolveOidcIssuer({ oidcIssuer, accountIndexUrl, webId });

  const response = await fetchWithTimeout(
    new URL(`${apiUrl}/participants`, window.location.origin).href,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        webId,
        oidcIssuer: issuer,
        credentialId: credentialToken?.id || "",
        credentialSecret: credentialToken?.secret || "",
        credentialResource: credentialToken?.resource || "",
        connectionsContainerUrl: getConnectionsContainerUrl(webId),
        enabled: true,
      }),
    },
    timeoutMs,
    solidFetch
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      payload?.error || `Sync worker registration failed (${response.status}).`
    );
  }

  return {
    registered: true,
    access,
    payload,
  };
}
