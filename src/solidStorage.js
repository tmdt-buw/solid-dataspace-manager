import { getUrlAll, setUrl } from "@inrupt/solid-client";

export const PIM_STORAGE = "http://www.w3.org/ns/pim/space#storage";

export function deriveLocalCssPodUrl(webId) {
  let url;
  try {
    url = new URL(String(webId || "").trim());
  } catch {
    return "";
  }

  const profileSuffix = "/profile/card";
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash !== "#me" ||
    /%2f|%5c/i.test(url.pathname) ||
    !url.pathname.endsWith(profileSuffix)
  ) {
    return "";
  }

  const podPath = url.pathname.slice(0, -profileSuffix.length);
  if (!podPath || podPath === "/" || podPath.includes("//")) return "";
  return `${url.origin}${podPath}/`;
}

export function ensurePodStorageLink(profileThing, webId) {
  if (!profileThing) return profileThing;
  if (getUrlAll(profileThing, PIM_STORAGE).length) return profileThing;

  const podUrl = deriveLocalCssPodUrl(webId);
  return podUrl ? setUrl(profileThing, PIM_STORAGE, podUrl) : profileThing;
}
