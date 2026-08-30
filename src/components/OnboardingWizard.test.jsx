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
const mockSessionFetch = jest.fn();
const mockHasStatisticsConsent = jest.fn();
const mockSaveStatisticsConsent = jest.fn();

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

jest.mock("../solidStorage", () => ({
  ensurePodStorageLink: (thing) => thing,
}));

jest.mock("../statisticsConsent", () => ({
  hasStatisticsConsent: (...args) => mockHasStatisticsConsent(...args),
  saveStatisticsConsent: (...args) => mockSaveStatisticsConsent(...args),
}));

const WEB_ID = "https://pod.example/alice/profile/card#me";
const CATALOG = "https://w3id.org/solid-dataspace-manager#catalog";
const STATISTICS_CONFIG = {
  enabled: true,
  workerWebId: "https://pod.example/worker/profile/card#me",
  activityResourcePath: "statistics/activity/activity.ttl",
};

function profileDataset({ name = "Alice", email = "alice@example.org" } = {}) {
  let profile = createThing({ url: WEB_ID });
  if (name) profile = setStringNoLocale(profile, VCARD.fn, name);
  if (email) profile = setUrl(profile, VCARD.email, `mailto:${email}`);
  profile = setUrl(profile, LDP.inbox, "https://pod.example/alice/inbox/");
  profile = setUrl(
    profile,
    CATALOG,
    "https://pod.example/alice/catalog/cat.ttl#it"
  );
  return setThing(createSolidDataset(), profile);
}

describe("OnboardingWizard shared Dataspace setup", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHasStatisticsConsent.mockReturnValue(false);
    mockSaveStatisticsConsent.mockResolvedValue(true);
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
    const dataset = profileDataset();
    mockGetSolidDataset.mockResolvedValue(dataset);
    mockSaveSolidDatasetAt.mockImplementation(async (_url, updated) => updated);
  });

  test("describes startup as loading the personal Dataspace workspace", () => {
    mockGetSolidDataset.mockReturnValue(new Promise(() => {}));

    render(
      <OnboardingWizard
        webId={WEB_ID}
        onComplete={jest.fn()}
        onCancel={jest.fn()}
      />
    );

    expect(
      screen.getByRole("heading", { name: "Profile setup", level: 1 })
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading your personal dataspace workspace …"
    );
    expect(screen.queryByText("Solid Dataspace")).not.toBeInTheDocument();
  });

  test("accepts a complete shared profile without organization or role", async () => {
    const onComplete = jest.fn();
    render(
      <OnboardingWizard
        webId={WEB_ID}
        onComplete={onComplete}
        onCancel={jest.fn()}
      />
    );

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  });

  test("requires only name in Basics and keeps app-specific setup out of Pod setup", async () => {
    mockGetSolidDataset.mockResolvedValue(profileDataset({ name: "", email: "" }));
    const onComplete = jest.fn();

    render(
      <OnboardingWizard
        webId={WEB_ID}
        onComplete={onComplete}
        onCancel={jest.fn()}
      />
    );

    const next = await screen.findByRole("button", { name: "Next" });
    expect(next).toBeDisabled();
    expect(screen.getByLabelText("Organization (optional)")).toHaveValue("");
    expect(screen.getByLabelText("Role (optional)")).toHaveValue("");

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Alice" },
    });
    expect(next).toBeEnabled();
    fireEvent.click(next);

    const email = await screen.findByPlaceholderText("name@example.org");
    fireEvent.change(email, { target: { value: "alice@example.org" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(
      await screen.findByRole("heading", { name: "Inbox, Catalog & Registry" })
    ).toBeInTheDocument();
    expect(screen.queryByText("Connections Folder")).not.toBeInTheDocument();
    expect(screen.queryByText("Credential Token")).not.toBeInTheDocument();
    expect(screen.queryByText("Usage Statistics")).not.toBeInTheDocument();

    const finish = screen.getByRole("button", { name: "Finish" });
    expect(finish).toBeEnabled();
    fireEvent.click(finish);
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    const solidCatalog = jest.requireMock("../solidCatalog");
    expect(solidCatalog.ensureCatalogStructure).toHaveBeenCalledWith(
      expect.objectContaining({ fetch: expect.any(Function) }),
      expect.objectContaining({
        title: "Alice's Catalog",
        registryConfig: expect.objectContaining({ mode: "private" }),
      })
    );
  });

  test("collects and stores usage statistics consent during Pod setup", async () => {
    const onComplete = jest.fn();

    render(
      <OnboardingWizard
        webId={WEB_ID}
        statisticsConfig={STATISTICS_CONFIG}
        onComplete={onComplete}
        onCancel={jest.fn()}
      />
    );

    expect(await screen.findByText("Usage Statistics")).toBeInTheDocument();
    const consent = screen.getByRole("checkbox", {
      name: /I agree that finishing will create and update my usage statistics/i,
    });
    const finish = screen.getByRole("button", { name: "Finish" });

    expect(consent).not.toBeChecked();
    expect(finish).toBeDisabled();

    fireEvent.click(consent);
    expect(finish).toBeEnabled();
    fireEvent.click(finish);

    await waitFor(() =>
      expect(mockSaveStatisticsConsent).toHaveBeenCalledWith(
        WEB_ID,
        expect.any(Function)
      )
    );
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(mockSaveStatisticsConsent.mock.invocationCallOrder[0]).toBeLessThan(
      onComplete.mock.invocationCallOrder[0]
    );
  });
});
