import React, { useEffect, useId, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrash, faXmark } from "@fortawesome/free-solid-svg-icons";
import { useI18n } from "../i18n";

export default function AccessConfirmDialog({
  show, title, message, children, confirmLabel = "Delete", onClose, onConfirm,
}) {
  const { t } = useI18n();
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (show && !dialog.open) {
      dialog.showModal();
      cancelRef.current?.focus();
    }
    if (!show && dialog.open) dialog.close();
  }, [show]);

  useEffect(() => {
    const dialog = dialogRef.current;
    return () => { if (dialog.open) dialog.close(); };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="access-confirm"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const buttons = event.currentTarget.querySelectorAll("button:not(:disabled)");
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
    >
      <div className="access-confirm__header">
        <span className="access-confirm__icon" aria-hidden="true"><FontAwesomeIcon icon={faTrash} /></span>
        <h2 id={titleId}>{t(title)}</h2>
        <button className="access-icon-button" type="button" onClick={onClose} aria-label={t("Close")}>
          <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
        </button>
      </div>
      <div className="access-confirm__body" id={descriptionId}>
        {message && <p>{t(message)}</p>}
        {children}
      </div>
      <div className="access-confirm__footer">
        <button ref={cancelRef} className="access-button" type="button" onClick={onClose}>{t("Cancel")}</button>
        <button className="access-button access-button--danger" type="button" onClick={onConfirm}>
          <FontAwesomeIcon icon={faTrash} aria-hidden="true" /> {t(confirmLabel)}
        </button>
      </div>
    </dialog>
  );
}
