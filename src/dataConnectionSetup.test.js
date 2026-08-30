import { prepareDataConnectionSetup } from "./dataConnectionSetup";

const mockGetSolidDataset = jest.fn();
const mockGetThing = jest.fn();
const mockGetUrl = jest.fn();
const mockCreateClientCredential = jest.fn();
const mockLoadAccountIndex = jest.fn();
const mockReadStoredAccountToken = jest.fn();
const mockResolveClientCredentialsUrl = jest.fn();
const mockLoadCredentialToken = jest.fn();
const mockSaveCredentialToken = jest.fn();
const mockConnectionContainerExists = jest.fn();
const mockEnsureConnectionsContainer = jest.fn();
const mockRegisterSyncWorkerParticipant = jest.fn();

jest.mock("@inrupt/solid-client", () => ({
  getSolidDataset: (...args) => mockGetSolidDataset(...args),
  getThing: (...args) => mockGetThing(...args),
  getThingAll: jest.fn(() => []),
  getUrl: (...args) => mockGetUrl(...args),
}));

jest.mock("./cssAccountApi", () => ({
  createClientCredential: (...args) => mockCreateClientCredential(...args),
  getAccountIndexUrl: (value) => `${new URL(value).origin}/.account/`,
  loadAccountIndex: (...args) => mockLoadAccountIndex(...args),
  readStoredAccountToken: (...args) => mockReadStoredAccountToken(...args),
  resolveClientCredentialsUrl: (...args) =>
    mockResolveClientCredentialsUrl(...args),
}));

jest.mock("./solidCredentialToken", () => ({
  isCredentialTokenDecodeError: (error) => error?.code === "decode",
  loadCredentialToken: (...args) => mockLoadCredentialToken(...args),
  saveCredentialToken: (...args) => mockSaveCredentialToken(...args),
}));

jest.mock("./solidConnections", () => ({
  connectionContainerExists: (...args) =>
    mockConnectionContainerExists(...args),
  ensureConnectionsContainer: (...args) =>
    mockEnsureConnectionsContainer(...args),
}));

jest.mock("./syncWorkerRegistration", () => ({
  registerSyncWorkerParticipant: (...args) =>
    mockRegisterSyncWorkerParticipant(...args),
  resolveOidcIssuer: ({ oidcIssuer, webId }) =>
    new URL(oidcIssuer || webId).origin,
}));

const WEB_ID = "https://pod.example/alice/profile/card#me";
const solidFetch = jest.fn();

describe("prepareDataConnectionSetup", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSolidDataset.mockResolvedValue({ profile: true });
    mockGetThing.mockReturnValue({ url: WEB_ID });
    mockGetUrl.mockReturnValue("https://pod.example/");
    mockConnectionContainerExists.mockResolvedValue(false);
    mockEnsureConnectionsContainer.mockResolvedValue(
      "https://pod.example/alice/connections/"
    );
    mockLoadCredentialToken.mockResolvedValue(null);
    mockReadStoredAccountToken.mockReturnValue("account-token");
    mockLoadAccountIndex.mockResolvedValue({
      authorized: true,
      controls: { account: { clientCredentials: "https://pod.example/credentials" } },
    });
    mockResolveClientCredentialsUrl.mockReturnValue(
      "https://pod.example/credentials"
    );
    mockCreateClientCredential.mockResolvedValue({
      id: "credential-id",
      secret: "credential-secret",
      resource: "https://pod.example/credentials/1",
    });
    mockSaveCredentialToken.mockResolvedValue({
      id: "credential-id",
      secret: "credential-secret",
    });
    mockRegisterSyncWorkerParticipant.mockResolvedValue({ registered: true });
  });

  test("reports missing app capabilities without provisioning them", async () => {
    const result = await prepareDataConnectionSetup({
      webId: WEB_ID,
      solidFetch,
    });

    expect(result).toEqual(
      expect.objectContaining({
        ready: false,
        connectionsReady: false,
        credentialReady: false,
        workerRegistered: false,
      })
    );
    expect(mockEnsureConnectionsContainer).not.toHaveBeenCalled();
    expect(mockCreateClientCredential).not.toHaveBeenCalled();
    expect(mockRegisterSyncWorkerParticipant).not.toHaveBeenCalled();
  });

  test("provisions the folder and credential before registering the worker", async () => {
    const result = await prepareDataConnectionSetup({
      webId: WEB_ID,
      solidFetch,
      provision: true,
    });

    expect(result).toEqual(
      expect.objectContaining({
        ready: true,
        connectionsReady: true,
        credentialReady: true,
        workerRegistered: true,
        error: "",
      })
    );
    expect(mockEnsureConnectionsContainer).toHaveBeenCalledWith(
      WEB_ID,
      solidFetch
    );
    expect(mockSaveCredentialToken).toHaveBeenCalledWith(
      WEB_ID,
      solidFetch,
      expect.objectContaining({
        name: "solid-dataspace",
        id: "credential-id",
        secret: "credential-secret",
      })
    );
    expect(mockRegisterSyncWorkerParticipant).toHaveBeenCalledWith(
      expect.objectContaining({
        webId: WEB_ID,
        credentialToken: expect.objectContaining({ id: "credential-id" }),
        solidFetch,
      })
    );
  });

  test("keeps the app gated when worker registration is unavailable", async () => {
    mockConnectionContainerExists.mockResolvedValue(true);
    mockLoadCredentialToken.mockResolvedValue({
      id: "credential-id",
      secret: "credential-secret",
    });
    mockRegisterSyncWorkerParticipant.mockResolvedValue({
      registered: false,
      reason: "service-webid-missing",
    });

    const result = await prepareDataConnectionSetup({
      webId: WEB_ID,
      solidFetch,
    });

    expect(result.ready).toBe(false);
    expect(result.connectionsReady).toBe(true);
    expect(result.credentialReady).toBe(true);
    expect(result.workerRegistered).toBe(false);
    expect(result.error).toMatch(/service WebID is missing/i);
  });
});
