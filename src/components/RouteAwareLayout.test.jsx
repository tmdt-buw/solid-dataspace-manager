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
    document.documentElement.classList.remove("solid-tours-route");
    document.body.classList.remove("solid-tours-route");
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
});
