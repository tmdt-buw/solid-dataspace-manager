import {
  createThing,
  getBoolean,
  getSolidDataset,
  getThing,
  getThingAll,
  saveSolidDatasetAt,
  setBoolean,
  setThing,
} from "@inrupt/solid-client";

export const STATISTICS_CONSENT_PREDICATE =
  "https://w3id.org/solid-dataspace-manager#statisticsConsent";

const getProfileDocumentUrl = (webId) => String(webId || "").split("#")[0];

export function hasStatisticsConsent(profileThing) {
  return Boolean(
    profileThing && getBoolean(profileThing, STATISTICS_CONSENT_PREDICATE) === true
  );
}

export async function setStatisticsConsent(webId, solidFetch, granted) {
  const profileDocumentUrl = getProfileDocumentUrl(webId);
  if (
    !profileDocumentUrl ||
    typeof solidFetch !== "function" ||
    typeof granted !== "boolean"
  ) {
    throw new Error("A WebID and authenticated Solid fetch are required.");
  }

  let dataset = await getSolidDataset(profileDocumentUrl, { fetch: solidFetch });
  let profileThing =
    getThing(dataset, webId) ||
    getThingAll(dataset).find((thing) => thing.url === webId) ||
    createThing({ url: webId });

  profileThing = setBoolean(
    profileThing,
    STATISTICS_CONSENT_PREDICATE,
    granted
  );
  dataset = setThing(dataset, profileThing);
  await saveSolidDatasetAt(profileDocumentUrl, dataset, { fetch: solidFetch });
  return granted;
}

export async function saveStatisticsConsent(webId, solidFetch) {
  return setStatisticsConsent(webId, solidFetch, true);
}

export async function revokeStatisticsConsent(webId, solidFetch) {
  return setStatisticsConsent(webId, solidFetch, false);
}
