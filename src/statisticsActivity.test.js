import {
  buildActivityPlaceholderTurtle,
  buildActivityTurtle,
  getActivityPeriod,
  parseActivityTurtle,
  recordStatisticsActivity,
  resolveActivityResourceUrl,
  resolveStatisticsPodUrl,
  startStatisticsActivityHeartbeat,
} from "./statisticsActivity";

const mockCreateContainerAt = jest.fn();
const mockGetPodUrlAll = jest.fn();
const mockGetSolidDataset = jest.fn();
const mockSaveAclFor = jest.fn();
const mockSetAgentResourceAccess = jest.fn((acl) => acl);
const mockSetAgentDefaultAccess = jest.fn((acl) => acl);

jest.mock("@inrupt/solid-client", () => ({
  createAcl: jest.fn(() => ({ acl: true })),
  createContainerAt: (...args) => mockCreateContainerAt(...args),
  getPodUrlAll: (...args) => mockGetPodUrlAll(...args),
  getSolidDataset: (...args) => mockGetSolidDataset(...args),
  hasAccessibleAcl: () => true,
  saveAclFor: (...args) => mockSaveAclFor(...args),
  setAgentResourceAccess: (...args) => mockSetAgentResourceAccess(...args),
  setAgentDefaultAccess: (...args) => mockSetAgentDefaultAccess(...args),
  setPublicDefaultAccess: jest.fn((acl) => acl),
  setPublicResourceAccess: jest.fn((acl) => acl),
}));

const config = {
  enabled: true,
  workerWebId: "https://worker.example/profile/card#me",
  activityResourcePath: "statistics/activity/activity.ttl",
  timezone: "Europe/Berlin",
};
const ownerWebId = "https://pod.example/alice/profile/card#me";
const secondaryAdminWebId = "https://pod.example/admin/profile/card#me";
const centralConfig = {
  ...config,
  podBaseUrl: "https://pod.example/alice/statistics/",
  adminWebIds: [ownerWebId, secondaryAdminWebId],
};

function response(status, { body = "", etag = "" } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (name.toLowerCase() === "etag" ? etag : "") },
    text: jest.fn(async () => body),
  };
}

describe("statistics activity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPodUrlAll.mockResolvedValue(["https://pod.example/alice/"]);
    mockGetSolidDataset.mockResolvedValue({ resource: true });
    mockSaveAclFor.mockResolvedValue({});
  });

  test("uses the configured timezone for day and month", () => {
    const now = new Date("2026-03-31T22:30:00.000Z");
    expect(getActivityPeriod(now, "Europe/Berlin")).toEqual({
      day: "2026-04-01",
      month: "2026-04",
    });
    expect(parseActivityTurtle(buildActivityTurtle(now), "https://pod/activity.ttl"))
      .toEqual({
        lastActiveAt: "2026-03-31T22:30:00.000Z",
        activeMonth: "2026-04",
      });
  });

  test("resolves a safe activity path strictly inside the Pod storage", () => {
    expect(
      resolveActivityResourceUrl(
        "https://pod.example/alice",
        "statistics/activity/activity.ttl"
      )
    ).toBe(
      "https://pod.example/alice/statistics/activity/activity.ttl"
    );
  });

  test("prefers an advertised pim:storage Pod URL", async () => {
    mockGetPodUrlAll.mockResolvedValue(["https://storage.example/alice/"]);
    await expect(
      resolveStatisticsPodUrl(
        "https://pod.example/alice/profile/card#me",
        jest.fn()
      )
    ).resolves.toBe("https://storage.example/alice/");
  });

  test("falls back to the local CSS Pod root when pim:storage is missing", async () => {
    mockGetPodUrlAll.mockResolvedValue([]);
    await expect(
      resolveStatisticsPodUrl(
        "https://pod.example/alice/profile/card#me",
        jest.fn()
      )
    ).resolves.toBe("https://pod.example/alice/");
  });

  test("does not hide profile discovery errors behind the local fallback", async () => {
    const profileError = new Error("Profile forbidden");
    mockGetPodUrlAll.mockRejectedValue(profileError);
    await expect(
      resolveStatisticsPodUrl(
        "https://pod.example/alice/profile/card#me",
        jest.fn()
      )
    ).rejects.toBe(profileError);
  });

  test.each([
    "%2e%2e/%2e%2e/profile/card",
    "private\\..\\profile/card",
    "private/activity.ttl?query=yes",
    "private/activity.ttl#fragment",
    "private/%2Factivity.ttl",
    "private/%5Cactivity.ttl",
    "https://attacker.example/activity.ttl",
  ])("rejects unsafe activity path %s", (unsafePath) => {
    expect(() =>
      resolveActivityResourceUrl("https://pod.example/alice/", unsafePath)
    ).toThrow(/Invalid statistics activity resource path/);
  });

  test("rejects insecure Solid storage URLs", () => {
    expect(() =>
      resolveActivityResourceUrl(
        "http://pod.example/alice/",
        "statistics/activity/activity.ttl"
      )
    ).toThrow(/Invalid Solid storage URL/);
  });

  test("does not rewrite an activity already recorded on the same local day", async () => {
    const now = new Date("2026-07-14T12:00:00.000Z");
    const existing = buildActivityTurtle(
      new Date("2026-07-14T06:00:00.000Z"),
      config.timezone
    );
    const fetcher = jest.fn(async (url, options) => {
      if (url.endsWith("activity.ttl")) {
        return response(200, { body: existing, etag: '"same-day"' });
      }
      return response(200);
    });

    await expect(
      recordStatisticsActivity({
        webId: "https://pod.example/alice/profile/card#me",
        fetch: fetcher,
        config,
        now,
      })
    ).resolves.toMatchObject({ recorded: false, reason: "already-recorded" });

    expect(fetcher.mock.calls.some(([, options]) => options.method === "PUT")).toBe(
      false
    );
    expect(mockSaveAclFor).toHaveBeenCalledTimes(2);
    expect(mockGetSolidDataset.mock.calls.map(([url]) => url)).toEqual([
      "https://pod.example/alice/statistics/activity/",
      "https://pod.example/alice/statistics/activity/activity.ttl",
    ]);
    const workerContainerAccess = mockSetAgentResourceAccess.mock.calls.find(
      ([, agent, access]) => agent === config.workerWebId && access?.control
    );
    expect(workerContainerAccess?.slice(1)).toEqual([
      config.workerWebId,
      { read: true, append: false, write: false, control: true },
    ]);
  });

  test("does not probe the restricted central statistics root when the activity container exists", async () => {
    const now = new Date("2026-07-14T12:00:00.000Z");
    const existing = buildActivityTurtle(now, config.timezone);
    const fetcher = jest.fn(async (url) => {
      if (url === "https://pod.example/alice/statistics/") {
        return response(403);
      }
      if (url.endsWith("activity.ttl")) {
        return response(200, { body: existing, etag: '"same-day"' });
      }
      return response(200);
    });

    await expect(
      recordStatisticsActivity({
        webId: ownerWebId,
        fetch: fetcher,
        config: centralConfig,
        now,
      })
    ).resolves.toMatchObject({ recorded: false, reason: "already-recorded" });

    expect(
      fetcher.mock.calls.some(
        ([url]) => url === "https://pod.example/alice/statistics/"
      )
    ).toBe(false);

    expect(mockGetSolidDataset.mock.calls.map(([url]) => url)).toEqual([
      "https://pod.example/alice/statistics/activity/",
      "https://pod.example/alice/statistics/activity/activity.ttl",
    ]);
    expect(
      mockSetAgentResourceAccess.mock.calls.some(
        ([, agent, access]) =>
          agent === secondaryAdminWebId && access?.write && access?.control
      )
    ).toBe(true);
  });

  test("gives the worker bootstrap access when creating a fresh central statistics root", async () => {
    const now = new Date("2026-07-14T12:00:00.000Z");
    const existing = buildActivityTurtle(now, config.timezone);
    const fetcher = jest.fn(async (url) => {
      if (url === "https://pod.example/alice/statistics/" || url.endsWith("activity/")) {
        return response(404);
      }
      if (url.endsWith("activity.ttl")) {
        return response(200, { body: existing, etag: '"same-day"' });
      }
      return response(200);
    });

    await recordStatisticsActivity({
      webId: ownerWebId,
      fetch: fetcher,
      config: centralConfig,
      now,
    });

    expect(mockCreateContainerAt.mock.calls.map(([url]) => url)).toEqual([
      "https://pod.example/alice/statistics/",
      "https://pod.example/alice/statistics/activity/",
    ]);
    const workerRootAccess = mockSetAgentResourceAccess.mock.calls.find(
      ([, agent, access]) =>
        agent === config.workerWebId && access?.write && access?.control
    );
    const workerRootDefault = mockSetAgentDefaultAccess.mock.calls.find(
      ([, agent, access]) =>
        agent === config.workerWebId && access?.write && access?.control
    );
    expect(workerRootAccess).toBeDefined();
    expect(workerRootDefault).toBeDefined();
  });

  test("creates a missing central activity container below a restricted existing root", async () => {
    const now = new Date("2026-07-14T12:00:00.000Z");
    const existing = buildActivityTurtle(now, config.timezone);
    const activityContainerUrl =
      "https://pod.example/alice/statistics/activity/";
    const centralRootUrl = "https://pod.example/alice/statistics/";
    const fetcher = jest.fn(async (url) => {
      if (url === activityContainerUrl) return response(404);
      if (url === centralRootUrl) return response(403);
      if (url.endsWith("activity.ttl")) {
        return response(200, { body: existing, etag: '"same-day"' });
      }
      return response(200);
    });

    await expect(
      recordStatisticsActivity({
        webId: ownerWebId,
        fetch: fetcher,
        config: centralConfig,
        now,
      })
    ).resolves.toMatchObject({ recorded: false, reason: "already-recorded" });

    expect(mockCreateContainerAt.mock.calls.map(([url]) => url)).toEqual([
      activityContainerUrl,
    ]);
  });

  test("fails on an inaccessible central activity container without probing the root", async () => {
    const activityContainerUrl =
      "https://pod.example/alice/statistics/activity/";
    const centralRootUrl = "https://pod.example/alice/statistics/";
    const fetcher = jest.fn(async (url) =>
      response(url === activityContainerUrl ? 403 : 200)
    );

    await expect(
      recordStatisticsActivity({
        webId: ownerWebId,
        fetch: fetcher,
        config: centralConfig,
        now: new Date("2026-07-14T12:00:00.000Z"),
      })
    ).rejects.toThrow(
      "Statistics activity container is not accessible (403)."
    );

    expect(
      fetcher.mock.calls.some(([url]) => url === centralRootUrl)
    ).toBe(false);
    expect(mockCreateContainerAt).not.toHaveBeenCalled();
  });

  test("does not grant central statistics admins access to a member Pod container", async () => {
    const now = new Date("2026-07-14T12:00:00.000Z");
    const existing = buildActivityTurtle(now, config.timezone);
    const fetcher = jest.fn(async (url) =>
      url.endsWith("activity.ttl")
        ? response(200, { body: existing, etag: '"same-day"' })
        : response(200)
    );

    await recordStatisticsActivity({
      webId: ownerWebId,
      fetch: fetcher,
      config: {
        ...centralConfig,
        podBaseUrl: "https://pod.example/admin/statistics/",
      },
      now,
    });

    expect(
      mockSetAgentResourceAccess.mock.calls.some(
        ([, agent]) => agent === secondaryAdminWebId
      )
    ).toBe(false);
  });

  test("retries an ETag conflict and writes at most with If-Match", async () => {
    const oldBody = buildActivityTurtle(new Date("2026-07-13T08:00:00.000Z"));
    let activityReads = 0;
    let activityWrites = 0;
    const fetcher = jest.fn(async (url, options) => {
      if (!url.endsWith("activity.ttl")) return response(200);
      if (options.method === "GET") {
        activityReads += 1;
        return response(200, {
          body: oldBody,
          etag: activityReads === 1 ? '"v1"' : '"v2"',
        });
      }
      activityWrites += 1;
      return activityWrites === 1 ? response(412) : response(204);
    });

    await expect(
      recordStatisticsActivity({
        webId: "https://pod.example/alice/profile/card#me",
        fetch: fetcher,
        config,
        now: new Date("2026-07-14T08:00:00.000Z"),
      })
    ).resolves.toMatchObject({ recorded: true, activeMonth: "2026-07" });

    const puts = fetcher.mock.calls.filter(([, options]) => options.method === "PUT");
    expect(puts).toHaveLength(2);
    expect(puts[0][1].headers["If-Match"]).toBe('"v1"');
    expect(puts[1][1].headers["If-Match"]).toBe('"v2"');
  });

  test("checks again while a Manager session stays open", async () => {
    jest.useFakeTimers();
    const recordActivity = jest.fn(async () => ({ recorded: false }));
    const stop = startStatisticsActivityHeartbeat({
      webId: "https://pod.example/alice/profile/card#me",
      fetch: jest.fn(),
      config,
      intervalMs: 60 * 60 * 1000,
      recordActivity,
    });

    await Promise.resolve();
    expect(recordActivity).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(60 * 60 * 1000);
    await Promise.resolve();
    expect(recordActivity).toHaveBeenCalledTimes(2);

    stop();
    jest.advanceTimersByTime(2 * 60 * 60 * 1000);
    await Promise.resolve();
    expect(recordActivity).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });

  test("passes the original heartbeat error to onError", async () => {
    const heartbeatError = new Error("ACL unavailable");
    const onError = jest.fn();
    const stop = startStatisticsActivityHeartbeat({
      webId: "https://pod.example/alice/profile/card#me",
      fetch: jest.fn(),
      config,
      onError,
      recordActivity: jest.fn(async () => {
        throw heartbeatError;
      }),
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(onError).toHaveBeenCalledWith(heartbeatError);
    stop();
  });

  test("secures a placeholder before writing the first timestamp", async () => {
    const order = [];
    let activityReads = 0;
    mockSaveAclFor.mockImplementation(async () => {
      order.push("acl");
      return {};
    });
    const fetcher = jest.fn(async (url, options) => {
      if (!url.endsWith("activity.ttl")) return response(200);
      if (options.method === "GET") {
        activityReads += 1;
        return activityReads === 1
          ? response(404)
          : response(200, {
              body: buildActivityPlaceholderTurtle(),
              etag: '"placeholder"',
            });
      }
      order.push(options.body.includes("lastActiveAt") ? "timestamp" : "placeholder");
      return response(201);
    });

    await recordStatisticsActivity({
      webId: "https://pod.example/alice/profile/card#me",
      fetch: fetcher,
      config,
      now: new Date("2026-07-14T08:00:00.000Z"),
    });

    expect(order).toEqual(["acl", "placeholder", "acl", "timestamp"]);
  });

  test("leaves only a non-sensitive placeholder when resource ACL setup fails", async () => {
    let activityReads = 0;
    const bodies = [];
    mockSaveAclFor
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("ACL unavailable"));
    const fetcher = jest.fn(async (url, options) => {
      if (!url.endsWith("activity.ttl")) return response(200);
      if (options.method === "GET") {
        activityReads += 1;
        return response(404);
      }
      bodies.push(options.body);
      return response(201);
    });

    await expect(
      recordStatisticsActivity({
        webId: "https://pod.example/alice/profile/card#me",
        fetch: fetcher,
        config,
      })
    ).rejects.toThrow(/ACL unavailable/);

    expect(activityReads).toBe(1);
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).not.toContain("lastActiveAt");
    expect(bodies[0]).not.toContain("profile/card#me");
  });
});
