import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faRightFromBracket,
  faChevronLeft,
  faChevronRight,
} from "@fortawesome/free-solid-svg-icons";
import session from "../solidSession";
import { useI18n } from "../i18n";
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
  adminArea = false,
}) {
  const { pathname } = useLocation();
  const { t } = useI18n();
  const isActive = (to) =>
    pathname === to || (to !== "/" && pathname.startsWith(`${to}/`));
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  useEffect(() => setMobileMenuOpen(false), [pathname]);
  const [unreadRequests, setUnreadRequests] = useState(0);
  const [unreadDecisions, setUnreadDecisions] = useState(0);

  const generalApps = getAppsBySection("general");
  const consumeApps = getAppsBySection("consume");
  const applicationApps = getAppsBySection("applications");
  const renderApp = (app) => {
    const content = (
      <>
        <FontAwesomeIcon icon={getAppIcon(app.iconKey)} />
        <span>{t(app.title)}</span>
      </>
    );
    return app.linkType === "internal" ? (
      <Link
        key={app.id}
        to={app.href}
        className={"sb-link" + (isActive(app.href) ? " active" : "")}
        title={t(app.title)}
      >
        {content}
      </Link>
    ) : (
      <a key={app.id} href={app.href} className="sb-link" title={t(app.title)}>
        {content}
      </a>
    );
  };
  const branding = getBranding();
  const logoStyle = collapsed ? undefined : branding.logoStyle;

  useEffect(() => {
    let cancelled = false;
    let timer;

    const resolveInboxUrl = async (webId) => {
      const profileDataset = await getSolidDataset(webId, {
        fetch: noCacheFetch,
      });
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

        const lastSeenDecisions =
          Date.parse(localStorage.getItem(LAST_SEEN_DECISIONS_KEY) || "") || 0;
        const hasSeenDecisions = Boolean(lastSeenDecisions);

        const inboxDataset = await getSolidDataset(inbox, {
          fetch: noCacheFetch,
        });
        const resourceUrls = getContainedResourceUrlAll(inboxDataset);

        let requestCount = 0;
        let decisionCount = 0;

        await Promise.all(
          resourceUrls.map(async (url) => {
            try {
              const dataset = await getSolidDataset(url, {
                fetch: noCacheFetch,
              });
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
          }),
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
    <aside
      className={`sidebar${collapsed ? " is-collapsed" : ""}${mobileMenuOpen ? " is-mobile-open" : ""}`}
    >
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
          aria-label={t(collapsed ? "Expand sidebar" : "Collapse sidebar")}
          title={t(collapsed ? "Expand sidebar" : "Collapse sidebar")}
        >
          <FontAwesomeIcon icon={collapsed ? faChevronRight : faChevronLeft} />
        </button>
      </div>

      <button
        type="button"
        className="sb-mobile-toggle"
        aria-expanded={mobileMenuOpen}
        aria-controls="dataspace-navigation"
        onClick={() => setMobileMenuOpen((open) => !open)}
      >
        {t(mobileMenuOpen ? "Close navigation" : "Open navigation")}
      </button>
      <nav
        id="dataspace-navigation"
        className="sb-nav"
        aria-label={t("Navigation")}
      >
        <div className="sb-section">{t("General")}</div>

        {generalApps.map(renderApp)}

        <Link
          to="/transactions"
          className={"sb-link" + (isActive("/transactions") ? " active" : "")}
          title={t("Transaction History")}
        >
          <FontAwesomeIcon icon={navigationIcons.transactions} />
          <span>{t("Transaction History")}</span>
        </Link>

        <Link
          to="/notifications"
          className={"sb-link" + (isActive("/notifications") ? " active" : "")}
          title={t("Access Requests")}
        >
          <span className="sb-icon">
            <FontAwesomeIcon icon={navigationIcons.notifications} />
            {unreadRequests > 0 && (
              <span className="sb-badge">
                {unreadRequests > 9 ? "9+" : unreadRequests}
              </span>
            )}
          </span>
          <span>{t("Access Requests")}</span>
        </Link>

        <Link
          to="/decisions"
          className={"sb-link" + (isActive("/decisions") ? " active" : "")}
          title={t("Access Decisions")}
        >
          <span className="sb-icon">
            <FontAwesomeIcon icon={navigationIcons.decisions} />
            {unreadDecisions > 0 && (
              <span className="sb-badge">
                {unreadDecisions > 9 ? "9+" : unreadDecisions}
              </span>
            )}
          </span>
          <span>{t("Access Decisions")}</span>
        </Link>

        <Link
          to="/profile"
          className={"sb-link" + (isActive("/profile") ? " active" : "")}
          title={t("Profile Manager")}
        >
          <FontAwesomeIcon icon={navigationIcons.profile} />
          <span>{t("Profile Manager")}</span>
        </Link>

        <Link
          to="/info"
          className={"sb-link" + (isActive("/info") ? " active" : "")}
          title={t("Information")}
        >
          <FontAwesomeIcon icon={navigationIcons.info} />
          <span>{t("Information")}</span>
        </Link>

        {consumeApps.length > 0 && (
          <>
            <div className="sb-section">{t("Consume and Provide")}</div>
            {consumeApps.map(renderApp)}
          </>
        )}
        {applicationApps.length > 0 && (
          <>
            <div className="sb-section">{t("Applications")}</div>
            {applicationApps.map(renderApp)}
          </>
        )}

        {(statisticsAdmin || adminArea) && (
          <>
            <div className="sb-section">{t("Administration")}</div>
            <Link
              to={adminArea ? "/admin" : "/statistics"}
              className={
                "sb-link" +
                (isActive(adminArea ? "/admin" : "/statistics")
                  ? " active"
                  : "")
              }
              title={adminArea ? "Admin Area" : t("Statistics Dashboard")}
            >
              <FontAwesomeIcon
                icon={
                  adminArea ? navigationIcons.admin : navigationIcons.statistics
                }
              />
              <span>
                {adminArea ? "Admin Area" : t("Statistics Dashboard")}
              </span>
            </Link>
          </>
        )}

        <div className="sb-section">{t("Miscellaneous")}</div>
        <Link
          to="/pod-provider"
          className={"sb-link" + (isActive("/pod-provider") ? " active" : "")}
          title={t("Solid Pod Provider")}
        >
          <FontAwesomeIcon icon={navigationIcons["pod-provider"]} />
          <span>{t("Solid Pod Provider")}</span>
        </Link>
      </nav>

      <div className="sb-bottom">
        <button
          onClick={handleLogout}
          className="icon-pill danger"
          title={t("Logout")}
        >
          <FontAwesomeIcon icon={faRightFromBracket} />
          <span>{t("Logout")}</span>
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;
