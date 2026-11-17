import { normalizeDataspaceId } from "../config/runtimeConfig";

export const UNCONFIGURED_DATASPACE_ID = "__unconfigured__";

export function buildExternalTargetUrl({
  activeLink,
  language,
  origin,
  dataspaceId,
}) {
  if (!activeLink?.url) return "";
  try {
    const url = new URL(activeLink.url, origin);
    url.searchParams.set("lang", language);
    if (["urban-data-explorer", "environmental-monitoring"].includes(activeLink.slug)) {
      // Never let an embedded instance silently use the worker's combined,
      // cross-dataspace endpoint when its partition is missing or invalid.
      const normalizedDataspaceId =
        typeof dataspaceId === "string"
          ? normalizeDataspaceId(dataspaceId)
          : "";
      url.searchParams.set(
        "dataspaceId",
        normalizedDataspaceId || UNCONFIGURED_DATASPACE_ID
      );
      // The host version label must select the same release inside the iframe.
      // Otherwise a cached entry HTML can keep loading an older hashed bundle.
      if (activeLink.version) url.searchParams.set("v", activeLink.version);
    }
    return url.toString();
  } catch {
    return activeLink.url;
  }
}
