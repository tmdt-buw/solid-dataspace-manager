import { createContainerAt } from "@inrupt/solid-client";

const ACL = "http://www.w3.org/ns/auth/acl#";
const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const FULL_MODES = ["Read", "Append", "Write", "Control"];
const ACTIVITY_WORKER_MODES = ["Read", "Control"];
const ADMIN_SNAPSHOT_MODES = ["Read"];

function escapeTurtleUrl(value) {
  return String(value).replace(/>/g, "%3E");
}

function authorization({
  id,
  targetUrl,
  agent,
  agentClass,
  modes,
  defaults = true,
}) {
  const actor = agent
    ? `acl:agent <${escapeTurtleUrl(agent)}>`
    : `acl:agentClass <${escapeTurtleUrl(agentClass)}>`;
  const modeList = modes.map((mode) => `acl:${mode}`).join(", ");
  return [
    `<#${id}> a acl:Authorization ;`,
    `  ${actor} ;`,
    `  acl:accessTo <${escapeTurtleUrl(targetUrl)}> ;`,
    ...(defaults
      ? [`  acl:default <${escapeTurtleUrl(targetUrl)}> ;`]
      : []),
    `  acl:mode ${modeList} .`,
  ].join("\n");
}

export function buildStatisticsContainerAcl({
  targetUrl,
  adminWebIds,
  workerWebId,
  workerModes = FULL_MODES,
  workerDefaults = true,
  adminModes = [],
  authenticatedAppend = false,
}) {
  const rules = [
    ...(adminModes.length
      ? adminWebIds.map((webId, index) =>
          authorization({
            id: `admin-${index + 1}`,
            targetUrl,
            agent: webId,
            modes: adminModes,
          })
        )
      : []),
    authorization({
      id: "worker",
      targetUrl,
      agent: workerWebId,
      modes: workerModes,
      defaults: workerDefaults,
    }),
  ];

  if (authenticatedAppend) {
    rules.push(
      authorization({
        id: "authenticated-append",
        targetUrl,
        agentClass: `${ACL}AuthenticatedAgent`,
        modes: ["Append"],
        defaults: false,
      })
    );
  }

  return [
    `@prefix acl: <${ACL}> .`,
    `@prefix rdf: <${RDF}> .`,
    "",
    rules.join("\n\n"),
    "",
  ].join("\n");
}

export function getStatisticsContainerDefinitions(podBaseUrl) {
  const baseUrl = new URL(podBaseUrl).href;
  return [
    { key: "base", url: baseUrl, adminModes: [] },
    {
      key: "activity",
      url: new URL("activity/", baseUrl).href,
      adminModes: FULL_MODES,
      workerModes: ACTIVITY_WORKER_MODES,
      workerDefaults: false,
    },
    {
      key: "events",
      url: new URL("events/", baseUrl).href,
      adminModes: [],
    },
    {
      key: "downloads",
      url: new URL("events/downloads/", baseUrl).href,
      adminModes: [],
      authenticatedAppend: true,
    },
    {
      key: "snapshots",
      url: new URL("snapshots/", baseUrl).href,
      adminModes: ADMIN_SNAPSHOT_MODES,
    },
    {
      key: "months",
      url: new URL("snapshots/months/", baseUrl).href,
      adminModes: ADMIN_SNAPSHOT_MODES,
    },
    {
      key: "state",
      url: new URL("state/", baseUrl).href,
      adminModes: [],
    },
  ];
}

export async function detectStatisticsPodInitialization({
  fetch: solidFetch,
  config,
}) {
  if (!config?.enabled || !config.podBaseUrl) {
    return {
      status: "unknown",
      message: "Statistics storage is not configured.",
    };
  }
  if (typeof solidFetch !== "function") {
    return {
      status: "unknown",
      message: "An authenticated Solid fetch is required.",
    };
  }

  const definitions = getStatisticsContainerDefinitions(config.podBaseUrl);
  const readableContainers = definitions.filter(({ key }) =>
    ["snapshots", "months"].includes(key)
  );

  let responses;
  try {
    responses = await Promise.all(
      readableContainers.map(({ url }) =>
        solidFetch(url, {
          method: "GET",
          headers: { Accept: "text/turtle" },
          cache: "no-store",
        })
      )
    );
  } catch {
    return {
      status: "unknown",
      message: "The statistics storage initialization state could not be verified.",
    };
  }

  if (responses.every((response) => response?.ok)) {
    return { status: "initialized" };
  }
  if (responses.every((response) => response?.status === 404)) {
    return { status: "uninitialized" };
  }
  return {
    status: "unknown",
    message: "The statistics storage initialization state could not be verified.",
  };
}

function aclUrlForContainer(containerUrl) {
  return `${containerUrl}.acl`;
}

async function putAcl(
  definition,
  { adminWebIds, workerWebId, solidFetch, temporary = false, allowMissing = false }
) {
  const response = await solidFetch(aclUrlForContainer(definition.url), {
    method: "PUT",
    headers: { "Content-Type": "text/turtle" },
    body: buildStatisticsContainerAcl({
      targetUrl: definition.url,
      adminWebIds,
      workerWebId,
      workerModes: definition.workerModes,
      workerDefaults: definition.workerDefaults,
      adminModes: temporary ? FULL_MODES : definition.adminModes,
      authenticatedAppend: temporary ? false : definition.authenticatedAppend,
    }),
  });

  if (!response.ok && !(allowMissing && [404, 409].includes(response.status))) {
    throw new Error(
      `ACL for statistics container '${definition.key}' could not be saved (${response.status}).`
    );
  }
}

async function ensureContainer(definition, solidFetch, { allowForbidden = false } = {}) {
  const response = await solidFetch(definition.url, {
    method: "GET",
    headers: { Accept: "text/turtle" },
    cache: "no-store",
  });
  if (response.ok || (allowForbidden && response.status === 403)) return;
  if (response.status !== 404) {
    throw new Error(
      `Statistics container '${definition.key}' is not accessible (${response.status}).`
    );
  }

  try {
    await createContainerAt(definition.url, { fetch: solidFetch });
  } catch (error) {
    const status = error?.statusCode || error?.response?.status || error?.status;
    if (![409, 412].includes(status)) throw error;
  }
}

export async function initializeStatisticsPod({
  webId,
  fetch: solidFetch,
  config,
  onProgress,
}) {
  if (!config?.enabled || !config.podBaseUrl) {
    throw new Error("Statistics storage is not configured.");
  }
  if (!config.adminWebIds?.some((adminWebId) => adminWebId === webId)) {
    throw new Error("The current WebID is not a configured statistics admin.");
  }
  if (!config.workerWebId) {
    throw new Error("Statistics worker WebID is not configured.");
  }
  if (typeof solidFetch !== "function") {
    throw new Error("An authenticated Solid fetch is required.");
  }

  const definitions = getStatisticsContainerDefinitions(config.podBaseUrl);
  const base = definitions[0];
  const progress = (step, key) => onProgress?.({ step, key });
  let setupError = null;

  try {
    progress("creating", base.key);
    await ensureContainer(base, solidFetch, { allowForbidden: true });
    await putAcl(base, {
      adminWebIds: config.adminWebIds,
      workerWebId: config.workerWebId,
      solidFetch,
      temporary: true,
    });

    for (const definition of definitions.slice(1)) {
      progress("creating", definition.key);
      await putAcl(definition, {
        adminWebIds: config.adminWebIds,
        workerWebId: config.workerWebId,
        solidFetch,
        temporary: true,
        allowMissing: true,
      });
      await ensureContainer(definition, solidFetch, { allowForbidden: true });
      await putAcl(definition, {
        adminWebIds: config.adminWebIds,
        workerWebId: config.workerWebId,
        solidFetch,
        temporary: true,
      });
    }
  } catch (error) {
    setupError = error;
  }

  const aclErrors = [];
  for (const definition of [...definitions].reverse()) {
    try {
      progress("securing", definition.key);
      await putAcl(definition, {
        adminWebIds: config.adminWebIds,
        workerWebId: config.workerWebId,
        solidFetch,
      });
    } catch (error) {
      aclErrors.push(error);
    }
  }

  if (setupError) throw setupError;
  if (aclErrors.length) {
    throw new Error(
      `Statistics storage was created, but ${aclErrors.length} ACL(s) could not be secured.`
    );
  }

  progress("complete", base.key);
  return {
    initialized: true,
    containers: definitions.map(({ key, url }) => ({ key, url })),
  };
}
