import React, { useEffect, useState } from "react";
import session from "../solidSession";
import {
  getSolidDataset,
  getContainedResourceUrlAll,
  getThing,
  getThingAll,
  getUrl,
  deleteFile,
} from "@inrupt/solid-client";
import { LDP } from "@inrupt/vocab-common-rdf";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBell,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";
import AccessConfirmDialog from "./AccessConfirmDialog";
import { AccessInboxHeader, AccessStatus, AccessEmptyState, AccessInboxSource, AccessPagination } from "./AccessInboxUi";
import ContentLoadingState from "./ContentLoadingState";
import { getSyncWorkerConfig } from "../config/runtimeConfig";
import {
  ENVIRONMENTAL_CONSENT,
  ENVIRONMENTAL_REQUEST,
  filterPreviousScenarioRuns,
  isTrustedEnvironmentalRequest,
  parseAccessDecisionThing,
} from "../accessRequestModel";
import { useI18n } from "../i18n";
import "./Notifications.css";

const LAST_SEEN_DECISIONS_KEY = "sdm-last-seen-decisions";
const CLOSED_DECISIONS = new Set(["revoked", "denied", "expired", "archived"]);

const getDisplayDecision = (decision) => {
  if (decision === "approved") return "Approved";
  if (decision === "denied") return "Denied";
  if (decision === "revoked") return "Revoked";
  if (decision === "expired") return "Expired";
  if (decision === "archived") return "Archived";
  return decision || "Unknown";
};

const noCacheFetch = (input, init = {}) =>
  session.fetch(input, {
    ...init,
    cache: "no-store",
    headers: { ...(init.headers || {}), "Cache-Control": "no-cache" },
  });

const formatDateTime = (value, language) => {
  if (!value) return "N/A";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const locale = language === "de" ? "de-DE" : "en-US";
  return date.toLocaleString(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getPodRoot = (webId) => {
  if (!webId) return "";
  try {
    const url = new URL(webId);
    const profileIndex = url.pathname.indexOf("/profile/");
    const basePath =
      profileIndex >= 0 ? url.pathname.slice(0, profileIndex + 1) : url.pathname;
    return `${url.origin}${basePath}`;
  } catch {
    return webId;
  }
};

const getOwnerRoot = (item) => {
  const url = item.datasetAccessUrl || item.datasetSemanticModelUrl || item.catalogUrl || "";
  if (!url) return "";
  try {
    const parsed = new URL(url);
    const trimmed = parsed.pathname.split("/").filter(Boolean);
    const rootPath = trimmed.length ? `/${trimmed[0]}/` : "/";
    return `${parsed.origin}${rootPath}`;
  } catch {
    return "";
  }
};

const getProviderRoot = (item, webId) => {
  const selfRoot = getPodRoot(webId);
  const ownerRoot = getOwnerRoot(item);
  if (ownerRoot && ownerRoot !== selfRoot) return ownerRoot;
  return ownerRoot || "unknown pod";
};

const DecisionInbox = ({ webId }) => {
  const { language, t } = useI18n();
  const [inboxUrl, setInboxUrl] = useState("");
  const [decisions, setDecisions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hideClosed, setHideClosed] = useState(true);
  const [showPreviousRuns, setShowPreviousRuns] = useState(false);
  const [page, setPage] = useState(1);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState("");
  const [confirmTitle, setConfirmTitle] = useState("");
  const [confirmAction, setConfirmAction] = useState("");
  const [confirmTargetId, setConfirmTargetId] = useState("");
  const pageSize = 5;
  const serviceWebId = getSyncWorkerConfig().serviceWebId;

  const resolveInboxUrl = async () => {
    const profileDataset = await getSolidDataset(webId, { fetch: noCacheFetch });
    const profile = getThing(profileDataset, webId);
    return profile ? getUrl(profile, LDP.inbox) : null;
  };

  const loadDecisionThing = async (url) => {
    const dataset = await getSolidDataset(url, { fetch: noCacheFetch });
    const thing = getThing(dataset, url) || getThingAll(dataset)[0];
    return { dataset, thing };
  };

  const buildDecisionKey = (item) =>
    item.requestId ||
    (item.scenarioRunId
      ? `${item.applicationId || "scenario"}:${item.scenarioRunId}:${
          item.datasetIdentifier || "dataset"
        }`
      : "") ||
    item.datasetIdentifier ||
    item.datasetAccessUrl ||
    item.datasetSemanticModelUrl ||
    item.catalogUrl ||
    item.id;

  const getDecisionTime = (item) =>
    Date.parse(item.decidedAt || item.createdAt) || item.urlTime || 0;

  const loadDecisions = async () => {
    setLoading(true);
    setError("");
    try {
      const inbox = await resolveInboxUrl();
      if (!inbox) {
        setInboxUrl("");
        setDecisions([]);
        setError("No Solid inbox found for this profile.");
        return;
      }
      setInboxUrl(inbox);

      const inboxDataset = await getSolidDataset(inbox, { fetch: noCacheFetch });
      const resourceUrls = getContainedResourceUrlAll(inboxDataset);
      const rawItems = await Promise.all(
        resourceUrls.map(async (url) => {
          try {
            const { thing } = await loadDecisionThing(url);
            return parseAccessDecisionThing(url, thing);
          } catch (err) {
            console.warn("Failed to parse decision:", url, err);
            return null;
          }
        })
      );

      const filtered = rawItems.filter(Boolean);
      const latestByKey = new Map();
      filtered.forEach((item) => {
        const key = buildDecisionKey(item);
        const existing = latestByKey.get(key);
        if (!existing || getDecisionTime(item) > getDecisionTime(existing)) {
          latestByKey.set(key, item);
        }
      });
      const latest = Array.from(latestByKey.values());
      latest.sort((a, b) => getDecisionTime(b) - getDecisionTime(a));

      setDecisions(latest);
      localStorage.setItem(LAST_SEEN_DECISIONS_KEY, new Date().toISOString());
    } catch (err) {
      console.error("Failed to load decisions:", err);
      setError("Failed to load access decisions.");
    } finally {
      setLoading(false);
    }
  };

  const openDeleteDecisionConfirm = (item) => {
    if (!item?.id) return;
    setConfirmTitle("Delete Decision");
    setConfirmMessage("Delete this decision?");
    setConfirmAction("deleteOne");
    setConfirmTargetId(item.id);
    setConfirmOpen(true);
  };

  const deleteDecision = async (id) => {
    if (!id) return;
    await deleteFile(id, { fetch: noCacheFetch });
    await loadDecisions();
  };

  const handleConfirm = async () => {
    if (confirmAction === "deleteOne") {
      await deleteDecision(confirmTargetId);
    }
    setConfirmOpen(false);
    setConfirmAction("");
    setConfirmTargetId("");
  };

  useEffect(() => {
    if (!webId) return;
    loadDecisions();
  }, [webId]);

  const currentRunDecisions = filterPreviousScenarioRuns(decisions, showPreviousRuns);
  const filteredDecisions = currentRunDecisions.filter((item) =>
    hideClosed ? !CLOSED_DECISIONS.has(item.decision) : true
  );
  const totalPages = Math.max(1, Math.ceil(filteredDecisions.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedDecisions = filteredDecisions.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize
  );

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  return (
    <section className="notifications access-inbox">
      <AccessInboxHeader
        icon={faBell}
        title="Access Decisions"
        description="Decisions on your access requests."
        loading={loading}
        onRefresh={loadDecisions}
      />
      <div className="notifications-filters" role="group" aria-label={t("Filter decisions")}>
        <label className="notifications-toggle">
          <input
            type="checkbox"
            checked={hideClosed}
            onChange={(e) => {
              setHideClosed(e.target.checked);
              setPage(1);
            }}
          />
          <span>{t("Hide closed")}</span>
        </label>
        <label className="notifications-toggle">
          <input
            type="checkbox"
            checked={showPreviousRuns}
            onChange={(e) => {
              setShowPreviousRuns(e.target.checked);
              setPage(1);
            }}
          />
          <span>{t("Show previous scenario runs")}</span>
        </label>
        <span className="notifications-count" aria-live="polite">
          {t(`Showing ${filteredDecisions.length} decision(s)`)}
        </span>
      </div>

      {error && <div className="notifications-error" role="alert">{t(error)}</div>}

      {loading ? (
        <ContentLoadingState
          title={t("Access Decisions")}
          message={t("Loading your personal access decisions workspace …")}
          appId="decisions"
          variant="compact"
        />
      ) : filteredDecisions.length === 0 ? (
        !error && <AccessEmptyState title="No access decisions found." />
      ) : (
        <div className="notifications-list">
          {pagedDecisions.map((item) => {
            const trustedEnvironmental = isTrustedEnvironmentalRequest(
              item,
              serviceWebId
            );
            return (
              <article className="notification-card" data-status={item.decision} key={item.id}>
                <header className="notification-head">
                  <div className="notification-heading">
                    <h2 className="notification-title" translate="no">
                      {item.datasetTitle || t("Untitled dataset")}
                    </h2>
                    <p className="notification-subtitle">
                      {t("ID:")} <span translate="no">{item.datasetIdentifier || "N/A"}</span>
                    </p>
                  </div>
                  <div className="notification-actions-inline">
                    <AccessStatus status={item.decision || "unknown"} label={getDisplayDecision(item.decision)} />
                    <button
                      className="access-icon-button access-icon-button--danger"
                      type="button"
                      onClick={() => openDeleteDecisionConfirm(item)}
                      title={t("Delete decision")}
                      aria-label={t("Delete decision")}
                    >
                      <FontAwesomeIcon icon={faTrash} aria-hidden="true" />
                    </button>
                  </div>
                </header>

                <dl className="notification-meta">
                  {trustedEnvironmental && (
                    <div><dt>{t("Application:")}</dt><dd>{t(ENVIRONMENTAL_REQUEST.displayName)}</dd></div>
                  )}
                  <div><dt>{t("Decided:")}</dt><dd>{formatDateTime(item.decidedAt || item.createdAt, language)}</dd></div>
                  <div><dt>{t("Expires:")}</dt><dd>{formatDateTime(item.expiresAt, language)}</dd></div>
                  <div><dt>{t("Provider:")}</dt><dd translate="no">{getProviderRoot(item, webId)}</dd></div>
                  {trustedEnvironmental && (
                    <>
                      <div className="notification-meta__wide"><dt>{t("Purpose:")}</dt><dd>{t(ENVIRONMENTAL_CONSENT.purpose)}</dd></div>
                      <div><dt>{t("Access:")}</dt><dd>{t(ENVIRONMENTAL_CONSENT.access)}</dd></div>
                    </>
                  )}
                </dl>

                {item.decisionComment && (
                  <div className="notification-message">
                    <strong>{t("Comment:")}</strong><p translate="no">{item.decisionComment}</p>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
      {!loading && filteredDecisions.length > pageSize && (
        <AccessPagination
          page={safePage}
          totalPages={totalPages}
          onPrevious={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
        />
      )}
      <AccessInboxSource url={inboxUrl} />
      <AccessConfirmDialog
        show={confirmOpen}
        title={confirmTitle}
        message={confirmMessage}
        confirmLabel="Delete"
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleConfirm}
      />
    </section>
  );
};

export default DecisionInbox;
