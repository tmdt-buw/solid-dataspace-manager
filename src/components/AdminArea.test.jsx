import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AdminArea from "./AdminArea";
import { I18nProvider } from "../i18n";
import { adminRequest } from "../adminApi";
const mockNavigate = jest.fn();
let mockPath = "/admin/apps";
jest.mock(
  "react-router-dom",
  () => ({
    useLocation: () => ({ pathname: mockPath }),
    useNavigate: () => mockNavigate,
  }),
  { virtual: true },
);
jest.mock("../adminApi", () => ({
  adminRequest: jest.fn(),
  awaitAdminJob: async (result) => result,
}));
jest.mock("../solidSession", () => ({
  __esModule: true,
  default: { fetch: jest.fn() },
}));
jest.mock("./StatisticsDashboard", () => ({
  __esModule: true,
  default: () => <div>Bestehendes Statistik-Dashboard</div>,
}));
const webId = "https://solid-community-server.tmdt.info/admin/profile/card#me";
const profile = {
  schemaVersion: 1,
  id: "test",
  environment: "test",
  domains: ["test.example"],
  administration: { enabled: true, adminWebIds: [webId] },
  public: {
    branding: {
      projectName: "Test Instance",
      logoUrl: "/logo.png",
      logoAlt: "Logo",
      logoWidth: "95px",
      logoHeight: "auto",
    },
    apps: [
      {
        id: "catalog",
        title: "Semantic Data Catalog",
        href: "/web/catalog",
        section: "consume",
        iconKey: "catalog",
        enabled: true,
        visible: true,
        order: 10,
        linkType: "internal",
      },
    ],
    fundingLogos: [],
    fundingGrantNumber: "",
    catalog: { defaultRegistry: "https://pod.example/test" },
    providers: [],
    syncWorker: { enabled: false },
    statistics: {
      enabled: false,
      adminWebIds: [webId],
      podBaseUrl: "https://pod.example/stats/",
      eventsUrl: "https://pod.example/events/",
      workerWebId: webId,
      timezone: "Europe/Berlin",
      activityResourcePath: "statistics/activity.ttl",
    },
  },
};
const loaded = () => ({
  profile: JSON.parse(JSON.stringify(profile)),
  revision: "r1",
  canEdit: true,
  isOperator: true,
  canReadStatistics: true,
  registries: [{ id: "test", label: "Test", url: "https://pod.example/test" }],
});
const access = {
  currentProfile: "test",
  profiles: [
    { id: "test", label: "Test Instance", environment: "test", canEdit: true },
  ],
};
beforeEach(() => {
  mockPath = "/admin/apps";
  jest.clearAllMocks();
  HTMLDialogElement.prototype.showModal = jest.fn(function () {
    this.setAttribute("open", "");
  });
  adminRequest.mockImplementation(async (path) =>
    path.endsWith("/history") ? [] : loaded(),
  );
});
function show(props = {}) {
  return render(
    <I18nProvider language="de">
      <AdminArea webId={webId} access={access} {...props} />
    </I18nProvider>,
  );
}
test("shows top navigation and imported application settings", async () => {
  show();
  expect(
    await screen.findByRole("switch", { name: "Semantic Data Catalog aktiv" }),
  ).toBeChecked();
  expect(
    screen.getByRole("navigation", { name: "Admin-Bereiche" }),
  ).toBeInTheDocument();
  expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Änderungen prüfen" }),
  ).toBeDisabled();
});
test("requires preview and explicit apply before sending any mutation", async () => {
  adminRequest.mockImplementation(async (path, body) =>
    path.endsWith("/preview")
      ? {
          id: "preview",
          diff: [{ path: "public.apps", before: [], after: [] }],
          requiresDeployment: false,
        }
      : path.endsWith("/apply")
        ? { status: "applied", message: "Konfiguration gespeichert." }
        : loaded(),
  );
  show();
  fireEvent.click(
    await screen.findByRole("switch", {
      name: "Semantic Data Catalog im Menü",
    }),
  );
  expect(adminRequest).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Änderungen prüfen" }));
  await screen.findByRole("button", { name: "Übernehmen" });
  expect(adminRequest.mock.calls.some(([p]) => p.endsWith("/apply"))).toBe(
    false,
  );
  fireEvent.click(screen.getByRole("button", { name: "Übernehmen" }));
  await screen.findByText("Konfiguration gespeichert.");
  expect(adminRequest).toHaveBeenCalledWith("/profiles/test/apply", {
    previewId: "preview",
  });
});
test("does not expose editing to an unauthorized identity", () => {
  show({ access: { profiles: [] } });
  expect(screen.getByRole("alert")).toHaveTextContent("keine Admin Area");
  expect(adminRequest).not.toHaveBeenCalled();
});
test("reports revision conflicts without losing unsaved edits", async () => {
  adminRequest.mockImplementation(async (path) => {
    if (path.endsWith("/preview"))
      throw new Error("Das Profil wurde zwischenzeitlich geändert.");
    return loaded();
  });
  show();
  fireEvent.click(
    await screen.findByRole("switch", {
      name: "Semantic Data Catalog im Menü",
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Änderungen prüfen" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "zwischenzeitlich",
  );
  expect(
    screen.getByRole("switch", { name: "Semantic Data Catalog im Menü" }),
  ).not.toBeChecked();
});
test("leaves test statistics disabled and does not fetch snapshots", async () => {
  mockPath = "/admin/statistics";
  show();
  await screen.findByText(
    "Die Statistikerfassung ist in diesem Profil deaktiviert. Die bestehenden Einstellungen wurden übernommen.",
  );
  expect(
    screen.getByRole("switch", { name: "Statistikerfassung aktiv" }),
  ).toBeDisabled();
  expect(
    screen.queryByText("Bestehendes Statistik-Dashboard"),
  ).not.toBeInTheDocument();
});
test("retains the existing dashboard for an authorized statistics reader", async () => {
  mockPath = "/admin/statistics";
  adminRequest.mockResolvedValue({
    ...loaded(),
    profile: {
      ...profile,
      environment: "prod",
      public: {
        ...profile.public,
        statistics: { ...profile.public.statistics, enabled: true },
      },
    },
  });
  show();
  expect(
    await screen.findByText("Bestehendes Statistik-Dashboard"),
  ).toBeInTheDocument();
});
test("statistics-only readers cannot see configuration forms", async () => {
  mockPath = "/admin/statistics";
  adminRequest.mockResolvedValue({ ...loaded(), canEdit: false });
  show();
  await screen.findByText(
    "Die Statistikerfassung ist in diesem Profil deaktiviert. Die bestehenden Einstellungen wurden übernommen.",
  );
  expect(
    screen.queryByRole("button", { name: "Änderungen prüfen" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: "Statistik-Einstellungen" }),
  ).not.toBeInTheDocument();
});
test("activates operational changes after explicit review", async () => {
  adminRequest.mockImplementation(async (path) =>
    path.endsWith("/preview")
      ? { id: "pending", diff: [], requiresDeployment: true }
      : path.endsWith("/apply")
        ? {
            status: "applied",
            message: "Dienste geprüft und aktiviert.",
          }
        : loaded(),
  );
  show();
  fireEvent.click(
    await screen.findByRole("switch", {
      name: "Semantic Data Catalog im Menü",
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Änderungen prüfen" }));
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Aktivieren und Dienste prüfen",
    }),
  );
  await waitFor(() =>
    expect(
      screen.getByText("Dienste geprüft und aktiviert."),
    ).toBeInTheDocument(),
  );
  expect(
    screen.queryByRole("button", { name: "Oberfläche neu laden" }),
  ).toBeInTheDocument();
});

test("selects a profile from the styled list and marks the current profile", async () => {
  const secondProfile = {
    id: "stadt-wuppertal",
    label: "Stadt Wuppertal",
    environment: "prod",
    canEdit: true,
  };
  adminRequest.mockImplementation(async (path) => {
    const result = loaded();
    if (path === "/profiles/stadt-wuppertal") {
      result.profile.id = secondProfile.id;
      result.profile.public.branding.projectName = secondProfile.label;
    }
    return result;
  });
  show({
    access: { ...access, profiles: [...access.profiles, secondProfile] },
  });
  await screen.findByRole("switch", { name: "Semantic Data Catalog aktiv" });
  const selector = screen.getByRole("combobox", { name: "Profil auswählen" });
  fireEvent.mouseDown(selector);
  expect(
    screen.getByRole("option", { name: "Test Instance test" }),
  ).toHaveAttribute("aria-selected", "true");
  fireEvent.click(
    screen.getByRole("option", { name: "Stadt Wuppertal stadt-wuppertal" }),
  );
  await waitFor(() =>
    expect(selector).toHaveTextContent("Stadt Wuppertal (stadt-wuppertal)"),
  );
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  expect(
    adminRequest.mock.calls.some(
      ([path]) => path === "/profiles/stadt-wuppertal",
    ),
  ).toBe(true);
});

test("keeps unsaved settings when a profile switch from the list is cancelled", async () => {
  show({
    access: {
      ...access,
      profiles: [
        ...access.profiles,
        {
          id: "stadt-wuppertal",
          label: "Stadt Wuppertal",
          environment: "prod",
          canEdit: true,
        },
      ],
    },
  });
  const visible = await screen.findByRole("switch", {
    name: "Semantic Data Catalog im Menü",
  });
  fireEvent.click(visible);
  const selector = screen.getByRole("combobox", { name: "Profil auswählen" });
  fireEvent.mouseDown(selector);
  fireEvent.click(
    screen.getByRole("option", { name: "Stadt Wuppertal stadt-wuppertal" }),
  );
  await screen.findByRole("dialog", { name: "Profil wechseln?" });
  fireEvent.click(screen.getByRole("button", { name: "Zurück" }));
  expect(selector).toHaveTextContent("Test Instance (test)");
  expect(visible).not.toBeChecked();
  expect(
    adminRequest.mock.calls.some(
      ([path]) => path === "/profiles/stadt-wuppertal",
    ),
  ).toBe(false);
});


test("keeps keyboard focus in the profile menu under StrictMode and closes with Escape", async () => {
  render(
    <React.StrictMode>
      <I18nProvider language="de">
        <AdminArea webId={webId} access={access} />
      </I18nProvider>
    </React.StrictMode>,
  );
  await screen.findByRole("switch", { name: "Semantic Data Catalog aktiv" });
  const selector = screen.getByRole("combobox", { name: "Profil auswählen" });
  fireEvent.mouseDown(selector);
  const selected = await screen.findByRole("option", { name: "Test Instance test" });
  await waitFor(() => expect(selected).toHaveFocus());
  fireEvent.keyDown(document.activeElement, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
  expect(selector).toHaveFocus();
});
