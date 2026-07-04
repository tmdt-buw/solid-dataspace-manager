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
const DEMO_ENCRYPTION_PREFIX = `${DEMO_ENCRYPTION_ALGORITHM}:`;
const CREDENTIAL_TOKEN_SECRET_PATTERN = /^(?:[a-f0-9]{2}){32,}$/i;

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
const decodeText = (bytes) => new TextDecoder("utf-8", { fatal: true }).decode(bytes);

const bytesToBase64 = (bytes) => {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

const base64ToBytes = (value) =>
  Uint8Array.from(atob(value || ""), (character) => character.charCodeAt(0));

const isReadableSecret = (value) => {
  if (typeof value !== "string" || value.length === 0) return false;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f) || code === 0xfffd) {
      return false;
    }
  }
  return true;
};

const isCredentialTokenSecret = (value) =>
  isReadableSecret(value) && CREDENTIAL_TOKEN_SECRET_PATTERN.test(value);

const stripEncryptionPrefix = (value) => {
  const raw = String(value || "");
  return raw.startsWith(DEMO_ENCRYPTION_PREFIX)
    ? { value: raw.slice(DEMO_ENCRYPTION_PREFIX.length), prefixed: true }
    : { value: raw, prefixed: false };
};

const decryptCredentialSecretCandidate = (
  encryptedSecret,
  webId,
  name = "solid-dataspace",
  validate = isReadableSecret
) => {
  try {
    const { value } = stripEncryptionPrefix(encryptedSecret);
    const encryptedBytes = base64ToBytes(value);
    const keyBytes = encodeText(deriveDemoKey(webId, name));
    const decrypted = encryptedBytes.map(
      (byte, index) => byte ^ keyBytes[index % keyBytes.length]
    );
    const secret = decodeText(decrypted);
    return validate(secret) ? secret : "";
  } catch {
    return "";
  }
};

const uniqueSecretCandidates = (candidates) => {
  const seen = new Set();
  return candidates.filter(({ webId, name }) => {
    const key = `${webId || ""}|${name || "solid-dataspace"}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return Boolean(webId);
  });
};

const decryptCredentialTokenSecret = (
  encryptedSecret,
  candidates,
  { allowPlaintextFallback = false } = {}
) => {
  const { prefixed } = stripEncryptionPrefix(encryptedSecret);
  const validCandidates = uniqueSecretCandidates(candidates);

  for (const candidate of validCandidates) {
    const secret = decryptCredentialSecretCandidate(
      encryptedSecret,
      candidate.webId,
      candidate.name,
      isCredentialTokenSecret
    );
    if (secret) return secret;
  }

  if (!prefixed && allowPlaintextFallback && isCredentialTokenSecret(encryptedSecret)) {
    return encryptedSecret;
  }

  throw new Error("Credential token secret could not be decoded.");
};

export const isCredentialTokenDecodeError = (error) =>
  error?.message === "Credential token secret could not be decoded.";

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
  return `${DEMO_ENCRYPTION_PREFIX}${bytesToBase64(encrypted)}`;
}

export function decryptCredentialSecret(encryptedSecret, webId, name = "solid-dataspace") {
  if (!encryptedSecret) return "";
  return (
    decryptCredentialSecretCandidate(encryptedSecret, webId, name) ||
    (stripEncryptionPrefix(encryptedSecret).prefixed
      ? ""
      : isReadableSecret(encryptedSecret)
        ? encryptedSecret
        : "")
  );
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

    const storedName = getStringNoLocale(tokenThing, SDM_TOKEN_NAME) || name;
    const tokenWebId = getUrl(tokenThing, SDM_TOKEN_WEBID) || webId;
    const algorithm =
      getStringNoLocale(tokenThing, SDM_TOKEN_ALGORITHM) ||
      (String(getStringNoLocale(tokenThing, SDM_TOKEN_SECRET) || "").startsWith(
        DEMO_ENCRYPTION_PREFIX
      )
        ? DEMO_ENCRYPTION_ALGORITHM
        : "");
    const id = getStringNoLocale(tokenThing, SDM_TOKEN_IDENTIFIER) || "";
    const encryptedSecret = getStringNoLocale(tokenThing, SDM_TOKEN_SECRET) || "";
    if (!id || !encryptedSecret) return null;

    return {
      name: storedName,
      id,
      secret: decryptCredentialTokenSecret(
        encryptedSecret,
        [
          { webId: tokenWebId, name: storedName },
          { webId, name },
        ],
        { allowPlaintextFallback: true }
      ),
      encryptedSecret,
      webId: tokenWebId,
      resource:
        getUrl(tokenThing, SDM_TOKEN_RESOURCE) ||
        getStringNoLocale(tokenThing, SDM_TOKEN_RESOURCE) ||
        "",
      algorithm: algorithm || DEMO_ENCRYPTION_ALGORITHM,
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
