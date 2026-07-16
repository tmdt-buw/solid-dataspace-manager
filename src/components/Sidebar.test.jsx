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
  expect(screen.queryByText("Administration")).not.toBeInTheDocument();
  expect(screen.queryByText("Statistics Dashboard")).not.toBeInTheDocument();
});

test("shows the dashboard navigation only to admins", () => {
  renderSidebar(true);
  expect(screen.getByText("Administration")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Statistics Dashboard/i })).toHaveAttribute(
    "href",
    "/statistics"
  );
});
