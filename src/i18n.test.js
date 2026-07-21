import {
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  normalizeLanguage,
  resolveInitialLanguageSource,
  translateText,
} from "./i18n";

describe("i18n language resolution", () => {
  afterEach(() => {
    window.localStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  test("normalizes supported language values", () => {
    expect(normalizeLanguage("de")).toBe("de");
    expect(normalizeLanguage("de-DE")).toBe("de");
    expect(normalizeLanguage("EN_us")).toBe("en");
    expect(normalizeLanguage("fr")).toBe(DEFAULT_LANGUAGE);
  });

  test("uses URL language before local storage", () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "en");
    window.history.replaceState({}, "", "/?lang=de");

    expect(resolveInitialLanguageSource()).toEqual({
      language: "de",
      source: "url",
    });
  });

  test("falls back to local storage before default", () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "de");

    expect(resolveInitialLanguageSource()).toEqual({
      language: "de",
      source: "local",
    });
  });

  test("defaults to English when no signal exists", () => {
    expect(resolveInitialLanguageSource()).toEqual({
      language: DEFAULT_LANGUAGE,
      source: "default",
    });
  });

  test("translates manager login and access request labels", () => {
    expect(translateText("Suggested providers", "de")).toBe(
      "Vorgeschlagene Anbieter"
    );
    expect(translateText("Custom issuer", "de")).toBe("Eigener Issuer");
    expect(translateText("Hide closed", "de")).toBe("Geschlossene ausblenden");
    expect(translateText("Refresh", "de")).toBe("Aktualisieren");
  });

  test("translates dynamic manager labels", () => {
    expect(translateText("Showing 3 request(s)", "de")).toBe(
      "3 Zugriffsanfrage(n) angezeigt"
    );
    expect(translateText("Page 2 of 5", "de")).toBe("Seite 2 von 5");
    expect(translateText("Delete Test connection", "de")).toBe(
      "Test connection löschen"
    );
  });

  test("translates statistics navigation, actions and error states", () => {
    expect(translateText("Statistics Dashboard", "de")).toBe(
      "Statistik-Dashboard"
    );
    expect(translateText("Initialize statistics storage", "de")).toBe(
      "Statistikspeicher initialisieren"
    );
    expect(translateText("Dataset metadata quality", "de")).toBe(
      "Dataset-Metadatenqualität"
    );
    expect(translateText("Usage Statistics", "de")).toBe(
      "Nutzungsstatistiken"
    );
    expect(
      translateText(
        "I agree that finishing will create and update my usage statistics in my pod.",
        "de"
      )
    ).toBe(
      "Ich stimme zu, dass beim Abschließen meine Nutzungsstatistiken in meinem Pod erstellt und aktualisiert werden."
    );
    expect(
      translateText(
        "The statistics snapshot could not be loaded (503).",
        "de"
      )
    ).toBe("Der Statistik-Snapshot konnte nicht geladen werden (503).");
  });
});
