import React from "react";
import { render, screen, waitFor } from "@testing-library/react";

const mockWebId = "https://pod.example/alice/profile/card#me";
const mockGetSolidDataset = jest.fn();
const mockHasStatisticsConsent = jest.fn();
const mockStartStatisticsActivityHeartbeat = jest.fn(() => jest.fn());

jest.mock("./solidSession", () => ({
  __esModule: true,
  default: {
    info: {
      isLoggedIn: true,
      webId: "https://pod.example/alice/profile/card#me",
    },
    fetch: jest.fn(),
    login: jest.fn(),
    logout: jest.fn(),
  },
}));

jest.mock("@inrupt/solid-client", () => ({
  getSolidDataset: (...args) => mockGetSolidDataset(...args),
  getThing: jest.fn(() => ({ url: mockWebId })),
  getThingAll: jest.fn(() => []),
  getStringNoLocale: jest.fn(() => "complete"),
  getUrl: jest.fn((_thing, predicate) => {
    if (String(predicate).includes("inbox")) {
      return "https://pod.example/alice/inbox/";
    }
    if (String(predicate).includes("catalog")) {
      return "https://pod.example/alice/catalog/cat.ttl#it";
    }
    return "";
  }),
  getUrlAll: jest.fn(() => ["mailto:alice@example.org"]),
}));

jest.mock("./statisticsConsent", () => ({
  hasStatisticsConsent: (...args) => mockHasStatisticsConsent(...args),
}));

jest.mock("./statisticsActivity", () => ({
  startStatisticsActivityHeartbeat: (...args) =>
    mockStartStatisticsActivityHeartbeat(...args),
}));

jest.mock("./config/runtimeConfig", () => ({
  getFundingGrantNumber: () => "",
  getFundingLogos: () => [],
  getPlasmaUrl: () => "/plasma/modelings",
  getStatisticsConfig: () => ({
    enabled: true,
    workerWebId: "https://pod.example/worker/profile/card#me",
    podBaseUrl: "https://pod.example/admin/statistics/",
    activityResourcePath: "statistics/activity/activity.ttl",
    eventsUrl: "",
    timezone: "Europe/Berlin",
  }),
  isStatisticsAdmin: () => false,
  isAppEnabled: () => true,
}));

jest.mock("./solidCatalog", () => ({
  buildDefaultPrivateRegistry: () => "https://pod.example/alice/registry/",
  ensureCurrentRegistryMembership: jest.fn(async () => ({})),
  loadRegistryConfig: jest.fn(async () => ({
    mode: "private",
    registries: [],
    privateRegistry: "https://pod.example/alice/registry/",
  })),
  resolveCatalogUrl: jest.fn(),
  SDP_CATALOG: "https://w3id.org/solid-dataspace-manager#catalog",
}));

jest.mock("./solidConnections", () => ({
  connectionContainerExists: jest.fn(async () => true),
}));

jest.mock("./solidCredentialToken", () => ({
  loadCredentialToken: jest.fn(async () => ({ id: "id", secret: "secret" })),
}));

jest.mock("./i18nProfile", () => ({
  loadProfileLanguage: jest.fn(async () => "en"),
  saveProfileLanguage: jest.fn(async () => ({})),
}));

jest.mock("./components/OnboardingWizard", () => () => (
  <div>Statistics consent onboarding</div>
));
jest.mock("./components/LoadingParticleCloud", () => () => (
  <div data-testid="loading-particle-cloud" />
));
jest.mock("./components/Sidebar", () => () => <div>Manager ready</div>);

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
  () => ({ HealthAppEmbed: () => null, setSession: jest.fn(), healthAppVersion: "test" }),
  { virtual: true }
);
jest.mock(
  "@hoelk-f/city-tours/embed",
  () => ({ CityToursEmbed: () => null, setSession: jest.fn(), toursAppVersion: "test" }),
  { virtual: true }
);
jest.mock(
  "@hoelk-f/solid-health-questionnaire/embed",
  () => ({ SolidHealthQuestionnaireEmbed: () => null, healthQuestionnaireVersion: "test" }),
  { virtual: true }
);
jest.mock(
  "react-router-dom",
  () => ({
    BrowserRouter: ({ children }) => <div>{children}</div>,
    Routes: ({ children }) => <div>{children}</div>,
    Route: () => null,
    useLocation: () => ({ pathname: "/" }),
  }),
  { virtual: true }
);

import App from "./App";
import session from "./solidSession";

describe("App statistics consent gate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    session.info.isLoggedIn = true;
    session.info.webId = mockWebId;
    const solidClient = jest.requireMock("@inrupt/solid-client");
    solidClient.getThing.mockReturnValue({ url: mockWebId });
    solidClient.getThingAll.mockReturnValue([]);
    solidClient.getStringNoLocale.mockImplementation((_thing, predicate) =>
      String(predicate).endsWith("#fn") ? "Alice" : ""
    );
    solidClient.getUrl.mockImplementation((_thing, predicate) => {
      if (String(predicate).includes("inbox")) {
        return "https://pod.example/alice/inbox/";
      }
      if (String(predicate).includes("catalog")) {
        return "https://pod.example/alice/catalog/cat.ttl#it";
      }
      return "";
    });
    solidClient.getUrlAll.mockReturnValue(["mailto:alice@example.org"]);
    const solidCatalog = jest.requireMock("./solidCatalog");
    solidCatalog.ensureCurrentRegistryMembership.mockResolvedValue({});
    solidCatalog.loadRegistryConfig.mockResolvedValue({
      mode: "private",
      registries: [],
      privateRegistry: "https://pod.example/alice/registry/",
    });
    jest
      .requireMock("./solidConnections")
      .connectionContainerExists.mockResolvedValue(true);
    jest
      .requireMock("./solidCredentialToken")
      .loadCredentialToken.mockResolvedValue({ id: "id", secret: "secret" });
    mockGetSolidDataset.mockResolvedValue({ profile: true });
  });

  test("routes a complete profile without statistics consent into onboarding", async () => {
    mockHasStatisticsConsent.mockReturnValue(false);

    render(<App />);

    expect(
      await screen.findByText("Statistics consent onboarding")
    ).toBeInTheDocument();
    expect(screen.queryByText("Manager ready")).not.toBeInTheDocument();
    expect(mockStartStatisticsActivityHeartbeat).not.toHaveBeenCalled();
  });

  test("starts the heartbeat only after the profile consent check succeeds", async () => {
    let resolveProfile;
    mockGetSolidDataset.mockReturnValue(
      new Promise((resolve) => {
        resolveProfile = resolve;
      })
    );
    mockHasStatisticsConsent.mockReturnValue(true);

    render(<App />);
    expect(mockStartStatisticsActivityHeartbeat).not.toHaveBeenCalled();
    expect(screen.getByTestId("loading-particle-cloud")).toBeInTheDocument();
    expect(screen.getByText("Checking profile")).toBeInTheDocument();

    resolveProfile({ profile: true });

    await waitFor(() =>
      expect(mockStartStatisticsActivityHeartbeat).toHaveBeenCalledTimes(1)
    );
    expect(mockStartStatisticsActivityHeartbeat).toHaveBeenCalledWith(
      expect.objectContaining({ webId: mockWebId })
    );
  });
});
