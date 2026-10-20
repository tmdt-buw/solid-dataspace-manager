import { getSyncWorkerConfig } from "./config/runtimeConfig";
export const SEALED_SECRET_PREFIX = "worker-aes-gcm-v1:";
export async function connectionWorkerCall(webId, solidFetch, action, payload = {}) {
  const config = getSyncWorkerConfig();
  if (!config.enabled) throw new Error("Data Connection is disabled for this profile.");
  const url = new URL(`${config.apiUrl.replace(/\/+$/, "")}/participants${action ? "/" + action : ""}`, window.location.origin);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 65000);
  try {
    const response = await solidFetch(url.href, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ...payload,
        webId
      }),
      signal: controller.signal
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Worker returned HTTP ${response.status}.`);
    return result;
  } finally {
    clearTimeout(timer);
  }
}
export async function sealConnectionCredential(webId, solidFetch, name, secret, previous = "") {
  if (!secret && previous.startsWith(SEALED_SECRET_PREFIX)) return previous;
  if (!secret) throw new Error("Enter an authentication credential.");
  return (await connectionWorkerCall(webId, solidFetch, "seal", {
    name,
    secret
  })).encryptedSecret;
}
export async function loadConnectionStatus(webId, solidFetch) {
  const config = getSyncWorkerConfig();
  const url = new URL(`${config.apiUrl.replace(/\/+$/, "")}/participants/status`, window.location.origin);
  url.searchParams.set("webId", webId);
  const response = await solidFetch(url.href);
  if (response.status === 404) return null;
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Synchronization status is unavailable.");
  return {...result.status, streams: result.streams || [], syncIntervalSeconds: result.syncIntervalSeconds || result.syncIntervalMinutes * 60};
}
