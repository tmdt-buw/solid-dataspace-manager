import session from "./solidSession";
export const workspaceAccessEnabled = () => window.__APP_CONFIG__?.accessGateway === true;
async function workspaceRequest(fetcher, url) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 15000);
  try {
    return await fetcher(url, { method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { "X-Dataspace-Access": "1" }, signal: controller.signal });
  } finally { window.clearTimeout(timer); }
}
export async function ensureWorkspaceSession() {
  if (!workspaceAccessEnabled()) return;
  if (!session.info.isLoggedIn || !session.info.webId) throw new Error("Please sign in again.");
  const response = await workspaceRequest(session.fetch, new URL("/access-api/session", window.location.origin).href);
  if (!response.ok) throw new Error("Workspace login failed. Please sign in again.");
}
export async function revokeWorkspaceSession() {
  if (!workspaceAccessEnabled()) return;
  const response = await workspaceRequest(window.fetch.bind(window), "/access-api/logout");
  if (!response.ok) throw new Error("Workspace logout failed. Please try again.");
}
export function workspaceReturnTarget(value, origin = window.location.origin) {
  try {
    const target = new URL(value || "/web/node-red", origin);
    if (target.origin === origin && /^\/(node-red|plasma)(\/|$)/.test(target.pathname))
      return target.pathname + target.search + target.hash;
  } catch { /* Invalid return address */ }
  return "/web/node-red";
}
