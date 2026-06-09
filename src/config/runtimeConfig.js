const fallbackConfig = {
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
};

function getWindowConfig() {
  if (typeof window === "undefined") {
    return {};
  }

  return window.__APP_CONFIG__ || {};
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
};

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
