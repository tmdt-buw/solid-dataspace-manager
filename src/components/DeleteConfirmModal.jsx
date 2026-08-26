import React from "react";
import { useI18n } from "../i18n";
import "./Modal.css";

const DeleteConfirmModal = ({ show, count = 0, onClose, onConfirm }) => {
  const { t } = useI18n();
  if (!show) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-header">
          <span className="modal-title">{t("Delete closed requests")}</span>
          <button className="modal-close" onClick={onClose} aria-label={t("Close")}>
            &times;
          </button>
        </div>
        <div className="modal-body">
          <p>{t(`Delete ${count} closed request(s)?`)}</p>
          <p>{t("This will permanently delete the closed requests from your inbox.")}</p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            {t("Cancel")}
          </button>
          <button className="btn btn-primary" onClick={onConfirm}>
            {t("Delete")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteConfirmModal;
