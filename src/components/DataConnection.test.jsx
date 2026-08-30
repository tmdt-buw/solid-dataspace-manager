import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import DataConnection from "./DataConnection";

const mockPrepareDataConnectionSetup = jest.fn();
const mockLoadHomeAssistantConnections = jest.fn();
const mockLoadCustomConnections = jest.fn();
const mockSessionFetch = jest.fn();

jest.mock("../solidSession", () => ({
  __esModule: true,
  default: { fetch: (...args) => mockSessionFetch(...args) },
}));

jest.mock("../dataConnectionSetup", () => ({
  prepareDataConnectionSetup: (...args) =>
    mockPrepareDataConnectionSetup(...args),
}));

jest.mock("../solidConnections", () => ({
  deleteCustomConnection: jest.fn(),
  deleteHomeAssistantConnection: jest.fn(),
  getHomeAssistantSolidSyncDocumentUrl: jest.fn(() => ""),
  loadConnectionLastSync: jest.fn(async () => null),
  loadCustomConnections: (...args) => mockLoadCustomConnections(...args),
  loadHomeAssistantConnections: (...args) =>
    mockLoadHomeAssistantConnections(...args),
  saveCustomConnection: jest.fn(),
  saveHomeAssistantConnection: jest.fn(),
}));

jest.mock("../solidCredentialToken", () => ({
  loadCredentialToken: jest.fn(async () => ({ id: "id", secret: "secret" })),
}));

jest.mock("../solidCatalog", () => ({
  getPodRoot: () => "https://pod.example/alice/",
}));

jest.mock("../syncWorkerRegistration", () => ({
  registerSyncWorkerParticipant: jest.fn(async () => ({ registered: true })),
}));

jest.mock("../homeAssistantApi", () => ({
  loadHomeAssistantEntities: jest.fn(async () => []),
}));

const WEB_ID = "https://pod.example/alice/profile/card#me";
const missingSetup = {
  ready: false,
  connectionsReady: false,
  credentialReady: false,
  workerRegistered: false,
  workerReason: "",
  error: "",
};
const readySetup = {
  ready: true,
  connectionsReady: true,
  credentialReady: true,
  workerRegistered: true,
  workerReason: "",
  error: "",
};

describe("DataConnection app-specific setup", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadHomeAssistantConnections.mockResolvedValue([]);
    mockLoadCustomConnections.mockResolvedValue([]);
  });

  test("keeps the connection UI gated until app setup succeeds", async () => {
    mockPrepareDataConnectionSetup
      .mockResolvedValueOnce(missingSetup)
      .mockResolvedValueOnce(readySetup);

    render(<DataConnection webId={WEB_ID} />);

    expect(
      await screen.findByRole("heading", { name: "Set up Data Connection" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Add connection/ })
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Set up Data Connection" })
    );

    expect(
      await screen.findByRole("button", { name: /^Add connection/ })
    ).toBeInTheDocument();
    expect(mockPrepareDataConnectionSetup).toHaveBeenLastCalledWith({
      webId: WEB_ID,
      solidFetch: expect.any(Function),
      provision: true,
    });
  });

  test("reuses a complete setup and opens the connection UI directly", async () => {
    mockPrepareDataConnectionSetup.mockResolvedValue(readySetup);

    render(<DataConnection webId={WEB_ID} />);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /^Add connection/ })
      ).toBeInTheDocument()
    );
    expect(
      screen.queryByRole("heading", { name: "Set up Data Connection" })
    ).not.toBeInTheDocument();
    expect(mockPrepareDataConnectionSetup).toHaveBeenCalledWith({
      webId: WEB_ID,
      solidFetch: expect.any(Function),
      provision: false,
    });
  });
});
