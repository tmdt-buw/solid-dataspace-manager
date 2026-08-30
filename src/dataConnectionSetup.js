import {
  getSolidDataset,
  getThing,
  getThingAll,
  getUrl,
} from "@inrupt/solid-client";
import {
  createClientCredential,
  getAccountIndexUrl,
  loadAccountIndex,
  readStoredAccountToken,
  resolveClientCredentialsUrl,
} from "./cssAccountApi";
import {
  isCredentialTokenDecodeError,
  loadCredentialToken,
  saveCredentialToken,
} from "./solidCredentialToken";
import {
  connectionContainerExists,
  ensureConnectionsContainer,
} from "./solidConnections";
import {
  registerSyncWorkerParticipant,
  resolveOidcIssuer,
} from "./syncWorkerRegistration";

export const DATASPACE_TOKEN_NAME = "solid-dataspace";

const SOLID_OIDC_ISSUER = "http://www.w3.org/ns/solid/terms#oidcIssuer";

const emptyStatus = () => ({
  ready: false,
  connectionsReady: false,
  credentialReady: false,
  workerRegistered: false,
  workerReason: "",
  error: "",
});

const getProfileDocumentUrl = (webId) => String(webId || "").split("#")[0];

const isCredentialNameConflict = (error) =>
  /\b409\b|conflict|already exists|duplicate/i.test(error?.message || "");

async function resolveAccountContext(webId, solidFetch) {
  let oidcIssuer = "";

  try {
    const profileDocumentUrl = getProfileDocumentUrl(webId);
    const dataset = await getSolidDataset(profileDocumentUrl, {
      fetch: solidFetch,
    });
    const profile =
      getThing(dataset, webId) ||
      getThingAll(dataset).find((thing) => thing.url === webId);
    oidcIssuer = profile ? getUrl(profile, SOLID_OIDC_ISSUER) || "" : "";
  } catch {
    // Providers commonly expose the account API on the WebID origin.
  }

  const resolvedIssuer = resolveOidcIssuer({ oidcIssuer, webId });
  return {
    oidcIssuer: resolvedIssuer,
    accountIndexUrl: getAccountIndexUrl(resolvedIssuer || webId),
  };
}

async function createDataspaceCredential(clientCredentialsUrl, webId, accountToken) {
  try {
    return await createClientCredential(
      clientCredentialsUrl,
      { name: DATASPACE_TOKEN_NAME, webId },
      accountToken
    );
  } catch (error) {
    if (!isCredentialNameConflict(error)) throw error;

    return createClientCredential(
      clientCredentialsUrl,
      {
        name: `${DATASPACE_TOKEN_NAME}-${Date.now().toString(36)}`,
        webId,
      },
      accountToken
    );
  }
}

async function loadExistingCredential(webId, solidFetch) {
  try {
    return await loadCredentialToken(webId, solidFetch, DATASPACE_TOKEN_NAME);
  } catch (error) {
    if (!isCredentialTokenDecodeError(error)) throw error;
    return null;
  }
}

async function provisionCredential(webId, solidFetch, accountIndexUrl) {
  const existing = await loadExistingCredential(webId, solidFetch);
  if (existing) return existing;

  const accountToken = readStoredAccountToken(accountIndexUrl);
  if (!accountToken) {
    throw new Error(
      "Account login is required to create the Data Connection credential token. Please sign out and sign in again."
    );
  }

  const accountIndex = await loadAccountIndex(accountIndexUrl, accountToken);
  if (!accountIndex.authorized) {
    throw new Error("The stored account login is no longer accepted by the provider.");
  }

  const clientCredentialsUrl = resolveClientCredentialsUrl(accountIndex.controls);
  if (!clientCredentialsUrl) {
    throw new Error("This provider does not expose credential token creation.");
  }

  const credential = await createDataspaceCredential(
    clientCredentialsUrl,
    webId,
    accountToken
  );
  const stored = await saveCredentialToken(webId, solidFetch, {
    name: DATASPACE_TOKEN_NAME,
    id: credential?.id,
    secret: credential?.secret,
    resource: credential?.resource,
  });

  if (!stored) {
    throw new Error("The provider did not return a complete credential token.");
  }

  return stored;
}

const workerReasonMessage = (reason) => {
  if (reason === "not-configured") {
    return "The background sync worker is not configured for this Dataspace instance.";
  }
  if (reason === "service-webid-missing") {
    return "The background sync worker service WebID is missing.";
  }
  return reason ? `The background sync worker could not be registered (${reason}).` : "";
};

/**
 * Checks the Data Connection capabilities and optionally provisions missing pieces.
 * Existing complete setups are re-registered idempotently so the worker and WAC grant
 * are verified before connection configuration becomes available.
 */
export async function prepareDataConnectionSetup({
  webId,
  solidFetch,
  provision = false,
}) {
  const status = emptyStatus();
  if (!webId || typeof solidFetch !== "function") {
    return {
      ...status,
      error: "A WebID and authenticated Solid fetch are required.",
    };
  }

  try {
    const accountContext = await resolveAccountContext(webId, solidFetch);

    status.connectionsReady = await connectionContainerExists(webId, solidFetch);
    if (!status.connectionsReady && provision) {
      await ensureConnectionsContainer(webId, solidFetch);
      status.connectionsReady = true;
    }

    let credentialToken = await loadExistingCredential(webId, solidFetch);
    if (!credentialToken && provision) {
      credentialToken = await provisionCredential(
        webId,
        solidFetch,
        accountContext.accountIndexUrl
      );
    }
    status.credentialReady = Boolean(credentialToken);

    if (!status.connectionsReady || !status.credentialReady) {
      return status;
    }

    const registration = await registerSyncWorkerParticipant({
      webId,
      oidcIssuer: accountContext.oidcIssuer,
      accountIndexUrl: accountContext.accountIndexUrl,
      credentialToken,
      solidFetch,
    });

    status.workerRegistered = registration?.registered === true;
    status.workerReason = registration?.reason || "";
    status.error = status.workerRegistered
      ? ""
      : workerReasonMessage(status.workerReason);
    status.ready =
      status.connectionsReady &&
      status.credentialReady &&
      status.workerRegistered;
    return status;
  } catch (error) {
    return {
      ...status,
      error: error?.message || "Data Connection setup could not be completed.",
    };
  }
}
