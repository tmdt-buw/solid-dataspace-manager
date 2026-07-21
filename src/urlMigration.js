export const LEGACY_TMDT_ORIGIN = "https://tmdt-solid-community-server.de";
export const CURRENT_TMDT_ORIGIN =
  "https://solid-community-server.tmdt.info";

export function migrateLegacyTmdtUrl(value) {
  let url;
  try {
    url = new URL(String(value || "").trim());
  } catch {
    return value;
  }

  if (
    url.origin !== LEGACY_TMDT_ORIGIN ||
    url.username ||
    url.password
  ) {
    return value;
  }
  url.hostname = new URL(CURRENT_TMDT_ORIGIN).hostname;
  return url.href;
}
