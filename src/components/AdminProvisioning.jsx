import React, { useEffect, useState } from "react";
import { useI18n } from "../i18n";
import { adminRequest, awaitAdminJob } from "../adminApi";

function FormField({ label, children }) {
  return (
    <label className="admin-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function AdminProvisioning({
  profiles,
  registries,
  webId,
  onCreated,
  onClose,
  onBusyChange,
}) {
  const { t } = useI18n();
  const [form, setForm] = useState({
    templateId: profiles[0]?.id || "test",
    id: "",
    name: "",
    domains: "",
    registryUrl:
      registries.find((r) => r.id === profiles[0]?.id)?.url || registries[0]?.url || "",
    adminWebIds: webId,
    workspaces: { "node-red": false, plasma: false },
  });
  const [preview, setPreview] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);
  const update = (key, value) => {
    setForm((v) => ({ ...v, [key]: value }));
    setPreview(null);
  };
  async function review() {
    setBusy(true);
    setError("");
    try {
      setPreview(
        await adminRequest("/profiles/preview", {
          ...form,
          domains: form.domains.split(/\s+/).filter(Boolean),
          adminWebIds: form.adminWebIds.split(/\s+/).filter(Boolean),
        }),
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function create() {
    setBusy(true);
    setError("");
    try {
      const result = await awaitAdminJob(
        await adminRequest(`/profiles/${preview.profileId}/apply`, {
          previewId: preview.id,
        }),
      );
      await onCreated(result.profileId);
    } catch (e) {
      setError(e.message);
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="admin-provisioning">
      <div className="admin-provisioning-body">
        {error && (
          <p role="alert" className="admin-notice admin-notice--error">
            {t(error)}
          </p>
        )}
        <div className="admin-form-grid">
          <FormField label={t("Copy settings from")}>
            <select
              disabled={busy}
              value={form.templateId}
              onChange={(e) => update("templateId", e.target.value)}
            >
              {profiles.map((p) => (
                <option translate="no" key={p.id} value={p.id}>
                  {p.label} · {p.id}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label={t("Profile identifier")}>
            <input
              disabled={busy}
              value={form.id}
              onChange={(e) => update("id", e.target.value)}
              placeholder="new-project"
              pattern="[a-z][a-z0-9-]{1,39}"
            />
          </FormField>
          <FormField label={t("Project name")}>
            <input
              disabled={busy}
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
            />
          </FormField>
          <FormField label={t("Domains, one per line; primary address first")}>
            <textarea
              disabled={busy}
              value={form.domains}
              onChange={(e) => update("domains", e.target.value)}
              placeholder="project.example.org"
            />
          </FormField>
          <FormField label={t("Registry URL")}>
            <input
              list="admin-known-registries"
              disabled={busy}
              type="url"
              value={form.registryUrl}
              onChange={(e) => update("registryUrl", e.target.value)}
            />
            <datalist id="admin-known-registries">
              {registries.map((r) => (
                <option key={r.id} value={r.url}>
                  {r.label}
                </option>
              ))}
            </datalist>
          </FormField>
          <FormField label={t("Administrators, one WebID per line")}>
            <textarea
              disabled={busy}
              value={form.adminWebIds}
              onChange={(e) => update("adminWebIds", e.target.value)}
            />
          </FormField>
        </div>
        <p>
          {t(
            "Use an existing, publicly readable registry. Creating or changing Pod resources requires the owner's permission and is not performed here.",
          )}
        </p>
        <div className="admin-inline">
          {[
            ["node-red", "Create a separate Node-RED workspace"],
            ["plasma", "Create a separate PLASMA workspace"],
          ].map(([key, label]) => (
            <label className="admin-toggle" key={key}>
              <input
                type="checkbox"
                disabled={busy}
                checked={form.workspaces[key]}
                onChange={(e) =>
                  update("workspaces", {
                    ...form.workspaces,
                    [key]: e.target.checked,
                  })
                }
              />
              <span>{t(label)}</span>
            </label>
          ))}
        </div>
        <p>
          {t(
            "New workspaces start with empty data volumes. Existing user data is never copied. DNS must point to this server.",
          )}
        </p>
        {preview && (
          <div className="admin-notice" role="status">
            {t(
              "Checks passed. The profile will be created in this environment with the settings shown above.",
            )}
          </div>
        )}
      </div>
      <div className="admin-modal-actions">
        <button className="admin-btn" disabled={busy} onClick={onClose}>
          {t("Cancel")}
        </button>
        <button
          className="admin-btn admin-btn--primary"
          disabled={busy || !form.id || !form.name || !form.domains}
          onClick={preview ? create : review}
        >
          {t(
            busy
              ? "Checking and activating …"
              : preview
                ? "Create and activate profile"
                : "Check new profile",
          )}
        </button>
      </div>
    </div>
  );
}

export function AdminPlatform({ profileId, configuration, onSaved }) {
  const { t } = useI18n();
  const [runtime, setRuntime] = useState(configuration.runtime),
    [preview, setPreview] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const fields = [
    ["syncTickSeconds", "Worker scheduler interval (seconds)", 10, 86400],
    ["catalogCacheSeconds", "Catalog cache refresh (seconds)", 30, 3600],
    ["monitoringCacheSeconds", "Monitoring cache refresh (seconds)", 60, 86400],
    ["indexIntervalSeconds", "Search index refresh (seconds)", 30, 86400],
  ];
  async function action() {
    setBusy(true);
    setError("");
    try {
      if (!preview)
        setPreview(
          await adminRequest(`/profiles/${profileId}/platform-preview`, {
            runtime,
            revision: configuration.revision,
          }),
        );
      else {
        const result = await awaitAdminJob(
          await adminRequest(`/profiles/${profileId}/apply`, {
            previewId: preview.id,
          }),
        );
        setPreview(null);
        await onSaved(result.message);
      }
    } catch (e) {
      setError(e.message);
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="admin-panel">
      <div className="admin-panel-heading">
        <h2>{t("Shared server settings")}</h2>
        <span className="admin-chip">{t("Operator")}</span>
      </div>
      <p>
        {t(
          "These intervals apply to all profiles in this environment. Only affected services are updated. Test remains a read-only cache preview.",
        )}
      </p>
      {error && (
        <p role="alert" className="admin-notice admin-notice--error">
          {t(error)}
        </p>
      )}
      <div className="admin-form-grid">
        {fields.map(([key, label, min, max]) => (
          <FormField key={key} label={t(label)}>
            <input
              type="number"
              min={min}
              max={max}
              disabled={busy}
              value={runtime[key] ?? ""}
              onChange={(e) => {
                setRuntime((v) => ({ ...v, [key]: Number(e.target.value) }));
                setPreview(null);
              }}
            />
          </FormField>
        ))}
      </div>
      {preview && (
        <div className="admin-notice">
          <ul>
            {preview.diff.map((d) => (
              <li key={d.path}>
                {t(fields.find((f) => d.path.endsWith(f[0]))?.[1] || d.path)}:{" "}
                {d.before ?? "—"} → {d.after}
              </li>
            ))}
          </ul>
        </div>
      )}
      <button
        className="admin-btn admin-btn--primary"
        onClick={action}
        disabled={
          busy ||
          JSON.stringify(runtime) === JSON.stringify(configuration.runtime)
        }
      >
        {t(
          busy
            ? "Checking and activating …"
            : preview
              ? "Activate server settings"
              : "Review server settings",
        )}
      </button>
    </section>
  );
}
