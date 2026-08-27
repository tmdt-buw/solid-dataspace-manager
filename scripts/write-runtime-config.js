const fs = require("fs");
const path = require("path");
const { parseBooleanValue } = require("./runtime-config-utils");

const INITIAL_STATISTICS_ADMIN_WEBID =
  "https://solid-community-server.tmdt.info/solidtestpod/profile/card#me";
const DEFAULT_STATISTICS_WORKER_WEBID =
  "https://solid-community-server.tmdt.info/solidserviceworker/profile/card#me";

function parseJsonEnv(name, fallback) {
  const raw = process.env[name];

  if (!raw || raw.trim() === "") {
    return fallback;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error(`Invalid JSON in environment variable ${name}`);
    console.error(raw);
    throw error;
  }
}

function parseAdminWebIdsEnv() {
  const raw = process.env.APP_STATISTICS_ADMIN_WEBIDS_JSON;
  if (raw === undefined) return [INITIAL_STATISTICS_ADMIN_WEBID];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.error(
      "Invalid APP_STATISTICS_ADMIN_WEBIDS_JSON; statistics administration is disabled."
    );
    return [];
  }
}

function parseBooleanEnv(name) {
  return parseBooleanValue(process.env[name]);
}

const config = {
  dataspaceId: process.env.APP_DATASPACE_ID || "",
  plasmaUrl:
    process.env.APP_PLASMA_URL ||
    "http://plasma.uni-wuppertal.de/modelings",
  apps: parseJsonEnv("APP_CONFIG_APPS_JSON", []),
  providers: parseJsonEnv("APP_CONFIG_PROVIDERS_JSON", []),
  branding: parseJsonEnv("APP_BRANDING_JSON", {}),
  fundingLogos: parseJsonEnv("APP_FUNDING_LOGOS_JSON", []),
  fundingGrantNumber: process.env.APP_FUNDING_GRANT_NUMBER || "",
  syncWorker: {
    enabled: process.env.APP_SYNC_WORKER_ENABLED !== "false",
    apiUrl: process.env.APP_SYNC_WORKER_API_URL || "/sync-worker",
    serviceWebId: process.env.APP_SYNC_WORKER_SERVICE_WEBID || "",
    intervalMinutes: Number(process.env.APP_SYNC_WORKER_INTERVAL_MINUTES || 10),
  },
  statistics: {
    enabled: parseBooleanEnv("APP_STATISTICS_ENABLED"),
    adminWebIds: parseAdminWebIdsEnv(),
    workerWebId:
      process.env.APP_STATISTICS_WORKER_WEBID ||
      process.env.APP_SYNC_WORKER_SERVICE_WEBID ||
      DEFAULT_STATISTICS_WORKER_WEBID,
    podBaseUrl:
      process.env.APP_STATISTICS_POD_BASE_URL ||
      "https://solid-community-server.tmdt.info/solidtestpod/statistics/",
    eventsUrl: process.env.APP_STATISTICS_EVENTS_URL || "",
    timezone: process.env.APP_STATISTICS_TIMEZONE || "Europe/Berlin",
    activityResourcePath:
      process.env.APP_STATISTICS_ACTIVITY_RESOURCE_PATH ||
      "statistics/activity/activity.ttl",
  },
};

const fileContent =
  `window.__APP_CONFIG__ = ${JSON.stringify(config, null, 2)};\n`;

const targets = [
  path.join(__dirname, "..", "public", "config.js"),
  path.join(__dirname, "..", "build", "config.js"),
].filter((targetPath) => fs.existsSync(path.dirname(targetPath)));

targets.forEach((targetPath) => {
  fs.writeFileSync(targetPath, fileContent, "utf8");
  console.log("Runtime config written to:", targetPath);
});

console.log(JSON.stringify(config, null, 2));
