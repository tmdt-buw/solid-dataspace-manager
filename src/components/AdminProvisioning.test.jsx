import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AdminProvisioning, AdminPlatform } from "./AdminProvisioning";
import { I18nProvider } from "../i18n";
import { adminRequest, awaitAdminJob } from "../adminApi";
jest.mock("../adminApi", () => ({
  adminRequest: jest.fn(),
  awaitAdminJob: jest.fn(async (r) => r),
}));
beforeEach(() => {
  jest.clearAllMocks();
  awaitAdminJob.mockImplementation(async (r) => r);
});
const props = {
  profiles: [{ id: "test", label: "Test" }],
  registries: [{ id: "test", url: "https://pod.example/registry" }],
  webId: "https://pod.example/admin#me",
  onCreated: jest.fn(),
  onClose: jest.fn(),
};
test("creation uses explicit preview and activation, and never requests existing workspace data", async () => {
  adminRequest
    .mockResolvedValueOnce({ id: "preview", profileId: "new-project" })
    .mockResolvedValueOnce({ status: "applied", profileId: "new-project" });
  render(
    <I18nProvider language="en">
      <AdminProvisioning {...props} />
    </I18nProvider>,
  );
  for (const [label, value] of [
    ["Profile identifier", "new-project"],
    ["Project name", "New project"],
    [
      "Domains, one per line; primary address first",
      "new.example.org\nalias.example.org",
    ],
  ])
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  expect(
    screen.getByLabelText("Create a separate Node-RED workspace"),
  ).not.toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "Check new profile" }));
  await screen.findByRole("button", { name: "Create and activate profile" });
  expect(adminRequest).toHaveBeenCalledTimes(1);
  expect(adminRequest).toHaveBeenCalledWith(
    "/profiles/preview",
    expect.objectContaining({
      domains: ["new.example.org", "alias.example.org"],
      adminWebIds: [props.webId],
      workspaces: { "node-red": false, plasma: false },
    }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Create and activate profile" }),
  );
  await waitFor(() =>
    expect(props.onCreated).toHaveBeenCalledWith("new-project"),
  );
  expect(adminRequest).toHaveBeenLastCalledWith("/profiles/new-project/apply", {
    previewId: "preview",
  });
});
test("editing after preview requires a fresh check", async () => {
  adminRequest.mockResolvedValue({ id: "preview", profileId: "new-project" });
  render(
    <I18nProvider language="en">
      <AdminProvisioning {...props} />
    </I18nProvider>,
  );
  for (const [label, value] of [
    ["Profile identifier", "new-project"],
    ["Project name", "New project"],
    ["Domains, one per line; primary address first", "new.example.org"],
  ])
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Check new profile" }));
  await screen.findByRole("button", { name: "Create and activate profile" });
  fireEvent.change(screen.getByLabelText("Project name"), {
    target: { value: "Changed" },
  });
  expect(
    screen.getByRole("button", { name: "Check new profile" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Create and activate profile" }),
  ).not.toBeInTheDocument();
});
test("server settings wait for activation job before announcing success", async () => {
  const onSaved = jest.fn();
  let complete;
  adminRequest
    .mockResolvedValueOnce({
      id: "preview",
      diff: [
        {
          path: "runtime.catalogCacheSeconds",
          label: "Catalog cache refresh (seconds)",
          before: 300,
          after: 301,
        },
      ],
    })
    .mockResolvedValueOnce({ status: "running", jobId: "job" });
  awaitAdminJob.mockImplementationOnce(
    () =>
      new Promise((r) => {
        complete = r;
      }),
  );
  render(
    <I18nProvider language="en">
      <AdminPlatform
        profileId="test"
        configuration={{
          revision: "p1",
          runtime: {
            syncTickSeconds: 600,
            catalogCacheSeconds: 300,
            monitoringCacheSeconds: 3600,
            indexIntervalSeconds: 300,
          },
        }}
        onSaved={onSaved}
      />
    </I18nProvider>,
  );
  fireEvent.change(screen.getByLabelText("Catalog cache refresh (seconds)"), {
    target: { value: "301" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: /Review server settings/ }),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: /Activate server settings/ }),
  );
  await waitFor(() => expect(complete).toBeDefined());
  expect(onSaved).not.toHaveBeenCalled();
  complete({ status: "applied", message: "Applied" });
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith("Applied"));
});
