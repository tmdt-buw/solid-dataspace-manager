import { recordAccessDecision, deliverAccessDecision, decisionDeliveries, hasUndeliveredDecision, canClearClosedRequest } from "../accessDecisionDelivery";
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
import { faInbox, faTrash, faCheck, faXmark } from "@fortawesome/free-solid-svg-icons";
import AccessConfirmDialog from "./AccessConfirmDialog";
import { AccessInboxHeader, AccessStatus, AccessEmptyState, AccessPagination } from "./AccessInboxUi";
import ContentLoadingState from "./ContentLoadingState";
import { getSyncWorkerConfig } from "../config/runtimeConfig";
import {
  ENVIRONMENTAL_CONSENT,
  environmentalConsent,
  ENVIRONMENTAL_REQUEST,
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

const Notifications = ({ webId }) => {
  const { language, t } = useI18n();
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

  const loadNotificationThing = async (url) => {
    const dataset = await getSolidDataset(url, { fetch: noCacheFetch });
    const thing = getThing(dataset, url) || getThingAll(dataset).find(candidate => parseAccessRequestThing(url, candidate));
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
      const next = { ...item, status: "expired", decidedAt: now, decidedBy: webId };
      const eventUrl = await recordAccessDecision({ fetch: noCacheFetch, item, decision: "expired", decidedAt: now, decidedBy: webId, note: item.decisionComment || "Access expired." });
      try { await deliverAccessDecision({ fetch: noCacheFetch, requestUrl: item.id, eventUrl }); }
      catch { setError("Access was updated, but the decision could not be delivered. Use Resend decision."); }
      const saved = await getSolidDataset(item.id, { fetch: noCacheFetch });
      return { ...next, deliveries: decisionDeliveries(saved) };

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
        setNotifications([]);
        setError("No Solid inbox found for this profile.");
        return;
      }

      const inboxDataset = await getSolidDataset(inbox, { fetch: noCacheFetch });
      const resourceUrls = getContainedResourceUrlAll(inboxDataset);
      const rawItems = await Promise.all(
        resourceUrls.map(async (url) => {
          try {
            const { dataset, thing } = await loadNotificationThing(url);
            const item = parseAccessRequestThing(url, thing);
            return item ? { ...item, deliveries: decisionDeliveries(dataset) } : null;
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

      const eventUrl = await recordAccessDecision({ fetch: noCacheFetch, item, decision, note, expiresAt: expiryIso, decidedAt: now, decidedBy: webId });
      let delivered = false;
      try { delivered = (await deliverAccessDecision({ fetch: noCacheFetch, requestUrl: item.id, eventUrl })).delivered; }
      catch { /* The saved event remains available for an explicit delivery retry. */ }
      await loadNotifications();
      if (!delivered) setError("Access was updated, but the decision could not be delivered. Use Resend decision.");

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

  const resendLegacyDecision = async (item) => {
    setProcessingId(item.id);
    setError("");
    try {
      const eventUrl = await recordAccessDecision({ fetch: noCacheFetch, item, decision: item.status, note: item.decisionComment, expiresAt: item.expiresAt, decidedAt: item.decidedAt, decidedBy: item.decidedBy || webId, preserveExisting: true });
      const result = await deliverAccessDecision({ fetch: noCacheFetch, requestUrl: item.id, eventUrl });
      await loadNotifications();
      if (!result.delivered) setError("Decision delivery failed. You can retry without changing access permissions.");
    } catch { setError("Decision delivery failed. You can retry without changing access permissions."); }
    finally { setProcessingId(""); }
  };

  const resendDecision = async (item, event) => {
    setProcessingId(item.id);
    setError("");
    try {
      const result = await deliverAccessDecision({ fetch: noCacheFetch, requestUrl: item.id, eventUrl: event.id });
      await loadNotifications();
      if (!result.delivered) setError("Decision delivery failed. You can retry without changing access permissions.");
    } catch {
      setError("Decision delivery failed. You can retry without changing access permissions.");
    } finally { setProcessingId(""); }
  };

  const clearClosed = async () => {
    if (!notifications.length) return;
    const closedItems = notifications.filter(canClearClosedRequest);
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
    const closedItems = notifications.filter(canClearClosedRequest);
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
    hideClosed ? !CLOSED_STATUSES.has(item.status) || hasUndeliveredDecision(item) : true
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
    <section className="notifications access-inbox">
      <AccessInboxHeader
        icon={faInbox}
        title="Access Requests"
        description="Manage access to your data."
        loading={loading}
        onRefresh={loadNotifications}
      />
      <div className="notifications-filters" role="group" aria-label={t("Filter requests")}>
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
          {t(`Showing ${filteredNotifications.length} request(s)`)}
        </span>
        <button
          className="access-button access-button--quiet"
          type="button"
          onClick={openClearClosedConfirm}
          disabled={
            clearingRevoked ||
            !notifications.some(canClearClosedRequest)
          }
        >
          <FontAwesomeIcon icon={faTrash} aria-hidden="true" />
          {clearingRevoked ? t("Clearing...") : t("Clear closed")}
        </button>
      </div>

      {error && <div className="notifications-error" role="alert">{t(error)}</div>}

      {loading ? (
        <ContentLoadingState
          title={t("Access Requests")}
          message={t("Loading your personal access requests workspace …")}
          appId="notifications"
          variant="compact"
        />
      ) : filteredNotifications.length === 0 ? (
        !error && <AccessEmptyState title="No access requests found." />
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
              <article
                className={`notification-card${trustedEnvironmental ? " notification-card--consent" : ""}`}
                data-status={item.status}
                key={item.id}
              >
                <header className="notification-head">
                  <div className="notification-heading">
                    <h2 className="notification-title" translate="no">
                      {trustedEnvironmental
                        ? t(ENVIRONMENTAL_CONSENT.title)
                        : item.datasetTitle || t("Untitled dataset")}
                    </h2>
                    <p className="notification-subtitle" translate="no">
                      {trustedEnvironmental
                        ? item.datasetTitle || t("Tour activity")
                        : `${t("ID:")} ${item.datasetIdentifier || "N/A"}`}
                    </p>
                  </div>
                  <AccessStatus status={item.status || "pending"} label={getDisplayStatus(item.status)} />
                </header>

                {item.deliveries?.filter(event => event.deliveryStatus !== "delivered").map(event => (
                  <div className="notification-delivery" role="status" key={event.id}>
                    <p>{t("Decision not delivered:")} {t(getDisplayStatus(event.decision))} ({formatDateTime(event.decidedAt, language)})</p>
                    <button type="button" className="access-button" disabled={processingId === item.id} onClick={() => resendDecision(item, event)}>{t("Resend decision")}</button>
                  </div>
                ))}

                {item.status !== "pending" && item.decidedAt && !item.deliveries?.length && (
                  <div className="notification-delivery">
                    <p>{t("Delivery of this older decision was not recorded.")}</p>
                    <button type="button" className="access-button" disabled={processingId === item.id} onClick={() => resendLegacyDecision(item)}>{t("Resend decision")}</button>
                  </div>
                )}

                <dl className="notification-meta">
                  <div>
                    <dt>{t("Requester:")}</dt>
                    <dd translate="no">{trustedEnvironmental ? ENVIRONMENTAL_REQUEST.displayName : item.requesterName || "N/A"}</dd>
                  </div>
                  <div>
                    <dt>{t("Requested:")}</dt>
                    <dd>{formatDateTime(item.createdAt, language)}</dd>
                  </div>
                  {!trustedEnvironmental && (
                    <>
                      <div><dt>{t("Email:")}</dt><dd translate="no">{item.requesterEmail || "N/A"}</dd></div>
                      <div className="notification-meta__wide"><dt>WebID</dt><dd translate="no">{item.requesterWebId || "N/A"}</dd></div>
                    </>
                  )}
                </dl>

                {trustedEnvironmental ? (
                  <div className="notification-consent">
                    <div className="notification-consent__item"><strong>{t("Data:")}</strong><span>{t(environmentalConsent(item).data)}</span></div>
                    <div className="notification-consent__item"><strong>{t("Purpose:")}</strong><span>{t(environmentalConsent(item).purpose)}</span></div>
                    <div className="notification-consent__item"><strong>{t("Access:")}</strong><span>{t(ENVIRONMENTAL_CONSENT.access)}</span></div>
                    <div className="notification-consent__notice"><strong>{t("Note:")}</strong><p>{t(ENVIRONMENTAL_CONSENT.notice)}</p></div>
                    {validationErrors.length > 0 && (
                      <div className="notification-consent__invalid" role="alert">
                        {t("This request cannot be approved:")}{" "}
                        {validationErrors.map((error) => t(error)).join(" ")}
                      </div>
                    )}
                  </div>
                ) : item.message ? (
                  <div className="notification-message">
                    <strong>{t("Message:")}</strong><p translate="no">{item.message}</p>
                  </div>
                ) : null}

                {item.status !== "pending" && (
                  <div className="notification-decision">
                    <div><strong>{t("Decision:")}</strong><span>{t(getDisplayStatus(item.status))}</span></div>
                    <div><strong>{t("Decided At:")}</strong><span>{formatDateTime(item.decidedAt, language)}</span></div>
                    {item.decisionComment && (
                      <div className="notification-decision__comment"><strong>{t("Comment:")}</strong><span translate="no">{item.decisionComment}</span></div>
                    )}
                  </div>
                )}

                {item.status === "pending" && (
                  <div className="notification-actions">
                    <h3>{t("Your decision")}</h3>
                    <div className="notification-inputs">
                      <label>
                        {t("Comment")}
                        <textarea
                          rows={2}
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
                        type="button"
                        onClick={() => handleDecision(item, "approved")}
                        disabled={processingId === item.id || validationErrors.length > 0}
                      >
                        <FontAwesomeIcon icon={faCheck} aria-hidden="true" /> {t("Approve")}
                      </button>
                      <button
                        className="btn-deny"
                        type="button"
                        onClick={() => handleDecision(item, "denied")}
                        disabled={processingId === item.id}
                      >
                        <FontAwesomeIcon icon={faXmark} aria-hidden="true" /> {t("Deny")}
                      </button>
                    </div>
                  </div>
                )}
                {item.status !== "pending" && (
                  <div className="notification-actions notification-actions--compact">
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
                          type="button"
                          onClick={() => handleDecision(item, "approved")}
                          disabled={processingId === item.id || validationErrors.length > 0}
                        >
                          <FontAwesomeIcon icon={faCheck} aria-hidden="true" /> {t("Approve")}
                        </button>
                      ) : (
                        <button
                          className="btn-deny"
                          type="button"
                          onClick={() => handleDecision(item, "revoked")}
                          disabled={processingId === item.id}
                        >
                          <FontAwesomeIcon icon={faXmark} aria-hidden="true" /> {t("Revoke")}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
      {!loading && filteredNotifications.length > pageSize && (
        <AccessPagination
          page={safePage}
          totalPages={totalPages}
          onPrevious={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
        />
      )}
      <AccessConfirmDialog
        show={confirmOpen}
        title="Delete closed requests"
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleConfirm}
      >
        <p>{t(`Delete ${notifications.filter(canClearClosedRequest).length} closed request(s)?`)}</p>
        <p>{t("This will permanently delete the closed requests from your inbox.")}</p>
      </AccessConfirmDialog>
    </section>
  );
};

export default Notifications;
