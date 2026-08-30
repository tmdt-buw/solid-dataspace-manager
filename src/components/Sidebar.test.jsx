import React from "react";
import { render, screen } from "@testing-library/react";
import Sidebar from "./Sidebar";

jest.mock(
  "react-router-dom",
  () => ({
    Link: ({ children, to, ...props }) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
    useLocation: () => ({ pathname: "/" }),
  }),
  { virtual: true }
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
  expect(screen.getByRole("link", { name: /Solid Tours/i })).toHaveAttribute(
    "href",
    "/web/solid-tours"
  );
  const healthAppLink = screen.getByRole("link", { name: /^Solid Health App$/i });
  expect(healthAppLink.querySelector('[data-icon="heart-pulse"]')).toBeInTheDocument();
  const questionnaireLink = screen.getByRole("link", {
    name: /Solid Health Questionnaire/i,
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
