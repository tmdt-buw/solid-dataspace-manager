import React from "react";
import { render, screen } from "@testing-library/react";
import fs from "fs";
import path from "path";
import { faInbox, faUser } from "@fortawesome/free-solid-svg-icons";
import ContentLoadingState from "./ContentLoadingState";
import { I18nProvider } from "../i18n";

describe("ContentLoadingState", () => {
  test("announces one busy status line below the application heading", () => {
    const { container } = render(
      <ContentLoadingState
        title="Loading records"
        message="Reading your Solid Pod."
      />
    );

    const status = screen.getByRole("status");
    const loader = status.closest(".dataspace-content-loading");
    expect(loader?.tagName).toBe("MAIN");
    expect(loader).toHaveAttribute("aria-busy", "true");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(
      screen.getByRole("heading", { name: "Loading records", level: 1 })
    ).toBeInTheDocument();
    expect(status).toHaveTextContent("Reading your Solid Pod.");
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-label",
      "Reading your Solid Pod."
    );
    expect(container.querySelector(".dataspace-content-loading__eyebrow"))
      .not.toBeInTheDocument();
  });

  test("supports compact and frame-filling overlay contexts", () => {
    const { container, rerender } = render(
      <ContentLoadingState title="Loading" variant="compact" />
    );
    expect(container.querySelector(".dataspace-content-loading")).toHaveClass(
      "dataspace-content-loading--compact"
    );

    rerender(<ContentLoadingState title="Loading" variant="overlay" />);
    expect(container.querySelector(".dataspace-content-loading")).toHaveClass(
      "dataspace-content-loading--overlay"
    );
  });

  test("uses the icon supplied by each application or tab", () => {
    const { container, rerender } = render(
      <ContentLoadingState title="Profile Manager" icon={faUser} />
    );
    expect(container.querySelector(".dataspace-content-loading__mark .fa-user"))
      .toBeInTheDocument();

    rerender(<ContentLoadingState title="Access Requests" icon={faInbox} />);
    expect(container.querySelector(".dataspace-content-loading__mark .fa-inbox"))
      .toBeInTheDocument();
    expect(container.querySelector(".dataspace-content-loading__mark .fa-user"))
      .not.toBeInTheDocument();
  });

  test("matches the City Tours loader geometry and motion", () => {
    const css = fs.readFileSync(
      path.resolve(__dirname, "ContentLoadingState.css"),
      "utf8"
    );

    expect(css).toMatch(
      /\.dataspace-content-loading__mark\s*{[^}]*width:\s*5rem[^}]*height:\s*5rem[^}]*border-radius:\s*1\.5rem/s
    );
    expect(css).toMatch(
      /\.dataspace-content-loading__title\s*{[^}]*margin:\s*1\.25rem 0 0\.55rem[^}]*font-size:\s*clamp\(1\.8rem, 4vw, 2\.8rem\)/s
    );
    expect(css).toMatch(
      /\.dataspace-content-loading\s*{[^}]*font-family:\s*Manrope, Inter, ui-sans-serif, system-ui/s
    );
    expect(css).toMatch(
      /\.dataspace-content-loading__title\s*{[^}]*font-weight:\s*700/s
    );
    expect(css).not.toMatch(
      /\.dataspace-content-loading__title\s*{[^}]*line-height\s*:/s
    );
    expect(css).toMatch(
      /\.dataspace-content-loading__rail\s*{[^}]*width:\s*min\(18rem, 70vw\)[^}]*margin-top:\s*1\.5rem/s
    );
    expect(css).toMatch(
      /@keyframes\s+dataspace-content-loading\s*{[^}]*translateX\(-105%\)[\s\S]*translateX\(243%\)/s
    );
    expect(css).toMatch(
      /\.dataspace-content-loading--overlay\s*{[^}]*inset:\s*0[^}]*min-height:\s*0/s
    );
  });

  test("translates app loading copy without waiting for the DOM translator", () => {
    render(
      <I18nProvider language="de">
        <ContentLoadingState
          title="Profile Manager"
          message="Loading your personal profile workspace …"
        />
      </I18nProvider>
    );

    expect(screen.getByText("Profilmanager")).toBeInTheDocument();
    expect(
      screen.getByText("Dein persönlicher Profilbereich wird geladen …")
    ).toBeInTheDocument();
  });
});
