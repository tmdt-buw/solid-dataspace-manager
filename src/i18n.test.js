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

  test("keeps Environmental Monitoring consent in English and localizes it for German", () => {
    const title = "Environmental Monitoring would like to access your donated data";
    const notice =
      "Environmental Monitoring does not display your name, WebID, Pod URL, contact email, exact completion date, or other direct identifiers. A route and activity type may be displayed as soon as access to one matching contribution from a single WebID has been approved; values from additional approved contributions are combined when available. Removing direct identifiers does not make a route anonymous: the location and shape of a single route, timing patterns, or links to known places may still identify a person or place. The restricted source resource contains the full route coordinates, completion date, activity type, calculated distance, active minutes, pace, and an estimated step count for walking. Your public catalog entry may still show the creator, WebID, and contact email stored in your Solid profile.";
    expect(translateText(title, "en")).toBe(title);
    expect(translateText(title, "de")).toBe(
      "Environmental Monitoring möchte auf deine gespendeten Daten zugreifen"
    );
    const purpose = "With your consent, Environmental Monitoring may read your donated routes and calculated activity values and display them publicly. Your source data in your Pod remains protected.";
    expect(translateText(purpose, "de")).toBe("Mit deiner Zustimmung darf Environmental Monitoring deine gespendeten Routen und daraus berechneten Aktivitätswerte lesen und öffentlich darstellen. Deine Quelldaten im Pod bleiben geschützt.");
    expect(translateText(purpose, "de")).not.toMatch(/Instanzen|localhost/);
    expect(translateText(notice, "de")).toContain(
      "einer einzelnen WebID genehmigt"
    );
    expect(translateText(notice, "de")).toContain(
      "macht eine Route nicht anonym"
    );
    expect(translateText("Data:", "de")).toBe("Daten:");
    expect(translateText("Note:", "de")).toBe("Hinweis:");
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
    expect(translateText("Enable usage statistics", "de")).toBe(
      "Nutzungsstatistiken aktivieren"
    );
    expect(translateText("Withdraw consent", "de")).toBe(
      "Zustimmung widerrufen"
    );
    expect(translateText("Worker access", "de")).toBe("Worker-Zugriff");
    expect(translateText("User survey", "de")).toBe("Nutzerbefragung");
    expect(translateText("System comprehensibility", "de")).toBe(
      "Verst\u00e4ndlichkeit des Systems"
    );
    expect(translateText("Dataset findability", "de")).toBe(
      "Auffindbarkeit relevanter Datens\u00e4tze"
    );
    expect(translateText("Positive rate", "de")).toBe("Positive Quote");
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

  test("translates shared onboarding and Data Connection setup labels", () => {
    expect(translateText("Organization (optional)", "de")).toBe(
      "Organisation (optional)"
    );
    expect(translateText("Inbox, Catalog & Registry", "de")).toBe(
      "Inbox, Katalog und Registry"
    );
    expect(translateText("Set up Data Connection", "de")).toBe(
      "Datenverbindung einrichten"
    );
    expect(translateText("Background sync worker", "de")).toBe(
      "Hintergrund-Sync-Worker"
    );
  });

  test("translates the current Information page explicitly", () => {
    expect(translateText("Your Solid Dataspace, at a glance.", "de")).toBe(
      "Dein Solid Dataspace auf einen Blick."
    );
    expect(translateText("Available in this Dataspace today", "de")).toBe(
      "Heute in diesem Dataspace verfügbar"
    );
    expect(translateText("What stays where", "de")).toBe(
      "Was wo gespeichert und verarbeitet wird"
    );
    expect(translateText("Current scope", "de")).toBe("Aktueller Umfang");
    expect(
      translateText("Applications available in this instance", "de")
    ).toBe("In dieser Instanz verfügbare Anwendungen");
  });

  test("translates tab-specific personal workspace loading copy", () => {
    expect(
      translateText("Loading your personal access decisions workspace …", "de")
    ).toBe("Dein persönlicher Bereich für Zugriffsentscheidungen wird geladen …");
    expect(
      translateText("Loading your personal access requests workspace …", "de")
    ).toBe("Dein persönlicher Bereich für Zugriffsanfragen wird geladen …");
    expect(
      translateText("Loading your personal statistics workspace …", "de")
    ).toBe("Dein persönlicher Statistikbereich wird geladen …");
    expect(
      translateText("Loading your personal provider workspace …", "de")
    ).toBe("Dein persönlicher Anbieterbereich wird geladen …");
  });

  test("translates the centralized application loading copy", () => {
    expect(
      translateText("Loading your personal dataspace workspace …", "de")
    ).toBe("Dein persönlicher Dataspace-Bereich wird geladen …");
    expect(
      translateText("Loading your personal profile workspace …", "de")
    ).toBe("Dein persönlicher Profilbereich wird geladen …");
    expect(
      translateText("Loading your personal application workspace …", "de")
    ).toBe("Dein persönlicher Anwendungsbereich wird geladen …");
  });
});
