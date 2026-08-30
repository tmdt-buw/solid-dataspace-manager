import {
  addUrl,
  createThing,
  setDatetime,
  setStringNoLocale,
  setUrl,
} from "@inrupt/solid-client";
import { RDF } from "@inrupt/vocab-common-rdf";
import {
  ACL_READ,
  ENVIRONMENTAL_CONSENT,
  ENVIRONMENTAL_REQUEST,
  LEGACY_FULL_ACCESS,
  READ_ONLY_ACCESS,
  SDM,
  buildAccessDecisionTurtle,
  filterPreviousScenarioRuns,
  getAccessTargetUrls,
  getApprovedAccess,
  isTrustedEnvironmentalRequest,
  parseAccessDecisionThing,
  parseAccessRequestThing,
  validateTrustedEnvironmentalRequest,
} from "./accessRequestModel";

const SERVICE_WEBID = "https://pod.example/worker/profile/card#me";
const OWNER_WEBID = "https://pod.example/laura/profile/card#me";
const REQUEST_ID = "4ebfab9f-d31e-41ed-b5d0-5c68e0c3aa04";
const RUN_ID = "9bf98ac8-5733-4ad9-9782-2d7d8cc42aec";
const DATASET_IDENTIFIER = `solid-tours-activity-${RUN_ID}`;
const RESOURCE_URL = `https://pod.example/laura/solid-tours/runs/${RUN_ID}/activity.geojson`;
const CATALOG_URL = `https://pod.example/laura/catalog/ds/${DATASET_IDENTIFIER}.ttl#it`;

function environmentalThing(type) {
  let thing = createThing({ url: "https://pod.example/laura/inbox/request-1" });
  thing = addUrl(thing, RDF.type, type);
  thing = setUrl(thing, SDM.requesterWebId, SERVICE_WEBID);
  thing = setUrl(thing, SDM.datasetAccessUrl, RESOURCE_URL);
  thing = setUrl(thing, SDM.catalogDatasetUrl, CATALOG_URL);
  thing = setStringNoLocale(thing, SDM.datasetIdentifier, DATASET_IDENTIFIER);
  thing = setStringNoLocale(thing, SDM.requestId, REQUEST_ID);
  thing = setStringNoLocale(thing, SDM.scenarioRunId, RUN_ID);
  thing = setStringNoLocale(
    thing,
    SDM.applicationId,
    ENVIRONMENTAL_REQUEST.applicationId
  );
  thing = setStringNoLocale(
    thing,
    SDM.applicationName,
    ENVIRONMENTAL_REQUEST.displayName
  );
  thing = addUrl(thing, SDM.requestedMode, ACL_READ);
  thing = setStringNoLocale(thing, SDM.purpose, ENVIRONMENTAL_REQUEST.purpose);
  thing = setStringNoLocale(
    thing,
    SDM.dataCategory,
    ENVIRONMENTAL_REQUEST.dataCategory
  );
  thing = setStringNoLocale(
    thing,
    SDM.outputVisibility,
    ENVIRONMENTAL_REQUEST.outputVisibility
  );
  thing = setDatetime(
    thing,
    "http://purl.org/dc/terms/created",
    new Date("2026-08-20T10:00:00.000Z")
  );
  return thing;
}

test("parses the extended environmental access request contract", () => {
  const item = parseAccessRequestThing(
    "https://pod.example/laura/inbox/request-1",
    environmentalThing(SDM.AccessRequest)
  );

  expect(item).toMatchObject({
    requestId: REQUEST_ID,
    scenarioRunId: RUN_ID,
    applicationId: "environmental-monitoring",
    applicationName: "Environmental Monitoring",
    requestedMode: ACL_READ,
    requestedModes: [ACL_READ],
    purpose: "completed-route-public-display",
    dataCategory: "route-and-derived-activity-summary",
    outputVisibility: "public",
    catalogDatasetUrl: CATALOG_URL,
    datasetAccessUrl: RESOURCE_URL,
  });
  expect(isTrustedEnvironmentalRequest(item, SERVICE_WEBID)).toBe(true);
  expect(validateTrustedEnvironmentalRequest(item, SERVICE_WEBID, OWNER_WEBID)).toEqual([]);
});

test("uses the exact Environmental Monitoring informed-consent copy", () => {
  expect(ENVIRONMENTAL_CONSENT).toEqual({
    title: "Environmental Monitoring wants to use your completed tours",
    data: "All donated completed routes and their calculated activity values",
    purpose:
      "Aggregated public display of donated routes and their derived activity values without direct identifiers in Environmental Monitoring.",
    access: "Read only",
    notice:
      "Environmental Monitoring does not display your name, WebID, Pod URL, contact email, exact completion date, or other direct identifiers. Your contribution is combined with contributions from other users; a route and activity type are displayed only after access to matching contributions from at least two different WebIDs has been approved. Even with this aggregation, route locations may still be linkable to people or places. The restricted source resource contains the full route coordinates, completion date, activity type, calculated distance, active minutes, pace, and an estimated step count for walking. Your public catalog entry may still show the creator, WebID, and contact email stored in your Solid profile.",
  });
  expect(ENVIRONMENTAL_CONSENT).not.toHaveProperty("qualityWarning");
  expect(ENVIRONMENTAL_CONSENT).not.toHaveProperty("privacyWarning");
});

test("parses the extended fields from access decisions", () => {
  let thing = environmentalThing(SDM.AccessDecision);
  thing = setStringNoLocale(thing, SDM.decision, "approved");
  const item = parseAccessDecisionThing(
    "https://pod.example/worker/inbox/access-decision-1700000000000",
    thing
  );
  expect(item).toMatchObject({
    decision: "approved",
    requestId: REQUEST_ID,
    scenarioRunId: RUN_ID,
    requestedModes: [ACL_READ],
    catalogDatasetUrl: CATALOG_URL,
  });
});

test("serializes the extended fields and only the granted Read mode", () => {
  const item = parseAccessRequestThing(
    "https://pod.example/laura/inbox/request-1",
    environmentalThing(SDM.AccessRequest)
  );
  const turtle = buildAccessDecisionTurtle({
    item,
    decision: "approved",
    decidedAt: "2026-08-20T10:30:00.000Z",
  });
  expect(turtle).toContain(`sdm:requestId "${REQUEST_ID}"`);
  expect(turtle).toContain(`sdm:scenarioRunId "${RUN_ID}"`);
  expect(turtle).toContain('sdm:purpose "completed-route-public-display"');
  expect(turtle).toContain(`sdm:catalogDatasetUrl <${CATALOG_URL}>`);
  expect(turtle).toContain("sdm:requestedMode <http://www.w3.org/ns/auth/acl#Read>");
  expect(turtle).not.toContain("acl#Write");
});

test("a trusted scenario grants one activity resource with read-only access", () => {
  const item = parseAccessRequestThing(
    "https://pod.example/laura/inbox/request-1",
    environmentalThing(SDM.AccessRequest)
  );
  expect(getAccessTargetUrls(item, SERVICE_WEBID)).toEqual([RESOURCE_URL]);
  expect(READ_ONLY_ACCESS).toEqual({
    read: true,
    append: false,
    write: false,
    control: false,
  });
  expect(getApprovedAccess(item, SERVICE_WEBID)).toBe(READ_ONLY_ACCESS);
});

test("preserves full access for legacy requests", () => {
  expect(
    getApprovedAccess(
      {
        applicationId: "legacy-app",
        requesterWebId: "https://pod.example/requester/profile/card#me",
      },
      SERVICE_WEBID
    )
  ).toBe(LEGACY_FULL_ACCESS);
  expect(LEGACY_FULL_ACCESS).toEqual({
    read: true,
    append: true,
    write: true,
    control: true,
  });
});

test("does not trust an application label without the configured worker WebID", () => {
  const item = parseAccessRequestThing(
    "https://pod.example/laura/inbox/request-1",
    environmentalThing(SDM.AccessRequest)
  );
  expect(isTrustedEnvironmentalRequest(item, "https://pod.example/other#me")).toBe(
    false
  );
  expect(
    validateTrustedEnvironmentalRequest(
      item,
      "https://pod.example/other#me",
      OWNER_WEBID
    )
  ).toContain("Environmental Monitoring service identity does not match.");
});

test("rejects a trusted request that is not the single read-only activity bundle", () => {
  const item = parseAccessRequestThing(
    "https://pod.example/laura/inbox/request-1",
    environmentalThing(SDM.AccessRequest)
  );
  expect(
    validateTrustedEnvironmentalRequest(
      {
        ...item,
        datasetAccessUrl: "https://pod.example/laura/private/raw-track.geojson",
        requestedModes: [ACL_READ, "http://www.w3.org/ns/auth/acl#Write"],
      },
      SERVICE_WEBID,
      OWNER_WEBID
    )
  ).toEqual(
    expect.arrayContaining([
      "Only read access can be approved.",
      "Activity resource URL does not match the scenario run.",
    ])
  );
});

test("rejects a catalog reference that does not match the scenario run", () => {
  const item = parseAccessRequestThing(
    "https://pod.example/laura/inbox/request-1",
    environmentalThing(SDM.AccessRequest)
  );
  expect(
    validateTrustedEnvironmentalRequest(
      {
        ...item,
        catalogDatasetUrl: "https://pod.example/worker/catalog/ds/claim.ttl#it",
      },
      SERVICE_WEBID,
      OWNER_WEBID
    )
  ).toContain("Catalog dataset reference does not match the scenario run.");
});

test("rejects a non-UUID scenario run and mismatched dataset identifier", () => {
  const item = parseAccessRequestThing(
    "https://pod.example/laura/inbox/request-1",
    environmentalThing(SDM.AccessRequest)
  );
  expect(
    validateTrustedEnvironmentalRequest(
      {
        ...item,
        requestId: "request-1",
        scenarioRunId: "run-1",
        datasetIdentifier: "some-activity",
      },
      SERVICE_WEBID,
      OWNER_WEBID
    )
  ).toEqual(
    expect.arrayContaining([
      "Request identifier must be a UUID v4.",
      "Scenario run identifier must be a UUID v4.",
      "Dataset identifier does not match the scenario run.",
    ])
  );
});

test("keeps only the newest scenario run unless history is requested", () => {
  const items = [
    {
      id: "old",
      applicationId: "environmental-monitoring",
      scenarioRunId: "run-old",
      createdAt: "2026-08-19T10:00:00.000Z",
    },
    {
      id: "new",
      applicationId: "environmental-monitoring",
      scenarioRunId: "run-new",
      createdAt: "2026-08-20T10:00:00.000Z",
    },
    { id: "legacy", createdAt: "2026-08-18T10:00:00.000Z" },
  ];

  expect(filterPreviousScenarioRuns(items).map((item) => item.id)).toEqual([
    "new",
    "legacy",
  ]);
  expect(filterPreviousScenarioRuns(items, true)).toEqual(items);
});
