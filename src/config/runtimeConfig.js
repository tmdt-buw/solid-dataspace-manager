const fallbackConfig = {
  plasmaUrl: "http://plasma.uni-wuppertal.de/modelings",
  apps: [
    {
      id: "environmental-monitoring",
      title: "Environmental Monitoring",
      href: "/web/environmental-monitoring",
      section: "applications",
      iconKey: "temperature",
      visible: true,
      order: 15,
      linkType: "internal",
    },
    {
      id: "solid-health-app",
      title: "Solid Health App",
      href: "/web/solid-health-app",
      section: "applications",
      iconKey: "health",
      visible: true,
      order: 20,
      linkType: "internal",
    },
  ],
  providers: [
    {
      id: "tmdt-solid",
      label: "TMDT Solid",
      issuer: "https://solid-community-server.tmdt.info",
      note: "Recommended",
      enabled: true,
      recommended: true,
    },
    {
      id: "solid-community",
      label: "Solid Community",
      issuer: "https://solidcommunity.net",
      note: "Public community server",
      enabled: true,
      recommended: false,
    },
  ],
  branding: {
    projectName: "Solid Dataspace",
    logoUrl: "/Logo_TMDT.png",
    logoAlt: "Project Logo",
  },
  fundingLogos: [],
  fundingGrantNumber: "",
  syncWorker: {
    enabled: true,
    apiUrl: "/sync-worker",
    serviceWebId: "",
    intervalMinutes: 10,
  },
  statistics: {
    enabled: false,
    adminWebIds: [
      "https://solid-community-server.tmdt.info/solidtestpod/profile/card#me",
    ],
    workerWebId:
      "https://solid-community-server.tmdt.info/solidserviceworker/profile/card#me",
    podBaseUrl:
      "https://solid-community-server.tmdt.info/solidtestpod/statistics/",
    eventsUrl: "",
    timezone: "Europe/Berlin",
    activityResourcePath: "statistics/activity/activity.ttl",
  },
};

function getWindowConfig() {
  if (typeof window === "undefined") {
    return {};
  }

  return window.__APP_CONFIG__ || {};
}

export function normalizePlasmaUrl(value) {
  const raw = typeof value === "string" ? value.trim() : "";

  if (raw.startsWith("/") && !raw.startsWith("//")) {
    return raw;
  }

  try {
    const url = new URL(raw);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function normalizeApp(app, index) {
  return {
    id: app?.id || `app-${index}`,
    title: app?.title || `App ${index + 1}`,
    href: app?.href || "/",
    section: app?.section || "applications",
    iconKey: app?.iconKey || "default",
    visible: app?.visible !== false,
    order: typeof app?.order === "number" ? app.order : index * 10,
    linkType: app?.linkType === "internal" ? "internal" : "external",
  };
}

function normalizeProvider(provider, index) {
  return {
    id: provider?.id || `provider-${index}`,
    label: provider?.label || `Provider ${index + 1}`,
    issuer: provider?.issuer || provider?.url || "",
    note: provider?.note || "",
    enabled: provider?.enabled !== false,
    recommended: Boolean(provider?.recommended),
  };
}

const cssSizePattern =
  /^(?:0|[0-9]+(?:\.[0-9]+)?(?:px|rem|em|%|vh|vw|vmin|vmax|ch))$/;

function normalizeCssSize(
  value,
  { allowAuto = true, allowNone = false } = {}
) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return `${value}px`;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return undefined;
  }

  if (
    (allowAuto && normalizedValue === "auto") ||
    (allowNone && normalizedValue === "none")
  ) {
    return normalizedValue;
  }

  return cssSizePattern.test(normalizedValue) ? normalizedValue : undefined;
}

function normalizeLogoStyle(config) {
  const style = {};
  const width = normalizeCssSize(config?.logoWidth ?? config?.width);
  const height = normalizeCssSize(config?.logoHeight ?? config?.height);
  const maxWidth = normalizeCssSize(
    config?.logoMaxWidth ?? config?.maxWidth,
    {
      allowAuto: false,
      allowNone: true,
    }
  );
  const maxHeight = normalizeCssSize(
    config?.logoMaxHeight ?? config?.maxHeight,
    {
      allowAuto: false,
      allowNone: true,
    }
  );

  if (width) style.width = width;
  if (height) style.height = height;
  if (maxWidth) style.maxWidth = maxWidth;
  if (maxHeight) style.maxHeight = maxHeight;

  return style;
}

function normalizeBranding(branding) {
  return {
    projectName: branding?.projectName || "Solid Dataspace",
    logoUrl: branding?.logoUrl || "/Logo_TMDT.png",
    logoAlt: branding?.logoAlt || branding?.projectName || "Project Logo",
    logoStyle: normalizeLogoStyle(branding),
  };
}

function normalizeFundingLogo(logo, index) {
  return {
    id: logo?.id || `funding-logo-${index}`,
    src: logo?.src || logo?.url || "",
    alt: logo?.alt || logo?.label || `Funding logo ${index + 1}`,
    visible: logo?.visible !== false,
    order: typeof logo?.order === "number" ? logo.order : index,
    logoStyle: normalizeLogoStyle(logo),
  };
}

function normalizeSyncWorker(syncWorker) {
  const intervalMinutes = Number(syncWorker?.intervalMinutes ?? 10);
  return {
    enabled: syncWorker?.enabled !== false,
    apiUrl: syncWorker?.apiUrl || "/sync-worker",
    serviceWebId: syncWorker?.serviceWebId || "",
    intervalMinutes:
      Number.isInteger(intervalMinutes) && intervalMinutes > 0
        ? intervalMinutes
        : 10,
  };
}

function normalizeWebIdList(value) {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .filter((entry) => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter((entry) => {
          if (!entry) return false;
          try {
            const url = new URL(entry);
            return url.protocol === "https:";
          } catch {
            return false;
          }
        })
    )
  );
}

function normalizeContainerUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (url.protocol !== "https:") return "";
    url.hash = "";
    url.search = "";
    return url.href.endsWith("/") ? url.href : `${url.href}/`;
  } catch {
    return "";
  }
}

export function normalizeRelativeResourcePath(value) {
  const raw = String(value || "").trim();
  if (
    !raw ||
    raw.startsWith("/") ||
    raw.includes("\\") ||
    raw.includes("?") ||
    raw.includes("#")
  ) {
    return "";
  }

  const segments = raw.split("/");
  if (segments.some((segment) => !segment)) return "";

  for (const segment of segments) {
    let decoded;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      return "";
    }
    if (
      !decoded ||
      decoded === "." ||
      decoded === ".." ||
      decoded.includes("/") ||
      decoded.includes("\\")
    ) {
      return "";
    }
  }

  try {
    const probe = new URL(raw, "https://example.invalid/");
    if (
      probe.origin !== "https://example.invalid" ||
      probe.pathname.startsWith("//")
    ) {
      return "";
    }
  } catch {
    return "";
  }

  return segments.join("/");
}

function normalizeActivityResourcePath(value) {
  return (
    normalizeRelativeResourcePath(value) ||
    "statistics/activity/activity.ttl"
  );
}

function normalizeTimezone(value) {
  const timezone = String(value || "").trim() || "Europe/Berlin";
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
    return timezone;
  } catch {
    return "Europe/Berlin";
  }
}

function normalizeBooleanFlag(value) {
  if (value === true) return true;
  if (typeof value !== "string") return false;
  return ["true", "1", "yes", "on"].includes(value.trim().toLowerCase());
}

export function normalizeStatisticsConfig(statistics) {
  const podBaseUrl = normalizeContainerUrl(statistics?.podBaseUrl);
  const explicitEventsUrl = normalizeContainerUrl(statistics?.eventsUrl);
  const adminWebIds = normalizeWebIdList(statistics?.adminWebIds);
  const workerWebIds = normalizeWebIdList([statistics?.workerWebId]);

  return {
    enabled: normalizeBooleanFlag(statistics?.enabled) && Boolean(podBaseUrl),
    adminWebIds,
    workerWebId: workerWebIds[0] || "",
    podBaseUrl,
    activityResourcePath: normalizeActivityResourcePath(
      statistics?.activityResourcePath
    ),
    eventsUrl:
      explicitEventsUrl ||
      (podBaseUrl ? new URL("events/downloads/", podBaseUrl).href : ""),
    timezone: normalizeTimezone(statistics?.timezone),
    currentSnapshotUrl: podBaseUrl
      ? new URL("snapshots/current.json", podBaseUrl).href
      : "",
  };
}

const runtimeConfig = getWindowConfig();

const appsSource =
  Array.isArray(runtimeConfig.apps) && runtimeConfig.apps.length > 0
    ? runtimeConfig.apps
    : fallbackConfig.apps;

const providersSource =
  Array.isArray(runtimeConfig.providers) && runtimeConfig.providers.length > 0
    ? runtimeConfig.providers
    : fallbackConfig.providers;

const brandingSource =
  runtimeConfig.branding && Object.keys(runtimeConfig.branding).length > 0
    ? runtimeConfig.branding
    : fallbackConfig.branding;

const fundingLogosSource =
  Array.isArray(runtimeConfig.fundingLogos) && runtimeConfig.fundingLogos.length > 0
    ? runtimeConfig.fundingLogos
    : fallbackConfig.fundingLogos;

export const appConfig = {
  plasmaUrl:
    normalizePlasmaUrl(runtimeConfig.plasmaUrl) || fallbackConfig.plasmaUrl,
  apps: appsSource.map(normalizeApp),
  providers: providersSource.map(normalizeProvider),
  branding: normalizeBranding(brandingSource),
  fundingLogos: fundingLogosSource
    .map(normalizeFundingLogo)
    .filter((logo) => logo.visible && logo.src)
    .sort((a, b) => a.order - b.order),
  fundingGrantNumber:
    typeof runtimeConfig.fundingGrantNumber === "string"
      ? runtimeConfig.fundingGrantNumber.trim()
      : fallbackConfig.fundingGrantNumber,
  syncWorker: normalizeSyncWorker(
    runtimeConfig.syncWorker || fallbackConfig.syncWorker
  ),
  statistics: normalizeStatisticsConfig(
    Object.prototype.hasOwnProperty.call(runtimeConfig, "statistics")
      ? runtimeConfig.statistics
      : fallbackConfig.statistics
  ),
};

export function getPlasmaUrl() {
  return appConfig.plasmaUrl;
}

export function getAppsBySection(section) {
  return appConfig.apps
    .filter((app) => app.visible && app.section === section)
    .sort((a, b) => a.order - b.order);
}

export function getEnabledProviders() {
  return appConfig.providers.filter(
    (provider) => provider.enabled && provider.issuer
  );
}

export function getRecommendedProvider() {
  const providers = getEnabledProviders();
  return providers.find((provider) => provider.recommended) || providers[0] || null;
}

export function getBranding() {
  return appConfig.branding;
}

export function getFundingLogos() {
  return appConfig.fundingLogos;
}

export function getFundingGrantNumber() {
  return appConfig.fundingGrantNumber;
}

export function getSyncWorkerConfig() {
  return appConfig.syncWorker;
}

export function getStatisticsConfig() {
  return appConfig.statistics;
}

export function isStatisticsAdmin(webId) {
  return (
    typeof webId === "string" &&
    appConfig.statistics.adminWebIds.some((adminWebId) => adminWebId === webId)
  );
}
