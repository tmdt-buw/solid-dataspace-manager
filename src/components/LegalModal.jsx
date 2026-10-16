import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import content from "../legalContent.generated.json";
import "./LegalModal.css";

export default function LegalModal({ page, locale, onClose }) {
  const dialogRef = useRef(null);
  const copy = content[locale];
  const closeLabel = locale === "de" ? "Schließen" : "Close";
  useEffect(() => {
    const dialog = dialogRef.current;
    const trigger = document.activeElement;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);

  return createPortal(<dialog ref={dialogRef} className="legal-modal" aria-label={copy[page]} aria-modal="true" lang={locale} translate="no" data-i18n-skip
    onCancel={event => { event.preventDefault(); event.stopPropagation(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="legal-modal-content">
      <header className="legal-modal-header"><h2>{copy[page]}</h2>
        <button type="button" aria-label={closeLabel} onClick={onClose}>×</button>
      </header>
      <article className="legal-modal-body" tabIndex={0}>
        <p className="legal-modal-revision">{copy.updated}: <time dateTime={content.revision}>{content.revision}</time></p>
        <p>{copy.summary}</p>
        {page === "privacy" && content.privacyStatus === "draft" && <aside><h3>{copy.draftTitle}</h3><p>{copy.draftBody}</p></aside>}
        {copy[`${page}Sections`].map((section, index) => <section key={index}>
          <h3>{section.title}</h3>
          {section.paragraphs.map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph}</p>)}
          {section.links?.length > 0 && <ul>{section.links.map(link => <li key={link.url}><a href={/^(https:\/\/|mailto:)/.test(link.url) ? link.url : undefined}>{link.label}</a></li>)}</ul>}
        </section>)}
      </article>
    </div>
  </dialog>, document.body);
}
