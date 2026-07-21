import React, { useCallback, useEffect, useRef, useState } from "react";
import session from "./solidSession";
import "@hoelk-f/solid-data-manager/embed.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import {
  DataManagerEmbed,
  setSession as setDataManagerSession,
} from "@hoelk-f/solid-data-manager/embed";
import "@hoelk-f/semantic-data-catalog/embed.css";
import {
  CatalogEmbed as SemanticDataCatalogEmbed,
  setSession as setCatalogSession,
  catalogVersion,
} from "@hoelk-f/semantic-data-catalog/embed";
import "@hoelk-f/solid-health-app/embed.css";
import {
  HealthAppEmbed,
  setSession as setHealthAppSession,
  healthAppVersion,
} from "@hoelk-f/solid-health-app/embed";
import "@hoelk-f/solid-chatbot/embed.css";
import {
  ChatbotEmbed,
  setSession as setChatbotSession,
  chatbotVersion,
} from "@hoelk-f/solid-chatbot/embed";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBookOpen, faHeartPulse } from "@fortawesome/free-solid-svg-icons";
import { faRocketchat } from "@fortawesome/free-brands-svg-icons";
import "./App.css";
import ExternalHost from "./components/ExternalHost";
import Info from "./components/Info";
import LoginScreen from "./components/LoginScreen";
import ProfilePage from "./components/ProfilePage";
import Notifications from "./components/Notifications";
import DecisionInbox from "./components/DecisionInbox";
import TransactionHistory from "./components/TransactionHistory";
import OnboardingWizard from "./components/OnboardingWizard";
import SolidPodProvider from "./components/SolidPodProvider";
import DataConnection from "./components/DataConnection";
import LoadingParticleCloud from "./components/LoadingParticleCloud";
import StatisticsDashboard from "./components/StatisticsDashboard";
import StatisticsRouteGuard from "./components/StatisticsRouteGuard";
import { appVersion } from "./versions";
import {
  dispatchLanguageChange,
  I18nProvider,
  normalizeLanguage,
  resolveInitialLanguageSource,
  writeStoredLanguage,
} from "./i18n";
import { loadProfileLanguage, saveProfileLanguage } from "./i18nProfile";
import {
  buildDefaultPrivateRegistry,
  ensureCurrentRegistryMembership,
  loadRegistryConfig,
  resolveCatalogUrl,
  SDP_CATALOG,
} from "./solidCatalog";
import { connectionContainerExists } from "./solidConnections";
import { loadCredentialToken } from "./solidCredentialToken";
import {
  getFundingGrantNumber,
  getFundingLogos,
  getStatisticsConfig,
  isStatisticsAdmin,
} from "./config/runtimeConfig";
import { startStatisticsActivityHeartbeat } from "./statisticsActivity";
import { hasStatisticsConsent } from "./statisticsConsent";

const AUTH_BRIDGE_KEY = "__SOLID_DATASPACE_AUTH__";
const statisticsConfig = getStatisticsConfig();

const App = () => {
  const initialLanguageRef = useRef(resolveInitialLanguageSource());
  const [language, setLanguageState] = useState(initialLanguageRef.current.language);
  const languageRef = useRef(language);
  const languageListenersRef = useRef(new Set());
  const profileLanguageResolvedRef = useRef(false);
  const [webId, setWebId] = useState(session.info.webId || "");
  const [sessionActive, setSessionActive] = useState(
    Boolean(session.info.isLoggedIn && session.info.webId)
  );
  const [onboardingRequired, setOnboardingRequired] = useState(false);
  const [checkingProfile, setCheckingProfile] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [statisticsConsentWebId, setStatisticsConsentWebId] = useState("");

  const getAuthState = useCallback(() => {
    return {
      isLoggedIn: Boolean(session.info.isLoggedIn),
      webId: session.info.webId || null,
    };
  }, []);

  const syncLocalStateFromSession = useCallback(() => {
    const auth = getAuthState();
    setSessionActive(auth.isLoggedIn);
    setWebId(auth.webId || "");
  }, [getAuthState]);

  const loginToSolid = useCallback(async (issuer) => {
    if (!issuer) return;

    await session.login({
      oidcIssuer: issuer,
      redirectUrl: `${window.location.origin}/`,
      clientName: "Solid Dataspace",
    });
  }, []);

  const logoutFromSolid = useCallback(async () => {
    await session.logout({ logoutType: "app" });
    setWebId("");
    setSessionActive(false);
    setOnboardingRequired(false);
    setStatisticsConsentWebId("");
    profileLanguageResolvedRef.current = false;
  }, []);

  const persistProfileLanguage = useCallback(
    async (nextLanguage) => {
      if (!sessionActive || !webId) return;
      await saveProfileLanguage(webId, session.fetch, nextLanguage);
    },
    [sessionActive, webId]
  );

  const handleLanguageChange = useCallback(
    async (nextLanguage) => {
      const normalized = normalizeLanguage(nextLanguage);
      setLanguageState(normalized);
      await persistProfileLanguage(normalized);
    },
    [persistProfileLanguage]
  );

  useEffect(() => {
    document.title = "Solid Dataspace";
    syncLocalStateFromSession();
  }, [syncLocalStateFromSession]);

  useEffect(() => {
    languageRef.current = language;
    writeStoredLanguage(language);
    dispatchLanguageChange(language);
    languageListenersRef.current.forEach((callback) => {
      try {
        callback(language);
      } catch (err) {
        console.error("Language listener failed:", err);
      }
    });
  }, [language]);

  useEffect(() => {
    profileLanguageResolvedRef.current = false;
  }, [webId]);

  useEffect(() => {
    if (
      !sessionActive ||
      !webId ||
      !statisticsConfig.enabled ||
      statisticsConsentWebId !== webId
    ) {
      return undefined;
    }

    return startStatisticsActivityHeartbeat({
      webId,
      fetch: session.fetch,
      config: statisticsConfig,
      onError: (error) => {
        console.warn(
          "Statistics activity heartbeat failed.",
          error instanceof Error ? error.message : error
        );
      },
    });
  }, [sessionActive, statisticsConsentWebId, webId]);

  useEffect(() => {
    if (!sessionActive || !webId) return undefined;

    let cancelled = false;
    ensureCurrentRegistryMembership(webId, session.fetch).catch((error) => {
      if (!cancelled) {
        console.warn(
          "Registry membership reconciliation failed.",
          error instanceof Error ? error.message : error
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [sessionActive, webId]);

  useEffect(() => {
    if (!sessionActive || !webId || profileLanguageResolvedRef.current) return;

    let cancelled = false;
    (async () => {
      try {
        const profileLanguage = await loadProfileLanguage(webId, session.fetch);
        if (cancelled) return;

        if (profileLanguage && initialLanguageRef.current.source === "default") {
          setLanguageState(profileLanguage);
          writeStoredLanguage(profileLanguage);
          dispatchLanguageChange(profileLanguage);
        } else {
          await saveProfileLanguage(webId, session.fetch, languageRef.current);
        }
      } catch (err) {
        console.warn("Failed to sync language preference with profile:", err);
      } finally {
        if (!cancelled) profileLanguageResolvedRef.current = true;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionActive, webId]);

  useEffect(() => {
    setDataManagerSession(session);
    setCatalogSession(session);
    setHealthAppSession(session);
    setChatbotSession(session);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const listeners = new Set();

    const bridge = {
      source: "solid-dataspace-manager",
      version: 1,
      isReady: true,

      getState: () => getAuthState(),

      getFetch: () => session.fetch.bind(session),

      getLanguage: () => languageRef.current,

      setLanguage: async (nextLanguage) => {
        const normalized = normalizeLanguage(nextLanguage);
        setLanguageState(normalized);
        writeStoredLanguage(normalized);
        dispatchLanguageChange(normalized);
        if (session.info.isLoggedIn && session.info.webId) {
          await saveProfileLanguage(session.info.webId, session.fetch, normalized);
        }
      },

      login: async (issuer) => {
        await loginToSolid(issuer);
      },

      logout: async () => {
        await logoutFromSolid();
      },

      subscribe: (callback) => {
        listeners.add(callback);
        return () => listeners.delete(callback);
      },

      subscribeLanguage: (callback) => {
        languageListenersRef.current.add(callback);
        return () => languageListenersRef.current.delete(callback);
      },

      notify: () => {
        const snapshot = getAuthState();

        listeners.forEach((callback) => {
          try {
            callback(snapshot);
          } catch (err) {
            console.error("Bridge listener failed:", err);
          }
        });

        window.dispatchEvent(
          new CustomEvent("solid-dataspace-auth-change", {
            detail: snapshot,
          })
        );
      },
    };

    window[AUTH_BRIDGE_KEY] = bridge;
    bridge.notify();

    return () => {
      if (window[AUTH_BRIDGE_KEY] === bridge) {
        delete window[AUTH_BRIDGE_KEY];
      }
    };
  }, [getAuthState, loginToSolid, logoutFromSolid]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const bridge = window[AUTH_BRIDGE_KEY];
    bridge?.notify?.();
  }, [webId, sessionActive]);

  useEffect(() => {
    if (!sessionActive || !webId) {
      setStatisticsConsentWebId("");
      return undefined;
    }

    let cancelled = false;
    const checkProfileCompleteness = async () => {
      setCheckingProfile(true);
      try {
        const {
          getSolidDataset,
          getThing,
          getThingAll,
          getStringNoLocale,
          getUrl,
          getUrlAll,
        } = await import("@inrupt/solid-client");
        const { FOAF, VCARD, LDP } = await import("@inrupt/vocab-common-rdf");

        const profileDocUrl = webId.split("#")[0];
        const ds = await getSolidDataset(profileDocUrl, { fetch: session.fetch });
        if (cancelled) return;

        let me = getThing(ds, webId) || getThingAll(ds).find((t) => t.url === webId);

        if (!me) {
          if (!cancelled) {
            setStatisticsConsentWebId("");
            setOnboardingRequired(true);
          }
          return;
        }

        const statisticsConsentGranted =
          !statisticsConfig.enabled || hasStatisticsConsent(me);

        const name =
          getStringNoLocale(me, VCARD.fn) ||
          getStringNoLocale(me, FOAF.name) ||
          `${getStringNoLocale(me, VCARD.given_name) || ""} ${
            getStringNoLocale(me, VCARD.family_name) || ""
          }`.trim();

        const org = getStringNoLocale(me, VCARD.organization_name) || "";
        const role = getStringNoLocale(me, VCARD.role) || "";
        const inbox = getUrl(me, LDP.inbox) || "";

        const emailUris = getUrlAll(me, VCARD.hasEmail) || [];
        const collected = [];

        emailUris.forEach((uri) => {
          if (uri.startsWith("mailto:")) {
            collected.push(uri.replace(/^mailto:/, ""));
          } else {
            const emailThing = getThing(ds, uri);
            const mailto = emailThing ? getUrl(emailThing, VCARD.value) : "";
            if (mailto && mailto.startsWith("mailto:")) {
              collected.push(mailto.replace(/^mailto:/, ""));
            }
          }
        });

        const directEmails = (getUrlAll(me, VCARD.email) || [])
          .filter(Boolean)
          .map((uri) => uri.replace(/^mailto:/, ""));

        const allEmails = [...collected, ...directEmails].filter(Boolean);

        const missingBasics = !(name && org && role);
        const missingEmail = allEmails.length === 0;
        const missingInbox = !inbox;

        const profileCatalog = getUrl(me, SDP_CATALOG) || "";
        let missingCatalog = !profileCatalog;
        if (profileCatalog) {
          try {
            await getSolidDataset(profileCatalog.split("#")[0], { fetch: session.fetch });
            missingCatalog = false;
          } catch {
            missingCatalog = true;
          }
        } else {
          try {
            const catalogUrl = await resolveCatalogUrl(webId, session.fetch);
            if (catalogUrl) {
              await getSolidDataset(catalogUrl.split("#")[0], { fetch: session.fetch });
            }
          } catch {
            // Keep onboarding required until the new profile predicate is present.
          }
        }

        let missingRegistry = false;
        try {
          const registryConfig = await loadRegistryConfig(webId, session.fetch);
          if (registryConfig.mode === "private") {
            const privateRegistry = (
              registryConfig.privateRegistry || buildDefaultPrivateRegistry(webId)
            ).trim();
            missingRegistry = !privateRegistry;
          } else {
            missingRegistry = !(registryConfig.registries || []).length;
          }
        } catch {
          missingRegistry = true;
        }

        let missingCredentialToken = false;
        try {
          const credentialToken = await loadCredentialToken(
            webId,
            session.fetch,
            "solid-dataspace"
          );
          missingCredentialToken = !credentialToken;
        } catch {
          missingCredentialToken = true;
        }

        let missingConnectionsContainer = false;
        try {
          const hasConnectionsContainer = await connectionContainerExists(
            webId,
            session.fetch
          );
          missingConnectionsContainer = !hasConnectionsContainer;
        } catch {
          missingConnectionsContainer = true;
        }

        const missingStatisticsConsent =
          statisticsConfig.enabled && !statisticsConsentGranted;

        if (cancelled) return;
        setStatisticsConsentWebId(
          statisticsConfig.enabled && statisticsConsentGranted ? webId : ""
        );
        setOnboardingRequired(
          missingBasics ||
            missingEmail ||
            missingInbox ||
            missingCatalog ||
            missingRegistry ||
            missingCredentialToken ||
            missingConnectionsContainer ||
            missingStatisticsConsent
        );
      } catch (err) {
        if (!cancelled) {
          console.error("Profile completeness check failed:", err);
          setStatisticsConsentWebId("");
          setOnboardingRequired(true);
        }
      } finally {
        if (!cancelled) setCheckingProfile(false);
      }
    };

    checkProfileCompleteness();
    return () => {
      cancelled = true;
    };
  }, [sessionActive, webId]);

  const renderWithI18n = (content) => (
    <I18nProvider language={language} onLanguageChange={handleLanguageChange}>
      {content}
    </I18nProvider>
  );

  if (!sessionActive) {
    return renderWithI18n(
      <div className="container">
        <LoginScreen onLogin={loginToSolid} />
      </div>
    );
  }

  if (checkingProfile) {
    return renderWithI18n(
      <div className="container">
        <div className="loading-screen">
          <div className="loading-card">
            <div className="loading-content">
              <div className="loading-eyebrow">Solid Dataspace</div>
              <div className="loading-title">Checking profile</div>
              <p className="loading-subtitle">
                We are connecting to your Solid Pod and verifying required profile details.
              </p>
              <LoadingParticleCloud />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (onboardingRequired) {
    return renderWithI18n(
      <div className="container">
        <OnboardingWizard
          webId={webId}
          statisticsConfig={statisticsConfig}
          onComplete={() => {
            setStatisticsConsentWebId(
              statisticsConfig.enabled ? webId : ""
            );
            setOnboardingRequired(false);
          }}
          onCancel={async () => {
            await logoutFromSolid();
          }}
        />
      </div>
    );
  }

  const DataManagerPage = () => (
    <div className="data-manager-embed">
      <DataManagerEmbed webId={webId} language={language} />
    </div>
  );

  const CatalogPage = () => (
    <div className="data-catalog-embed">
      <div className="catalog-header toolbar--title">
        <div className="crumb">
          <FontAwesomeIcon icon={faBookOpen} className="crumb-icon" />
          <span>Semantic Data Catalog</span>
        </div>
        <span className="integrated-version">{catalogVersion}</span>
      </div>
      <SemanticDataCatalogEmbed
        webId={webId}
        language={language}
        statisticsConfig={{
          enabled: statisticsConfig.enabled,
          eventsUrl: statisticsConfig.eventsUrl,
        }}
      />
    </div>
  );

  const ChatbotPage = () => (
    <div className="solid-chatbot-embed">
      <div className="chatbot-header toolbar--title">
        <div className="crumb">
          <FontAwesomeIcon icon={faRocketchat} className="crumb-icon" />
          <span>Solid Chatbot</span>
        </div>
        <span className="integrated-version">{chatbotVersion}</span>
      </div>
      <ChatbotEmbed webId={webId} session={session} language={language} />
    </div>
  );

  const HealthAppPage = () => (
    <div className="solid-health-app-embed">
      <div className="health-app-header toolbar--title">
        <div className="crumb">
          <FontAwesomeIcon icon={faHeartPulse} className="crumb-icon" />
          <span>Solid Health App</span>
        </div>
        <span className="integrated-version">{healthAppVersion}</span>
      </div>
      <HealthAppEmbed webId={webId} language={language} />
    </div>
  );

  const fundingLogos = getFundingLogos();
  const fundingGrantNumber = getFundingGrantNumber();
  const statisticsAdmin = isStatisticsAdmin(webId);

  return renderWithI18n(
    <BrowserRouter>
      <div className={`layout${sidebarCollapsed ? " layout--sidebar-collapsed" : ""}`}>
        <Sidebar
          webId={webId}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((value) => !value)}
          statisticsAdmin={statisticsAdmin}
        />
        <div className="main">
          <div className="container">
            <Routes>
              <Route path="/" element={<DataManagerPage />} />
              <Route path="/catalog" element={<CatalogPage />} />
              <Route path="/data-connection" element={<DataConnection webId={webId} />} />
              <Route path="/transactions" element={<TransactionHistory webId={webId} />} />
              <Route path="/notifications" element={<Notifications webId={webId} />} />
              <Route path="/decisions" element={<DecisionInbox webId={webId} />} />
              <Route path="/profile" element={<ProfilePage webId={webId} />} />
              <Route path="/pod-provider" element={<SolidPodProvider webId={webId} />} />
              <Route path="/info" element={<Info />} />
              <Route
                path="/statistics"
                element={
                  <StatisticsRouteGuard webId={webId}>
                    <StatisticsDashboard
                      webId={webId}
                      solidFetch={session.fetch}
                      config={statisticsConfig}
                    />
                  </StatisticsRouteGuard>
                }
              />
              <Route path="/web/solid-health-app" element={<HealthAppPage />} />
              <Route path="/web/solid-chatbot" element={<ChatbotPage />} />
              <Route path="/web/:slug" element={<ExternalHost />} />
            </Routes>
          </div>
          <footer className="app-footer">
            <div className="app-footer__meta">
              <span>&copy; 2026 TMDT</span>
              <span className="app-footer__separator">&middot;</span>
              <span className="app-footer__version">{appVersion}</span>
            </div>
            {(fundingLogos.length > 0 || fundingGrantNumber) && (
              <div className="app-footer__funding" aria-label="Funding logos">
                {fundingGrantNumber && (
                  <div className="app-footer__grant">
                    <span>grant number</span>
                    <strong>{fundingGrantNumber}</strong>
                  </div>
                )}
                {fundingLogos.map((logo) => (
                  <img
                    key={logo.id}
                    src={logo.src}
                    alt={logo.alt}
                    style={logo.logoStyle}
                  />
                ))}
              </div>
            )}
          </footer>
        </div>
      </div>
    </BrowserRouter>
  );
};

export default App;
