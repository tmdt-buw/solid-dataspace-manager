import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft, faArrowRight, faArrowRotateLeft, faBoxArchive,
  faCheck, faClock, faInbox, faLink, faRotateRight, faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { useI18n } from "../i18n";

export function AccessInboxHeader({ icon, title, description, loading, onRefresh }) {
  const { t } = useI18n();
  return (
    <header className="access-inbox__header">
      <div className="access-inbox__heading">
        <span className="access-inbox__mark" aria-hidden="true"><FontAwesomeIcon icon={icon} /></span>
        <div>
          <p className="access-inbox__eyebrow">{t("Access management")}</p>
          <h1>{t(title)}</h1>
          <p className="access-inbox__description">{t(description)}</p>
        </div>
      </div>
      <button className="access-button" type="button" onClick={onRefresh} disabled={loading}>
        <FontAwesomeIcon icon={faRotateRight} aria-hidden="true" />
        {t("Refresh")}
      </button>
    </header>
  );
}

const statusIcons = {
  pending: faClock,
  approved: faCheck,
  denied: faXmark,
  revoked: faArrowRotateLeft,
  expired: faClock,
  archived: faBoxArchive,
};

export function AccessStatus({ status, label }) {
  const { t } = useI18n();
  const known = Object.prototype.hasOwnProperty.call(statusIcons, status);
  return (
    <span className={`access-status access-status--${known ? status : "unknown"}`}>
      <FontAwesomeIcon icon={known ? statusIcons[status] : faInbox} aria-hidden="true" />
      {t(label)}
    </span>
  );
}

export function AccessEmptyState({ title }) {
  const { t } = useI18n();
  return (
    <div className="notifications-empty" role="status">
      <span className="notifications-empty__icon" aria-hidden="true"><FontAwesomeIcon icon={faInbox} /></span>
      <h2>{t(title)}</h2>
      <p>{t("Adjust the filters or refresh your inbox.")}</p>
    </div>
  );
}

export function AccessInboxSource({ url }) {
  if (!url) return null;
  return (
    <div className="notifications-inbox">
      <FontAwesomeIcon icon={faLink} aria-hidden="true" />
      <span>Inbox</span>
      <a href={url} translate="no">{url}</a>
    </div>
  );
}

export function AccessPagination({ page, totalPages, onPrevious, onNext }) {
  const { t } = useI18n();
  return (
    <nav className="notifications-pagination" aria-label={t("Pagination")}>
      <button className="access-button" type="button" disabled={page <= 1} onClick={onPrevious}>
        <FontAwesomeIcon icon={faArrowLeft} aria-hidden="true" /> {t("Prev")}
      </button>
      <span className="notifications-page" aria-live="polite">{t(`Page ${page} of ${totalPages}`)}</span>
      <button className="access-button" type="button" disabled={page >= totalPages} onClick={onNext}>
        {t("Next")} <FontAwesomeIcon icon={faArrowRight} aria-hidden="true" />
      </button>
    </nav>
  );
}
