import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nProvider } from "../i18n";
import Sidebar from "./Sidebar";
import ContentLoadingState from "./ContentLoadingState";
import ExternalHost from "./ExternalHost";
import * as runtimeConfig from "../config/runtimeConfig";

jest.mock(
  "react-router-dom",
  () => ({
    Link: ({ children, to, ...props }) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
    useLocation: () => ({ pathname: "/" }),
    useParams: () => ({ slug: "environmental-monitoring" }),
    useNavigate: () => jest.fn(),
  }),
  { virtual: true }
);

afterEach(() => jest.restoreAllMocks());

test("translates navigation and toggles the mobile menu explicitly", () => {
  render(<I18nProvider language="de"><Sidebar webId="" /></I18nProvider>);
  expect(screen.getByRole("link", { name: "Zugriffsanfragen" })).toHaveAttribute("href", "/notifications");
  const toggle = screen.getByRole("button", { name: "Navigation öffnen" });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(toggle);
  expect(screen.getByRole("button", { name: "Navigation schließen" })).toHaveAttribute("aria-expanded", "true");
});

test.each([
  ["solid-data-manager", "Solid Data Manager", "folder"],
  ["transactions", "Transaction History", "chart-line"],
  ["notifications", "Access Requests", "inbox"],
  ["decisions", "Access Decisions", "bell"],
  ["profile", "Profile Manager", "user"],
  ["info", "Information", "info"],
  ["catalog", "Semantic Data Catalog", "book-open"],
  ["plasma", "PLASMA", "hexagon-nodes"],
  ["node-red", "Node-RED", "diagram-project"],
  ["data-connection", "Data Connection", "link"],
  ["statistics", "Statistics Dashboard", "chart-line"],
  ["pod-provider", "Solid Pod Provider", "server"],
  ["environmental-monitoring", "Environmental Monitoring", "temperature-high"],
  ["solid-health-app", "Health App", "heart-pulse"],
  ["city-tours", "City Tours", "route"],
  ["solid-health-questionnaire", "Health Questionnaire", "clipboard-check"],
])("uses the sidebar icon for the %s loading screen", (appId, title, iconName) => {
  const { container } = render(
    <>
      <Sidebar webId="" statisticsAdmin />
      <ContentLoadingState appId={appId} title="Translated loading title" />
    </>
  );
  const sidebarIcon = screen.getByRole("link", { name: title }).querySelector("svg");
  const loadingIcon = container.querySelector(".dataspace-content-loading__mark svg");
  expect(loadingIcon).toHaveAttribute("data-icon", iconName);
  expect(loadingIcon.getAttribute("viewBox")).toBe(sidebarIcon.getAttribute("viewBox"));
  expect(loadingIcon.querySelector("path").getAttribute("d"))
    .toBe(sidebarIcon.querySelector("path").getAttribute("d"));
});

test.each(["database", "rocketchat", "unknown-icon"])(
  "honors the configured %s sidebar icon in the iframe loading screen",
  (iconKey) => {
    jest.spyOn(runtimeConfig, "getAppsBySection").mockReturnValue([{
      id: "environmental-monitoring", title: "Environmental Monitoring",
      href: "/web/environmental-monitoring", linkType: "internal", iconKey,
    }]);
    const { container } = render(<><Sidebar webId="" /><ExternalHost /></>);
    const sidebarIcon = screen.getByRole("link", { name: "Environmental Monitoring" }).querySelector("svg");
    const loadingIcon = container.querySelector(".dataspace-content-loading__mark svg");
    expect(loadingIcon.getAttribute("data-icon")).toBe(sidebarIcon.getAttribute("data-icon"));
    expect(loadingIcon.getAttribute("data-prefix")).toBe(sidebarIcon.getAttribute("data-prefix"));
    expect(loadingIcon.querySelector("path").getAttribute("d"))
      .toBe(sidebarIcon.querySelector("path").getAttribute("d"));
  }
);

function renderSidebar(statisticsAdmin) {
  return render(
    <Sidebar
      webId=""
      collapsed={false}
      onToggle={jest.fn()}
      statisticsAdmin={statisticsAdmin}
    />
  );
}

test("hides the administration section from non-admins", () => {
  renderSidebar(false);
  const nodeRedLink = screen.getByRole("link", { name: /Node-RED/i });
  expect(nodeRedLink).toHaveAttribute("href", "/web/node-red");
  expect(
    nodeRedLink.querySelector('[data-icon="diagram-project"]')
  ).toBeInTheDocument();
  expect(nodeRedLink.querySelector('[data-icon="database"]')).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: /City Tours/i })).toHaveAttribute(
    "href",
    "/web/city-tours"
  );
  const healthAppLink = screen.getByRole("link", { name: /^Health App$/i });
  expect(healthAppLink.querySelector('[data-icon="heart-pulse"]')).toBeInTheDocument();
  const questionnaireLink = screen.getByRole("link", {
    name: /Health Questionnaire/i,
  });
  expect(questionnaireLink).toHaveAttribute("href", "/web/solid-health-questionnaire");
  expect(
    questionnaireLink.querySelector('[data-icon="clipboard-check"]')
  ).toBeInTheDocument();
  expect(
    questionnaireLink.querySelector('[data-icon="heart-pulse"]')
  ).not.toBeInTheDocument();
  expect(screen.queryByText("Administration")).not.toBeInTheDocument();
  expect(screen.queryByText("Statistics Dashboard")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: /^Usage Statistics$/i })
  ).not.toBeInTheDocument();
});

test("shows the dashboard navigation only to admins", () => {
  renderSidebar(true);
  expect(screen.getByText("Administration")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Statistics Dashboard/i })).toHaveAttribute(
    "href",
    "/statistics"
  );
});
