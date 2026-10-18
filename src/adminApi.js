import session from "./solidSession";
import { translateText, resolveInitialLanguage } from "./i18n";

export function isAdministrationEnabled() {
  return (
    typeof window !== "undefined" &&
    window.__APP_CONFIG__?.administration?.enabled === true
  );
}

export async function adminRequest(path, body, options = {}) {
  const response = await session.fetch(
    new URL(`/admin-api${path}`, window.location.origin).href,
    {
      method: body === undefined ? "GET" : "POST",
      cache: "no-store",
      signal: options.signal,
      headers: {
        Accept: "application/json",
        ...(body === undefined
          ? {}
          : { "Content-Type": "application/json", "X-Dataspace-Admin": "1" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      translateText(
        result.error || "Der Verwaltungsdienst ist nicht erreichbar.",
        resolveInitialLanguage(),
      ),
    );
    error.status = response.status;
    throw error;
  }
  return result;
}

export async function awaitAdminJob(result, onStatus, options = {}) {
  if (result.status !== "running" || !result.jobId) return result;
  sessionStorage.setItem("dataspace-admin-job", result.jobId);
  for (let attempt = 0; attempt < 360; attempt++) {
    let job;
    try {
      job = await adminRequest(`/jobs/${result.jobId}`, undefined, options);
    } catch (error) {
      if ([401, 403, 404].includes(error.status))
        sessionStorage.removeItem("dataspace-admin-job");
      throw error;
    }
    onStatus?.(job.status);
    if (job.status === "completed") {
      sessionStorage.removeItem("dataspace-admin-job");
      return job.result;
    }
    if (job.status === "failed") {
      sessionStorage.removeItem("dataspace-admin-job");
      throw new Error(
        translateText(
          job.error || "The update failed. Check the change history.",
          resolveInitialLanguage(),
        ),
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(
    translateText(
      "The update is still running. Its status is available in the change history.",
      resolveInitialLanguage(),
    ),
  );
}
