import React, { useEffect, useState } from "react";
import session from "../solidSession";
import {
  getSolidDataset,
  getContainedResourceUrlAll,
  getThing,
  getThingAll,
  getUrl,
  getUrlAll,
  getStringNoLocale,
  deleteFile,
  saveSolidDatasetAt,
  setStringNoLocale,
  setUrl,
  setThing,
  removeAll,
  getFileWithAcl,
  getSolidDatasetWithAcl,
  getResourceAcl,
  hasResourceAcl,
  hasAccessibleAcl,
  createAclFromFallbackAcl,
  setAgentResourceAccess,
  saveAclFor,
} from "@inrupt/solid-client";
import { DCAT, DCTERMS, LDP } from "@inrupt/vocab-common-rdf";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faInbox, faRotateRight, faCheck, faXmark } from "@fortawesome/free-solid-svg-icons";
import DeleteConfirmModal from "./DeleteConfirmModal";
import ContentLoadingState from "./ContentLoadingState";
import { getSyncWorkerConfig } from "../config/runtimeConfig";
import {
  ENVIRONMENTAL_CONSENT,
  ENVIRONMENTAL_REQUEST,
  SDM,
  buildAccessDecisionTurtle,
  filterPreviousScenarioRuns,
  getAccessTargetUrls,
  getApprovedAccess,
  isTrustedEnvironmentalRequest,
  parseAccessRequestThing,
  validateTrustedEnvironmentalRequest,
} from "../accessRequestModel";
import { useI18n } from "../i18n";
import "./Notifications.css";

const LAST_SEEN_REQUESTS_KEY = "sdm-last-seen-requests";
const CLOSED_STATUSES = new Set(["revoked", "denied", "expired", "archived"]);

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

const getDisplayStatus = (status) => {
  if (status === "approved") return "Approved";
  if (status === "denied") return "Denied";
  if (status === "revoked") return "Revoked";
  if (status === "expired") return "Expired";
  if (status === "archived") return "Archived";
  if (status === "pending") return "Pending";
  return status || "Pending";
};

const getStatusClass = (status) => {
  if (status === "approved") return "status-approved";
  if (status === "denied" || status === "revoked" || status === "expired") return "status-denied";
  return "status-pending";
};

const Notifications = ({ webId }) => {
  const { language, t } = useI18n();
  const [inboxUrl, setInboxUrl] = useState("");
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [decisionNotes, setDecisionNotes] = useState({});
  const [decisionExpiry, setDecisionExpiry] = useState({});
  const [processingId, setProcessingId] = useState("");
  const [hideClosed, setHideClosed] = useState(true);
  const [showPreviousRuns, setShowPreviousRuns] = useState(false);
  const [page, setPage] = useState(1);
  const [clearingRevoked, setClearingRevoked] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const pageSize = 5;
  const syncWorkerConfig = getSyncWorkerConfig();
  const serviceWebId = syncWorkerConfig.serviceWebId;

  const resolveInboxUrl = async () => {
    const profileDataset = await getSolidDataset(webId, { fetch: noCacheFetch });
    const profile = getThing(profileDataset, webId);
    return profile ? getUrl(profile, LDP.inbox) : null;
  };

  const resolveInboxForWebId = async (targetWebId) => {
    if (!targetWebId) return null;
    const profileDataset = await getSolidDataset(targetWebId, { fetch: noCacheFetch });
    const profile = getThing(profileDataset, targetWebId);
    return profile ? getUrl(profile, LDP.inbox) : null;
  };

  const notifyRequester = async ({ item, decision, note, expiresAt, decidedAt }) => {
    try {
      const inboxUrl = await resolveInboxForWebId(item.requesterWebId);
      if (!inboxUrl) {
        console.warn("[AccessDecision] requester inbox missing", item.requesterWebId);
        return;
      }

      const turtle = buildAccessDecisionTurtle({
        item,
        decision,
        note,
        expiresAt,
        decidedAt,
      });
      const res = await session.fetch(inboxUrl, {
        method: "POST",
        headers: {
          "Content-Type": "text/turtle",
          "Slug": `access-decision-${item.datasetIdentifier || "dataset"}-${Date.now()}`,
        },
        body: turtle,
      });
      if (!res.ok) {
        console.warn("[AccessDecision] inbox rejected", res.status);
      }
    } catch (err) {
      console.warn("[AccessDecision] notify failed", err);
    }
  };

  const loadNotificationThing = async (url) => {
    const dataset = await getSolidDataset(url, { fetch: noCacheFetch });
    const thing = getThing(dataset, url) || getThingAll(dataset)[0];
    return { dataset, thing };
  };

  const validateCatalogDistribution = async (item) => {
    if (!isTrustedEnvironmentalRequest(item, serviceWebId)) return [];
    if (!item.catalogDatasetUrl) return ["Catalog dataset reference is missing."];
    try {
      const documentUrl = item.catalogDatasetUrl.split("#")[0];
      const dataset = await getSolidDataset(documentUrl, { fetch: noCacheFetch });
      const datasetThing = getThing(dataset, item.catalogDatasetUrl);
      if (!datasetThing) return ["Catalog dataset could not be resolved."];

      const errors = [];
      const accessRights = getStringNoLocale(datasetThing, DCTERMS.accessRights) || "";
      if (accessRights.toLowerCase() !== "restricted") {
        errors.push("Catalog dataset is not marked restricted.");
      }
      const identifier = getStringNoLocale(datasetThing, DCTERMS.identifier) || "";
      if (item.datasetIdentifier && identifier !== item.datasetIdentifier) {
        errors.push("Catalog dataset identifier does not match the request.");
      }
      const distributions = getUrlAll(datasetThing, DCAT.distribution);
      if (distributions.length !== 1) {
        errors.push("Catalog dataset must contain exactly one distribution.");
      }
      const matchingDistribution = distributions
        .map((url) => getThing(dataset, url))
        .filter(Boolean)
        .find(
          (thing) =>
            (getUrl(thing, DCAT.downloadURL) || getUrl(thing, DCAT.accessURL) || "") ===
            item.datasetAccessUrl
        );
      if (!matchingDistribution) {
        errors.push("Requested resource is not the catalog dataset distribution.");
      } else {
        const mediaType = getStringNoLocale(matchingDistribution, DCAT.mediaType) || "";
        if (mediaType !== "application/geo+json") {
          errors.push("Activity distribution must use application/geo+json.");
        }
      }
      return errors;
    } catch (catalogError) {
      console.warn("Failed to validate requested catalog distribution.", catalogError);
      return ["Catalog dataset could not be verified."];
    }
  };

  const updateNotification = async (url, updates) => {
    const { dataset, thing } = await loadNotificationThing(url);
    if (!thing) return;

    let updated = thing;
    if (updates.status) {
      updated = setStringNoLocale(updated, SDM.status, updates.status);
    }
    if ("decisionComment" in updates) {
      updated = removeAll(updated, SDM.decisionComment);
      if (updates.decisionComment) {
        updated = setStringNoLocale(updated, SDM.decisionComment, updates.decisionComment);
      }
    }
    if ("expiresAt" in updates) {
      updated = removeAll(updated, SDM.expiresAt);
      if (updates.expiresAt) {
        updated = setStringNoLocale(updated, SDM.expiresAt, updates.expiresAt);
      }
    }
    if ("decidedAt" in updates) {
      updated = removeAll(updated, SDM.decidedAt);
      if (updates.decidedAt) {
        updated = setStringNoLocale(updated, SDM.decidedAt, updates.decidedAt);
      }
    }
    if ("decidedBy" in updates) {
      updated = removeAll(updated, SDM.decidedBy);
      if (updates.decidedBy) {
        updated = setUrl(updated, SDM.decidedBy, updates.decidedBy);
      }
    }

    const updatedDataset = setThing(dataset, updated);
    await saveSolidDatasetAt(url, updatedDataset, { fetch: noCacheFetch });
  };

  const getResourceAndAcl = async (url) => {
    const resource = url.endsWith("/")
      ? await getSolidDatasetWithAcl(url, { fetch: noCacheFetch })
      : await getFileWithAcl(url, { fetch: noCacheFetch });
    let resourceAcl;
    if (!hasResourceAcl(resource)) {
      if (!hasAccessibleAcl(resource)) {
        throw new Error("No access to ACL.");
      }
      resourceAcl = createAclFromFallbackAcl(resource);
    } else {
      resourceAcl = getResourceAcl(resource);
    }
    return { resource, resourceAcl };
  };

  const setAccessForResource = async (url, agentWebId, access) => {
    if (!url) return;
    const { resource, resourceAcl } = await getResourceAndAcl(url);
    const updatedAcl = setAgentResourceAccess(resourceAcl, agentWebId, access);
    await saveAclFor(resource, updatedAcl, { fetch: noCacheFetch });
  };

  const expireIfNeeded = async (item) => {
    if (item.status !== "approved" || !item.expiresAt) return item;
    const expiryDate = new Date(item.expiresAt);
    if (Number.isNaN(expiryDate.getTime())) return item;
    if (expiryDate > new Date()) return item;

    try {
      for (const target of getAccessTargetUrls(item, serviceWebId)) {
        await setAccessForResource(target, item.requesterWebId, {});
      }
      const now = new Date().toISOString();
      await updateNotification(item.id, {
        status: "expired",
        decidedAt: now,
        decidedBy: webId,
        decisionComment: item.decisionComment || "Access expired.",
      });
      return { ...item, status: "expired", decidedAt: now, decidedBy: webId };
    } catch (err) {
      console.error("Failed to expire access:", err);
      return item;
    }
  };

  const loadNotifications = async () => {
    setLoading(true);
    setError("");
    try {
      const inbox = await resolveInboxUrl();
      if (!inbox) {
        setInboxUrl("");
        setNotifications([]);
        setError("No Solid inbox found for this profile.");
        return;
      }
      setInboxUrl(inbox);

      const inboxDataset = await getSolidDataset(inbox, { fetch: noCacheFetch });
      const resourceUrls = getContainedResourceUrlAll(inboxDataset);
      const rawItems = await Promise.all(
        resourceUrls.map(async (url) => {
          try {
            const { thing } = await loadNotificationThing(url);
            return parseAccessRequestThing(url, thing);
          } catch (err) {
            console.warn("Failed to parse notification:", url, err);
            return null;
          }
        })
      );

      const filtered = rawItems.filter(Boolean);
      const processed = [];
      for (const item of filtered) {
        // Keep notifications up to date with expiry decisions.
        const nextItem = await expireIfNeeded(item);
        const catalogValidationErrors = await validateCatalogDistribution(nextItem);
        processed.push({ ...nextItem, catalogValidationErrors });
      }

      processed.sort((a, b) => {
        const aTime = Date.parse(a.createdAt) || 0;
        const bTime = Date.parse(b.createdAt) || 0;
        return bTime - aTime;
      });

      setNotifications(processed);
      const newest = processed.find((item) => Date.parse(item.createdAt));
      if (newest?.createdAt) {
        localStorage.setItem(LAST_SEEN_REQUESTS_KEY, newest.createdAt);
      }
    } catch (err) {
      console.error("Failed to load inbox:", err);
      setError("Failed to load notifications from the Solid inbox.");
    } finally {
      setLoading(false);
    }
  };

  const handleDecision = async (item, decision) => {
    setProcessingId(item.id);
    try {
      const note = decisionNotes[item.id] || "";
      const expiryInput = decisionExpiry[item.id] || "";
      const expiryIso = expiryInput ? new Date(expiryInput).toISOString() : "";
      const now = new Date().toISOString();
      const validationErrors = [
        ...validateTrustedEnvironmentalRequest(item, serviceWebId, webId),
        ...(item.catalogValidationErrors || []),
      ];
      const localizedValidationErrors = validationErrors.map((error) => t(error));
      if (decision === "approved" && validationErrors.length > 0) {
        throw new Error(localizedValidationErrors.join(" "));
      }

      console.warn("[AccessRequest] decision", {
        decision,
        requesterWebId: item.requesterWebId,
        datasetAccessUrl: item.datasetAccessUrl,
        datasetSemanticModelUrl: item.datasetSemanticModelUrl,
        expiresAt: expiryIso || null,
        inboxItem: item.id,
      });

      if (decision === "approved") {
        const approvedAccess = getApprovedAccess(item, serviceWebId);
        for (const target of getAccessTargetUrls(item, serviceWebId)) {
          await setAccessForResource(target, item.requesterWebId, approvedAccess);
        }
      } else if (decision === "revoked") {
        for (const target of getAccessTargetUrls(item, serviceWebId)) {
          await setAccessForResource(target, item.requesterWebId, {});
        }
      }

      await updateNotification(item.id, {
        status: decision,
        decisionComment: note,
        expiresAt: expiryIso,
        decidedAt: now,
        decidedBy: webId,
      });

      await notifyRequester({
        item,
        decision,
        note,
        expiresAt: expiryIso,
        decidedAt: now,
      });

      console.warn("[AccessRequest] decision saved", {
        decision,
        inboxItem: item.id,
      });

      await loadNotifications();
    } catch (err) {
      console.error("Failed to update decision:", err);
      setError(
        err instanceof Error
          ? `${t("Failed to update access decision:")} ${err.message}`
          : t("Failed to update access decision.")
      );
    } finally {
      setProcessingId("");
    }
  };

  const clearClosed = async () => {
    if (!notifications.length) return;
    const closedItems = notifications.filter((item) => CLOSED_STATUSES.has(item.status));
    if (!closedItems.length) return;

    setClearingRevoked(true);
    try {
      await Promise.all(
        closedItems.map((item) => deleteFile(item.id, { fetch: noCacheFetch }))
      );
      await loadNotifications();
    } catch (err) {
      console.error("Failed to clear closed requests:", err);
      setError("Failed to clear closed requests.");
    } finally {
      setClearingRevoked(false);
    }
  };

  const openClearClosedConfirm = () => {
    const closedItems = notifications.filter((item) => CLOSED_STATUSES.has(item.status));
    if (!closedItems.length) return;
    setConfirmOpen(true);
  };

  const handleConfirm = async () => {
    await clearClosed();
    setConfirmOpen(false);
  };

  useEffect(() => {
    if (!webId) return;
    loadNotifications();
  }, [webId]);

  const currentRunNotifications = filterPreviousScenarioRuns(
    notifications,
    showPreviousRuns
  );
  const filteredNotifications = currentRunNotifications.filter((item) =>
    hideClosed ? !CLOSED_STATUSES.has(item.status) : true
  );
  const totalPages = Math.max(1, Math.ceil(filteredNotifications.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedNotifications = filteredNotifications.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize
  );

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  return (
    <div className="notifications">
      <div className="notifications-header toolbar--title">
        <div className="crumb">
          <FontAwesomeIcon icon={faInbox} className="crumb-icon" />
          <span>{t("Access Requests")}</span>
        </div>
        <button className="pill-btn" onClick={loadNotifications} disabled={loading}>
          <FontAwesomeIcon icon={faRotateRight} />
          <span>{t("Refresh")}</span>
        </button>
      </div>
      <div className="notifications-filters">
        <label className="notifications-toggle">
          <input
            type="checkbox"
            checked={hideClosed}
            onChange={(e) => {
              setHideClosed(e.target.checked);
              setPage(1);
            }}
          />
          {t("Hide closed")}
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
          Show previous scenario runs
        </label>
        <div className="notifications-count">
          {t(`Showing ${filteredNotifications.length} request(s)`)}
        </div>
        <button
          className="pill-btn"
          onClick={openClearClosedConfirm}
          disabled={
            clearingRevoked ||
            !notifications.some((item) => CLOSED_STATUSES.has(item.status))
          }
        >
          {clearingRevoked ? t("Clearing...") : t("Clear closed")}
        </button>
      </div>

      {error && <div className="notifications-error">{error}</div>}
      {inboxUrl && (
        <div className="notifications-inbox">
          Inbox: <a href={inboxUrl}>{inboxUrl}</a>
        </div>
      )}

      {loading ? (
        <ContentLoadingState
          title={t("Access Requests")}
          message={t("Loading your personal access requests workspace …")}
          appId="notifications"
        />
      ) : filteredNotifications.length === 0 ? (
        <div className="notifications-empty">{t("No access requests found.")}</div>
      ) : (
        <div className="notifications-list">
          {pagedNotifications.map((item) => {
            const trustedEnvironmental = isTrustedEnvironmentalRequest(
              item,
              serviceWebId
            );
            const validationErrors = [
              ...validateTrustedEnvironmentalRequest(item, serviceWebId, webId),
              ...(item.catalogValidationErrors || []),
            ];
            return (
              <div
                className={`notification-card${
                  trustedEnvironmental ? " notification-card--consent" : ""
                }`}
                key={item.id}
              >
              <div className="notification-head">
                <div>
                  <div className="notification-title" translate="no">
                    {trustedEnvironmental
                      ? t(ENVIRONMENTAL_CONSENT.title)
                      : item.datasetTitle || t("Untitled dataset")}
                  </div>
                  <div className="notification-subtitle" translate="no">
                    {trustedEnvironmental
                      ? item.datasetTitle || t("Tour activity")
                      : `${t("ID:")} ${item.datasetIdentifier || "N/A"}`}
                  </div>
                </div>
                <span className={`status-pill ${getStatusClass(item.status)}`}>
                  {t(getDisplayStatus(item.status))}
                </span>
              </div>

              <div className="notification-meta">
                <div>
                  <strong>Requester:</strong>{" "}
                  {trustedEnvironmental
                    ? ENVIRONMENTAL_REQUEST.displayName
                    : <span translate="no">{item.requesterName || "N/A"}</span>}
                </div>
                {!trustedEnvironmental && (
                  <>
                  <div><strong>Email:</strong> {item.requesterEmail || "N/A"}</div>
                  <div className="notification-webid">
                    <strong>WebID:</strong> {item.requesterWebId || "N/A"}
                  </div>
                </>
                )}
                <div><strong>{t("Requested:")}</strong> {formatDateTime(item.createdAt, language)}</div>
              </div>

              {trustedEnvironmental ? (
                <div className="notification-consent">
                  <div><strong>{t("Data:")}</strong> {t(ENVIRONMENTAL_CONSENT.data)}</div>
                  <div><strong>{t("Purpose:")}</strong> {t(ENVIRONMENTAL_CONSENT.purpose)}</div>
                  <div><strong>{t("Access:")}</strong> {t(ENVIRONMENTAL_CONSENT.access)}</div>
                  <div><strong>{t("Note:")}</strong> {t(ENVIRONMENTAL_CONSENT.notice)}</div>
                  {validationErrors.length > 0 && (
                    <div className="notification-consent__invalid" role="alert">
                      {t("This request cannot be approved:")}{" "}
                      {validationErrors.map((error) => t(error)).join(" ")}
                    </div>
                  )}
                </div>
              ) : item.message ? (
                <div className="notification-message">
                  <strong>{t("Message:")}</strong> <span translate="no">{item.message}</span>
                </div>
              ) : null}

              {item.status !== "pending" && (
                <div className="notification-decision">
                  <div>
                    <strong>{t("Decision:")}</strong> {t(getDisplayStatus(item.status))}
                  </div>
                  <div><strong>{t("Decided At:")}</strong> {formatDateTime(item.decidedAt, language)}</div>
                  {item.decisionComment && (
                    <div><strong>{t("Comment:")}</strong> <span translate="no">{item.decisionComment}</span></div>
                  )}
                </div>
              )}

              {item.status === "pending" && (
                <div className="notification-actions">
                  <div className="notification-inputs">
                    <label>
                      {t("Comment")}
                      <textarea
                        value={decisionNotes[item.id] || ""}
                        onChange={(e) =>
                          setDecisionNotes((prev) => ({ ...prev, [item.id]: e.target.value }))
                        }
                        placeholder={t("Optional comment...")}
                      />
                    </label>
                    <label>
                      {t("Expiry (optional)")}
                      <input
                        type="datetime-local"
                        value={decisionExpiry[item.id] || ""}
                        onChange={(e) =>
                          setDecisionExpiry((prev) => ({ ...prev, [item.id]: e.target.value }))
                        }
                      />
                    </label>
                  </div>
                  <div className="notification-buttons">
                    <button
                      className="btn-approve"
                      onClick={() => handleDecision(item, "approved")}
                      disabled={
                        processingId === item.id || validationErrors.length > 0
                      }
                    >
                      <FontAwesomeIcon icon={faCheck} /> {t("Approve")}
                    </button>
                    <button
                      className="btn-deny"
                      onClick={() => handleDecision(item, "denied")}
                      disabled={processingId === item.id}
                    >
                      <FontAwesomeIcon icon={faXmark} /> {t("Deny")}
                    </button>
                  </div>
                </div>
              )}
              {item.status !== "pending" && (
                <div className="notification-actions">
                  <div className="notification-inputs">
                    {item.status !== "approved" && (
                      <label>
                        {t("Expiry (optional)")}
                        <input
                          type="datetime-local"
                          value={decisionExpiry[item.id] || ""}
                          onChange={(e) =>
                            setDecisionExpiry((prev) => ({ ...prev, [item.id]: e.target.value }))
                          }
                        />
                      </label>
                    )}
                  </div>
                  <div className="notification-buttons">
                    {item.status !== "approved" ? (
                      <button
                        className="btn-approve"
                        onClick={() => handleDecision(item, "approved")}
                        disabled={
                          processingId === item.id || validationErrors.length > 0
                        }
                      >
                        <FontAwesomeIcon icon={faCheck} /> {t("Approve")}
                      </button>
                    ) : (
                      <button
                        className="btn-deny"
                        onClick={() => handleDecision(item, "revoked")}
                        disabled={processingId === item.id}
                      >
                        <FontAwesomeIcon icon={faXmark} /> {t("Revoke")}
                      </button>
                    )}
                  </div>
                </div>
              )}
              </div>
            );
          })}
        </div>
      )}
      {!loading && filteredNotifications.length > pageSize && (
        <div className="notifications-pagination">
          <button
            className="pill-btn"
            disabled={safePage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </button>
          <span className="notifications-page">
            {t(`Page ${safePage} of ${totalPages}`)}
          </span>
          <button
            className="pill-btn"
            disabled={safePage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            {t("Next")}
          </button>
        </div>
      )}
      <DeleteConfirmModal
        show={confirmOpen}
        count={notifications.filter((item) => CLOSED_STATUSES.has(item.status)).length}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleConfirm}
      />
    </div>
  );
};

export default Notifications;
