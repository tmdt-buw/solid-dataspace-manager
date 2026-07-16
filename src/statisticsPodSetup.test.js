import {
  buildStatisticsContainerAcl,
  detectStatisticsPodInitialization,
  getStatisticsContainerDefinitions,
  initializeStatisticsPod,
} from "./statisticsPodSetup";

const mockCreateContainerAt = jest.fn();

jest.mock("@inrupt/solid-client", () => ({
  createContainerAt: (...args) => mockCreateContainerAt(...args),
}));

const config = {
  enabled: true,
  podBaseUrl: "https://pod.example/admin/statistics/",
  adminWebIds: ["https://pod.example/admin/profile/card#me"],
  workerWebId: "https://pod.example/worker/profile/card#me",
};

function response(status) {
  return { ok: status >= 200 && status < 300, status };
}

function getAuthorizationBlock(turtle, id) {
  const block = turtle
    .split("\n\n")
    .find((candidate) => candidate.startsWith(`<#${id}>`));
  expect(block).toBeDefined();
  return block;
}

describe("statistics Pod setup", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateContainerAt.mockResolvedValue({});
  });

  test("detects initialized statistics storage when both readable containers exist", async () => {
    const fetcher = jest.fn().mockResolvedValue(response(200));

    await expect(
      detectStatisticsPodInitialization({ fetch: fetcher, config })
    ).resolves.toEqual({ status: "initialized" });

    const definitions = getStatisticsContainerDefinitions(config.podBaseUrl);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      definitions.find(({ key }) => key === "snapshots").url,
      definitions.find(({ key }) => key === "months").url,
    ]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  test("detects uninitialized statistics storage only when both containers are missing", async () => {
    const fetcher = jest.fn().mockResolvedValue(response(404));

    await expect(
      detectStatisticsPodInitialization({ fetch: fetcher, config })
    ).resolves.toEqual({ status: "uninitialized" });
  });

  test.each([
    ["mixed responses", [200, 404]],
    ["forbidden responses", [403, 403]],
  ])("keeps the initialization state unknown for %s", async (_, statuses) => {
    const fetcher = jest.fn();
    statuses.forEach((status) => fetcher.mockResolvedValueOnce(response(status)));

    await expect(
      detectStatisticsPodInitialization({ fetch: fetcher, config })
    ).resolves.toMatchObject({ status: "unknown" });
  });

  test("keeps the initialization state unknown after a network failure", async () => {
    const fetcher = jest.fn().mockRejectedValue(new Error("network unavailable"));

    await expect(
      detectStatisticsPodInitialization({ fetch: fetcher, config })
    ).resolves.toMatchObject({ status: "unknown" });
  });

  test("builds a download ACL with worker full and authenticated append only", () => {
    const targetUrl =
      "https://pod.example/admin/statistics/events/downloads/";
    const turtle = buildStatisticsContainerAcl({
      targetUrl,
      adminWebIds: config.adminWebIds,
      workerWebId: config.workerWebId,
      adminModes: [],
      authenticatedAppend: true,
    });

    const authenticatedRule = getAuthorizationBlock(
      turtle,
      "authenticated-append"
    );
    expect(authenticatedRule).toContain(
      "acl:agentClass <http://www.w3.org/ns/auth/acl#AuthenticatedAgent>"
    );
    expect(authenticatedRule).toContain(`acl:accessTo <${targetUrl}>`);
    expect(authenticatedRule).toContain("acl:mode acl:Append");
    expect(authenticatedRule).not.toContain("acl:default");

    const workerRule = getAuthorizationBlock(turtle, "worker");
    expect(workerRule).toContain(`acl:accessTo <${targetUrl}>`);
    expect(workerRule).toContain(`acl:default <${targetUrl}>`);
    expect(turtle).not.toContain("<#admin-1>");
    expect(turtle).not.toContain("foaf:Agent");
  });

  test("creates all containers and finishes with restrictive ACLs", async () => {
    const fetcher = jest.fn(async (url, options) => {
      if (options.method === "GET") return response(404);
      return response(201);
    });

    await expect(
      initializeStatisticsPod({
        webId: config.adminWebIds[0],
        fetch: fetcher,
        config,
      })
    ).resolves.toMatchObject({ initialized: true });

    const definitions = getStatisticsContainerDefinitions(config.podBaseUrl);
    expect(mockCreateContainerAt).toHaveBeenCalledTimes(definitions.length);

    const finalAclWrites = fetcher.mock.calls
      .filter(([url, options]) => url.endsWith(".acl") && options.method === "PUT")
      .slice(-definitions.length);
    expect(finalAclWrites).toHaveLength(definitions.length);

    const eventsAcl = finalAclWrites.find(([url]) =>
      url.endsWith("events/downloads/.acl")
    )[1].body;
    expect(eventsAcl).toContain("AuthenticatedAgent");
    expect(eventsAcl).not.toContain("<#admin-1>");

    const snapshotsAcl = finalAclWrites.find(([url]) =>
      url.endsWith("snapshots/.acl")
    )[1].body;
    const snapshotAdminRule = getAuthorizationBlock(snapshotsAcl, "admin-1");
    const snapshotsUrl = definitions.find(
      ({ key }) => key === "snapshots"
    ).url;
    expect(snapshotAdminRule).toContain(`acl:accessTo <${snapshotsUrl}>`);
    expect(snapshotAdminRule).toContain(`acl:default <${snapshotsUrl}>`);
    expect(snapshotAdminRule).toContain("acl:mode acl:Read .");

    const stateAcl = finalAclWrites.find(([url]) =>
      url.endsWith("state/.acl")
    )[1].body;
    expect(stateAcl).not.toContain("<#admin-1>");
  });

  test("fails closed for a non-admin WebID", async () => {
    await expect(
      initializeStatisticsPod({
        webId: "https://pod.example/not-admin#me",
        fetch: jest.fn(),
        config,
      })
    ).rejects.toThrow(/not a configured statistics admin/i);
  });
});
