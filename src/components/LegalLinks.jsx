import React, { useState } from "react";
import LegalModal from "./LegalModal";
import { useI18n } from "../i18n";
import "./LegalLinks.css";

const labels = {
  de: {
    imprint: "Impressum",
    privacy: "Datenschutzerklärung",
    navigation: "Rechtliche Informationen",
  },
  en: {
    imprint: "Legal notice",
    privacy: "Privacy notice",
    navigation: "Legal information",
  },
};

export default function LegalLinks() {
  const { language } = useI18n();
  const [page, setPage] = useState(null);
  const locale = language === "de" ? "de" : "en";
  const copy = labels[locale];
  return (
    <><nav className="legal-links" aria-label={copy.navigation} lang={locale} translate="no" data-i18n-skip>
      {["imprint", "privacy"].map((page) => (
        <button key={page} type="button" aria-haspopup="dialog" onClick={() => setPage(page)}>
          {copy[page]}
        </button>
      ))}
    </nav>
      {page && <LegalModal page={page} locale={locale} onClose={() => setPage(null)} />}
    </>
  );
}
