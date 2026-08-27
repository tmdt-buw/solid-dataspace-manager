const SAFARI_TOKEN = /Safari/i;
const SAFARI_EXCLUDED_TOKEN =
  /(Chrome|Chromium|CriOS|FxiOS|EdgiOS|OPR|OPiOS|Android)/i;

export const isSafariBrowser = ({ vendor = "", userAgent = "" } = {}) => {
  const normalizedVendor = String(vendor);
  const normalizedUserAgent = String(userAgent);

  return (
    normalizedVendor.includes("Apple") &&
    SAFARI_TOKEN.test(normalizedUserAgent) &&
    !SAFARI_EXCLUDED_TOKEN.test(normalizedUserAgent)
  );
};

export const markSafariBrowser = ({
  navigatorObject = typeof navigator === "undefined" ? undefined : navigator,
  documentElement =
    typeof document === "undefined" ? undefined : document.documentElement,
} = {}) => {
  const safari = isSafariBrowser({
    vendor: navigatorObject?.vendor,
    userAgent: navigatorObject?.userAgent,
  });

  documentElement?.classList.toggle("browser-safari", safari);
  return safari;
};
