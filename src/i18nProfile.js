import {
  createThing,
  getSolidDataset,
  getStringNoLocale,
  getThing,
  getThingAll,
  removeAll,
  saveSolidDatasetAt,
  setStringNoLocale,
  setThing,
} from "@inrupt/solid-client";
import {
  normalizeLanguage,
  PROFILE_LANGUAGE_PREDICATE,
  SUPPORTED_LANGUAGES,
} from "./i18n";

export async function loadProfileLanguage(webId, fetcher) {
  if (!webId || !fetcher) return "";
  const profileDocUrl = webId.split("#")[0];
  const dataset = await getSolidDataset(profileDocUrl, { fetch: fetcher });
  const profileThing =
    getThing(dataset, webId) || getThingAll(dataset).find((thing) => thing.url === webId);
  const raw = profileThing
    ? getStringNoLocale(profileThing, PROFILE_LANGUAGE_PREDICATE)
    : "";
  const rawLanguage = String(raw || "").trim().toLowerCase();
  const isSupported = SUPPORTED_LANGUAGES.some(
    (supported) =>
      rawLanguage === supported ||
      rawLanguage.startsWith(`${supported}-`) ||
      rawLanguage.startsWith(`${supported}_`)
  );
  if (!isSupported) return "";
  const language = normalizeLanguage(raw);
  return SUPPORTED_LANGUAGES.includes(language) ? language : "";
}

export async function saveProfileLanguage(webId, fetcher, language) {
  if (!webId || !fetcher) return;
  const normalized = normalizeLanguage(language);
  const profileDocUrl = webId.split("#")[0];
  let dataset = await getSolidDataset(profileDocUrl, { fetch: fetcher });
  let profileThing =
    getThing(dataset, webId) || getThingAll(dataset).find((thing) => thing.url === webId);
  if (!profileThing) profileThing = createThing({ url: webId });
  profileThing = removeAll(profileThing, PROFILE_LANGUAGE_PREDICATE);
  profileThing = setStringNoLocale(profileThing, PROFILE_LANGUAGE_PREDICATE, normalized);
  dataset = setThing(dataset, profileThing);
  await saveSolidDatasetAt(profileDocUrl, dataset, { fetch: fetcher });
}
