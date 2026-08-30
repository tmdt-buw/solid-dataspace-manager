import React, { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChartLine,
  faCheck,
  faCircleInfo,
  faShieldHalved,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import {
  revokeStatisticsConsent,
  saveStatisticsConsent,
} from "../statisticsConsent";
import { revokeStatisticsActivityAccess } from "../statisticsActivity";
import { useI18n } from "../i18n";
import "./StatisticsParticipation.css";

function WithdrawalDialog({ busy, onCancel, onConfirm }) {
  const { t } = useI18n();
  const confirmRef = useRef(null);

  useEffect(() => {
    confirmRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busy, onCancel]);

  return (
    <div className="statistics-consent-modal" role="presentation">
      <div
        className="statistics-consent-modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="statistics-withdraw-title"
        aria-describedby="statistics-withdraw-description"
      >
        <div className="statistics-consent-modal__header">
          <div>
            <span className="statistics-consent-modal__eyebrow">
              {t("Usage statistics")}
            </span>
            <h2 id="statistics-withdraw-title">
              {t("Withdraw usage statistics consent?")}
            </h2>
          </div>
          <button
            type="button"
            className="statistics-consent-modal__close"
            onClick={onCancel}
            disabled={busy}
            aria-label={t("Close")}
            title={t("Close")}
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>
        <p id="statistics-withdraw-description">
          {t(
            "Future heartbeat updates will stop and the statistics worker's access to your activity file will be removed. The private file remains in your Solid Pod."
          )}
        </p>
        <div className="statistics-consent-modal__actions">
          <button
            type="button"
            className="statistics-consent-button statistics-consent-button--secondary"
            onClick={onCancel}
            disabled={busy}
          >
            {t("Cancel")}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className="statistics-consent-button statistics-consent-button--danger"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? t("Withdrawing...") : t("Withdraw consent")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function StatisticsParticipation({
  webId,
  solidFetch,
  config,
  consentGranted,
  onConsentChange,
  showHeader = true,
}) {
  const { t } = useI18n();
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [withdrawalOpen, setWithdrawalOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [cleanupRequired, setCleanupRequired] = useState(false);
  const [locallyRevoked, setLocallyRevoked] = useState(false);
  const withdrawButtonRef = useRef(null);
  const participationEnabled = consentGranted && !locallyRevoked;
  const setupAvailable = Boolean(config?.enabled && config?.workerWebId);

  const closeWithdrawal = () => {
    if (busy) return;
    setWithdrawalOpen(false);
    window.setTimeout(() => withdrawButtonRef.current?.focus(), 0);
  };

  const enableParticipation = async () => {
    if (!accepted || busy || !setupAvailable) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await saveStatisticsConsent(webId, solidFetch);
      setLocallyRevoked(false);
      onConsentChange?.(true);
      setAccepted(false);
      setCleanupRequired(false);
      setNotice("Usage statistics are enabled.");
    } catch (saveError) {
      setError(
        saveError?.message || "Usage statistics consent could not be saved."
      );
    } finally {
      setBusy(false);
    }
  };

  const removeWorkerAccess = async () => {
    await revokeStatisticsActivityAccess({
      webId,
      fetch: solidFetch,
      config,
    });
    setCleanupRequired(false);
  };

  const withdrawParticipation = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await revokeStatisticsConsent(webId, solidFetch);
      setLocallyRevoked(true);
      onConsentChange?.(false);
      setWithdrawalOpen(false);
      try {
        await removeWorkerAccess();
        setNotice("Usage statistics consent was withdrawn.");
      } catch {
        setCleanupRequired(true);
        setError(
          "Consent was withdrawn, but the statistics worker access could not be removed. Retry the access removal."
        );
      }
    } catch (saveError) {
      setError(
        saveError?.message || "Usage statistics consent could not be withdrawn."
      );
    } finally {
      setBusy(false);
    }
  };

  const retryCleanup = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await removeWorkerAccess();
      setNotice("Statistics worker access was removed.");
    } catch (cleanupError) {
      setError(
        cleanupError?.message || "Statistics worker access could not be removed."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="statistics-consent-page">
      {showHeader && (
        <header className="statistics-header toolbar--title">
          <div className="crumb">
            <FontAwesomeIcon icon={faChartLine} className="crumb-icon" />
            <div>
              <h1>{t("Usage Statistics")}</h1>
            </div>
          </div>
        </header>
      )}

      <article className="statistics-consent-card">
        <div className="statistics-consent-card__header">
          <div className="statistics-consent-card__icon" aria-hidden="true">
            <FontAwesomeIcon icon={faShieldHalved} />
          </div>
          <div>
            <span className="statistics-consent-card__eyebrow">
              {t("Statistics setup")}
            </span>
            <h2>{t("Usage statistics participation")}</h2>
            <p>
              {t(
                "Choose whether the Solid Dataspace Manager may record your monthly activity."
              )}
            </p>
          </div>
          <span
            className={`statistics-consent-status statistics-consent-status--${
              participationEnabled ? "enabled" : "disabled"
            }`}
          >
            {participationEnabled ? t("Enabled") : t("Not enabled")}
          </span>
        </div>

        <div className="statistics-consent-details">
          <div>
            <strong>{t("Stored data")}</strong>
            <span>{t("Last activity time and active calendar month")}</span>
          </div>
          <div>
            <strong>{t("Pod resource")}</strong>
            <code>{config?.activityResourcePath || "statistics/activity/activity.ttl"}</code>
          </div>
          <div>
            <strong>{t("Worker access")}</strong>
            <span>{t("Read only")}</span>
          </div>
        </div>

        <div className="statistics-consent-explanation">
          <FontAwesomeIcon icon={faCircleInfo} aria-hidden="true" />
          <p>
            {t(
              "The activity file is private in your Solid Pod. It contains no route, health, profile, or catalog content. No heartbeat is written until you explicitly agree."
            )}
          </p>
        </div>

        {notice && (
          <div className="statistics-consent-notice" role="status">
            <FontAwesomeIcon icon={faCheck} aria-hidden="true" />
            {t(notice)}
          </div>
        )}
        {error && (
          <div className="statistics-consent-error" role="alert">
            {t(error)}
          </div>
        )}

        {participationEnabled ? (
          <div className="statistics-consent-card__footer">
            <p>
              {t(
                "Your consent is stored in your WebID profile. You can withdraw it here at any time."
              )}
            </p>
            <button
              ref={withdrawButtonRef}
              type="button"
              className="statistics-consent-button statistics-consent-button--dangerGhost"
              onClick={() => {
                setError("");
                setNotice("");
                setWithdrawalOpen(true);
              }}
              disabled={busy}
            >
              {t("Withdraw consent")}
            </button>
          </div>
        ) : cleanupRequired ? (
          <div className="statistics-consent-card__footer statistics-consent-card__footer--actions">
            <span />
            <button
              type="button"
              className="statistics-consent-button statistics-consent-button--secondary"
              onClick={retryCleanup}
              disabled={busy}
            >
              {busy ? t("Removing access...") : t("Retry access removal")}
            </button>
          </div>
        ) : !config?.enabled ? (
          <p className="statistics-consent-disabled">
            {t("Statistics are disabled in the runtime configuration.")}
          </p>
        ) : !config?.workerWebId ? (
          <p className="statistics-consent-disabled">
            {t("Statistics worker WebID is not configured.")}
          </p>
        ) : (
          <div className="statistics-consent-optin">
            <label className="statistics-consent-checkbox">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(event) => setAccepted(event.target.checked)}
                disabled={busy}
              />
              <span>
                {t(
                  "I agree that the Manager may create and update this usage activity file and grant the configured statistics worker read-only access."
                )}
              </span>
            </label>
            <div className="statistics-consent-card__footer statistics-consent-card__footer--actions">
              <span />
              <button
                type="button"
                className="statistics-consent-button statistics-consent-button--primary"
                onClick={enableParticipation}
                disabled={!accepted || busy}
              >
                {busy ? t("Saving...") : t("Enable usage statistics")}
              </button>
            </div>
          </div>
        )}
      </article>

      {withdrawalOpen && (
        <WithdrawalDialog
          busy={busy}
          onCancel={closeWithdrawal}
          onConfirm={withdrawParticipation}
        />
      )}
    </section>
  );
}
