import {
  isStatisticsAdmin,
  normalizeRelativeResourcePath,
  normalizeStatisticsConfig,
} from "./runtimeConfig";

const INITIAL_ADMIN =
  "https://solid-community-server.tmdt.info/solidtestpod/profile/card#me";

describe("statistics runtime config", () => {
  test("uses an exact, case-sensitive admin WebID comparison", () => {
    expect(isStatisticsAdmin(INITIAL_ADMIN)).toBe(true);
    expect(isStatisticsAdmin(`${INITIAL_ADMIN}/`)).toBe(false);
    expect(isStatisticsAdmin(INITIAL_ADMIN.toUpperCase())).toBe(false);
  });

  test("fails closed for invalid admin lists and unsafe URLs", () => {
    expect(
      normalizeStatisticsConfig({
        enabled: true,
        adminWebIds: "not-an-array",
        workerWebId: "not-a-webid",
        podBaseUrl: "javascript:alert(1)",
        eventsUrl: "ftp://pod.example/events/",
      })
    ).toMatchObject({
      enabled: false,
      adminWebIds: [],
      workerWebId: "",
      podBaseUrl: "",
      eventsUrl: "",
    });
  });

  test("requires a valid explicit statistics enable flag", () => {
    const base = {
      podBaseUrl: "https://pod.example/statistics/",
      adminWebIds: [INITIAL_ADMIN],
    };
    expect(normalizeStatisticsConfig(base).enabled).toBe(false);
    expect(normalizeStatisticsConfig({ ...base, enabled: "false" }).enabled).toBe(
      false
    );
    expect(normalizeStatisticsConfig({ ...base, enabled: "true" }).enabled).toBe(
      true
    );
    expect(normalizeStatisticsConfig({ ...base, enabled: "yes" }).enabled).toBe(
      true
    );
    expect(normalizeStatisticsConfig({ ...base, enabled: "invalid" }).enabled).toBe(
      false
    );
  });

  test("fails closed for insecure statistics identities and containers", () => {
    expect(
      normalizeStatisticsConfig({
        enabled: true,
        adminWebIds: ["http://pod.example/profile/card#me"],
        workerWebId: "http://pod.example/worker#me",
        podBaseUrl: "http://pod.example/statistics/",
        eventsUrl: "http://pod.example/statistics/events/downloads/",
      })
    ).toMatchObject({
      enabled: false,
      adminWebIds: [],
      workerWebId: "",
      podBaseUrl: "",
      eventsUrl: "",
    });
  });

  test("supports explicit event URL, timezone and a safe activity path", () => {
    expect(
      normalizeStatisticsConfig({
        enabled: true,
        adminWebIds: [INITIAL_ADMIN, INITIAL_ADMIN],
        workerWebId: "https://pod.example/worker#me",
        podBaseUrl: "https://pod.example/statistics",
        eventsUrl: "https://events.example/downloads",
        timezone: "Europe/Berlin",
        activityResourcePath: "../public/activity.ttl",
      })
    ).toMatchObject({
      enabled: true,
      adminWebIds: [INITIAL_ADMIN],
      podBaseUrl: "https://pod.example/statistics/",
      eventsUrl: "https://events.example/downloads/",
      timezone: "Europe/Berlin",
      activityResourcePath: "private/solid-dataspace/statistics/activity.ttl",
    });
  });

  test("removes query and fragment from statistics container URLs", () => {
    expect(
      normalizeStatisticsConfig({
        enabled: true,
        podBaseUrl: "https://host/stats?tenant=x#y",
      })
    ).toMatchObject({
      enabled: true,
      podBaseUrl: "https://host/stats/",
      eventsUrl: "https://host/stats/events/downloads/",
      currentSnapshotUrl: "https://host/stats/snapshots/current.json",
    });
  });

  test("accepts only safe relative activity resource segments", () => {
    expect(
      normalizeRelativeResourcePath(
        "private/solid-dataspace/statistics/activity.ttl"
      )
    ).toBe("private/solid-dataspace/statistics/activity.ttl");

    for (const unsafe of [
      "%2e%2e/%2e%2e/profile/card",
      "private/%2e%2e/activity.ttl",
      "private\\..\\profile/card",
      "private/activity.ttl?query=yes",
      "private/activity.ttl#fragment",
      "private/%2Factivity.ttl",
      "private/%5Cactivity.ttl",
      "private//activity.ttl",
      "/private/activity.ttl",
      "https://pod.example/activity.ttl",
    ]) {
      expect(normalizeRelativeResourcePath(unsafe)).toBe("");
    }
  });
});
