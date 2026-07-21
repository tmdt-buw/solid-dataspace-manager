import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  createSolidDataset,
  createThing,
  setStringNoLocale,
  setThing,
  setUrl,
} from "@inrupt/solid-client";
import { LDP, VCARD } from "@inrupt/vocab-common-rdf";
import OnboardingWizard from "./OnboardingWizard";

const mockGetSolidDataset = jest.fn();
const mockSaveSolidDatasetAt = jest.fn();
const mockRecordStatisticsActivity = jest.fn();
const mockSaveStatisticsConsent = jest.fn();
const mockHasStatisticsConsent = jest.fn();
const mockSessionFetch = jest.fn();

jest.mock("@inrupt/solid-client", () => {
  const actual = jest.requireActual("@inrupt/solid-client");
  return {
    ...actual,
    createContainerAt: jest.fn(async () => ({})),
    getSolidDataset: (...args) => mockGetSolidDataset(...args),
    getSolidDatasetWithAcl: jest.fn(async () => ({ resource: true })),
    getResourceAcl: jest.fn(() => ({})),
    hasResourceAcl: jest.fn(() => true),
    hasAccessibleAcl: jest.fn(() => true),
    createAclFromFallbackAcl: jest.fn(() => ({})),
    setPublicResourceAccess: jest.fn((acl) => acl),
    saveAclFor: jest.fn(async () => ({})),
    saveSolidDatasetAt: (...args) => mockSaveSolidDatasetAt(...args),
    overwriteFile: jest.fn(async () => ({})),
  };
});

jest.mock("../solidSession", () => ({
  __esModule: true,
  default: { fetch: (...args) => mockSessionFetch(...args) },
}));

jest.mock("../solidCatalog", () => ({
  buildDefaultPrivateRegistry: () => "https://pod.example/alice/registry/",
  ensureCatalogStructure: jest.fn(async () => ({
    catalogUrl: "https://pod.example/alice/catalog/cat.ttl#it",
  })),
  ensurePrivateRegistryContainer: jest.fn(async () => ({})),
  loadRegistryConfig: jest.fn(async () => ({
    mode: "private",
    registries: [],
    privateRegistry: "https://pod.example/alice/registry/",
  })),
  loadRegistryMembersFromContainer: jest.fn(async () => []),
  REGISTRY_PRESETS: [],
  resolveCatalogUrl: jest.fn(async () =>
    "https://pod.example/alice/catalog/cat.ttl#it"
  ),
  saveRegistryConfig: jest.fn(async () => ({})),
  SDP_CATALOG: "https://w3id.org/solid-dataspace-manager#catalog",
}));

jest.mock("../cssAccountApi", () => ({
  createClientCredential: jest.fn(),
  getAccountIndexUrl: () => "https://pod.example/.account/",
  loadAccountIndex: jest.fn(),
  readStoredAccountToken: jest.fn(),
  resolveClientCredentialsUrl: jest.fn(),
}));

jest.mock("../solidCredentialToken", () => ({
  isCredentialTokenDecodeError: () => false,
  loadCredentialToken: jest.fn(async () => ({ id: "id", secret: "secret" })),
  saveCredentialToken: jest.fn(),
}));

jest.mock("../syncWorkerRegistration", () => ({
  registerSyncWorkerParticipant: jest.fn(async () => ({ registered: true })),
  resolveOidcIssuer: () => "https://pod.example/",
}));

jest.mock("../solidConnections", () => ({
  connectionContainerExists: jest.fn(async () => true),
  ensureConnectionsContainer: jest.fn(async () => ({})),
  getConnectionsContainerUrl: () => "https://pod.example/alice/connections/",
}));

jest.mock("../solidStorage", () => ({
  ensurePodStorageLink: (thing) => thing,
}));

jest.mock("../statisticsActivity", () => ({
  recordStatisticsActivity: (...args) => mockRecordStatisticsActivity(...args),
}));

jest.mock("../statisticsConsent", () => ({
  hasStatisticsConsent: (...args) => mockHasStatisticsConsent(...args),
  saveStatisticsConsent: (...args) => mockSaveStatisticsConsent(...args),
}));

const WEB_ID = "https://pod.example/alice/profile/card#me";
const CATALOG = "https://w3id.org/solid-dataspace-manager#catalog";
const OIDC_ISSUER = "http://www.w3.org/ns/solid/terms#oidcIssuer";

function completeProfileDataset() {
  let profile = createThing({ url: WEB_ID });
  profile = setStringNoLocale(profile, VCARD.fn, "Alice");
  profile = setStringNoLocale(profile, VCARD.organization_name, "Example Org");
  profile = setStringNoLocale(profile, VCARD.role, "Researcher");
  profile = setUrl(profile, VCARD.email, "mailto:alice@example.org");
  profile = setUrl(profile, LDP.inbox, "https://pod.example/alice/inbox/");
  profile = setUrl(
    profile,
    CATALOG,
    "https://pod.example/alice/catalog/cat.ttl#it"
  );
  profile = setUrl(profile, OIDC_ISSUER, "https://pod.example/");
  return setThing(createSolidDataset(), profile);
}

const statisticsConfig = {
  enabled: true,
  workerWebId: "https://pod.example/worker/profile/card#me",
  activityResourcePath: "statistics/activity/activity.ttl",
  timezone: "Europe/Berlin",
};

describe("OnboardingWizard statistics consent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const solidClient = jest.requireMock("@inrupt/solid-client");
    solidClient.getSolidDatasetWithAcl.mockResolvedValue({ resource: true });
    solidClient.getResourceAcl.mockReturnValue({});
    solidClient.hasResourceAcl.mockReturnValue(true);
    solidClient.hasAccessibleAcl.mockReturnValue(true);
    solidClient.createAclFromFallbackAcl.mockReturnValue({});
    solidClient.setPublicResourceAccess.mockImplementation((acl) => acl);
    solidClient.saveAclFor.mockResolvedValue({});

    const solidCatalog = jest.requireMock("../solidCatalog");
    solidCatalog.loadRegistryConfig.mockResolvedValue({
      mode: "private",
      registries: [],
      privateRegistry: "https://pod.example/alice/registry/",
    });
    solidCatalog.ensureCatalogStructure.mockResolvedValue({
      catalogUrl: "https://pod.example/alice/catalog/cat.ttl#it",
    });
    solidCatalog.ensurePrivateRegistryContainer.mockResolvedValue({});
    solidCatalog.saveRegistryConfig.mockResolvedValue({});
    jest
      .requireMock("../solidCredentialToken")
      .loadCredentialToken.mockResolvedValue({ id: "id", secret: "secret" });
    const solidConnections = jest.requireMock("../solidConnections");
    solidConnections.connectionContainerExists.mockResolvedValue(true);
    solidConnections.ensureConnectionsContainer.mockResolvedValue({});
    jest
      .requireMock("../syncWorkerRegistration")
      .registerSyncWorkerParticipant.mockResolvedValue({ registered: true });
    const dataset = completeProfileDataset();
    mockGetSolidDataset.mockResolvedValue(dataset);
    mockSaveSolidDatasetAt.mockImplementation(async (_url, updated) => updated);
    mockHasStatisticsConsent.mockReturnValue(false);
    mockRecordStatisticsActivity.mockResolvedValue({ recorded: true });
    mockSaveStatisticsConsent.mockResolvedValue(true);
  });

  test("requires the checkbox and records activity before persisting consent", async () => {
    const onComplete = jest.fn();
    render(
      <OnboardingWizard
        webId={WEB_ID}
        statisticsConfig={statisticsConfig}
        onComplete={onComplete}
        onCancel={jest.fn()}
      />
    );

    const consent = await screen.findByRole("checkbox", {
      name: /create and update my usage statistics/i,
    });
    const finish = screen.getByRole("button", { name: "Finish" });

    expect(finish).toBeDisabled();
    expect(mockRecordStatisticsActivity).not.toHaveBeenCalled();
    expect(mockSaveStatisticsConsent).not.toHaveBeenCalled();

    fireEvent.click(consent);
    expect(finish).toBeEnabled();
    fireEvent.click(finish);

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(mockRecordStatisticsActivity).toHaveBeenCalledWith({
      webId: WEB_ID,
      fetch: expect.any(Function),
      config: statisticsConfig,
    });
    expect(mockSaveStatisticsConsent).toHaveBeenCalledWith(
      WEB_ID,
      expect.any(Function)
    );
    expect(mockRecordStatisticsActivity.mock.invocationCallOrder[0]).toBeLessThan(
      mockSaveStatisticsConsent.mock.invocationCallOrder[0]
    );
    expect(mockSaveStatisticsConsent.mock.invocationCallOrder[0]).toBeLessThan(
      onComplete.mock.invocationCallOrder[0]
    );
  });

  test("does not require or write consent when statistics are disabled", async () => {
    const onComplete = jest.fn();
    render(
      <OnboardingWizard
        webId={WEB_ID}
        statisticsConfig={{ ...statisticsConfig, enabled: false }}
        onComplete={onComplete}
        onCancel={jest.fn()}
      />
    );

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(
      screen.queryByRole("checkbox", {
        name: /create and update my usage statistics/i,
      })
    ).not.toBeInTheDocument();
    expect(mockRecordStatisticsActivity).not.toHaveBeenCalled();
    expect(mockSaveStatisticsConsent).not.toHaveBeenCalled();
  });
});
