import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import {
  faShieldHalved,
  faTableCellsLarge,
  faChartColumn,
  faLayerGroup,
  faPalette,
  faDatabase,
  faUsers,
  faKey,
  faServer,
  faClockRotateLeft,
  faPlus,
  faXmark,
  faCheck,
  faArrowRight,
  faPen,
  faCircleInfo,
  faRotateRight,
  faChevronDown,
} from "@fortawesome/free-solid-svg-icons";
import { adminRequest, awaitAdminJob } from "../adminApi";
import { useI18n } from "../i18n";
import { AdminProvisioning, AdminPlatform } from "./AdminProvisioning";
import { appVersion } from "../versions";
import { normalizeStatisticsConfig } from "../config/runtimeConfig";
import session from "../solidSession";
import StatisticsDashboard from "./StatisticsDashboard";
import { getAppIcon } from "../config/appIcons";
import "./AdminArea.css";

const EMPTY_PROFILES = [];
const sections = [
  ["overview", "Übersicht", faTableCellsLarge],
  ["statistics", "Statistiken", faChartColumn],
  ["apps", "Anwendungen", faLayerGroup],
  ["branding", "Erscheinungsbild", faPalette],
  ["catalog", "Katalog & Registry", faDatabase],
  ["admins", "Administratoren", faUsers],
  ["login", "Anmeldung", faKey],
  ["operations", "Betrieb", faServer],
  ["history", "Änderungsverlauf", faClockRotateLeft],
];
const copy = (value) => JSON.parse(JSON.stringify(value));
const read = (object, path) =>
  path.split(".").reduce((value, key) => value?.[key], object);
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const display = (value, translate = (value) => value) =>
  typeof value === "boolean"
    ? value
      ? translate("An")
      : translate("Aus")
    : value == null
      ? "—"
      : typeof value === "object"
        ? Array.isArray(value)
          ? value.map((item) => display(item, translate)).join("\n")
          : Object.entries(value)
              .map(
                ([key, item]) =>
                  `${translate(friendlyPath(key))}: ${display(item, translate)}`,
              )
              .join("\n")
        : String(value);
const friendlyPath = (path) =>
  path
    .replace(/^public\./, "")
    .replace("administration.adminWebIds", "Administratoren")
    .replace("fundingGrantNumber", "Förderkennzeichen")
    .replace("branding.projectName", "Projektname")
    .replace("branding.logoUrl", "Projektlogo")
    .replace("apps", "Anwendungen")
    .replace("providers", "Login-Anbieter")
    .replace("fundingLogos", "Förderlogos");
function Icon({ icon }) {
  return <FontAwesomeIcon icon={icon} />;
}
function ProfileSelectArrow(props) {
  return <FontAwesomeIcon icon={faChevronDown} {...props} />;
}
function Button({ children, primary, icon, ...props }) {
  return (
    <button
      type="button"
      className={`admin-btn${primary ? " admin-btn--primary" : ""}`}
      {...props}
    >
      {icon && <Icon icon={icon} />}
      {children}
    </button>
  );
}
function Notice({ children, error }) {
  return (
    <div
      className={`admin-notice${error ? " admin-notice--error" : ""}`}
      role={error ? "alert" : "status"}
    >
      <Icon icon={error ? faCircleInfo : faShieldHalved} />
      <div>{children}</div>
    </div>
  );
}
function Panel({ title, children, action }) {
  return (
    <section className="admin-panel">
      <div className="admin-panel-heading">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
function Modal({
  title,
  children,
  onClose,
  actions,
  className = "",
  busy = false,
}) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`admin-modal ${className}`}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="admin-modal-heading">
        <h2>{title}</h2>
        <button
          type="button"
          className="admin-icon-btn"
          aria-label="Schließen"
          disabled={busy}
          onClick={onClose}
        >
          <Icon icon={faXmark} />
        </button>
      </div>
      <div className="admin-modal-content">{children}</div>
      {actions && <div className="admin-modal-actions">{actions}</div>}
    </dialog>
  );
}

export default function AdminArea({ access, loadingAccess, webId }) {
  const { language, t } = useI18n();
  const [newProfile, setNewProfile] = useState(false);
  const [provisioningBusy, setProvisioningBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [localAccess, setLocalAccess] = useState(null);
  const navigate = useNavigate(),
    { pathname } = useLocation();
  const section = sections.some((s) => s[0] === pathname.split("/")[2])
    ? pathname.split("/")[2]
    : "overview";
  const [profileId, setProfileId] = useState("");
  const [loaded, setLoaded] = useState(null),
    [draft, setDraft] = useState(null),
    [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [preview, setPreview] = useState(null),
    [appEditor, setAppEditor] = useState(null),
    [addAdmin, setAddAdmin] = useState(false),
    [adminWebId, setAdminWebId] = useState(""),
    [switchTo, setSwitchTo] = useState(""),
    [reloadAvailable, setReloadAvailable] = useState(false);
  const requestRef = useRef(0);
  const profileSelectRef = useRef(null);
  const canEdit = Boolean(loaded?.canEdit),
    dirty = Boolean(loaded && draft && !equal(loaded.profile, draft));
  const profiles = localAccess?.profiles || access?.profiles || EMPTY_PROFILES;
  const activeStatistics = useMemo(
    () => normalizeStatisticsConfig(loaded?.profile?.public?.statistics),
    [loaded],
  );
  useEffect(() => {
    if (profiles.length && !profiles.some((p) => p.id === profileId))
      setProfileId(
        profiles.some((p) => p.id === access.currentProfile)
          ? access.currentProfile
          : profiles[0].id,
      );
  }, [access, profileId, profiles]);
  useEffect(() => {
    if (!profileId) return;
    const request = ++requestRef.current,
      controller = new AbortController();
    setLoading(true);
    setError("");
    setLoaded(null);
    setDraft(null);
    setHistory([]);
    adminRequest(`/profiles/${profileId}`, undefined, {
      signal: controller.signal,
    })
      .then((result) => {
        if (request === requestRef.current) {
          setLoaded(result);
          setDraft(copy(result.profile));
        }
      })
      .catch((e) => {
        if (e.name !== "AbortError" && request === requestRef.current)
          setError(e.message);
      })
      .finally(() => {
        if (request === requestRef.current) setLoading(false);
      });
    return () => controller.abort();
  }, [profileId, refreshKey]);
  useEffect(() => {
    if (section !== "history" || !profileId || !canEdit) return;
    const controller = new AbortController();
    adminRequest(`/profiles/${profileId}/history`, undefined, {
      signal: controller.signal,
    })
      .then(setHistory)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [section, profileId, canEdit, message]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    if (!webId || !access?.profiles?.length) return;
    const jobId = sessionStorage.getItem("dataspace-admin-job");
    if (!jobId) return;
    const controller = new AbortController();
    setBusy(true);
    setMessage(t("Checking the previous activation …"));
    awaitAdminJob({ status: "running", jobId }, undefined, {
      signal: controller.signal,
    })
      .then(async (result) => {
        const next = await adminRequest("/me", undefined, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setLocalAccess(next);
        if (result.profileId) setProfileId(result.profileId);
        setMessage(result.message);
        setRefreshKey((v) => v + 1);
        setReloadAvailable(true);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
    // Resume once for this authenticated identity, not on a language or draft change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webId, access?.currentProfile]);
  function requiresOperator(path) {
    return (
      /^(domains|redirectDomains|public\.(catalog|statistics|syncWorker)\.|public\.plasmaUrl)/.test(
        path,
      ) ||
      /^public\.providers\.\d+\.(issuer|enabled)$/.test(path) ||
      (/^public\.apps\.\d+\.enabled$/.test(path) &&
        ["node-red", "plasma"].includes(
          draft?.public.apps[Number(path.split(".")[2])]?.id,
        ))
    );
  }
  function update(path, value) {
    if (!canEdit || busy || (requiresOperator(path) && !loaded?.isOperator))
      return;
    setPreview(null);
    setError("");
    setDraft((current) => {
      const next = copy(current);
      const keys = path.split(".");
      let obj = next;
      keys.slice(0, -1).forEach((key) => {
        obj = obj[key];
      });
      obj[keys.at(-1)] = value;
      return next;
    });
  }
  function field(
    label,
    path,
    { type = "text", hint = "", disabled = false, options = null } = {},
  ) {
    const value = read(draft, path) ?? "";
    return (
      <label className="admin-field">
        <span>{label}</span>
        {options ? (
          <select
            value={value}
            disabled={
              !canEdit ||
              busy ||
              disabled ||
              (requiresOperator(path) && !loaded?.isOperator)
            }
            onChange={(e) => update(path, e.target.value)}
          >
            {options.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        ) : type === "webids" ? (
          <textarea
            rows={3}
            value={Array.isArray(value) ? value.join("\n") : value}
            disabled={
              !canEdit ||
              busy ||
              disabled ||
              (requiresOperator(path) && !loaded?.isOperator)
            }
            onChange={(e) => update(path, e.target.value.split("\n"))}
            onBlur={(e) =>
              update(
                path,
                e.target.value
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean),
              )
            }
          />
        ) : (
          <input
            type={type}
            value={value}
            disabled={
              !canEdit ||
              busy ||
              disabled ||
              (requiresOperator(path) && !loaded?.isOperator)
            }
            onChange={(e) =>
              update(
                path,
                type === "number" ? Number(e.target.value) : e.target.value,
              )
            }
          />
        )}{" "}
        {hint && <small>{hint}</small>}
      </label>
    );
  }
  function toggle(label, path, disabled = false) {
    return (
      <label className="admin-toggle">
        <input
          type="checkbox"
          role="switch"
          aria-label={label}
          checked={Boolean(read(draft, path))}
          onChange={(e) => update(path, e.target.checked)}
          disabled={
            !canEdit ||
            busy ||
            disabled ||
            (requiresOperator(path) && !loaded?.isOperator)
          }
        />
        <span>{label}</span>
      </label>
    );
  }
  async function reload() {
    setBusy(true);
    setError("");
    try {
      const result = await adminRequest(`/profiles/${profileId}`);
      setLoaded(result);
      setDraft(copy(result.profile));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function review() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      setPreview(
        await adminRequest(`/profiles/${profileId}/preview`, {
          revision: loaded.revision,
          profile: draft,
        }),
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    setBusy(true);
    setError("");
    try {
      const result = await awaitAdminJob(
        await adminRequest(`/profiles/${profileId}/apply`, {
          previewId: preview.id,
        }),
      );
      setPreview(null);
      setMessage(result.message);
      setReloadAvailable(result.status === "applied");
      const next = await adminRequest(`/profiles/${profileId}`);
      setLoaded(next);
      setDraft(copy(next.profile));
    } catch (e) {
      setPreview(null);
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function restore(entry) {
    setBusy(true);
    setError("");
    try {
      const record = await adminRequest(
        `/profiles/${profileId}/history/${entry.id}`,
      );
      setDraft(copy(record.before));
      setMessage(
        "Vorheriger Stand als Entwurf geladen. Bitte Änderungen prüfen.",
      );
      navigate("/admin/overview");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (loadingAccess)
    return (
      <div className="admin-area" lang={language}>
        <Notice>Admin-Berechtigungen werden geprüft …</Notice>
      </div>
    );
  if (!profiles.length)
    return (
      <div className="admin-area" lang={language}>
        <Notice error>
          Für diese Solid-WebID ist keine Admin Area freigegeben.
        </Notice>
      </div>
    );
  const current = profiles.find((p) => p.id === profileId);
  const available = sections.filter((s) => canEdit || s[0] === "statistics");
  const selectedSection = canEdit ? section : "statistics";
  const test = draft?.environment === "test";
  const go = (id) => navigate(`/admin/${id}`);
  const pageHeading = (title, description, action) => (
    <div className="admin-page-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
  const operationsNotice = (
    <Notice>
      Changes are checked, backed up and activated. Shared server changes
      require operator access; affected services are verified after the update.
    </Notice>
  );
  function content() {
    const pub = draft.public;
    if (selectedSection === "overview")
      return (
        <>
          {pageHeading(
            "Übersicht",
            `${t("Settings for")} ${pub.branding.projectName}`,
          )}
          <div className="admin-metrics">
            {[
              [faLayerGroup, pub.apps.length, "Anwendungen"],
              [
                faCheck,
                pub.apps.filter((a) => a.enabled && a.visible).length,
                "Im Menü sichtbar",
              ],
              [
                faUsers,
                draft.administration.adminWebIds.length,
                "Administratoren",
              ],
              [
                faChartColumn,
                pub.statistics.enabled ? "Aktiv" : "Deaktiviert",
                "Statistikerfassung",
              ],
            ].map(([icon, value, label]) => (
              <div className="admin-panel admin-metric" key={label}>
                <span className="admin-symbol">
                  <Icon icon={icon} />
                </span>
                <div>
                  <strong>{value}</strong>
                  <p>{label}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="admin-grid">
            {sections
              .filter((s) =>
                ["apps", "branding", "admins", "catalog"].includes(s[0]),
              )
              .map(([id, label, icon]) => (
                <button
                  key={id}
                  className="admin-panel admin-quick"
                  onClick={() => go(id)}
                >
                  <span className="admin-symbol">
                    <Icon icon={icon} />
                  </span>
                  <h2>{label}</h2>
                  <Icon icon={faArrowRight} />
                </button>
              ))}
          </div>
          <Panel title="Statistics Dashboard">
            <p>
              Nutzeraktivität, Downloads, Nutzerbefragung und Metadatenqualität.
            </p>
            <Button icon={faChartColumn} onClick={() => go("statistics")}>
              Statistiken öffnen
            </Button>
          </Panel>
        </>
      );
    if (selectedSection === "apps")
      return (
        <>
          {pageHeading(
            "Anwendungen",
            "Verfügbarkeit und Menüeinträge für dieses Profil.",
          )}
          <div className="admin-panel admin-apps">
            <div className="admin-app-heading">
              <span>Anwendung</span>
              <span>Aktiv</span>
              <span>Im Menü</span>
              <span />
            </div>
            {pub.apps.map((a, i) => (
              <div key={a.id} className="admin-app-row">
                <div className="admin-app-info">
                  <span className="admin-symbol">
                    <Icon icon={getAppIcon(a.iconKey)} />
                  </span>
                  <div>
                    <strong>{a.title}</strong>
                    <small>{a.href}</small>
                  </div>
                </div>
                {toggle(
                  `${a.title} ${t("active")}`,
                  `public.apps.${i}.enabled`,
                )}
                {toggle(
                  `${a.title} ${t("in menu")}`,
                  `public.apps.${i}.visible`,
                )}
                <button
                  className="admin-icon-btn"
                  aria-label={`${a.title} ${t("edit")}`}
                  onClick={() => setAppEditor(i)}
                >
                  <Icon icon={faPen} />
                </button>
              </div>
            ))}
          </div>
          <p className="admin-hint">
            „Aktiv“ steuert die Erreichbarkeit über dieses Profil. „Im Menü“
            steuert nur den Sidebar-Eintrag. Pod-Zugriffsrechte bleiben
            maßgeblich.
          </p>
        </>
      );
    if (selectedSection === "branding")
      return (
        <>
          {pageHeading(
            "Erscheinungsbild",
            "Projektname, Logos und Förderhinweise.",
          )}
          <div className="admin-grid">
            <Panel title="Projekt & Logo">
              <div className="admin-form-grid">
                {field("Projektname", "public.branding.projectName")}
                {field("Logo-URL oder Pfad", "public.branding.logoUrl", {
                  hint: "Vorhandene Datei oder HTTPS-Adresse.",
                })}
                {field("Alternativtext", "public.branding.logoAlt")}
                {field("Logobreite", "public.branding.logoWidth", {
                  hint: "Zum Beispiel 95px.",
                })}
                {field("Logohöhe", "public.branding.logoHeight", {
                  hint: "Zum Beispiel auto.",
                })}
              </div>
            </Panel>
            <Panel title="Vorschau">
              <div className="admin-brand-preview">
                <img
                  src={pub.branding.logoUrl}
                  alt={pub.branding.logoAlt}
                  referrerPolicy="no-referrer"
                />
                <strong>{pub.branding.projectName}</strong>
              </div>
            </Panel>
          </div>
          <Panel
            title="Förderhinweise"
            action={
              <Button
                icon={faPlus}
                onClick={() =>
                  update("public.fundingLogos", [
                    ...pub.fundingLogos,
                    {
                      id: `logo-${Date.now()}`,
                      src: "",
                      alt: "",
                      order: pub.fundingLogos.length + 1,
                      logoWidth: "120px",
                      logoHeight: "auto",
                    },
                  ])
                }
              >
                Logo hinzufügen
              </Button>
            }
          >
            {field("Förderkennzeichen", "public.fundingGrantNumber")}
            {pub.fundingLogos.map((logo, i) => (
              <div key={logo.id} className="admin-list-card">
                <div className="admin-form-grid">
                  {field("Kennung", `public.fundingLogos.${i}.id`)}
                  {field("Logo-Adresse", `public.fundingLogos.${i}.src`)}
                  {field("Beschreibung", `public.fundingLogos.${i}.alt`)}
                  {field("Reihenfolge", `public.fundingLogos.${i}.order`, {
                    type: "number",
                  })}
                  {field("Breite", `public.fundingLogos.${i}.logoWidth`)}
                  {field("Höhe", `public.fundingLogos.${i}.logoHeight`)}
                  {"logoMaxHeight" in logo &&
                    field(
                      "Maximale Höhe",
                      `public.fundingLogos.${i}.logoMaxHeight`,
                    )}
                </div>
                <Button
                  onClick={() =>
                    update(
                      "public.fundingLogos",
                      pub.fundingLogos.filter((_, n) => n !== i),
                    )
                  }
                >
                  Logo entfernen
                </Button>
              </div>
            ))}
          </Panel>
        </>
      );
    if (selectedSection === "catalog")
      return (
        <>
          {pageHeading(
            "Katalog & Registry",
            "Die Registry ergibt sich aus dem aufgerufenen Profil.",
          )}
          <Panel title="Zugeordnete Registry">
            {field("Registry", "public.catalog.defaultRegistry", {
              options: loaded.registries.map((r) => [
                r.url,
                r.label + " · " + r.id,
              ]),
            })}
            <p className="admin-hint">
              Angezeigt werden die erreichbaren Datenquellen der registrierten
              Personen. Im Katalog erscheinen weder Registry-Filter noch
              Registry-Infozeile.
            </p>
          </Panel>
          <div className="admin-grid">
            <Panel title="Cache & Suche">
              <p>
                Cache und Suchindex bleiben pro Registry getrennt. Änderungen
                der Zuordnung werden mit den zuständigen Diensten geprüft.
              </p>
            </Panel>
            <Panel title="Bestehende Daten">
              <p>
                Diese Verwaltung verändert keine Katalogeinträge oder
                Berechtigungen in den Pods. Der DACE-Altbestand bleibt erhalten.
              </p>
            </Panel>
          </div>
          {operationsNotice}
        </>
      );
    if (selectedSection === "admins")
      return (
        <>
          {pageHeading(
            "Administratoren",
            "Mehrere Solid-WebIDs können dieses Profil verwalten.",
            <Button
              primary
              icon={faPlus}
              onClick={() => {
                setAdminWebId("");
                setAddAdmin(true);
              }}
            >
              Admin hinzufügen
            </Button>,
          )}
          <Panel title={`Zugriff auf ${pub.branding.projectName}`}>
            {draft.administration.adminWebIds.map((id) => (
              <div className="admin-list-card admin-person" key={id}>
                <span className="admin-symbol">
                  <Icon icon={faUsers} />
                </span>
                <div>
                  <strong>
                    {id === webId ? "Deine WebID" : "Profil-Admin"}
                  </strong>
                  <p>{id}</p>
                  <span className="admin-chip">Profil-Admin</span>
                </div>
                <Button
                  disabled={
                    busy ||
                    id === webId ||
                    draft.administration.adminWebIds.length <= 1
                  }
                  onClick={() =>
                    update(
                      "administration.adminWebIds",
                      draft.administration.adminWebIds.filter((v) => v !== id),
                    )
                  }
                >
                  Entfernen
                </Button>
              </div>
            ))}
            <Notice>
              Die Berechtigung wird auf dem Server anhand der angemeldeten WebID
              geprüft. Die eigene Berechtigung und mindestens ein Admin bleiben
              erhalten.
            </Notice>
          </Panel>
          <Panel title="Statistik-Zugriff">
            {field(
              "Berechtigte WebIDs · eine pro Zeile",
              "public.statistics.adminWebIds",
              {
                type: "webids",
                hint: "Statistik-Leserechte und Profil-Verwaltung werden getrennt vergeben. Der Statistik-Pod muss den Zugriff ebenfalls erlauben.",
              },
            )}
          </Panel>
        </>
      );
    if (selectedSection === "login")
      return (
        <>
          {pageHeading(
            "Anmeldung",
            "Solid-Anbieter für dieses Profil.",
            <Button
              icon={faPlus}
              onClick={() =>
                update("public.providers", [
                  ...pub.providers,
                  {
                    id: `provider-${Date.now()}`,
                    label: "Neuer Anbieter",
                    issuer: "",
                    note: "",
                    enabled: false,
                    recommended: false,
                  },
                ])
              }
            >
              Anbieter hinzufügen
            </Button>,
          )}
          {pub.providers.map((p, i) => (
            <Panel key={p.id} title={p.label}>
              <div className="admin-form-grid">
                {field("Kennung", `public.providers.${i}.id`)}
                {field("Anzeigename", `public.providers.${i}.label`)}
                {field("Issuer-Adresse", `public.providers.${i}.issuer`)}
                {field("Hinweis", `public.providers.${i}.note`)}
              </div>
              <div className="admin-inline">
                {toggle("Aktiv", `public.providers.${i}.enabled`)}
                {toggle("Empfohlen", `public.providers.${i}.recommended`)}
              </div>
            </Panel>
          ))}
          {operationsNotice}
        </>
      );
    if (selectedSection === "statistics")
      return (
        <>
          {pageHeading(
            "Statistiken",
            "Das bestehende Statistics Dashboard ist hier integriert.",
          )}{" "}
          {!loaded.canReadStatistics ? (
            <Notice>
              Für diese WebID sind keine Statistik-Leserechte konfiguriert.
            </Notice>
          ) : !activeStatistics.enabled ? (
            <Notice>
              Die Statistikerfassung ist in diesem Profil deaktiviert. Die
              bestehenden Einstellungen wurden übernommen.
            </Notice>
          ) : (
            <>
              <Notice>
                Bestandsauswertung: Der konfigurierte Statistik-Speicher kann
                mehrere Profile umfassen. Zugriff erhalten ausschließlich die
                dafür berechtigten Statistik-Admins.
              </Notice>
              <StatisticsDashboard
                webId={webId}
                solidFetch={session.fetch}
                config={activeStatistics}
                allowSetup={false}
              />
            </>
          )}
          {canEdit && (
            <Panel title="Statistik-Einstellungen">
              <div className="admin-inline">
                {toggle(
                  "Statistikerfassung aktiv",
                  "public.statistics.enabled",
                  test,
                )}
              </div>
              <div className="admin-form-grid">
                {field("Statistik-Pod", "public.statistics.podBaseUrl")}
                {field("Download-Ereignisse", "public.statistics.eventsUrl")}
                {field("Worker-WebID", "public.statistics.workerWebId")}
                {field("Zeitzone", "public.statistics.timezone")}
                {field(
                  "Aktivitäts-Ressourcenpfad",
                  "public.statistics.activityResourcePath",
                )}
              </div>
              <p className="admin-hint">
                {test
                  ? "Der Live-Test erfasst keine produktiven Statistikdaten. "
                  : ""}
                Existing Pod permissions remain unchanged. Configuration changes
                are checked before activation.
              </p>
            </Panel>
          )}
        </>
      );
    if (selectedSection === "operations")
      return (
        <>
          {pageHeading(
            "Betrieb",
            "Bestehende Betriebsparameter dieses Profils.",
          )}
          {operationsNotice}
          <div className="admin-grid">
            <Panel title="Sync-Worker">
              <div className="admin-inline">
                {toggle(
                  "Worker-Verwaltung in der Oberfläche",
                  "public.syncWorker.enabled",
                  test,
                )}
              </div>
              <div className="admin-form-grid">
                {field("API-Adresse", "public.syncWorker.apiUrl")}
                {field("Service-WebID", "public.syncWorker.serviceWebId")}
                {field(
                  "Vorgabe für Sync-Intervall (Minuten)",
                  "public.syncWorker.intervalMinutes",
                  {
                    type: "number",
                    hint: "Vorgabe der Oberfläche; der tatsächliche Worker-Takt wird gesondert konfiguriert.",
                  },
                )}
              </div>
            </Panel>
            <Panel title="Arbeitsbereiche">
              {field("PLASMA-Adresse", "public.plasmaUrl")}
              <p className="admin-hint">
                Node-RED und PLASMA behalten ihre getrennten Arbeitsbereiche.
                Dienste und Datenvolumes werden hier nicht gelöscht oder
                zusammengeführt.
              </p>
            </Panel>
          </div>
          {loaded.isOperator && loaded.platform && (
            <AdminPlatform
              key={loaded.platform.revision}
              profileId={profileId}
              configuration={loaded.platform}
              onSaved={async (message) => {
                setMessage(message);
                await reload();
              }}
            />
          )}
          <Panel title="Domains">
            {field("Domains, one per line; primary address first", "domains", {
              type: "webids",
              hint: "Zusätzliche Domains benötigen passende DNS-, Routing- und Login-Einstellungen.",
            })}
            {field(
              "Redirect aliases to the primary address, one per line",
              "redirectDomains",
              {
                type: "webids",
                hint: "Keep the address currently in use as an alias. Open the new address before redirecting the old one.",
              },
            )}
          </Panel>
          {"cityToursLegacyContinuousWebIds" in pub && (
            <Panel title="City Tours · bestehende Freigaben">
              {field(
                "WebIDs · eine pro Zeile",
                "public.cityToursLegacyContinuousWebIds",
                { type: "webids" },
              )}
            </Panel>
          )}
        </>
      );
    if (selectedSection === "history")
      return (
        <>
          {pageHeading(
            "Änderungsverlauf",
            "Changes, backups and activation results.",
          )}
          <Panel title="Gespeicherte Änderungen">
            {!history.length ? (
              <p>Noch keine Änderungen über die Admin Area gespeichert.</p>
            ) : (
              history.map((entry) => (
                <div className="admin-list-card" key={entry.id}>
                  <div className="admin-panel-heading">
                    <strong>
                      {new Date(entry.completedAt).toLocaleString(
                        language === "de" ? "de-DE" : "en-GB",
                      )}
                    </strong>
                    <span className="admin-chip">
                      {{
                        applied: "Übernommen",
                        "pending-deployment": "Betriebsänderung offen",
                        failed: "Fehlgeschlagen",
                        "rolled-back": "Zurückgesetzt",
                        applying: "In Bearbeitung",
                        discarded: "Discarded",
                      }[entry.status] || entry.status}
                    </span>
                  </div>
                  <p className="admin-webid" translate="no">
                    {entry.actor}
                  </p>
                  <ul>
                    {entry.diff.map((d) => (
                      <li key={d.path}>
                        {(d.label || friendlyPath(d.path))
                          .split(" · ")
                          .map((part) => t(part))
                          .join(" · ")}
                      </li>
                    ))}
                  </ul>
                  {entry.status === "applied" && !entry.kind && (
                    <Button
                      disabled={busy}
                      icon={faClockRotateLeft}
                      onClick={() => restore(entry)}
                    >
                      Vorherigen Stand als Entwurf laden
                    </Button>
                  )}
                  {entry.status === "pending-deployment" && (
                    <div className="admin-inline">
                      <Button
                        disabled={busy}
                        onClick={async () => {
                          try {
                            const record = await adminRequest(
                              `/profiles/${profileId}/history/${entry.id}`,
                            );
                            setDraft(copy(record.profile));
                            navigate("/admin/overview");
                            setMessage(
                              t(
                                "Saved proposal loaded. Review it again before activation.",
                              ),
                            );
                          } catch (e) {
                            setError(e.message);
                          }
                        }}
                      >
                        {t("Load saved proposal")}
                      </Button>
                      <Button
                        disabled={busy}
                        onClick={async () => {
                          try {
                            await adminRequest(
                              `/profiles/${profileId}/discard`,
                              { entryId: entry.id },
                            );
                            setHistory(
                              await adminRequest(
                                `/profiles/${profileId}/history`,
                              ),
                            );
                          } catch (e) {
                            setError(e.message);
                          }
                        }}
                      >
                        {t("Discard proposal")}
                      </Button>
                    </div>
                  )}
                </div>
              ))
            )}
          </Panel>
        </>
      );
    return null;
  }
  return (
    <section className="admin-area" lang={language}>
      <header className="toolbar--title admin-header">
        <div className="crumb">
          <Icon icon={faShieldHalved} />
          <strong>Admin Area</strong>
        </div>
        <span className="integrated-version">{appVersion}</span>
      </header>
      <div className="admin-context">
        <div className="admin-profile-field">
          <label htmlFor="admin-profile-selector">
            <small>Du verwaltest das Profil</small>
          </label>
          <div className="admin-profile-select">
            <span className="admin-profile-icon" aria-hidden="true">
              <Icon icon={faLayerGroup} />
            </span>
            <Select
              id="admin-profile-selector"
              ref={profileSelectRef}
              className="admin-profile-control"
              inputProps={{ "aria-label": t("Profil auswählen") }}
              value={profileId}
              disabled={busy}
              IconComponent={ProfileSelectArrow}
              renderValue={() => (
                <span translate="no">
                  {current?.label} ({current?.id})
                </span>
              )}
              MenuProps={{
                disablePortal: true,
                container: () => profileSelectRef.current,
                disableScrollLock: true,
                slotProps: {
                  paper: { className: "admin-profile-menu" },
                  list: { className: "admin-profile-options" },
                },
              }}
              onChange={(e) => {
                if (dirty) setSwitchTo(e.target.value);
                else setProfileId(e.target.value);
              }}
            >
              {profiles.map((p) => (
                <MenuItem
                  className="admin-profile-option"
                  translate="no"
                  key={p.id}
                  value={p.id}
                >
                  <span className="admin-profile-option-text">
                    <strong>{p.label}</strong>
                    <span>{p.id}</span>
                  </span>
                  {p.id === profileId && (
                    <span className="admin-profile-check" aria-hidden="true">
                      <Icon icon={faCheck} />
                    </span>
                  )}
                </MenuItem>
              ))}
            </Select>
          </div>
        </div>
        {(localAccess?.isOperator || access?.isOperator) && (
          <Button
            onClick={() => setNewProfile(true)}
            disabled={dirty || busy || loading}
            icon={faPlus}
          >
            {t("Create profile")}
          </Button>
        )}
      </div>
      <nav className="admin-nav" aria-label="Admin-Bereiche">
        {available.map(([id, label, icon]) => (
          <button
            key={id}
            type="button"
            aria-current={selectedSection === id ? "page" : undefined}
            className={selectedSection === id ? "is-active" : ""}
            onClick={() => go(id)}
          >
            <Icon icon={icon} />
            {label}
          </button>
        ))}
      </nav>
      <label className="admin-mobile-nav">
        Bereich
        <select value={selectedSection} onChange={(e) => go(e.target.value)}>
          {available.map(([id, label]) => (
            <option value={id} key={id}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <div className="admin-content">
        {error && (
          <Notice error>
            {t(error)}
            <Button disabled={busy} onClick={reload} icon={faRotateRight}>
              Aktuellen Stand laden
            </Button>
          </Notice>
        )}
        {message && (
          <Notice>
            {message}
            {reloadAvailable && (
              <Button onClick={() => window.location.reload()}>
                Oberfläche neu laden
              </Button>
            )}
          </Notice>
        )}
        {loading ? (
          <p role="status">Konfiguration wird geladen …</p>
        ) : draft && loaded ? (
          content()
        ) : null}
      </div>
      {canEdit && (
        <footer className="admin-savebar">
          <div>
            <strong>
              {dirty ? "Ungespeicherte Änderungen" : "Keine offenen Änderungen"}
            </strong>
            <small translate="no">{current?.label}</small>
          </div>
          <div>
            <Button
              disabled={!dirty || busy}
              onClick={() => {
                setDraft(copy(loaded.profile));
                setError("");
              }}
            >
              Verwerfen
            </Button>
            <Button
              primary
              icon={faArrowRight}
              disabled={!dirty || busy}
              onClick={review}
            >
              {busy ? "Wird geprüft …" : "Änderungen prüfen"}
            </Button>
          </div>
        </footer>
      )}
      {preview && (
        <Modal
          title="Änderungen prüfen"
          onClose={() => {
            if (!busy) setPreview(null);
          }}
          actions={
            <>
              <Button disabled={busy} onClick={() => setPreview(null)}>
                Abbrechen
              </Button>
              <Button primary disabled={busy} onClick={apply}>
                {busy
                  ? "Wird gespeichert …"
                  : preview.requiresDeployment
                    ? "Activate and check services"
                    : "Übernehmen"}
              </Button>
            </>
          }
        >
          <p>
            Profil: <strong translate="no">{current?.label}</strong>
          </p>
          {preview.diff.map((d) => (
            <div className="admin-diff" key={d.path}>
              <strong>
                {(d.label || friendlyPath(d.path))
                  .split(" · ")
                  .map((part) => t(part))
                  .join(" · ")}
              </strong>
              <div>
                <pre>{display(d.before, t)}</pre>
                <Icon icon={faArrowRight} />
                <pre>{display(d.after, t)}</pre>
              </div>
            </div>
          ))}
          <Notice>
            {preview.requiresDeployment
              ? "The previous state is backed up. Affected services are updated and checked; failures trigger a rollback."
              : "Der vorherige Stand wird gesichert. Anschließend werden die Einstellungen ohne neues App-Release übernommen."}
          </Notice>
        </Modal>
      )}
      {newProfile && (
        <Modal
          title={t("Create profile")}
          className="admin-modal--provisioning"
          busy={provisioningBusy}
          onClose={() => {
            if (!provisioningBusy) setNewProfile(false);
          }}
        >
          <AdminProvisioning
            profiles={profiles}
            registries={loaded?.registries || []}
            webId={webId}
            onBusyChange={setProvisioningBusy}
            onClose={() => setNewProfile(false)}
            onCreated={async (id) => {
              const next = await adminRequest("/me");
              setLocalAccess(next);
              setProfileId(id);
              setNewProfile(false);
              setMessage(t("Profile created and activated."));
              navigate("/admin/overview");
            }}
          />
        </Modal>
      )}
      {appEditor !== null && draft && (
        <Modal
          title="Anwendung bearbeiten"
          onClose={() => setAppEditor(null)}
          actions={
            <Button primary onClick={() => setAppEditor(null)}>
              Fertig
            </Button>
          }
        >
          <div className="admin-form-grid">
            {field("Anzeigename", `public.apps.${appEditor}.title`)}
            {field("Link", `public.apps.${appEditor}.href`)}
            {field("Menügruppe", `public.apps.${appEditor}.section`, {
              options: [
                ["general", "Allgemein"],
                ["consume", "Daten nutzen"],
                ["applications", "Anwendungen"],
              ],
            })}
            {field("Reihenfolge", `public.apps.${appEditor}.order`, {
              type: "number",
            })}
            {field("Symbolkennung", `public.apps.${appEditor}.iconKey`)}
            {field("Linkart", `public.apps.${appEditor}.linkType`, {
              options: [
                ["internal", "Intern"],
                ["external", "Extern"],
              ],
            })}
          </div>
        </Modal>
      )}
      {addAdmin && (
        <Modal
          title="Admin hinzufügen"
          onClose={() => setAddAdmin(false)}
          actions={
            <>
              <Button onClick={() => setAddAdmin(false)}>Abbrechen</Button>
              <Button
                primary
                disabled={
                  !/^https:\/\/[^\s]+$/.test(adminWebId) ||
                  draft.administration.adminWebIds.includes(adminWebId)
                }
                onClick={() => {
                  update("administration.adminWebIds", [
                    ...draft.administration.adminWebIds,
                    adminWebId,
                  ]);
                  setAddAdmin(false);
                }}
              >
                Vormerken
              </Button>
            </>
          }
        >
          <label className="admin-field">
            Vollständige Solid-WebID
            <input
              type="url"
              value={adminWebId}
              onChange={(e) => setAdminWebId(e.target.value.trim())}
              placeholder="https://pod.example/profile/card#me"
            />
          </label>
          <Notice>
            Diese Person darf die Einstellungen dieses Profils verwalten.
            Statistik-Leserechte und Pod-Zugriffe werden separat vergeben.
          </Notice>
        </Modal>
      )}
      {switchTo && (
        <Modal
          title="Profil wechseln?"
          onClose={() => setSwitchTo("")}
          actions={
            <>
              <Button onClick={() => setSwitchTo("")}>Zurück</Button>
              <Button
                primary
                onClick={() => {
                  setProfileId(switchTo);
                  setSwitchTo("");
                  setMessage("");
                }}
              >
                Verwerfen und wechseln
              </Button>
            </>
          }
        >
          <p>Die ungespeicherten Änderungen dieses Profils würden verworfen.</p>
        </Modal>
      )}
    </section>
  );
}
