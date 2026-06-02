const fs = require("fs");
const path = require("path");

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

const config = {
  apps: parseJsonEnv("APP_CONFIG_APPS_JSON", []),
  providers: parseJsonEnv("APP_CONFIG_PROVIDERS_JSON", []),
  branding: parseJsonEnv("APP_BRANDING_JSON", {}),
  fundingLogos: parseJsonEnv("APP_FUNDING_LOGOS_JSON", []),
  fundingGrantNumber: process.env.APP_FUNDING_GRANT_NUMBER || "",
  syncWorker: {
    enabled: process.env.APP_SYNC_WORKER_ENABLED !== "false",
    apiUrl: process.env.APP_SYNC_WORKER_API_URL || "/sync-worker",
    serviceWebId: process.env.APP_SYNC_WORKER_SERVICE_WEBID || "",
    intervalMinutes: Number(process.env.APP_SYNC_WORKER_INTERVAL_MINUTES || 5),
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
