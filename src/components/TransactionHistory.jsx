import React, { useEffect, useMemo, useState } from "react";
import session from "../solidSession";
import {
  getSolidDataset,
  getContainedResourceUrlAll,
  getThing,
  getThingAll,
  getUrl,
  getUrlAll,
  getStringNoLocale,
} from "@inrupt/solid-client";
import { LDP, RDF } from "@inrupt/vocab-common-rdf";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChartLine,
  faLink,
  faRightLeft,
  faDatabase,
  faDownload,
  faRotateRight,
} from "@fortawesome/free-solid-svg-icons";
import DataspaceConnectionsVisual from "./DataspaceConnectionsVisual";
import ContentLoadingState from "./ContentLoadingState";
import "./TransactionHistory.css";

const SDM_NS = "https://w3id.org/solid-dataspace-manager#";
const SDM = {
  AccessRequest: `${SDM_NS}AccessRequest`,
  AccessDecision: `${SDM_NS}AccessDecision`,
  status: `${SDM_NS}status`,
  decision: `${SDM_NS}decision`,
  decidedAt: `${SDM_NS}decidedAt`,
  requesterWebId: `${SDM_NS}requesterWebId`,
  datasetIdentifier: `${SDM_NS}datasetIdentifier`,
  datasetTitle: `${SDM_NS}datasetTitle`,
  datasetAccessUrl: `${SDM_NS}datasetAccessUrl`,
  datasetSemanticModelUrl: `${SDM_NS}datasetSemanticModelUrl`,
  catalogUrl: `${SDM_NS}catalogUrl`,
  decisionComment: `${SDM_NS}decisionComment`,
  expiresAt: `${SDM_NS}expiresAt`,
  message: `${SDM_NS}message`,
};

const DCT_CREATED = "http://purl.org/dc/terms/created";
const DCT_TITLE = "http://purl.org/dc/terms/title";

const noCacheFetch = (input, init = {}) =>
  session.fetch(input, {
    ...init,
    cache: "no-store",
    headers: { ...(init.headers || {}), "Cache-Control": "no-cache" },
  });

const formatDateTime = (value) => {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("de-DE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const buildDecisionKey = (item) => {
  const parts = [
    item.requesterWebId || "",
    item.datasetIdentifier || "",
    item.datasetAccessUrl || "",
    item.datasetSemanticModelUrl || "",
  ];
  return parts.join("|");
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

const getPartnerRoot = (item) => {
  const requesterRoot = getPodRoot(item.requesterWebId);
  const ownerRoot = getOwnerRoot(item);
  if (item.direction === "incoming") {
    return ownerRoot || requesterRoot || "unknown pod";
  }
  return requesterRoot || ownerRoot || "unknown pod";
};

const getPodLabel = (root) => {
  if (!root || root === "unknown pod") return "Unknown Pod";
  try {
    const url = new URL(root);
    const firstPath = url.pathname.split("/").filter(Boolean)[0];
    return firstPath ? `${url.hostname}/${firstPath}` : url.hostname;
  } catch {
    return root;
  }
};

const getDecisionTime = (item) =>
  Date.parse(item.decidedAt || item.createdAt) || item.urlTime || 0;

const isExpired = (item) => {
  if (!item.expiresAt) return false;
  const time = Date.parse(item.expiresAt);
  if (Number.isNaN(time)) return false;
  return time < Date.now();
};

const TransactionHistory = ({ webId }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [decisions, setDecisions] = useState([]);
  const [requests, setRequests] = useState([]);
  const [dataSourceCount, setDataSourceCount] = useState(0);

  const resolveInboxUrl = async () => {
    const profileDataset = await getSolidDataset(webId, { fetch: noCacheFetch });
    const profile = getThing(profileDataset, webId);
    return profile ? getUrl(profile, LDP.inbox) : null;
  };

  const loadInboxItem = async (url) => {
    const dataset = await getSolidDataset(url, { fetch: noCacheFetch });
    const thing = getThing(dataset, url) || getThingAll(dataset)[0];
    return { dataset, thing };
  };

  const parseDecision = (url, thing) => {
    if (!thing) return null;
    const types = getUrlAll(thing, RDF.type);
    if (!types.includes(SDM.AccessDecision)) return null;

    const timestampMatch = url.match(/(\d{10,})(?:\/)?$/);
    const urlTime = timestampMatch ? Number(timestampMatch[1]) : 0;

    return {
      id: url,
      type: "decision",
      decision: getStringNoLocale(thing, SDM.decision) || "",
      decidedAt: getStringNoLocale(thing, SDM.decidedAt) || "",
      requesterWebId: getUrl(thing, SDM.requesterWebId) || "",
      datasetIdentifier: getStringNoLocale(thing, SDM.datasetIdentifier) || "",
      datasetTitle:
        getStringNoLocale(thing, SDM.datasetTitle) ||
        getStringNoLocale(thing, DCT_TITLE) ||
        "",
      datasetAccessUrl: getUrl(thing, SDM.datasetAccessUrl) || "",
      datasetSemanticModelUrl: getUrl(thing, SDM.datasetSemanticModelUrl) || "",
      catalogUrl: getUrl(thing, SDM.catalogUrl) || "",
      decisionComment: getStringNoLocale(thing, SDM.decisionComment) || "",
      expiresAt: getStringNoLocale(thing, SDM.expiresAt) || "",
      createdAt: getStringNoLocale(thing, DCT_CREATED) || "",
      urlTime,
    };
  };

  const parseRequest = (url, thing) => {
    if (!thing) return null;
    const types = getUrlAll(thing, RDF.type);
    if (!types.includes(SDM.AccessRequest)) return null;

    return {
      id: url,
      type: "request",
      status: getStringNoLocale(thing, SDM.status) || "pending",
      requesterWebId: getUrl(thing, SDM.requesterWebId) || "",
      datasetIdentifier: getStringNoLocale(thing, SDM.datasetIdentifier) || "",
      datasetTitle:
        getStringNoLocale(thing, SDM.datasetTitle) ||
        getStringNoLocale(thing, DCT_TITLE) ||
        "",
      datasetAccessUrl: getUrl(thing, SDM.datasetAccessUrl) || "",
      datasetSemanticModelUrl: getUrl(thing, SDM.datasetSemanticModelUrl) || "",
      catalogUrl: getUrl(thing, SDM.catalogUrl) || "",
      decidedAt: getStringNoLocale(thing, SDM.decidedAt) || "",
      expiresAt: getStringNoLocale(thing, SDM.expiresAt) || "",
      message: getStringNoLocale(thing, SDM.message) || "",
      createdAt: getStringNoLocale(thing, DCT_CREATED) || "",
    };
  };

  const loadCatalogDataSourceCount = async () => {
    if (!webId) {
      setDataSourceCount(0);
      return 0;
    }

    try {
      const datasetContainerUrl = `${getPodRoot(webId)}catalog/ds/`;
      const datasetContainer = await getSolidDataset(datasetContainerUrl, {
        fetch: noCacheFetch,
      });
      const resourceUrls = getContainedResourceUrlAll(datasetContainer).filter(
        (url) => !url.endsWith("/")
      );
      setDataSourceCount(resourceUrls.length);
      return resourceUrls.length;
    } catch (err) {
      console.warn("Failed to count catalog data sources:", err);
      setDataSourceCount(0);
      return 0;
    }
  };

  const loadTransactions = async () => {
    setLoading(true);
    setError("");
    void loadCatalogDataSourceCount();
    try {
      const inbox = await resolveInboxUrl();
      if (!inbox) {
        setDecisions([]);
        setRequests([]);
        setError("No Solid inbox found for this profile.");
        return;
      }

      const inboxDataset = await getSolidDataset(inbox, { fetch: noCacheFetch });
      const resourceUrls = getContainedResourceUrlAll(inboxDataset);
      const rawItems = await Promise.all(
        resourceUrls.map(async (url) => {
          try {
            const { thing } = await loadInboxItem(url);
            return { url, thing };
          } catch (err) {
            console.warn("Failed to parse inbox item:", url, err);
            return null;
          }
        })
      );

      const parsedDecisions = [];
      const parsedRequests = [];
      rawItems.filter(Boolean).forEach(({ url, thing }) => {
        const decision = parseDecision(url, thing);
        if (decision) {
          parsedDecisions.push(decision);
          return;
        }
        const request = parseRequest(url, thing);
        if (request) parsedRequests.push(request);
      });

      parsedDecisions.sort((a, b) => getDecisionTime(b) - getDecisionTime(a));
      parsedRequests.sort((a, b) => getDecisionTime(b) - getDecisionTime(a));

      setDecisions(parsedDecisions);
      setRequests(parsedRequests);
    } catch (err) {
      console.error("Failed to load transactions:", err);
      setError("Failed to load transactions.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!webId) return;
    loadTransactions();
  }, [webId]);

  const activeConnections = useMemo(() => {
    const combined = [...decisions, ...requests];
    const latestByKey = new Map();

    combined.forEach((item) => {
      const key = buildDecisionKey(item);
      if (!latestByKey.has(key)) {
        latestByKey.set(key, item);
        return;
      }
      const existing = latestByKey.get(key);
      if (getDecisionTime(item) >= getDecisionTime(existing)) {
        latestByKey.set(key, item);
      }
    });

    const activeItems = Array.from(latestByKey.values()).filter((item) => {
      const decision = item.decision || item.status || "";
      return decision === "approved" && !isExpired(item);
    });

    return activeItems.map((item) => ({
      ...item,
      direction: item.requesterWebId && item.requesterWebId === webId ? "incoming" : "outgoing",
    }));
  }, [decisions, requests, webId]);

  const connectionNodes = useMemo(
    () =>
      activeConnections
        .map((item, index) => {
          const root = getPartnerRoot(item);
          return {
            id: item.id || `${root}-${index}`,
            root,
            label: getPodLabel(root),
            detail: item.datasetTitle || item.datasetIdentifier || "Active connection",
            direction: item.direction,
            connectionCount: 1,
            datasetCount: item.datasetIdentifier || item.datasetAccessUrl ? 1 : 0,
            latestAt: getDecisionTime(item),
          };
        })
        .sort((a, b) => b.latestAt - a.latestAt || a.label.localeCompare(b.label)),
    [activeConnections]
  );

  const uniquePartnerCount = useMemo(() => {
    const roots = new Set();
    activeConnections.forEach((item) => {
      const root = getPartnerRoot(item);
      if (root) roots.add(root);
    });
    return roots.size;
  }, [activeConnections]);

  const stats = useMemo(() => {
    const incoming = activeConnections.filter((item) => item.direction === "incoming");
    const outgoing = activeConnections.filter((item) => item.direction === "outgoing");
    const datasets = new Set(activeConnections.map((item) => item.datasetIdentifier || item.datasetAccessUrl));
    return {
      total: activeConnections.length,
      incoming: incoming.length,
      outgoing: outgoing.length,
      datasets: datasets.size,
      partners: uniquePartnerCount,
      downloads: null,
    };
  }, [activeConnections, uniquePartnerCount]);

  const selfRoot = getPodRoot(webId) || "your pod";
  const visualDataSourceCount = Math.max(
    dataSourceCount,
    stats.datasets,
    activeConnections.length
  );
  return (
    <div className="transactions-page">
      <div className="transactions-header toolbar--title">
        <div className="crumb">
          <FontAwesomeIcon icon={faChartLine} className="crumb-icon" />
          <span>Transaction History</span>
        </div>
        <button className="pill-btn" onClick={loadTransactions} disabled={loading}>
          <FontAwesomeIcon icon={faRotateRight} />
          <span>Refresh</span>
        </button>
      </div>

      <div className="transactions-block">
        <div className="transactions-stats">
          <div className="stat-card">
            <div className="stat-label">
              <FontAwesomeIcon icon={faLink} /> Active connections
            </div>
            <div className="stat-value">{stats.total}</div>
            <div className="stat-sub">Current valid access links</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">
              <FontAwesomeIcon icon={faRightLeft} /> Incoming vs outgoing
            </div>
            <div className="stat-value">
              {stats.incoming} / {stats.outgoing}
            </div>
            <div className="stat-sub">Incoming / Outgoing</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">
              <FontAwesomeIcon icon={faDatabase} /> Active datasets
            </div>
            <div className="stat-value">{stats.datasets}</div>
            <div className="stat-sub">Datasets with active access</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">
              <FontAwesomeIcon icon={faDownload} /> Catalog downloads
            </div>
            <div className="stat-value">{stats.downloads ?? "—"}</div>
            <div className="stat-sub">Tracking not enabled</div>
          </div>
        </div>

        <div className="transactions-graph-card">
          <div className="transactions-graph-header">
            <span>Active Dataspace Connections</span>
            <span className="graph-meta">
              {visualDataSourceCount} data source point(s), {activeConnections.length} link(s)
            </span>
          </div>
          <DataspaceConnectionsVisual
            pods={connectionNodes}
            dataSourceCount={visualDataSourceCount}
            selfLabel={getPodLabel(selfRoot)}
            selfRoot={selfRoot}
          />
        </div>

        <div className="transactions-table-card">
          <div className="transactions-table-header">
            <span>Active Connections</span>
            <span className="graph-meta">{activeConnections.length} total</span>
          </div>
          {loading ? (
            <ContentLoadingState
              title="Transaction History"
              message="Loading your personal connections …"
              appId="transactions"
              variant="compact"
            />
          ) : activeConnections.length === 0 ? (
            <div className="transactions-empty">No active connections found.</div>
          ) : (
            <div className="transactions-table">
              <div className="transactions-row transactions-row--head">
                <span>Direction</span>
                <span>Requester / Provider</span>
                <span>Dataset</span>
                <span>Last Update</span>
                <span>Expires</span>
              </div>
              {activeConnections.map((item) => (
                <div className="transactions-row" key={item.id}>
                  <span className={`dir-pill dir-${item.direction}`}>
                    {item.direction}
                  </span>
                  <span className="mono">{getPartnerRoot(item)}</span>
                  <span translate={item.datasetTitle || item.datasetIdentifier ? "no" : undefined}>{item.datasetTitle || item.datasetIdentifier || "Untitled"}</span>
                  <span>{formatDateTime(item.decidedAt || item.createdAt)}</span>
                  <span>{formatDateTime(item.expiresAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {error && <div className="transactions-error">{error}</div>}
    </div>
  );
};

export default TransactionHistory;
