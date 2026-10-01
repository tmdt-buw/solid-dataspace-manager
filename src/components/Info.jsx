import React from "react";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBell,
  faBookOpen,
  faChartLine,
  faChevronRight,
  faCircleInfo,
  faClipboardCheck,
  faDatabase,
  faDiagramProject,
  faFolderOpen,
  faHeartPulse,
  faHexagonNodes,
  faInbox,
  faKey,
  faLink,
  faRoute,
  faServer,
  faShieldHalved,
  faTemperatureHigh,
  faUser,
  faUserGear,
} from "@fortawesome/free-solid-svg-icons";
import { useI18n } from "../i18n";
import {
  getAppsBySection,
  getDataspaceId,
  getSyncWorkerConfig,
} from "../config/runtimeConfig";
import { appVersion } from "../versions";
import {
  INFO_APPLICATION_DETAILS,
  INFO_ARCHITECTURE_NODES,
  INFO_CURRENT_SCOPE,
  INFO_DATA_BOUNDARIES,
  INFO_FLOW_STEPS,
  INFO_GLOSSARY,
  INFO_TOOL_GROUPS,
} from "./infoContent";
import "./Info.css";

const toolIcons = {
  "data-manager": faFolderOpen,
  profile: faUserGear,
  transactions: faChartLine,
  "pod-provider": faServer,
  catalog: faBookOpen,
  plasma: faHexagonNodes,
  "node-red": faDiagramProject,
  "data-connection": faLink,
  requests: faInbox,
  decisions: faBell,
};

const groupIcons = {
  manage: faUser,
  exchange: faHexagonNodes,
};

const applicationIcons = {
  temperature: faTemperatureHigh,
  health: faHeartPulse,
  tour: faRoute,
  questionnaire: faClipboardCheck,
  server: faServer,
  database: faDatabase,
  default: faDatabase,
};

const architectureIcons = {
  identity: faUser,
  storage: faDatabase,
  control: faShieldHalved,
  use: faBookOpen,
};

const boundaryIcons = {
  pod: faDatabase,
  catalog: faBookOpen,
  browser: faKey,
  services: faDiagramProject,
};

function DestinationLink({ destination, className, children, label }) {
  if (destination.linkType === "external") {
    return (
      <a className={className} href={destination.href} aria-label={label}>
        {children}
      </a>
    );
  }

  return (
    <Link className={className} to={destination.href} aria-label={label}>
      {children}
    </Link>
  );
}

function SectionHeading({ eyebrow, title, description, id }) {
  return (
    <div className="info-section-heading">
      <span className="info-eyebrow">{eyebrow}</span>
      <h2 id={id}>{title}</h2>
      <p>{description}</p>
    </div>
  );
}

function Info() {
  const { t } = useI18n();
  const applications = getAppsBySection("applications");
  const dataspaceId = getDataspaceId();
  const syncWorker = getSyncWorkerConfig();

  const statusItems = [
    { label: t("Manager release"), value: appVersion },
    {
      label: t("Current Dataspace"),
      value: dataspaceId || t("Local runtime"),
      code: Boolean(dataspaceId),
    },
    {
      label: t("Integrated applications"),
      value: `${applications.length} ${t("active")}`,
    },
    {
      label: t("Background sync"),
      value: syncWorker.enabled
        ? `${syncWorker.intervalMinutes} ${t("minute cycle")}`
        : t("Not configured"),
    },
  ];

  return (
    <div className="info-page">
      <div className="toolbar toolbar--title info-toolbar">
        <div className="crumb">
          <FontAwesomeIcon icon={faCircleInfo} className="crumb-icon" />
          <span>{t("Information")}</span>
        </div>
        <span className="info-toolbar__version" aria-label={`${t("Version")} ${appVersion}`}>
          {appVersion}
        </span>
      </div>

      <main className="info-shell">
        <section className="info-hero" aria-labelledby="info-title">
          <div className="info-hero__copy">
            <span className="info-eyebrow info-eyebrow--light">
              {t("Current implementation")}
            </span>
            <h1 id="info-title">{t("Your Solid Dataspace, at a glance.")}</h1>
            <p className="info-hero__lead">
              {t(
                "One workspace connects personal Pod storage, semantic discovery, controlled data sharing and domain applications. Your WebID identifies you; access is still decided at the resource."
              )}
            </p>

            <div className="info-principles" aria-label={t("Core principles")}>
              <span>
                <FontAwesomeIcon icon={faDatabase} aria-hidden="true" />
                {t("Pod-first storage")}
              </span>
              <span>
                <FontAwesomeIcon icon={faShieldHalved} aria-hidden="true" />
                {t("Explicit access decisions")}
              </span>
              <span>
                <FontAwesomeIcon icon={faKey} aria-hidden="true" />
                {t("One Solid identity")}
              </span>
            </div>
          </div>

          <figure className="info-topology">
            <figcaption>
              <span>{t("Solid architecture")}</span>
              <strong>{t("Control follows the data")}</strong>
            </figcaption>
            <ol className="info-topology__rail">
              {INFO_ARCHITECTURE_NODES.map((node, index) => (
                <li key={node.id}>
                  <span className="info-topology__number">0{index + 1}</span>
                  <span className="info-topology__icon">
                    <FontAwesomeIcon icon={architectureIcons[node.iconKey]} aria-hidden="true" />
                  </span>
                  <span className="info-topology__text">
                    <strong>{t(node.label)}</strong>
                    <small>{t(node.detail)}</small>
                  </span>
                </li>
              ))}
            </ol>
            <p>
              {t(
                "The Pod remains the primary store. Catalogs expose selected metadata; permissions stay attached to protected resources."
              )}
            </p>
          </figure>

          <dl className="info-status" aria-label={t("Current runtime status")}>
            {statusItems.map((item) => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd className={item.code ? "info-status__code" : undefined}>{item.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <nav className="info-index" aria-label={t("On this page")}>
          <span>{t("On this page")}</span>
          <a href="#info-workspace">{t("Workspace")}</a>
          <a href="#info-applications">{t("Applications")}</a>
          <a href="#info-flow">{t("Data flow")}</a>
          <a href="#info-privacy">{t("Data & privacy")}</a>
          <a href="#info-terms">{t("Key terms")}</a>
        </nav>

        <section className="info-section" aria-labelledby="info-workspace">
          <SectionHeading
            eyebrow={t("Platform")}
            title={t("Available in this Dataspace today")}
            description={t(
              "The Manager brings the daily Solid workflows into one consistent workspace. Each entry opens the corresponding tool."
            )}
            id="info-workspace"
          />

          <div className="info-tool-groups">
            {INFO_TOOL_GROUPS.map((group) => (
              <article className="info-tool-group" key={group.id}>
                <header>
                  <span className="info-tool-group__icon">
                    <FontAwesomeIcon icon={groupIcons[group.iconKey]} aria-hidden="true" />
                  </span>
                  <div>
                    <h3>{t(group.title)}</h3>
                    <p>{t(group.description)}</p>
                  </div>
                </header>
                <ul>
                  {group.tools.map((tool) => (
                    <li key={tool.id}>
                      <Link
                        className="info-tool-link"
                        to={tool.to}
                        aria-label={`${t("Open")} ${t(tool.title)}`}
                      >
                        <span className="info-tool-link__icon">
                          <FontAwesomeIcon icon={toolIcons[tool.iconKey]} aria-hidden="true" />
                        </span>
                        <span className="info-tool-link__copy">
                          <strong>{t(tool.title)}</strong>
                          <small>{t(tool.description)}</small>
                        </span>
                        <FontAwesomeIcon
                          className="info-tool-link__arrow"
                          icon={faChevronRight}
                          aria-hidden="true"
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="info-section" aria-labelledby="info-applications">
          <SectionHeading
            eyebrow={t("Domain applications")}
            title={t("Applications available in this instance")}
            description={t(
              "The list follows the active runtime configuration, so this page and the sidebar always describe the same application set."
            )}
            id="info-applications"
          />

          <div className="info-applications">
            {applications.map((app) => {
              const detail = INFO_APPLICATION_DETAILS[app.id] || {
                eyebrow: "Integrated application",
                description: "An application connected to this Solid Dataspace instance.",
                dataNote: "Data handling depends on the application's access policy",
              };
              const icon = applicationIcons[app.iconKey] || applicationIcons.default;

              return (
                <DestinationLink
                  key={app.id}
                  destination={app}
                  className="info-application"
                  label={`${t("Open")} ${t(app.title)}`}
                >
                  <span className="info-application__visual">
                    <FontAwesomeIcon icon={icon} aria-hidden="true" />
                    <small>{t(detail.eyebrow)}</small>
                  </span>
                  <span className="info-application__body">
                    <span className="info-application__title">
                      <strong>{t(app.title)}</strong>
                      <FontAwesomeIcon icon={faChevronRight} aria-hidden="true" />
                    </span>
                    <span className="info-application__description">{t(detail.description)}</span>
                    <span className="info-application__data">
                      <FontAwesomeIcon icon={faShieldHalved} aria-hidden="true" />
                      {t(detail.dataNote)}
                    </span>
                  </span>
                </DestinationLink>
              );
            })}
          </div>
        </section>

        <section className="info-flow" aria-labelledby="info-flow">
          <div className="info-flow__intro">
            <span className="info-eyebrow info-eyebrow--light">{t("End-to-end")}</span>
            <h2 id="info-flow">{t("How data moves through the Dataspace")}</h2>
            <p>
              {t(
                "Storage, discovery and use are separate decisions. Publishing metadata does not automatically make a protected source readable."
              )}
            </p>
          </div>
          <ol className="info-flow__steps">
            {INFO_FLOW_STEPS.map((step, index) => (
              <li key={step.title}>
                <span className="info-flow__number">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <h3>{t(step.title)}</h3>
                  <p>{t(step.description)}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="info-section" aria-labelledby="info-privacy">
          <SectionHeading
            eyebrow={t("Data boundaries")}
            title={t("What stays where")}
            description={t(
              "The project is Pod-first, but it is not accurate to claim that every derived value exists only in a Pod. These are the current processing boundaries."
            )}
            id="info-privacy"
          />
          <div className="info-boundaries">
            {INFO_DATA_BOUNDARIES.map((boundary) => (
              <article key={boundary.title}>
                <span className="info-boundaries__icon">
                  <FontAwesomeIcon icon={boundaryIcons[boundary.iconKey]} aria-hidden="true" />
                </span>
                <span className="info-boundaries__label">{t(boundary.label)}</span>
                <h3>{t(boundary.title)}</h3>
                <p>{t(boundary.description)}</p>
              </article>
            ))}
          </div>
          <aside className="info-privacy-note">
            <FontAwesomeIcon icon={faShieldHalved} aria-hidden="true" />
            <div>
              <strong>{t("Access is contextual, not global")}</strong>
              <p>
                {t(
                  "Solid-OIDC authenticates the session. WAC permissions determine whether that authenticated agent may access a specific Pod resource."
                )}
              </p>
            </div>
          </aside>
          <div className="info-scope">
            <div className="info-scope__heading">
              <span className="info-eyebrow">{t("Current scope")}</span>
              <h3>{t("Implemented today, with clear boundaries")}</h3>
            </div>
            <ul>
              {INFO_CURRENT_SCOPE.map((item) => (
                <li key={item}>{t(item)}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className="info-section info-section--terms" aria-labelledby="info-terms">
          <SectionHeading
            eyebrow={t("Solid in plain language")}
            title={t("Key terms")}
            description={t("The concepts used throughout this workspace, without protocol jargon.")}
            id="info-terms"
          />
          <dl className="info-glossary">
            {INFO_GLOSSARY.map((item) => (
              <div key={item.term}>
                <dt>{t(item.term)}</dt>
                <dd>{t(item.definition)}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>
    </div>
  );
}

export default Info;
