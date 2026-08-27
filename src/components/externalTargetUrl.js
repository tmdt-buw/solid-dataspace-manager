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
    if (activeLink.slug === "environmental-monitoring") {
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
    }
    return url.toString();
  } catch {
    return activeLink.url;
  }
}
