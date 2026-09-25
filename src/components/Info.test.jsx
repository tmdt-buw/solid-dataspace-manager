import React from "react";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "../i18n";
import {
  getAppsBySection,
  getDataspaceId,
  getSyncWorkerConfig,
} from "../config/runtimeConfig";
import Info from "./Info";

jest.mock(
  "react-router-dom",
  () => ({
    Link: ({ children, to, ...props }) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
  }),
  { virtual: true }
);

jest.mock("../config/runtimeConfig", () => ({
  getAppsBySection: jest.fn(),
  getDataspaceId: jest.fn(),
  getSyncWorkerConfig: jest.fn(),
}));

const configuredApplications = [
  {
    id: "environmental-monitoring",
    title: "Environmental Monitoring",
    href: "/web/environmental-monitoring",
    iconKey: "temperature",
    linkType: "internal",
  },
  {
    id: "solid-health-app",
    title: "Health App",
    href: "/web/solid-health-app",
    iconKey: "health",
    linkType: "internal",
  },
  {
    id: "city-tours",
    title: "City Tours",
    href: "/web/city-tours",
    iconKey: "tour",
    linkType: "internal",
  },
  {
    id: "solid-health-questionnaire",
    title: "Health Questionnaire",
    href: "/web/solid-health-questionnaire",
    iconKey: "questionnaire",
    linkType: "internal",
  },
  {
    id: "solid-chatbot",
    title: "Chatbot",
    href: "/web/solid-chatbot",
    iconKey: "rocketchat",
    linkType: "internal",
  },
];

function renderInfo(language = "en") {
  return render(
    <I18nProvider language={language}>
      <Info />
    </I18nProvider>
  );
}

describe("Information page", () => {
  beforeEach(() => {
    getAppsBySection.mockReturnValue(configuredApplications);
    getDataspaceId.mockReturnValue("stadt-wuppertal");
    getSyncWorkerConfig.mockReturnValue({ enabled: true, intervalMinutes: 10 });
  });

  test("presents the current runtime and configured applications", () => {
    renderInfo();

    expect(
      screen.getByRole("heading", {
        name: "Your Solid Dataspace, at a glance.",
        level: 1,
      })
    ).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByText("stadt-wuppertal")).toBeInTheDocument();
    expect(screen.getByText("5 active")).toBeInTheDocument();
    expect(screen.getByText("10 minute cycle")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open Health Questionnaire" })
    ).toHaveAttribute("href", "/web/solid-health-questionnaire");
    expect(screen.getByRole("link", { name: "Open Chatbot" })).toHaveAttribute(
      "href",
      "/web/solid-chatbot"
    );
    expect(screen.queryByText("Urban Heat Monitoring")).not.toBeInTheDocument();
  });

  test("uses explicit German content when the Dataspace language is German", () => {
    renderInfo("de");

    expect(
      screen.getByRole("heading", {
        name: "Dein Solid Dataspace auf einen Blick.",
        level: 1,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Heute in diesem Dataspace verfügbar",
        level: 2,
      })
    ).toBeInTheDocument();
    expect(screen.getByText("5 aktiv")).toBeInTheDocument();
    expect(screen.getByText("10 Minuten-Takt")).toBeInTheDocument();
    expect(screen.getAllByText("Umweltmonitoring").length).toBeGreaterThan(0);
    expect(
      screen.queryByText("Your Solid Dataspace, at a glance.")
    ).not.toBeInTheDocument();
  });

  test("exposes structured navigation, flow and glossary semantics", () => {
    const { container } = renderInfo();

    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "On this page" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Data & privacy" })).toHaveAttribute(
      "href",
      "#info-privacy"
    );
    expect(
      screen.getByRole("heading", {
        name: "How data moves through the Dataspace",
        level: 2,
      })
    ).toBeInTheDocument();
    expect(container.querySelector("figure.info-topology")).toBeInTheDocument();
    expect(container.querySelector("dl.info-glossary")).toBeInTheDocument();
    expect(container.querySelectorAll(".info-flow__steps > li")).toHaveLength(5);
  });
});
