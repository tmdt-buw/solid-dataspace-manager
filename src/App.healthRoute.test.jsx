import React from "react";
import { render, screen } from "@testing-library/react";

const mockWebId = "https://pod.example/alice/profile/card#me";

// CRA's Jest resolver cannot load the package exports of React Router 7 directly.
// Use the package's real CommonJS implementation so route matching is still exercised.
jest.mock(
  "react-router-dom",
  () =>
    jest.requireActual(
      "../node_modules/react-router/dist/development/index.js"
    ),
  { virtual: true }
);

jest.mock("./solidSession", () => ({
  __esModule: true,
  default: {
    info: {
      isLoggedIn: true,
      webId: "https://pod.example/alice/profile/card#me",
    },
    fetch: async () => ({}),
    login: async () => ({}),
    logout: async () => ({}),
  },
}));

jest.mock("@inrupt/solid-client", () => ({
  getSolidDataset: async () => ({}),
  getThing: () => ({ url: mockWebId }),
  getThingAll: () => [],
  getStringNoLocale: () => "Alice",
  getUrl: (_thing, predicate) => {
    if (String(predicate).includes("inbox")) {
      return "https://pod.example/alice/inbox/";
    }
    if (String(predicate).includes("catalog")) {
      return "https://pod.example/alice/catalog/catalog.ttl#catalog";
    }
    return "";
  },
  getUrlAll: () => ["mailto:alice@example.org"],
}));

jest.mock("./solidCatalog", () => ({
  buildDefaultPrivateRegistry: () => "https://pod.example/alice/registry/",
  ensureCurrentRegistryMembership: async () => ({}),
  loadRegistryConfig: async () => ({
    mode: "private",
    registries: [],
    privateRegistry: "https://pod.example/alice/registry/",
  }),
  resolveCatalogUrl: async () => "",
  SDP_CATALOG: "https://w3id.org/solid-dataspace-manager#catalog",
}));

jest.mock("./config/runtimeConfig", () => ({
  getFundingGrantNumber: () => "",
  getFundingLogos: () => [],
  getPlasmaUrl: () => "/plasma/modelings",
  getStatisticsConfig: () => ({ enabled: false }),
  isStatisticsAdmin: () => false,
}));

jest.mock("./i18n", () => ({
  dispatchLanguageChange: jest.fn(),
  I18nProvider: ({ children }) => children,
  useI18n: () => ({ language: "en" }),
  normalizeLanguage: (language) => language,
  resolveInitialLanguageSource: () => ({ language: "en", source: "default" }),
  writeStoredLanguage: jest.fn(),
}));

jest.mock("./i18nProfile", () => ({
  loadProfileLanguage: async () => "en",
  saveProfileLanguage: async () => ({}),
}));

jest.mock("./statisticsActivity", () => ({
  startStatisticsActivityHeartbeat: () => () => {},
}));

jest.mock("./statisticsConsent", () => ({
  hasStatisticsConsent: () => true,
}));

jest.mock("./components/RouteAwareLayout", () => ({ children }) => (
  <div>{children}</div>
));
jest.mock("./components/Sidebar", () => () => <div>Sidebar</div>);
jest.mock("./components/LoadingParticleCloud", () => () => <div>Loading</div>);
jest.mock("./components/OnboardingWizard", () => () => <div>Onboarding</div>);
jest.mock("./components/StatisticsRouteGuard", () => ({ children }) => children);

jest.mock("@hoelk-f/solid-data-manager/embed.css", () => ({}), {
  virtual: true,
});
jest.mock("@hoelk-f/semantic-data-catalog/embed.css", () => ({}), {
  virtual: true,
});
jest.mock("@hoelk-f/solid-health-app/embed.css", () => ({}), {
  virtual: true,
});
jest.mock("@hoelk-f/city-tours/embed.css", () => ({}), {
  virtual: true,
});
jest.mock("@hoelk-f/solid-health-questionnaire/embed.css", () => ({}), {
  virtual: true,
});

jest.mock(
  "@hoelk-f/solid-data-manager/embed",
  () => ({ DataManagerEmbed: () => null, setSession: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@hoelk-f/semantic-data-catalog/embed",
  () => ({ CatalogEmbed: () => null, setSession: jest.fn(), catalogVersion: "test" }),
  { virtual: true }
);
jest.mock(
  "@hoelk-f/solid-health-app/embed",
  () => {
    const { useLocation } = jest.requireMock("react-router-dom");
    return {
      HealthAppEmbed: () => {
        const location = useLocation();
        return <div data-testid="health-app-embed">{location.pathname}</div>;
      },
      setSession: jest.fn(),
      healthAppVersion: "test",
    };
  },
  { virtual: true }
);
jest.mock(
  "@hoelk-f/city-tours/embed",
  () => ({ CityToursEmbed: () => <div data-testid="city-tours-embed" />, toursAppVersion: "test" }),
  { virtual: true }
);
jest.mock(
  "@hoelk-f/solid-health-questionnaire/embed",
  () => ({ SolidHealthQuestionnaireEmbed: () => null, healthQuestionnaireVersion: "test" }),
  { virtual: true }
);

import App from "./App";

describe.each([
  "/web/solid-health-app",
  "/web/solid-health-app/detail/steps",
])("health app host route at %s", (path) => {
  test("renders the embedded health app", async () => {
    window.history.replaceState({}, "", path);

    render(<App />);

    expect(await screen.findByTestId("health-app-embed")).toHaveTextContent(path);
  });
});

describe.each(["/web/city-tours", "/web/solid-tours", "/web/solid-tours/"])(
  "City Tours host route at %s",
  (path) => {
    test("renders City Tours and preserves bookmark parameters on the canonical route", async () => {
      window.history.replaceState({}, "", `${path}?tour=example#map`);
      render(<App />);
      expect(await screen.findByTestId("city-tours-embed")).toBeInTheDocument();
      expect(window.location.pathname).toBe("/web/city-tours");
      expect(window.location.search).toBe("?tour=example");
      expect(window.location.hash).toBe("#map");
      expect(screen.getByRole("link", { name: /Privacy notice/ })).toHaveAttribute("href", "/legal/en/privacy.html");
      expect(screen.getByRole("link", { name: /Legal notice/ })).toHaveAttribute("href", "/legal/en/imprint.html");
    });
  }
);
