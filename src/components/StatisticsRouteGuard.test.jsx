import React from "react";
import { render, screen } from "@testing-library/react";
import StatisticsRouteGuard from "./StatisticsRouteGuard";

const ADMIN_WEBID = "https://pod.example/admin/profile/card#me";

jest.mock("../config/runtimeConfig", () => ({
  isStatisticsAdmin: (webId) => webId === ADMIN_WEBID,
}));

jest.mock(
  "react-router-dom",
  () => ({
    Navigate: ({ to }) => <div data-testid="redirect">{to}</div>,
  }),
  { virtual: true }
);

function renderGuard(webId) {
  return render(
    <StatisticsRouteGuard webId={webId}>
      <div>Secret dashboard</div>
    </StatisticsRouteGuard>
  );
}

test("renders the dashboard for an exact admin WebID", () => {
  renderGuard(ADMIN_WEBID);
  expect(screen.getByText("Secret dashboard")).toBeInTheDocument();
});

test("redirects a similar but non-matching WebID", () => {
  renderGuard(`${ADMIN_WEBID}/`);
  expect(screen.queryByText("Secret dashboard")).not.toBeInTheDocument();
  expect(screen.getByTestId("redirect")).toHaveTextContent("/");
});
