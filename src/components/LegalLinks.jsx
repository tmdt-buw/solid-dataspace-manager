import React from "react";
import { useI18n } from "../i18n";
import "./LegalLinks.css";

const labels = {
  de: {
    imprint: "Impressum",
    privacy: "Datenschutzerklärung",
    navigation: "Rechtliche Informationen",
    newTab: "öffnet in einem neuen Tab",
  },
  en: {
    imprint: "Legal notice",
    privacy: "Privacy notice",
    navigation: "Legal information",
    newTab: "opens in a new tab",
  },
};

export default function LegalLinks() {
  const { language } = useI18n();
  const locale = language === "de" ? "de" : "en";
  const copy = labels[locale];
  return (
    <nav className="legal-links" aria-label={copy.navigation} lang={locale} translate="no" data-i18n-skip>
      {["imprint", "privacy"].map((page) => (
        <a key={page} href={`/legal/${locale}/${page}.html`} target="_blank" rel="noopener noreferrer" aria-label={`${copy[page]} (${copy.newTab})`}>
          {copy[page]}
        </a>
      ))}
    </nav>
  );
}
