import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faRightFromBracket,
  faChevronLeft,
  faChevronRight,
} from "@fortawesome/free-solid-svg-icons";
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
import "./Sidebar.css";
import { getAppsBySection, getBranding } from "../config/runtimeConfig";
import { getAppIcon, navigationIcons } from "../config/appIcons";

const SDM_NS = "https://w3id.org/solid-dataspace-manager#";
const SDM = {
  AccessRequest: `${SDM_NS}AccessRequest`,
  AccessDecision: `${SDM_NS}AccessDecision`,
  status: `${SDM_NS}status`,
  decidedAt: `${SDM_NS}decidedAt`,
};

const DCT_CREATED = "http://purl.org/dc/terms/created";
const LAST_SEEN_DECISIONS_KEY = "sdm-last-seen-decisions";

const noCacheFetch = (input, init = {}) =>
  session.fetch(input, {
    ...init,
    cache: "no-store",
    headers: { ...(init.headers || {}), "Cache-Control": "no-cache" },
  });

function Sidebar({
  webId,
  collapsed = false,
  onToggle,
  statisticsAdmin = false,
}) {
  const { pathname } = useLocation();
  const isActive = (to) => pathname === to || (to !== "/" && pathname.startsWith(`${to}/`));
  const [unreadRequests, setUnreadRequests] = useState(0);
  const [unreadDecisions, setUnreadDecisions] = useState(0);

  const applicationApps = getAppsBySection("applications");
  const branding = getBranding();
  const logoStyle = collapsed ? undefined : branding.logoStyle;

  useEffect(() => {
    let cancelled = false;
    let timer;

    const resolveInboxUrl = async (webId) => {
      const profileDataset = await getSolidDataset(webId, { fetch: noCacheFetch });
      const profile = getThing(profileDataset, webId);
      return profile ? getUrl(profile, LDP.inbox) : null;
    };

    const parseTypes = (thing) => getUrlAll(thing, RDF.type);

    const countUnread = async () => {
      if (!session.info.isLoggedIn || !session.info.webId) return;
      try {
        const inbox = await resolveInboxUrl(session.info.webId);
        if (!inbox) {
          if (!cancelled) {
            setUnreadRequests(0);
            setUnreadDecisions(0);
          }
          return;
        }

        const lastSeenDecisions = Date.parse(
          localStorage.getItem(LAST_SEEN_DECISIONS_KEY) || ""
        ) || 0;
        const hasSeenDecisions = Boolean(lastSeenDecisions);

        const inboxDataset = await getSolidDataset(inbox, { fetch: noCacheFetch });
        const resourceUrls = getContainedResourceUrlAll(inboxDataset);

        let requestCount = 0;
        let decisionCount = 0;

        await Promise.all(
          resourceUrls.map(async (url) => {
            try {
              const dataset = await getSolidDataset(url, { fetch: noCacheFetch });
              const thing = getThing(dataset, url) || getThingAll(dataset)[0];
              if (!thing) return;

              const types = parseTypes(thing);

              if (types.includes(SDM.AccessRequest)) {
                const status = getStringNoLocale(thing, SDM.status) || "";
                if (status === "pending") requestCount += 1;
              }

              if (types.includes(SDM.AccessDecision)) {
                const decidedAt = getStringNoLocale(thing, SDM.decidedAt) || "";
                const createdAt = getStringNoLocale(thing, DCT_CREATED) || "";
                const decisionTime = Date.parse(decidedAt || createdAt) || 0;

                if (!hasSeenDecisions) {
                  decisionCount += 1;
                } else if (decisionTime > lastSeenDecisions) {
                  decisionCount += 1;
                }
              }
            } catch {
              // Ignore malformed inbox items.
            }
          })
        );

        if (!cancelled) {
          setUnreadRequests(requestCount);
          setUnreadDecisions(decisionCount);
        }
      } catch {
        if (!cancelled) {
          setUnreadRequests(0);
          setUnreadDecisions(0);
        }
      }
    };

    if (!webId) return undefined;

    countUnread();
    timer = setInterval(countUnread, 15000);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [webId]);

  const handleLogout = async () => {
    try {
      await session.logout();
      window.location.href = "/";
    } catch (e) {
      console.error("Logout failed:", e);
    }
  };

  return (
    <aside className={`sidebar${collapsed ? " is-collapsed" : ""}`}>
      <div className="sb-brand">
        <div className="sb-logo">
          <img
            src={branding.logoUrl}
            alt={branding.logoAlt}
            style={logoStyle}
          />
        </div>
        <button
          type="button"
          className="sb-collapse"
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <FontAwesomeIcon icon={collapsed ? faChevronRight : faChevronLeft} />
        </button>
      </div>

      <nav className="sb-nav">
        <div className="sb-section">General</div>

        <Link to="/" className={"sb-link" + (isActive("/") ? " active" : "")} title="Solid Data Manager">
          <FontAwesomeIcon icon={navigationIcons["solid-data-manager"]} />
          <span>Solid Data Manager</span>
        </Link>

        <Link
          to="/transactions"
          className={"sb-link" + (isActive("/transactions") ? " active" : "")}
          title="Transaction History"
        >
          <FontAwesomeIcon icon={navigationIcons.transactions} />
          <span>Transaction History</span>
        </Link>

        <Link
          to="/notifications"
          className={"sb-link" + (isActive("/notifications") ? " active" : "")}
          title="Access Requests"
        >
          <span className="sb-icon">
            <FontAwesomeIcon icon={navigationIcons.notifications} />
            {unreadRequests > 0 && (
              <span className="sb-badge">
                {unreadRequests > 9 ? "9+" : unreadRequests}
              </span>
            )}
          </span>
          <span>Access Requests</span>
        </Link>

        <Link
          to="/decisions"
          className={"sb-link" + (isActive("/decisions") ? " active" : "")}
          title="Access Decisions"
        >
          <span className="sb-icon">
            <FontAwesomeIcon icon={navigationIcons.decisions} />
            {unreadDecisions > 0 && (
              <span className="sb-badge">
                {unreadDecisions > 9 ? "9+" : unreadDecisions}
              </span>
            )}
          </span>
          <span>Access Decisions</span>
        </Link>

        <Link
          to="/profile"
          className={"sb-link" + (isActive("/profile") ? " active" : "")}
          title="Profile Manager"
        >
          <FontAwesomeIcon icon={navigationIcons.profile} />
          <span>Profile Manager</span>
        </Link>

        <Link to="/info" className={"sb-link" + (isActive("/info") ? " active" : "")} title="Information">
          <FontAwesomeIcon icon={navigationIcons.info} />
          <span>Information</span>
        </Link>

        <div className="sb-section">Consume and Provide</div>

        <Link
          to="/catalog"
          className={"sb-link" + (isActive("/catalog") ? " active" : "")}
          title="Semantic Data Catalog"
        >
          <FontAwesomeIcon icon={navigationIcons.catalog} />
          <span>Semantic Data Catalog</span>
        </Link>

        <Link
          to="/web/plasma"
          className={"sb-link" + (isActive("/web/plasma") ? " active" : "")}
          title="PLASMA"
        >
          <FontAwesomeIcon icon={navigationIcons.plasma} />
          <span>PLASMA</span>
        </Link>

        <Link
          to="/web/node-red"
          className={"sb-link" + (isActive("/web/node-red") ? " active" : "")}
          title="Node-RED"
        >
          <FontAwesomeIcon icon={navigationIcons["node-red"]} />
          <span>Node-RED</span>
        </Link>

        <Link
          to="/data-connection"
          className={"sb-link" + (isActive("/data-connection") ? " active" : "")}
          title="Data Connection"
        >
          <FontAwesomeIcon icon={navigationIcons["data-connection"]} />
          <span>Data Connection</span>
        </Link>

        {applicationApps.length > 0 && (
          <>
            <div className="sb-section">Applications</div>
            {applicationApps.map((app) => {
              const icon = getAppIcon(app.iconKey);

              if (app.linkType === "internal") {
                return (
                  <Link
                    key={app.id}
                    to={app.href}
                    className={"sb-link" + (isActive(app.href) ? " active" : "")}
                    title={app.title}
                  >
                    <FontAwesomeIcon icon={icon} />
                    <span>{app.title}</span>
                  </Link>
                );
              }

              return (
                <a key={app.id} href={app.href} className="sb-link" title={app.title}>
                  <FontAwesomeIcon icon={icon} />
                  <span>{app.title}</span>
                </a>
              );
            })}
          </>
        )}

        {statisticsAdmin && (
          <>
            <div className="sb-section">Administration</div>
            <Link
              to="/statistics"
              className={"sb-link" + (isActive("/statistics") ? " active" : "")}
              title="Statistics Dashboard"
            >
              <FontAwesomeIcon icon={navigationIcons.statistics} />
              <span>Statistics Dashboard</span>
            </Link>
          </>
        )}

        <div className="sb-section">Miscellaneous</div>
        <Link
          to="/pod-provider"
          className={"sb-link" + (isActive("/pod-provider") ? " active" : "")}
          title="Solid Pod Provider"
        >
          <FontAwesomeIcon icon={navigationIcons["pod-provider"]} />
          <span>Solid Pod Provider</span>
        </Link>
      </nav>

      <div className="sb-bottom">
        <button onClick={handleLogout} className="icon-pill danger" title="Logout">
          <FontAwesomeIcon icon={faRightFromBracket} />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;
