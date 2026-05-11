import {
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

const SDM_NS = "https://w3id.org/solid-dataspace-manager#";
const SDM_TOKEN_TYPE = `${SDM_NS}CredentialToken`;
const SDM_TOKEN_NAME = `${SDM_NS}tokenName`;
const SDM_TOKEN_IDENTIFIER = `${SDM_NS}tokenIdentifier`;
const SDM_TOKEN_SECRET = `${SDM_NS}encryptedTokenSecret`;
const SDM_TOKEN_WEBID = `${SDM_NS}tokenWebId`;
const SDM_TOKEN_RESOURCE = `${SDM_NS}tokenResource`;
const SDM_TOKEN_ALGORITHM = `${SDM_NS}encryptionAlgorithm`;
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const DCTERMS_CREATED = "http://purl.org/dc/terms/created";
const DCTERMS_MODIFIED = "http://purl.org/dc/terms/modified";
const DEMO_ENCRYPTION_ALGORITHM = "demo-xor-v1";

const getPodRoot = (webId) => {
  const url = new URL(webId);
  const segments = url.pathname.split("/").filter(Boolean);
  const profileIndex = segments.indexOf("profile");
  const baseSegments = profileIndex > -1 ? segments.slice(0, profileIndex) : segments;
  const basePath = baseSegments.length ? `/${baseSegments.join("/")}/` : "/";
  return `${url.origin}${basePath}`;
};

const slugifyTokenName = (name) =>
  (name || "solid-dataspace")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "solid-dataspace";

export const getCredentialTokenContainerUrl = (webId) =>
  webId ? `${getPodRoot(webId)}token/` : "";

export const getCredentialTokenDocumentUrl = (webId, name = "solid-dataspace") =>
  webId ? `${getCredentialTokenContainerUrl(webId)}${slugifyTokenName(name)}.ttl` : "";

const getCredentialTokenThingUrl = (webId, name = "solid-dataspace") => {
  const documentUrl = getCredentialTokenDocumentUrl(webId, name);
  return documentUrl ? `${documentUrl}#it` : "";
};

const deriveDemoKey = (webId, name) =>
  `${webId || ""}|${name || "solid-dataspace"}|solid-dataspace-manager-demo`;

const encodeText = (value) => new TextEncoder().encode(value || "");
const decodeText = (bytes) => new TextDecoder().decode(bytes);

const bytesToBase64 = (bytes) => {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

const base64ToBytes = (value) =>
  Uint8Array.from(atob(value || ""), (character) => character.charCodeAt(0));

const isAbsoluteUrl = (value) => {
  try {
    return Boolean(new URL(value));
  } catch {
    return false;
  }
};

export function encryptCredentialSecret(secret, webId, name = "solid-dataspace") {
  if (!secret) return "";
  const secretBytes = encodeText(secret);
  const keyBytes = encodeText(deriveDemoKey(webId, name));
  const encrypted = secretBytes.map(
    (byte, index) => byte ^ keyBytes[index % keyBytes.length]
  );
  return bytesToBase64(encrypted);
}

export function decryptCredentialSecret(encryptedSecret, webId, name = "solid-dataspace") {
  if (!encryptedSecret) return "";
  const encryptedBytes = base64ToBytes(encryptedSecret);
  const keyBytes = encodeText(deriveDemoKey(webId, name));
  const decrypted = encryptedBytes.map(
    (byte, index) => byte ^ keyBytes[index % keyBytes.length]
  );
  return decodeText(decrypted);
}

const ensureCredentialTokenContainer = async (webId, fetch) => {
  const containerUrl = getCredentialTokenContainerUrl(webId);
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

export async function loadCredentialToken(webId, fetch, name = "solid-dataspace") {
  const documentUrl = getCredentialTokenDocumentUrl(webId, name);
  const thingUrl = getCredentialTokenThingUrl(webId, name);
  if (!documentUrl || !thingUrl || !fetch) return null;

  try {
    const dataset = await getSolidDataset(documentUrl, { fetch });
    const tokenThing = getThing(dataset, thingUrl);
    if (!tokenThing) return null;

    const id = getStringNoLocale(tokenThing, SDM_TOKEN_IDENTIFIER) || "";
    const encryptedSecret = getStringNoLocale(tokenThing, SDM_TOKEN_SECRET) || "";
    if (!id || !encryptedSecret) return null;

    return {
      name: getStringNoLocale(tokenThing, SDM_TOKEN_NAME) || name,
      id,
      secret: decryptCredentialSecret(encryptedSecret, webId, name),
      encryptedSecret,
      webId: getUrl(tokenThing, SDM_TOKEN_WEBID) || webId,
      resource:
        getUrl(tokenThing, SDM_TOKEN_RESOURCE) ||
        getStringNoLocale(tokenThing, SDM_TOKEN_RESOURCE) ||
        "",
      algorithm:
        getStringNoLocale(tokenThing, SDM_TOKEN_ALGORITHM) ||
        DEMO_ENCRYPTION_ALGORITHM,
      documentUrl,
      createdAt: getDatetime(tokenThing, DCTERMS_CREATED),
      modifiedAt: getDatetime(tokenThing, DCTERMS_MODIFIED),
    };
  } catch (err) {
    const status = err?.statusCode || err?.response?.status;
    if (status === 404) return null;
    throw err;
  }
}

export async function saveCredentialToken(
  webId,
  fetch,
  { name = "solid-dataspace", id, secret, resource = "" }
) {
  if (!webId || !fetch || !id || !secret) return null;

  await ensureCredentialTokenContainer(webId, fetch);

  const documentUrl = getCredentialTokenDocumentUrl(webId, name);
  const thingUrl = getCredentialTokenThingUrl(webId, name);
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

  let tokenThing = getThing(dataset, thingUrl) || createThing({ url: thingUrl });
  tokenThing = removeAll(tokenThing, RDF_TYPE);
  tokenThing = removeAll(tokenThing, SDM_TOKEN_NAME);
  tokenThing = removeAll(tokenThing, SDM_TOKEN_IDENTIFIER);
  tokenThing = removeAll(tokenThing, SDM_TOKEN_SECRET);
  tokenThing = removeAll(tokenThing, SDM_TOKEN_WEBID);
  tokenThing = removeAll(tokenThing, SDM_TOKEN_RESOURCE);
  tokenThing = removeAll(tokenThing, SDM_TOKEN_ALGORITHM);
  tokenThing = removeAll(tokenThing, DCTERMS_MODIFIED);

  tokenThing = setUrl(tokenThing, RDF_TYPE, SDM_TOKEN_TYPE);
  tokenThing = setStringNoLocale(tokenThing, SDM_TOKEN_NAME, name);
  tokenThing = setStringNoLocale(tokenThing, SDM_TOKEN_IDENTIFIER, id);
  tokenThing = setStringNoLocale(
    tokenThing,
    SDM_TOKEN_SECRET,
    encryptCredentialSecret(secret, webId, name)
  );
  tokenThing = setUrl(tokenThing, SDM_TOKEN_WEBID, webId);
  if (resource && isAbsoluteUrl(resource)) {
    tokenThing = setUrl(tokenThing, SDM_TOKEN_RESOURCE, resource);
  } else if (resource) {
    tokenThing = setStringNoLocale(tokenThing, SDM_TOKEN_RESOURCE, resource);
  }
  tokenThing = setStringNoLocale(
    tokenThing,
    SDM_TOKEN_ALGORITHM,
    DEMO_ENCRYPTION_ALGORITHM
  );

  if (!getDatetime(tokenThing, DCTERMS_CREATED)) {
    tokenThing = setDatetime(tokenThing, DCTERMS_CREATED, new Date());
  }
  tokenThing = setDatetime(tokenThing, DCTERMS_MODIFIED, new Date());

  dataset = setThing(dataset, tokenThing);
  await saveSolidDatasetAt(documentUrl, dataset, { fetch });

  return loadCredentialToken(webId, fetch, name);
}
