// Loopback development uses the provider's OIDC login, not the server-only
// account handoff. Keep this fallback even when runtime config is unavailable.
export function usesProviderLogin(config = window.__APP_CONFIG__, location = window.location) {
  return config?.loginMode === "oidc" || (
    ["http:", "https:"].includes(location?.protocol) &&
    ["localhost", "127.0.0.1", "[::1]"].includes(location?.hostname)
  );
}
