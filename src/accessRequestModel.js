import {
  getDatetime,
  getStringNoLocale,
  getUrl,
  getUrlAll,
} from "@inrupt/solid-client";
import { RDF } from "@inrupt/vocab-common-rdf";

export const SDM_NS = "https://w3id.org/solid-dataspace-manager#";
export const ACL_READ = "http://www.w3.org/ns/auth/acl#Read";
export const READ_ONLY_ACCESS = Object.freeze({
  read: true,
  append: false,
  write: false,
  control: false,
});
export const LEGACY_FULL_ACCESS = Object.freeze({
  read: true,
  append: true,
  write: true,
  control: true,
});

export const SDM = Object.freeze({
  AccessRequest: `${SDM_NS}AccessRequest`,
  AccessDecision: `${SDM_NS}AccessDecision`,
  status: `${SDM_NS}status`,
  decision: `${SDM_NS}decision`,
  requesterWebId: `${SDM_NS}requesterWebId`,
  requesterName: `${SDM_NS}requesterName`,
  requesterEmail: `${SDM_NS}requesterEmail`,
  datasetIdentifier: `${SDM_NS}datasetIdentifier`,
  datasetTitle: `${SDM_NS}datasetTitle`,
  datasetAccessUrl: `${SDM_NS}datasetAccessUrl`,
  datasetSemanticModelUrl: `${SDM_NS}datasetSemanticModelUrl`,
  catalogUrl: `${SDM_NS}catalogUrl`,
  catalogDatasetUrl: `${SDM_NS}catalogDatasetUrl`,
  message: `${SDM_NS}message`,
  decisionComment: `${SDM_NS}decisionComment`,
  expiresAt: `${SDM_NS}expiresAt`,
  decidedAt: `${SDM_NS}decidedAt`,
  decidedBy: `${SDM_NS}decidedBy`,
  requestId: `${SDM_NS}requestId`,
  scenarioRunId: `${SDM_NS}scenarioRunId`,
  applicationId: `${SDM_NS}applicationId`,
  applicationName: `${SDM_NS}applicationName`,
  requestedMode: `${SDM_NS}requestedMode`,
  purpose: `${SDM_NS}purpose`,
  dataCategory: `${SDM_NS}dataCategory`,
  outputVisibility: `${SDM_NS}outputVisibility`,
});

export const ENVIRONMENTAL_REQUEST = Object.freeze({
  applicationId: "environmental-monitoring",
  displayName: "Environmental Monitoring",
  purpose: "completed-route-public-display",
  dataCategory: "route-and-derived-activity-summary",
  outputVisibility: "public",
  fileName: "activity.geojson",
});

export const ENVIRONMENTAL_CONSENT = Object.freeze({
  title: "Environmental Monitoring wants to use your completed tours",
  data: "All donated completed routes and their calculated activity values",
  purpose:
    "Public display of approved donated routes and their derived activity values without direct identifiers in Environmental Monitoring.",
  access: "Read only",
  notice:
    "Environmental Monitoring does not display your name, WebID, Pod URL, contact email, exact completion date, or other direct identifiers. A route and activity type may be displayed as soon as access to one matching contribution from a single WebID has been approved; values from additional approved contributions are combined when available. Removing direct identifiers does not make a route anonymous: the location and shape of a single route, timing patterns, or links to known places may still identify a person or place. The restricted source resource contains the full route coordinates, completion date, activity type, calculated distance, active minutes, pace, and an estimated step count for walking. Your public catalog entry may still show the creator, WebID, and contact email stored in your Solid profile.",
});

export const DCT_CREATED = "http://purl.org/dc/terms/created";
export const DCT_TITLE = "http://purl.org/dc/terms/title";
export const AS_PUBLISHED = "https://www.w3.org/ns/activitystreams#published";
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const strings = (thing, predicate) => {
  const values = [];
  try {
    values.push(...getUrlAll(thing, predicate));
  } catch {
    // Some legacy requests encoded the mode as a string.
  }
  const literal = getStringNoLocale(thing, predicate);
  if (literal) values.push(literal);
  return Array.from(new Set(values.filter(Boolean)));
};

const commonFields = (thing) => {
  const requestedModes = strings(thing, SDM.requestedMode);
  return {
    requesterWebId: getUrl(thing, SDM.requesterWebId) || "",
    requesterName: getStringNoLocale(thing, SDM.requesterName) || "",
    requesterEmail: getStringNoLocale(thing, SDM.requesterEmail) || "",
    datasetIdentifier: getStringNoLocale(thing, SDM.datasetIdentifier) || "",
    datasetTitle:
      getStringNoLocale(thing, SDM.datasetTitle) ||
      getStringNoLocale(thing, DCT_TITLE) ||
      "",
    datasetAccessUrl: getUrl(thing, SDM.datasetAccessUrl) || "",
    datasetSemanticModelUrl: getUrl(thing, SDM.datasetSemanticModelUrl) || "",
    catalogUrl: getUrl(thing, SDM.catalogUrl) || "",
    catalogDatasetUrl: getUrl(thing, SDM.catalogDatasetUrl) || "",
    requestId: getStringNoLocale(thing, SDM.requestId) || "",
    scenarioRunId: getStringNoLocale(thing, SDM.scenarioRunId) || "",
    applicationId: getStringNoLocale(thing, SDM.applicationId) || "",
    applicationName: getStringNoLocale(thing, SDM.applicationName) || "",
    requestedMode: requestedModes[0] || "",
    requestedModes,
    purpose: getStringNoLocale(thing, SDM.purpose) || "",
    dataCategory: getStringNoLocale(thing, SDM.dataCategory) || "",
    outputVisibility: getStringNoLocale(thing, SDM.outputVisibility) || "",
  };
};

export function parseAccessRequestThing(url, thing) {
  if (!thing || !getUrlAll(thing, RDF.type).includes(SDM.AccessRequest)) return null;
  return {
    id: url,
    ...commonFields(thing),
    status: getStringNoLocale(thing, SDM.status) || "pending",
    message: getStringNoLocale(thing, SDM.message) || "",
    decisionComment: getStringNoLocale(thing, SDM.decisionComment) || "",
    expiresAt: getStringNoLocale(thing, SDM.expiresAt) || "",
    decidedAt: getStringNoLocale(thing, SDM.decidedAt) || "",
    decidedBy: getUrl(thing, SDM.decidedBy) || "",
    createdAt:
      getDatetime(thing, DCT_CREATED) ||
      getDatetime(thing, AS_PUBLISHED) ||
      getStringNoLocale(thing, DCT_CREATED) ||
      getStringNoLocale(thing, AS_PUBLISHED) ||
      "",
  };
}

export function parseAccessDecisionThing(url, thing) {
  if (!thing || !getUrlAll(thing, RDF.type).includes(SDM.AccessDecision)) return null;
  const timestampMatch = url.match(/(\d{10,})(?:\/)?$/);
  return {
    id: url,
    ...commonFields(thing),
    decision: getStringNoLocale(thing, SDM.decision) || "",
    decidedAt:
      getDatetime(thing, SDM.decidedAt) ||
      getStringNoLocale(thing, SDM.decidedAt) ||
      "",
    decisionComment: getStringNoLocale(thing, SDM.decisionComment) || "",
    expiresAt: getStringNoLocale(thing, SDM.expiresAt) || "",
    createdAt:
      getDatetime(thing, DCT_CREATED) ||
      getStringNoLocale(thing, DCT_CREATED) ||
      "",
    urlTime: timestampMatch ? Number(timestampMatch[1]) : 0,
  };
}

export function isTrustedEnvironmentalRequest(item, serviceWebId) {
  return Boolean(
    item &&
      serviceWebId &&
      item.applicationId === ENVIRONMENTAL_REQUEST.applicationId &&
      item.requesterWebId === serviceWebId
  );
}

export function isEnvironmentalApplicationRequest(item) {
  return item?.applicationId === ENVIRONMENTAL_REQUEST.applicationId;
}

const getOwnerPodRoot = (webId) => {
  try {
    const url = new URL(webId);
    const profileIndex = url.pathname.indexOf("/profile/");
    const basePath =
      profileIndex >= 0 ? url.pathname.slice(0, profileIndex + 1) : "/";
    return `${url.origin}${basePath}`;
  } catch {
    return "";
  }
};

export function validateTrustedEnvironmentalRequest(item, serviceWebId, ownerWebId = "") {
  if (!isEnvironmentalApplicationRequest(item)) return [];
  const errors = [];
  if (!serviceWebId) {
    errors.push("Environmental Monitoring service identity is not configured.");
  } else if (item.requesterWebId !== serviceWebId) {
    errors.push("Environmental Monitoring service identity does not match.");
  }
  if (item.applicationName !== ENVIRONMENTAL_REQUEST.displayName) {
    errors.push("Environmental Monitoring application name does not match.");
  }
  if (!UUID_V4_PATTERN.test(item.requestId || "")) {
    errors.push("Request identifier must be a UUID v4.");
  }
  if (!UUID_V4_PATTERN.test(item.scenarioRunId || "")) {
    errors.push("Scenario run identifier must be a UUID v4.");
  }
  if (item.purpose !== ENVIRONMENTAL_REQUEST.purpose) errors.push("Unsupported purpose.");
  if (item.dataCategory !== ENVIRONMENTAL_REQUEST.dataCategory) {
    errors.push("Unsupported data category.");
  }
  if (item.outputVisibility !== ENVIRONMENTAL_REQUEST.outputVisibility) {
    errors.push("Output visibility must be public.");
  }
  if (
    item.requestedModes.length !== 1 ||
    item.requestedModes[0] !== ACL_READ
  ) {
    errors.push("Only read access can be approved.");
  }
  if (item.datasetSemanticModelUrl) errors.push("Only one activity resource may be requested.");
  const ownerPodRoot = getOwnerPodRoot(ownerWebId);
  if (!ownerPodRoot) {
    errors.push("Data owner identity is invalid.");
  } else {
    const expectedIdentifier = `solid-tours-activity-${item.scenarioRunId}`;
    const expectedActivityUrl = `${ownerPodRoot}solid-tours/runs/${item.scenarioRunId}/${ENVIRONMENTAL_REQUEST.fileName}`;
    const expectedCatalogDatasetUrl = `${ownerPodRoot}catalog/ds/${expectedIdentifier}.ttl#it`;
    if (item.datasetIdentifier !== expectedIdentifier) {
      errors.push("Dataset identifier does not match the scenario run.");
    }
    if (item.datasetAccessUrl !== expectedActivityUrl) {
      errors.push("Activity resource URL does not match the scenario run.");
    }
    if (item.catalogDatasetUrl !== expectedCatalogDatasetUrl) {
      errors.push("Catalog dataset reference does not match the scenario run.");
    }
  }
  return errors;
}

export function getAccessTargetUrls(item, serviceWebId) {
  const targets = [item?.datasetAccessUrl];
  if (!isTrustedEnvironmentalRequest(item, serviceWebId)) {
    targets.push(item?.datasetSemanticModelUrl);
  }
  return Array.from(new Set(targets.filter(Boolean)));
}

export function getApprovedAccess(item, serviceWebId) {
  return isTrustedEnvironmentalRequest(item, serviceWebId)
    ? READ_ONLY_ACCESS
    : LEGACY_FULL_ACCESS;
}

const escapeLiteral = (value = "") =>
  String(value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, "\\n");

export function buildAccessDecisionTurtle({
  item,
  decision,
  note = "",
  expiresAt = "",
  decidedAt,
}) {
  const lines = [
    `@prefix sdm: <${SDM_NS}>.`,
    "@prefix acl: <http://www.w3.org/ns/auth/acl#>.",
    "@prefix dct: <http://purl.org/dc/terms/>.",
    "@prefix as: <https://www.w3.org/ns/activitystreams#>.",
    "@prefix xsd: <http://www.w3.org/2001/XMLSchema#>.",
    "",
    "<> a sdm:AccessDecision, as:Offer;",
    `  dct:created "${escapeLiteral(decidedAt)}"^^xsd:dateTime;`,
    `  sdm:decision "${escapeLiteral(decision)}";`,
    `  sdm:requesterWebId <${item.requesterWebId}>;`,
    `  sdm:decidedAt "${escapeLiteral(decidedAt)}"^^xsd:dateTime;`,
    `  sdm:datasetIdentifier "${escapeLiteral(item.datasetIdentifier || "")}";`,
    `  sdm:datasetTitle "${escapeLiteral(item.datasetTitle || "")}";`,
    `  dct:title "${escapeLiteral(item.datasetTitle || "")}";`,
  ];
  const urls = [
    ["datasetAccessUrl", item.datasetAccessUrl],
    ["datasetSemanticModelUrl", item.datasetSemanticModelUrl],
    ["catalogUrl", item.catalogUrl],
    ["catalogDatasetUrl", item.catalogDatasetUrl],
  ];
  urls.forEach(([predicate, value]) => {
    if (value) lines.push(`  sdm:${predicate} <${value}>;`);
  });
  const literals = [
    ["requesterName", item.requesterName],
    ["requesterEmail", item.requesterEmail],
    ["requestId", item.requestId],
    ["scenarioRunId", item.scenarioRunId],
    ["applicationId", item.applicationId],
    ["applicationName", item.applicationName],
    ["purpose", item.purpose],
    ["dataCategory", item.dataCategory],
    ["outputVisibility", item.outputVisibility],
    ["decisionComment", note],
    ["expiresAt", expiresAt],
  ];
  literals.forEach(([predicate, value]) => {
    if (value) lines.push(`  sdm:${predicate} "${escapeLiteral(value)}";`);
  });
  const modes =
    decision === "approved" && isEnvironmentalApplicationRequest(item)
      ? [ACL_READ]
      : item.requestedModes || [];
  Array.from(new Set(modes)).forEach((mode) => {
    if (mode) lines.push(`  sdm:requestedMode <${mode}>;`);
  });
  lines.push("  .");
  return lines.join("\n");
}

const itemTime = (item) =>
  Date.parse(item?.createdAt || item?.decidedAt || "") || item?.urlTime || 0;

export function filterPreviousScenarioRuns(items, showPrevious = false) {
  if (showPrevious) return items;
  const latestByApplication = new Map();
  items.forEach((item) => {
    if (!item?.applicationId || !item?.scenarioRunId) return;
    const existing = latestByApplication.get(item.applicationId);
    if (!existing || itemTime(item) > itemTime(existing)) {
      latestByApplication.set(item.applicationId, item);
    }
  });
  return items.filter((item) => {
    if (!item?.applicationId || !item?.scenarioRunId) return true;
    return latestByApplication.get(item.applicationId)?.scenarioRunId === item.scenarioRunId;
  });
}
