import React from "react";
import { render, waitFor } from "@testing-library/react";
import RouteAwareLayout from "./RouteAwareLayout";

let mockPathname = "/";

jest.mock(
  "react-router-dom",
  () => ({
    useLocation: () => ({ pathname: mockPathname }),
  }),
  { virtual: true }
);

describe("RouteAwareLayout", () => {
  afterEach(() => {
    mockPathname = "/";
    document.documentElement.classList.remove("dataspace-shell-active");
    document.body.classList.remove("dataspace-shell-active");
    document.documentElement.classList.remove("solid-tours-route");
    document.body.classList.remove("solid-tours-route");
    document.documentElement.classList.remove("catalog-route");
    document.body.classList.remove("catalog-route");
    document.documentElement.classList.remove("health-questionnaire-route");
    document.body.classList.remove("health-questionnaire-route");
  });

  test("clips only the Solid Tours document and cleans up after SPA navigation", async () => {
    mockPathname = "/web/solid-tours";
    const { container, rerender, unmount } = render(
      <RouteAwareLayout className="layout layout--sidebar-collapsed">
        Tours
      </RouteAwareLayout>
    );

    const layout = container.firstChild;

    expect(layout).toHaveClass("layout", "layout--sidebar-collapsed", "layout--solid-tours");
    await waitFor(() => {
      expect(document.documentElement).toHaveClass("solid-tours-route");
      expect(document.body).toHaveClass("solid-tours-route");
    });

    mockPathname = "/profile";
    rerender(<RouteAwareLayout className="layout">Profile</RouteAwareLayout>);

    await waitFor(() => {
      expect(container.firstChild).not.toHaveClass("layout--solid-tours");
      expect(document.documentElement).not.toHaveClass("solid-tours-route");
      expect(document.body).not.toHaveClass("solid-tours-route");
    });

    unmount();
    expect(document.documentElement).not.toHaveClass("solid-tours-route");
    expect(document.body).not.toHaveClass("solid-tours-route");
  });

  test("does not alter the document on another route", () => {
    mockPathname = "/profile";
    const { container } = render(
      <RouteAwareLayout className="layout">Profile</RouteAwareLayout>
    );

    expect(container.firstChild).toHaveClass("layout");
    expect(container.firstChild).not.toHaveClass("layout--solid-tours");
    expect(document.documentElement).not.toHaveClass("solid-tours-route");
    expect(document.body).not.toHaveClass("solid-tours-route");
  });

  test("lets the data manager own the scroll area inside its frame", () => {
    mockPathname = "/";
    const { container } = render(
      <RouteAwareLayout className="layout">Data Manager</RouteAwareLayout>
    );

    expect(container.firstChild).toHaveClass("layout", "layout--data-manager");
  });

  test("clips the catalog document and removes the scroll lock after navigation", async () => {
    mockPathname = "/catalog";
    const { container, rerender, unmount } = render(
      <RouteAwareLayout className="layout">Catalog</RouteAwareLayout>
    );

    expect(container.firstChild).toHaveClass("layout", "layout--catalog");
    expect(container.firstChild).not.toHaveClass("layout--solid-tours");
    await waitFor(() => {
      expect(document.documentElement).toHaveClass("catalog-route");
      expect(document.body).toHaveClass("catalog-route");
    });

    mockPathname = "/profile";
    rerender(<RouteAwareLayout className="layout">Profile</RouteAwareLayout>);

    await waitFor(() => {
      expect(container.firstChild).not.toHaveClass("layout--catalog");
      expect(document.documentElement).not.toHaveClass("catalog-route");
      expect(document.body).not.toHaveClass("catalog-route");
    });

    unmount();
    expect(document.documentElement).not.toHaveClass("catalog-route");
    expect(document.body).not.toHaveClass("catalog-route");
  });

  test("contains the health questionnaire and cleans its route class after navigation", async () => {
    mockPathname = "/web/solid-health-questionnaire";
    const { container, rerender, unmount } = render(
      <RouteAwareLayout className="layout">Questionnaire</RouteAwareLayout>
    );

    expect(container.firstChild).toHaveClass(
      "layout",
      "layout--health-questionnaire"
    );
    await waitFor(() => {
      expect(document.documentElement).toHaveClass("dataspace-shell-active");
      expect(document.body).toHaveClass("health-questionnaire-route");
    });

    mockPathname = "/profile";
    rerender(<RouteAwareLayout className="layout">Profile</RouteAwareLayout>);

    await waitFor(() => {
      expect(container.firstChild).not.toHaveClass(
        "layout--health-questionnaire"
      );
      expect(document.body).not.toHaveClass("health-questionnaire-route");
      expect(document.body).toHaveClass("dataspace-shell-active");
    });

    unmount();
    expect(document.documentElement).not.toHaveClass("dataspace-shell-active");
    expect(document.body).not.toHaveClass("dataspace-shell-active");
  });
});
