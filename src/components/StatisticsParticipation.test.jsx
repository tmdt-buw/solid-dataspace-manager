import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import StatisticsParticipation from "./StatisticsParticipation";

const mockSaveStatisticsConsent = jest.fn();
const mockRevokeStatisticsConsent = jest.fn();
const mockRevokeStatisticsActivityAccess = jest.fn();

jest.mock("../statisticsConsent", () => ({
  saveStatisticsConsent: (...args) => mockSaveStatisticsConsent(...args),
  revokeStatisticsConsent: (...args) => mockRevokeStatisticsConsent(...args),
}));

jest.mock("../statisticsActivity", () => ({
  revokeStatisticsActivityAccess: (...args) =>
    mockRevokeStatisticsActivityAccess(...args),
}));

const WEB_ID = "https://pod.example/alice/profile/card#me";
const solidFetch = jest.fn();
const config = {
  enabled: true,
  workerWebId: "https://pod.example/worker/profile/card#me",
  activityResourcePath: "statistics/activity/activity.ttl",
};

function renderParticipation(props = {}) {
  const onConsentChange = jest.fn();
  render(
    <StatisticsParticipation
      webId={WEB_ID}
      solidFetch={solidFetch}
      config={config}
      consentGranted={false}
      onConsentChange={onConsentChange}
      {...props}
    />
  );
  return { onConsentChange };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSaveStatisticsConsent.mockResolvedValue(true);
  mockRevokeStatisticsConsent.mockResolvedValue(false);
  mockRevokeStatisticsActivityAccess.mockResolvedValue({ revoked: true });
});

test("does not write anything until the user checks and confirms the opt-in", async () => {
  const { onConsentChange } = renderParticipation();

  const enableButton = screen.getByRole("button", {
    name: "Enable usage statistics",
  });
  expect(enableButton).toBeDisabled();
  expect(mockSaveStatisticsConsent).not.toHaveBeenCalled();
  expect(mockRevokeStatisticsActivityAccess).not.toHaveBeenCalled();

  fireEvent.click(
    screen.getByRole("checkbox", {
      name: /I agree that the Manager may create and update/i,
    })
  );
  fireEvent.click(enableButton);

  await waitFor(() =>
    expect(mockSaveStatisticsConsent).toHaveBeenCalledWith(WEB_ID, solidFetch)
  );
  expect(onConsentChange).toHaveBeenCalledWith(true);
  expect(await screen.findByText("Usage statistics are enabled.")).toBeInTheDocument();
});

test("requires confirmation before withdrawing and removes worker access", async () => {
  const { onConsentChange } = renderParticipation({ consentGranted: true });

  fireEvent.click(screen.getByRole("button", { name: "Withdraw consent" }));
  expect(
    screen.getByRole("dialog", { name: "Withdraw usage statistics consent?" })
  ).toBeInTheDocument();
  expect(mockRevokeStatisticsConsent).not.toHaveBeenCalled();

  fireEvent.click(
    screen.getByRole("dialog").querySelector(
      ".statistics-consent-button--danger"
    )
  );

  await waitFor(() =>
    expect(mockRevokeStatisticsConsent).toHaveBeenCalledWith(WEB_ID, solidFetch)
  );
  expect(onConsentChange).toHaveBeenCalledWith(false);
  expect(mockRevokeStatisticsActivityAccess).toHaveBeenCalledWith({
    webId: WEB_ID,
    fetch: solidFetch,
    config,
  });
  expect(
    await screen.findByText("Usage statistics consent was withdrawn.")
  ).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("keeps participation disabled and offers an ACL cleanup retry after a partial withdrawal", async () => {
  mockRevokeStatisticsActivityAccess
    .mockRejectedValueOnce(new Error("ACL unavailable"))
    .mockResolvedValueOnce({ revoked: true });
  const { onConsentChange } = renderParticipation({ consentGranted: true });

  fireEvent.click(screen.getByRole("button", { name: "Withdraw consent" }));
  fireEvent.click(
    screen.getByRole("dialog").querySelector(
      ".statistics-consent-button--danger"
    )
  );

  expect(
    await screen.findByText(/Consent was withdrawn, but the statistics worker access/i)
  ).toBeInTheDocument();
  expect(onConsentChange).toHaveBeenCalledWith(false);

  fireEvent.click(screen.getByRole("button", { name: "Retry access removal" }));
  expect(
    await screen.findByText("Statistics worker access was removed.")
  ).toBeInTheDocument();
  expect(mockRevokeStatisticsActivityAccess).toHaveBeenCalledTimes(2);
});

test("shows a disabled state without offering an opt-in write", () => {
  renderParticipation({ config: { ...config, enabled: false } });

  expect(
    screen.getByText("Statistics are disabled in the runtime configuration.")
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Enable usage statistics" })
  ).not.toBeInTheDocument();
  expect(mockSaveStatisticsConsent).not.toHaveBeenCalled();
});

test("still allows an existing consent to be withdrawn when statistics are disabled", async () => {
  const { onConsentChange } = renderParticipation({
    config: { ...config, enabled: false },
    consentGranted: true,
  });

  fireEvent.click(screen.getByRole("button", { name: "Withdraw consent" }));
  fireEvent.click(
    screen.getByRole("dialog").querySelector(
      ".statistics-consent-button--danger"
    )
  );

  await waitFor(() => expect(onConsentChange).toHaveBeenCalledWith(false));
  expect(mockRevokeStatisticsActivityAccess).toHaveBeenCalled();
});

test("fails closed when the statistics worker identity is missing", () => {
  renderParticipation({ config: { ...config, workerWebId: "" } });

  expect(
    screen.getByText("Statistics worker WebID is not configured.")
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Enable usage statistics" })
  ).not.toBeInTheDocument();
  expect(mockSaveStatisticsConsent).not.toHaveBeenCalled();
});
