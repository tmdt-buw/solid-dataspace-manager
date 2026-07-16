import {
  createAcl,
  createContainerAt,
  getPodUrlAll,
  getSolidDatasetWithAcl,
  hasAccessibleAcl,
  saveAclFor,
  setAgentDefaultAccess,
  setAgentResourceAccess,
  setPublicDefaultAccess,
  setPublicResourceAccess,
} from "@inrupt/solid-client";
import { Parser } from "n3";
import { normalizeRelativeResourcePath } from "./config/runtimeConfig";

export const STATISTICS_NAMESPACE =
  "https://w3id.org/solid-dataspace-manager/statistics#";

const OWNER_ACCESS = {
  read: true,
  append: true,
  write: true,
  control: true,
};
const WORKER_READ_ACCESS = {
  read: true,
  append: false,
  write: false,
  control: false,
};
const NO_ACCESS = {
  read: false,
  append: false,
  write: false,
  control: false,
};
const MAX_WRITE_ATTEMPTS = 3;
export const ACTIVITY_CHECK_INTERVAL_MS = 60 * 60 * 1000;

const getErrorStatus = (error) =>
  error?.statusCode || error?.response?.status || error?.status;

function formatDateParts(date, timezone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.formatToParts(date).reduce((parts, part) => {
    if (part.type !== "literal") parts[part.type] = part.value;
    return parts;
  }, {});
}

export function getActivityPeriod(date = new Date(), timezone = "Europe/Berlin") {
  const parts = formatDateParts(date, timezone);
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    month: `${parts.year}-${parts.month}`,
  };
}

export function buildActivityTurtle(
  date = new Date(),
  timezone = "Europe/Berlin"
) {
  const { month } = getActivityPeriod(date, timezone);
  return [
    `@prefix sdmstat: <${STATISTICS_NAMESPACE}> .`,
    "@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .",
    "",
    "<#it> a sdmstat:UsageActivity ;",
    `  sdmstat:lastActiveAt "${date.toISOString()}"^^xsd:dateTime ;`,
    `  sdmstat:activeMonth "${month}" .`,
    "",
  ].join("\n");
}

export function buildActivityPlaceholderTurtle() {
  return [
    `@prefix sdmstat: <${STATISTICS_NAMESPACE}> .`,
    "",
    "<#it> a sdmstat:UsageActivity .",
    "",
  ].join("\n");
}

export function parseActivityTurtle(turtle, resourceUrl) {
  try {
    const quads = new Parser({ baseIRI: resourceUrl }).parse(turtle);
    const lastActiveAt = quads.find(
      (quad) => quad.predicate.value === `${STATISTICS_NAMESPACE}lastActiveAt`
    )?.object?.value;
    const activeMonth = quads.find(
      (quad) => quad.predicate.value === `${STATISTICS_NAMESPACE}activeMonth`
    )?.object?.value;
    return { lastActiveAt: lastActiveAt || "", activeMonth: activeMonth || "" };
  } catch {
    return { lastActiveAt: "", activeMonth: "" };
  }
}

export function resolveActivityResourceUrl(podUrl, resourcePath) {
  const path = normalizeRelativeResourcePath(resourcePath);
  if (!path) {
    throw new Error("Invalid statistics activity resource path.");
  }

  let storageUrl;
  try {
    storageUrl = new URL(String(podUrl || "").trim());
  } catch {
    throw new Error("Invalid Solid storage URL.");
  }
  if (storageUrl.protocol !== "https:") {
    throw new Error("Invalid Solid storage URL.");
  }
  storageUrl.hash = "";
  storageUrl.search = "";
  if (!storageUrl.pathname.endsWith("/")) storageUrl.pathname += "/";

  const activityUrl = new URL(path, storageUrl);
  if (
    activityUrl.origin !== storageUrl.origin ||
    !activityUrl.pathname.startsWith(storageUrl.pathname)
  ) {
    throw new Error("Statistics activity resource must stay inside Solid storage.");
  }
  return activityUrl.href;
}

async function securePrivateContainer(containerUrl, webId, solidFetch) {
  const resource = await getSolidDatasetWithAcl(containerUrl, {
    fetch: solidFetch,
  });
  if (!hasAccessibleAcl(resource)) {
    throw new Error("No Control access to a statistics activity container ACL.");
  }

  let acl = createAcl(resource);
  acl = setPublicResourceAccess(acl, NO_ACCESS);
  acl = setPublicDefaultAccess(acl, NO_ACCESS);
  acl = setAgentResourceAccess(acl, webId, OWNER_ACCESS);
  acl = setAgentDefaultAccess(acl, webId, OWNER_ACCESS);
  await saveAclFor(resource, acl, { fetch: solidFetch });
}

async function ensureContainer(containerUrl, webId, solidFetch) {
  const response = await solidFetch(containerUrl, {
    method: "GET",
    headers: { Accept: "text/turtle" },
    cache: "no-store",
  });
  if (response.ok) return false;
  if (response.status !== 404) {
    throw new Error(
      `Statistics activity container is not accessible (${response.status}).`
    );
  }

  try {
    await createContainerAt(containerUrl, { fetch: solidFetch });
  } catch (error) {
    if (![409, 412].includes(getErrorStatus(error))) throw error;
  }
  await securePrivateContainer(containerUrl, webId, solidFetch);
  return true;
}

async function ensureContainerHierarchy(podUrl, resourceUrl, webId, solidFetch) {
  const pod = new URL(podUrl);
  const resource = new URL(resourceUrl);
  const relativePath = resource.pathname.slice(pod.pathname.length);
  const segments = relativePath.split("/").filter(Boolean).slice(0, -1);
  let currentUrl = pod.href.endsWith("/") ? pod.href : `${pod.href}/`;

  for (const [index, segment] of segments.entries()) {
    currentUrl = new URL(`${encodeURIComponent(segment)}/`, currentUrl).href;
    const created = await ensureContainer(currentUrl, webId, solidFetch);
    if (!created && index === segments.length - 1) {
      await securePrivateContainer(currentUrl, webId, solidFetch);
    }
  }
}

export async function ensureActivityAcl({
  resourceUrl,
  webId,
  workerWebId,
  fetch: solidFetch,
}) {
  if (!workerWebId) {
    throw new Error("Statistics worker WebID is not configured.");
  }

  const resource = await getSolidDatasetWithAcl(resourceUrl, {
    fetch: solidFetch,
  });
  if (!hasAccessibleAcl(resource)) {
    throw new Error("No Control access to the statistics activity ACL.");
  }

  let acl = createAcl(resource);
  acl = setPublicResourceAccess(acl, NO_ACCESS);
  acl = setAgentResourceAccess(acl, webId, OWNER_ACCESS);
  if (workerWebId !== webId) {
    acl = setAgentResourceAccess(acl, workerWebId, WORKER_READ_ACCESS);
  }
  await saveAclFor(resource, acl, { fetch: solidFetch });
}

export async function recordStatisticsActivity({
  webId,
  fetch: solidFetch,
  config,
  now = new Date(),
}) {
  if (!config?.enabled) return { recorded: false, reason: "disabled" };
  if (!webId || typeof solidFetch !== "function") {
    return { recorded: false, reason: "missing-session" };
  }
  if (!config.workerWebId) {
    throw new Error("Statistics worker WebID is not configured.");
  }

  const podUrls = await getPodUrlAll(webId, { fetch: solidFetch });
  const podUrl = podUrls[0];
  if (!podUrl) throw new Error("No Solid storage was found for the current WebID.");

  const resourceUrl = resolveActivityResourceUrl(
    podUrl,
    config.activityResourcePath
  );
  await ensureContainerHierarchy(podUrl, resourceUrl, webId, solidFetch);

  const currentPeriod = getActivityPeriod(now, config.timezone);
  const body = buildActivityTurtle(now, config.timezone);

  for (let attempt = 1; attempt <= MAX_WRITE_ATTEMPTS; attempt += 1) {
    let existingResponse = await solidFetch(resourceUrl, {
      method: "GET",
      headers: { Accept: "text/turtle" },
      cache: "no-store",
    });

    let aclSecured = false;
    if (existingResponse.status === 404) {
      const placeholderResponse = await solidFetch(resourceUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "text/turtle",
          "If-None-Match": "*",
        },
        body: buildActivityPlaceholderTurtle(),
      });
      if ([409, 412].includes(placeholderResponse.status)) {
        if (attempt < MAX_WRITE_ATTEMPTS) continue;
        throw new Error("Statistics activity placeholder could not be created.");
      }
      if (!placeholderResponse.ok) {
        throw new Error(
          `Statistics activity placeholder could not be created (${placeholderResponse.status}).`
        );
      }

      await ensureActivityAcl({
        resourceUrl,
        webId,
        workerWebId: config.workerWebId,
        fetch: solidFetch,
      });
      aclSecured = true;
      existingResponse = await solidFetch(resourceUrl, {
        method: "GET",
        headers: { Accept: "text/turtle" },
        cache: "no-store",
      });
    }

    if (!existingResponse.ok) {
      throw new Error(
        `Statistics activity could not be read (${existingResponse.status}).`
      );
    }

    if (!aclSecured) {
      await ensureActivityAcl({
        resourceUrl,
        webId,
        workerWebId: config.workerWebId,
        fetch: solidFetch,
      });
    }

    const etag = existingResponse.headers?.get?.("etag") || "";
    const existingActivity = parseActivityTurtle(
      await existingResponse.text(),
      resourceUrl
    );
    const lastSeen = Date.parse(existingActivity.lastActiveAt);
    if (
      Number.isFinite(lastSeen) &&
      getActivityPeriod(new Date(lastSeen), config.timezone).day ===
        currentPeriod.day
    ) {
      return { recorded: false, reason: "already-recorded", resourceUrl };
    }
    if (!etag) {
      throw new Error("Statistics activity resource did not provide an ETag.");
    }

    const writeResponse = await solidFetch(resourceUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "text/turtle",
        "If-Match": etag,
      },
      body,
    });

    if (writeResponse.ok) {
      return { recorded: true, resourceUrl, activeMonth: currentPeriod.month };
    }
    if (![409, 412].includes(writeResponse.status) || attempt === MAX_WRITE_ATTEMPTS) {
      throw new Error(
        `Statistics activity could not be written (${writeResponse.status}).`
      );
    }
  }

  throw new Error("Statistics activity could not be written after three attempts.");
}

export function startStatisticsActivityHeartbeat({
  webId,
  fetch: solidFetch,
  config,
  intervalMs = ACTIVITY_CHECK_INTERVAL_MS,
  onError,
  recordActivity = recordStatisticsActivity,
}) {
  let stopped = false;
  let running = false;

  const run = async () => {
    if (stopped || running) return;
    running = true;
    try {
      await recordActivity({ webId, fetch: solidFetch, config });
    } catch {
      if (!stopped) onError?.();
    } finally {
      running = false;
    }
  };

  run();
  const timer = setInterval(run, intervalMs);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
