import { isSafariBrowser, markSafariBrowser } from "./browserCompatibility";

const APPLE_VENDOR = "Apple Computer, Inc.";

describe("Safari browser compatibility marker", () => {
  afterEach(() => {
    document.documentElement.classList.remove("browser-safari");
  });

  test.each([
    [
      "desktop Safari",
      APPLE_VENDOR,
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.6 Safari/605.1.15",
    ],
    [
      "iOS Safari",
      APPLE_VENDOR,
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1",
    ],
  ])("detects %s", (_label, vendor, userAgent) => {
    expect(isSafariBrowser({ vendor, userAgent })).toBe(true);
  });

  test.each([
    ["Chrome", "Google Inc.", "Chrome/140.0 Safari/537.36"],
    ["Chromium", "Google Inc.", "Chromium/140.0 Safari/537.36"],
    ["Chrome on iOS", APPLE_VENDOR, "CriOS/140.0 Mobile Safari/604.1"],
    ["Firefox on iOS", APPLE_VENDOR, "FxiOS/142.0 Mobile Safari/605.1.15"],
    ["Edge on iOS", APPLE_VENDOR, "EdgiOS/140.0 Mobile Safari/605.1.15"],
    ["Opera", "Google Inc.", "OPR/121.0 Chrome/140.0 Safari/537.36"],
    ["Opera on iOS", APPLE_VENDOR, "OPiOS/6.0 Mobile Safari/9537.53"],
    ["Android browser", APPLE_VENDOR, "Android 16 Chrome/140.0 Safari/537.36"],
    ["non-Apple Safari token", "Google Inc.", "Safari/537.36"],
  ])("does not detect %s", (_label, vendor, userAgent) => {
    expect(isSafariBrowser({ vendor, userAgent })).toBe(false);
  });

  test("toggles the document marker from the supplied browser identity", () => {
    expect(
      markSafariBrowser({
        navigatorObject: {
          vendor: APPLE_VENDOR,
          userAgent: "Version/18.6 Safari/605.1.15",
        },
        documentElement: document.documentElement,
      })
    ).toBe(true);
    expect(document.documentElement).toHaveClass("browser-safari");

    expect(
      markSafariBrowser({
        navigatorObject: {
          vendor: "Google Inc.",
          userAgent: "Chrome/140.0 Safari/537.36",
        },
        documentElement: document.documentElement,
      })
    ).toBe(false);
    expect(document.documentElement).not.toHaveClass("browser-safari");
  });
});
