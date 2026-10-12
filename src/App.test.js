import { render, screen } from "@testing-library/react";
import React from "react";

jest.mock("@hoelk-f/solid-data-manager/embed.css", () => ({}), {
  virtual: true,
});
jest.mock("@hoelk-f/semantic-data-catalog/embed.css", () => ({}), {
  virtual: true,
});
jest.mock("@hoelk-f/solid-health-app/embed.css", () => ({}), {
  virtual: true,
});
jest.mock("@hoelk-f/city-tours/embed.css", () => ({}), {
  virtual: true,
});
jest.mock("@hoelk-f/solid-health-questionnaire/embed.css", () => ({}), {
  virtual: true,
});

jest.mock(
  "@hoelk-f/solid-data-manager/embed",
  () => ({ DataManagerEmbed: () => null, setSession: jest.fn() }),
  { virtual: true }
);

jest.mock("./components/LoginParticleCloud", () => () => (
  <div data-testid="login-particle-cloud" />
));
jest.mock(
  "@hoelk-f/semantic-data-catalog/embed",
  () => ({ CatalogEmbed: () => null, setSession: jest.fn(), catalogVersion: "test" }),
  { virtual: true }
);
jest.mock(
  "@hoelk-f/solid-health-app/embed",
  () => ({ HealthAppEmbed: () => null, setSession: jest.fn(), healthAppVersion: "test" }),
  { virtual: true }
);
jest.mock(
  "@hoelk-f/city-tours/embed",
  () => ({ CityToursEmbed: () => null, setSession: jest.fn(), toursAppVersion: "test" }),
  { virtual: true }
);
jest.mock(
  "@hoelk-f/solid-health-questionnaire/embed",
  () => ({ SolidHealthQuestionnaireEmbed: () => null, healthQuestionnaireVersion: "test" }),
  { virtual: true }
);

jest.mock("react-router-dom", () => ({
  BrowserRouter: ({ children }) => <div>{children}</div>,
  Routes: ({ children }) => <div>{children}</div>,
  Route: () => null,
  useLocation: () => ({ pathname: "/" }),
}), { virtual: true });

import App from "./App";

test("renders login screen", () => {
  render(<App />);
  expect(screen.getAllByText(/Solid Dataspace/i).length).toBeGreaterThan(0);
  expect(screen.getByRole("link", { name: /Privacy notice|Datenschutzerkl\u00e4rung/ })).toHaveAttribute(
    "href",
    expect.stringMatching(/^\/legal\/(de|en)\/privacy\.html$/)
  );
  expect(screen.getByRole("link", { name: /Legal notice|Impressum/ })).toHaveAttribute(
    "href",
    expect.stringMatching(/^\/legal\/(de|en)\/imprint\.html$/)
  );
});
