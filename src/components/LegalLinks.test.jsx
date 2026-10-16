import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { I18nProvider } from "../i18n";
import LegalLinks from "./LegalLinks";
import content from "../../legal/content.json";

test.each(["en", "de"])("opens complete legal documents without navigation and returns focus (%s)", locale => {
  const copy = content[locale];
  const href = window.location.href;
  render(<I18nProvider language={locale}><LegalLinks /></I18nProvider>);
  for (const page of ["imprint", "privacy"]) {
    const trigger = screen.getByRole("button", { name: copy[page] });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: copy[page] });
    expect(dialog).toHaveAttribute("open");
    for (const section of copy[`${page}Sections`]) {
      expect(within(dialog).getByRole("heading", { name: section.title })).toBeInTheDocument();
      for (const paragraph of section.paragraphs) expect(dialog).toHaveTextContent(paragraph);
    }
    expect(window.location.href).toBe(href);
    fireEvent(dialog, new Event("cancel", { bubbles: true, cancelable: true }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  }
});
