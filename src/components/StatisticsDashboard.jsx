import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChartColumn,
  faDatabase,
  faDownload,
  faRotateRight,
  faShieldHalved,
  faTriangleExclamation,
  faUsers,
} from "@fortawesome/free-solid-svg-icons";
import {
  detectStatisticsPodInitialization,
  initializeStatisticsPod,
} from "../statisticsPodSetup";
import { useI18n } from "../i18n";
import "./StatisticsDashboard.css";

const DOWNLOAD_TYPES = [
  ["dataset_download", "Dataset downloads"],
  ["dataset_access", "Dataset access clicks"],
  ["semantic_model_download", "Semantic model downloads"],
];

const ACCOUNTS_PAGE_SIZE = 10;

const numberOrZero = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const arrayOrEmpty = (value) => (Array.isArray(value) ? value : []);

function normalizeDownloadTypes(byType = {}) {
  return DOWNLOAD_TYPES.reduce(
    (result, [type]) => ({
      ...result,
      [type]: numberOrZero(byType?.[type]),
    }),
    {}
  );
}

function normalizeCatalogInstanceDownloads(value) {
  const entries = Array.isArray(value)
    ? value.map((instance) => ["", instance])
    : value && typeof value === "object"
    ? Object.entries(value)
    : [];

  return entries.flatMap(([fallbackId, instance], index) => {
    if (!instance || typeof instance !== "object" || Array.isArray(instance)) {
      return [];
    }

    const id = String(
      instance.id || fallbackId || instance.label || `catalog-${index + 1}`
    );
    const label = String(instance.label || id);
    return [
      {
        id,
        label,
        total: numberOrZero(instance.total),
        byType: normalizeDownloadTypes(instance.byType),
      },
    ];
  });
}

export function normalizeStatisticsSnapshot(raw = {}) {
  const downloads = raw.downloads || {};
  const catalog = raw.catalog || {};
  return {
    schemaVersion: numberOrZero(raw.schemaVersion),
    generatedAt: raw.generatedAt || "",
    timezone: raw.timezone || "Europe/Berlin",
    month: raw.month || "",
    pseudonymVersion: raw.pseudonymVersion || "",
    totals: {
      uniqueAccounts: numberOrZero(raw.totals?.uniqueAccounts),
      activeUsers: numberOrZero(raw.totals?.activeUsers),
      activeRate: numberOrZero(raw.totals?.activeRate),
    },
    registries: arrayOrEmpty(raw.registries).map((registry, index) => ({
      id: registry?.id || registry?.url || `registry-${index + 1}`,
      label: registry?.label || registry?.id || registry?.url || `Registry ${index + 1}`,
      url: registry?.url || "",
      memberCount: numberOrZero(registry?.memberCount),
      activeUsers: numberOrZero(registry?.activeUsers),
      activeRate: numberOrZero(registry?.activeRate),
      members: arrayOrEmpty(registry?.members).map((member) => ({
        id: member?.id || "N/A",
        lastSeen: member?.lastSeen || null,
      })),
      errors: arrayOrEmpty(registry?.errors),
    })),
    activity: {
      monthly: arrayOrEmpty(raw.activity?.monthly)
        .map((month) => ({
          month: month?.month || "",
          activeUsers: numberOrZero(month?.activeUsers),
          uniqueAccounts: numberOrZero(month?.uniqueAccounts),
          activeRate: numberOrZero(month?.activeRate),
        }))
        .filter((month) => month.month)
        .slice(-24),
    },
    downloads: {
      total: numberOrZero(downloads.total),
      byType: normalizeDownloadTypes(downloads.byType),
      byCatalogInstance: normalizeCatalogInstanceDownloads(
        downloads.byCatalogInstance
      ),
      datasets: arrayOrEmpty(downloads.datasets)
        .map((dataset) => ({
          datasetUrl: dataset?.datasetUrl || "",
          title: dataset?.title || dataset?.datasetUrl || "Unknown dataset",
          total: numberOrZero(dataset?.total),
          byType: normalizeDownloadTypes(dataset?.byType),
        }))
        .sort((a, b) => b.total - a.total),
      monthly: arrayOrEmpty(downloads.monthly),
    },
    catalog: {
      datasets: normalizeCatalogEntity(catalog.datasets),
      series: normalizeCatalogEntity(catalog.series),
    },
    partialErrors: arrayOrEmpty(raw.partialErrors),
    run: {
      startedAt: raw.run?.startedAt || "",
      completedAt: raw.run?.completedAt || "",
      durationMs: numberOrZero(raw.run?.durationMs),
      status: raw.run?.status || "unknown",
    },
  };
}

function normalizeCatalogEntity(entity = {}) {
  return {
    count: numberOrZero(entity.count),
    semanticModelCount: numberOrZero(entity.semanticModelCount),
    semanticModelRate: numberOrZero(entity.semanticModelRate),
    quality: {
      score: numberOrZero(entity.quality?.score),
      filledFields: numberOrZero(entity.quality?.filledFields),
      totalFields: numberOrZero(entity.quality?.totalFields),
      fields: arrayOrEmpty(entity.quality?.fields).map((field) => ({
        key: field?.key || "unknown",
        filled: numberOrZero(field?.filled),
        total: numberOrZero(field?.total),
        rate: numberOrZero(field?.rate),
      })),
    },
  };
}

export async function loadStatisticsSnapshot(solidFetch, snapshotUrl) {
  const response = await solidFetch(snapshotUrl, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) {
    const error = new Error(
      response.status === 404
        ? "No statistics snapshot exists yet. Initialize the storage and wait for the next worker run."
        : response.status === 403
        ? "The current admin cannot read the statistics snapshot."
        : `The statistics snapshot could not be loaded (${response.status}).`
    );
    error.status = response.status;
    throw error;
  }

  try {
    return normalizeStatisticsSnapshot(await response.json());
  } catch {
    throw new Error("The statistics snapshot does not contain valid JSON.");
  }
}

function localeFor(language) {
  return language === "de" ? "de-DE" : "en-US";
}

function formatNumber(value, language) {
  return new Intl.NumberFormat(localeFor(language)).format(numberOrZero(value));
}

function percentValue(value) {
  const number = numberOrZero(value);
  return number <= 1 ? number * 100 : number;
}

function formatPercent(value, language) {
  return `${new Intl.NumberFormat(localeFor(language), {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(percentValue(value))} %`;
}

function formatDate(value, timezone = "Europe/Berlin", language = "en") {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "N/A";
  return new Intl.DateTimeFormat(localeFor(language), {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
    hourCycle: "h23",
  }).format(date);
}

function newestLastSeen(current, candidate) {
  if (!current) return candidate || null;
  if (!candidate) return current;

  const currentTime = Date.parse(current);
  const candidateTime = Date.parse(candidate);
  if (Number.isNaN(currentTime)) {
    return Number.isNaN(candidateTime) ? current : candidate;
  }
  if (Number.isNaN(candidateTime)) return current;
  return candidateTime > currentTime ? candidate : current;
}

export function aggregateStatisticsAccounts(registries = []) {
  const accounts = new Map();

  arrayOrEmpty(registries).forEach((registry) => {
    arrayOrEmpty(registry?.members).forEach((member) => {
      const id = member?.id || "N/A";
      const existing = accounts.get(id);
      accounts.set(id, {
        id,
        lastSeen: newestLastSeen(existing?.lastSeen, member?.lastSeen),
      });
    });
  });

  return Array.from(accounts.values()).sort((a, b) => a.id.localeCompare(b.id));
}

function MetricCard({ icon, label, value }) {
  return (
    <article className="statistics-metric">
      <span className="statistics-metric__icon">
        <FontAwesomeIcon icon={icon} />
      </span>
      <div>
        <div className="statistics-metric__label">{label}</div>
        <strong>{value}</strong>
      </div>
    </article>
  );
}

function QualityPanel({ title, entity, showSemanticModel = false }) {
  const { language, t } = useI18n();
  return (
    <article className="statistics-panel statistics-quality">
      <div className="statistics-panel__header">
        <div>
          <h3>{title}</h3>
          <p>{formatNumber(entity.count, language)} {t("entries")}</p>
        </div>
      </div>
      <div className="statistics-quality-metric">
        <span>{t("Metadata quality")}</span>
        <strong>
          {formatNumber(entity.quality.filledFields, language)} / {formatNumber(
            entity.quality.totalFields,
            language
          )} ({formatPercent(entity.quality.score, language)})
        </strong>
      </div>
      {showSemanticModel && (
        <div className="statistics-semantic-model">
          <span>{t("With semantic model")}</span>
          <strong>
            {formatNumber(entity.semanticModelCount, language)} / {formatNumber(
              entity.count,
              language
            )} ({formatPercent(entity.semanticModelRate, language)})
          </strong>
        </div>
      )}
      {entity.quality.fields.length > 0 ? (
        <div className="statistics-table-wrap">
          <table className="statistics-table statistics-table--compact">
            <thead>
              <tr>
                <th>{t("Field")}</th>
                <th>{t("Completed")}</th>
                <th>{t("Rate")}</th>
              </tr>
            </thead>
            <tbody>
              {entity.quality.fields.map((field) => (
                <tr key={field.key}>
                  <td>{field.key}</td>
                  <td>
                    {formatNumber(field.filled, language)} / {formatNumber(
                      field.total,
                      language
                    )}
                  </td>
                  <td>{formatPercent(field.rate, language)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="statistics-empty">{t("No field rates available yet.")}</p>
      )}
    </article>
  );
}

function ActivityChart({ months }) {
  const { language, t } = useI18n();
  const max = Math.max(1, ...months.map((month) => month.activeUsers));
  if (!months.length) {
    return <p className="statistics-empty">{t("No monthly values available yet.")}</p>;
  }

  return (
    <div
      className="statistics-chart"
      aria-label={t("Active users over the last 24 months")}
    >
      {months.map((month) => (
        <div className="statistics-chart__item" key={month.month}>
          <div className="statistics-chart__plot">
            <div
              className="statistics-chart__bar"
              style={{ height: `${Math.max(4, (month.activeUsers / max) * 100)}%` }}
              title={`${month.month}: ${month.activeUsers} ${t("active users")}`}
            />
          </div>
          <strong>{formatNumber(month.activeUsers, language)}</strong>
          <span>{month.month}</span>
        </div>
      ))}
    </div>
  );
}

function StatisticsDashboard({ webId, solidFetch, config }) {
  const { language, t } = useI18n();
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [setup, setSetup] = useState({ status: "idle", message: "" });
  const [storageState, setStorageState] = useState("checking");
  const [accountsPage, setAccountsPage] = useState(1);

  const detectStorageState = useCallback(async () => {
    try {
      const result = await detectStatisticsPodInitialization({
        fetch: solidFetch,
        config,
      });
      return ["initialized", "uninitialized"].includes(result?.status)
        ? result.status
        : "unknown";
    } catch {
      return "unknown";
    }
  }, [config, solidFetch]);

  const refresh = useCallback(async () => {
    if (!config?.enabled || !config.currentSnapshotUrl) {
      setSnapshot(null);
      setError("Statistics are disabled in the runtime configuration.");
      setStorageState("unknown");
      setLoading(false);
      return;
    }
    setLoading(true);
    setStorageState("checking");
    setError("");
    const [snapshotResult, nextStorageState] = await Promise.all([
      loadStatisticsSnapshot(solidFetch, config.currentSnapshotUrl).then(
        (nextSnapshot) => ({ nextSnapshot }),
        (loadError) => ({ loadError })
      ),
      detectStorageState(),
    ]);
    setStorageState(nextStorageState);
    if (snapshotResult.nextSnapshot) {
      const { nextSnapshot } = snapshotResult;
      setSnapshot(nextSnapshot);
      setAccountsPage(1);
    } else {
      const { loadError } = snapshotResult;
      setSnapshot(null);
      setError(loadError.message || "The statistics snapshot could not be loaded.");
    }
    setLoading(false);
  }, [config, detectStorageState, solidFetch]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const initializeStorage = async () => {
    setSetup({ status: "running", message: "Preparing statistics storage..." });
    try {
      await initializeStatisticsPod({
        webId,
        fetch: solidFetch,
        config,
        onProgress: ({ step, key }) => {
          setSetup({
            status: "running",
            message:
              step === "securing"
                ? "Securing statistics ACLs..."
                : "Checking statistics containers...",
          });
        },
      });
      setSetup({
        status: "success",
        message:
          "Statistics storage and ACLs are ready. New values appear after the next worker run.",
      });
      await refresh();
      setStorageState("initialized");
    } catch (setupError) {
      setSetup({
        status: "error",
        message: setupError.message || "Statistics storage could not be initialized.",
      });
      setStorageState("checking");
      setStorageState(await detectStorageState());
    }
  };

  const runStatus = snapshot?.run?.status || "unknown";
  const runLabel =
    runStatus === "ok" || runStatus === "success"
      ? "Successful"
      : runStatus === "partial"
      ? "Partial"
      : runStatus === "error" || runStatus === "failed"
      ? "Failed"
      : runStatus;
  const downloadsByType = useMemo(() => snapshot?.downloads?.byType || {}, [snapshot]);
  const accounts = useMemo(
    () => aggregateStatisticsAccounts(snapshot?.registries),
    [snapshot?.registries]
  );
  const accountsPageCount = Math.max(
    1,
    Math.ceil(accounts.length / ACCOUNTS_PAGE_SIZE)
  );
  const safeAccountsPage = Math.min(accountsPage, accountsPageCount);
  const visibleAccounts = accounts.slice(
    (safeAccountsPage - 1) * ACCOUNTS_PAGE_SIZE,
    safeAccountsPage * ACCOUNTS_PAGE_SIZE
  );

  useEffect(() => {
    setAccountsPage((page) => Math.min(page, accountsPageCount));
  }, [accountsPageCount]);

  return (
    <section className="statistics-dashboard">
      <header className="statistics-header toolbar--title">
        <div className="crumb">
          <FontAwesomeIcon icon={faChartColumn} className="crumb-icon" />
          <div>
            <h1>{t("Statistics Dashboard")}</h1>
          </div>
        </div>
        <div className="statistics-actions">
          {storageState === "uninitialized" && setup.status !== "running" && (
            <button
              type="button"
              className="statistics-button statistics-button--secondary"
              onClick={initializeStorage}
            >
              <FontAwesomeIcon icon={faShieldHalved} />
              {t("Initialize statistics storage")}
            </button>
          )}
          <button
            type="button"
            className="pill-btn"
            onClick={refresh}
            disabled={loading}
          >
            <FontAwesomeIcon icon={faRotateRight} />
            <span>{t("Refresh")}</span>
          </button>
        </div>
      </header>

      {setup.message && (
        <div className={`statistics-notice statistics-notice--${setup.status}`} role="status">
          {t(setup.message)}
        </div>
      )}

      {loading && (
        <div className="statistics-state" role="status">
          <span className="statistics-spinner" />
          {t("Loading statistics snapshot...")}
        </div>
      )}

      {!loading && error && (
        <div className="statistics-state statistics-state--error" role="alert">
          <FontAwesomeIcon icon={faTriangleExclamation} />
          <div>
            <strong>{t("Statistics unavailable")}</strong>
            <p>{t(error)}</p>
          </div>
        </div>
      )}

      {!loading && snapshot && (
        <>
          <div className="statistics-runline">
            <span
              className={`statistics-status statistics-status--${
                runStatus === "ok"
                  ? "success"
                  : runStatus === "error"
                  ? "failed"
                  : runStatus
              }`}
            >
              {t("Worker")}: {t(runLabel)}
            </span>
            <span>
              {t("Snapshot")}: {formatDate(
                snapshot.generatedAt,
                snapshot.timezone,
                language
              )}
            </span>
            <span>
              {t("Last run")}: {formatDate(
                snapshot.run.completedAt,
                snapshot.timezone,
                language
              )}
            </span>
            {snapshot.run.durationMs > 0 && (
              <span>{(snapshot.run.durationMs / 1000).toFixed(1)} s</span>
            )}
          </div>

          <div className="statistics-metrics">
            <MetricCard
              icon={faUsers}
              label={t("Solid accounts")}
              value={formatNumber(snapshot.totals.uniqueAccounts, language)}
            />
            <MetricCard
              icon={faChartColumn}
              label={`${t("Active users")} ${snapshot.month || ""}`}
              value={formatNumber(snapshot.totals.activeUsers, language)}
            />
            <MetricCard
              icon={faDownload}
              label={t("Catalog actions")}
              value={formatNumber(snapshot.downloads.total, language)}
            />
            <MetricCard
              icon={faDatabase}
              label={t("Catalog entries")}
              value={formatNumber(
                snapshot.catalog.datasets.count + snapshot.catalog.series.count,
                language
              )}
            />
          </div>

          <article className="statistics-panel">
            <div className="statistics-panel__header">
              <div>
                <h2>{t("Active users by month")}</h2>
              </div>
            </div>
            <ActivityChart months={snapshot.activity.monthly} />
          </article>

          <article className="statistics-panel">
            <div className="statistics-panel__header">
              <div>
                <h2>{t("Solid Dataspace")}</h2>
              </div>
              <strong className="statistics-panel__total">
                {formatNumber(accounts.length, language)}
              </strong>
            </div>
            {accounts.length ? (
              <>
                <div className="statistics-table-wrap">
                  <table className="statistics-table statistics-table--members">
                    <thead>
                      <tr>
                        <th>{t("Pseudonym")}</th>
                        <th>{t("Last online")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleAccounts.map((member) => (
                        <tr key={member.id}>
                          <td><code>{member.id}</code></td>
                          <td>
                            {formatDate(member.lastSeen, snapshot.timezone, language)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {accounts.length > ACCOUNTS_PAGE_SIZE && (
                  <div className="statistics-pagination">
                    <button
                      type="button"
                      className="pill-btn"
                      disabled={safeAccountsPage <= 1}
                      onClick={() => setAccountsPage((page) => Math.max(1, page - 1))}
                    >
                      {t("Prev")}
                    </button>
                    <span className="statistics-pagination__page">
                      {t(`Page ${safeAccountsPage} of ${accountsPageCount}`)}
                    </span>
                    <button
                      type="button"
                      className="pill-btn"
                      disabled={safeAccountsPage >= accountsPageCount}
                      onClick={() =>
                        setAccountsPage((page) =>
                          Math.min(accountsPageCount, page + 1)
                        )
                      }
                    >
                      {t("Next")}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <p className="statistics-empty">
                {t("No accounts in the snapshot.")}
              </p>
            )}
          </article>

          <article className="statistics-panel">
            <div className="statistics-panel__header">
              <div>
                <h2>{t("Downloads and access clicks")}</h2>
              </div>
            </div>
            <div className="statistics-download-types">
              {DOWNLOAD_TYPES.map(([type, label]) => (
                <div key={type}>
                  <span>{t(label)}</span>
                  <strong>{formatNumber(downloadsByType[type], language)}</strong>
                </div>
              ))}
            </div>
            {snapshot.downloads.byCatalogInstance.length > 0 && (
              <section className="statistics-instance-downloads">
                <h3>{t("Downloads by catalog instance")}</h3>
                <div className="statistics-table-wrap">
                  <table className="statistics-table statistics-table--compact">
                    <thead>
                      <tr>
                        <th>{t("Catalog instance")}</th>
                        <th>{t("Total")}</th>
                        <th>{t("Downloads")}</th>
                        <th>{t("Access clicks")}</th>
                        <th>{t("Models")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {snapshot.downloads.byCatalogInstance.map(
                        (instance, index) => (
                          <tr key={`${instance.id}-${index}`}>
                            <td>
                              <strong>{instance.label}</strong>
                              {instance.id !== instance.label && (
                                <small>{instance.id}</small>
                              )}
                            </td>
                            <td>{formatNumber(instance.total, language)}</td>
                            <td>
                              {formatNumber(
                                instance.byType.dataset_download,
                                language
                              )}
                            </td>
                            <td>
                              {formatNumber(
                                instance.byType.dataset_access,
                                language
                              )}
                            </td>
                            <td>
                              {formatNumber(
                                instance.byType.semantic_model_download,
                                language
                              )}
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
            <div className="statistics-table-wrap">
              <table className="statistics-table">
                <thead>
                  <tr>
                    <th>{t("Dataset")}</th>
                    <th>{t("Total")}</th>
                    <th>{t("Downloads")}</th>
                    <th>{t("Access clicks")}</th>
                    <th>{t("Models")}</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.downloads.datasets.length ? (
                    snapshot.downloads.datasets.map((dataset) => (
                      <tr key={dataset.datasetUrl || dataset.title}>
                        <td>
                          <strong>{dataset.title}</strong>
                          {dataset.datasetUrl && <small>{dataset.datasetUrl}</small>}
                        </td>
                        <td>{formatNumber(dataset.total, language)}</td>
                        <td>{formatNumber(dataset.byType.dataset_download, language)}</td>
                        <td>{formatNumber(dataset.byType.dataset_access, language)}</td>
                        <td>
                          {formatNumber(dataset.byType.semantic_model_download, language)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="5" className="statistics-empty">
                        {t("No catalog actions available yet.")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>

          <section className="statistics-quality-grid">
            <QualityPanel
              title={t("Dataset metadata quality")}
              entity={snapshot.catalog.datasets}
              showSemanticModel
            />
            <QualityPanel
              title={t("Series metadata quality")}
              entity={snapshot.catalog.series}
            />
          </section>

        </>
      )}
    </section>
  );
}

export default StatisticsDashboard;
