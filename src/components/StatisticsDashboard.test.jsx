import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import StatisticsDashboard, {
  aggregateStatisticsAccounts,
  loadStatisticsSnapshot,
  normalizeStatisticsSnapshot,
} from "./StatisticsDashboard";

const mockDetectStatisticsPodInitialization = jest.fn();
const mockInitializeStatisticsPod = jest.fn();

jest.mock("../statisticsPodSetup", () => ({
  detectStatisticsPodInitialization: (...args) =>
    mockDetectStatisticsPodInitialization(...args),
  initializeStatisticsPod: (...args) => mockInitializeStatisticsPod(...args),
}));

const config = {
  enabled: true,
  currentSnapshotUrl: "https://pod.example/statistics/snapshots/current.json",
  podBaseUrl: "https://pod.example/statistics/",
  workerWebId: "https://pod.example/worker#me",
  adminWebIds: ["https://pod.example/admin#me"],
};

const snapshot = {
  schemaVersion: 1,
  generatedAt: "2026-07-14T10:00:00.000Z",
  timezone: "Europe/Berlin",
  month: "2026-07",
  totals: { uniqueAccounts: 4, activeUsers: 2, activeRate: 0.5 },
  registries: [
    {
      id: "test",
      label: "Test Registry",
      url: "https://registry.example/test/",
      memberCount: 4,
      activeUsers: 2,
      activeRate: 0.5,
      members: [{ id: "v1:012345", lastSeen: null }],
      errors: ["2 registry entries could not be evaluated."],
    },
  ],
  activity: {
    monthly: [
      { month: "2026-06", activeUsers: 1, uniqueAccounts: 4, activeRate: 0.25 },
      { month: "2026-07", activeUsers: 2, uniqueAccounts: 4, activeRate: 0.5 },
    ],
  },
  downloads: {
    total: 8,
    byType: {
      dataset_download: 4,
      dataset_access: 3,
      semantic_model_download: 1,
    },
    datasets: [
      {
        datasetUrl: "https://catalog.example/datasets/air.ttl",
        title: "Air quality",
        total: 8,
        byType: {
          dataset_download: 4,
          dataset_access: 3,
          semantic_model_download: 1,
        },
      },
    ],
  },
  catalog: {
    datasets: {
      count: 2,
      semanticModelCount: 1,
      semanticModelRate: 0.5,
      quality: {
        score: 0.75,
        filledFields: 18,
        totalFields: 24,
        fields: [{ key: "description", filled: 1, total: 2, rate: 0.5 }],
      },
    },
    series: {
      count: 1,
      quality: { score: 1, filledFields: 5, totalFields: 5, fields: [] },
    },
  },
  partialErrors: [
    {
      scope: "registry-entries",
      source: "test",
      message: "2 registry entries could not be evaluated.",
    },
  ],
  run: {
    startedAt: "2026-07-14T09:59:58.000Z",
    completedAt: "2026-07-14T10:00:00.000Z",
    durationMs: 2000,
    status: "ok",
  },
};

beforeEach(() => {
  mockDetectStatisticsPodInitialization.mockReset();
  mockInitializeStatisticsPod.mockReset();
  mockDetectStatisticsPodInitialization.mockResolvedValue({
    status: "initialized",
  });
});

test("renders the complete snapshot with the compact dashboard labels", async () => {
  const solidFetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => snapshot,
  }));

  render(
    <StatisticsDashboard
      webId={config.adminWebIds[0]}
      solidFetch={solidFetch}
      config={config}
    />
  );

  const dataspaceHeading = await screen.findByText("Solid Dataspace");
  expect(dataspaceHeading).toBeInTheDocument();
  expect(
    dataspaceHeading
      .closest(".statistics-panel")
      .querySelector(".statistics-panel__total")
  ).toHaveTextContent("1");
  expect(screen.getByText("v1:012345")).toBeInTheDocument();
  expect(screen.getAllByText("N/A").length).toBeGreaterThan(0);
  expect(screen.getByText("Air quality")).toBeInTheDocument();
  expect(screen.queryByText("Test Registry")).not.toBeInTheDocument();
  expect(screen.queryByText("https://registry.example/test/")).not.toBeInTheDocument();
  expect(
    screen.getByText((_, element) =>
      element?.classList?.contains("statistics-status") &&
      element.textContent.includes("Successful")
    )
  ).toBeInTheDocument();
  expect(
    screen.getByText((_, element) =>
      element?.classList?.contains("statistics-semantic-model") &&
      element.textContent.includes("1 / 2 (50 %)")
    )
  ).toBeInTheDocument();
  expect(
    screen.getByText((_, element) =>
      element?.classList?.contains("statistics-quality-metric") &&
      element.textContent.includes("18 / 24 (75 %)")
    )
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /refresh/i })).toHaveClass("pill-btn");
  expect(
    screen.getByText("Active users 2026-07").closest(".statistics-metric")
  ).not.toHaveTextContent("50 %");
  expect(
    screen.getByText("Catalog entries").closest(".statistics-metric")
  ).not.toHaveTextContent("2 datasets");
  expect(
    screen.queryByText("Pseudonymized usage, catalog activity and metadata quality")
  ).not.toBeInTheDocument();
  expect(
    screen.queryByText(
      "One-time setup by the statistics Pod owner. After initialization, only the worker can change raw events and state."
    )
  ).not.toBeInTheDocument();
  expect(
    screen.queryByText(
      "Only actions triggered through the embedded or standalone catalog."
    )
  ).not.toBeInTheDocument();
  expect(
    screen.queryByText("Downloads by catalog instance")
  ).not.toBeInTheDocument();
  expect(screen.queryByText("Dataset access clicks")).not.toBeInTheDocument();
  expect(screen.queryByText("Access clicks")).not.toBeInTheDocument();
  expect(
    screen.getByText("Catalog downloads").closest(".statistics-metric")
  ).toHaveTextContent("5");
  expect(
    document.querySelector(".statistics-download-types").children
  ).toHaveLength(2);
  expect(
    screen
      .getByText("Dataset metadata quality")
      .closest(".statistics-quality")
      .querySelector(".statistics-semantic-model--spacer")
  ).toBeNull();
  expect(
    screen
      .getByText("Series metadata quality")
      .closest(".statistics-quality")
      .querySelector(".statistics-semantic-model--spacer")
  ).toHaveAttribute("aria-hidden", "true");
  expect(screen.queryByText("Partial errors")).not.toBeInTheDocument();
  expect(solidFetch).toHaveBeenCalledWith(config.currentSnapshotUrl, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
});

test("renders catalog-instance downloads without replacing aggregate downloads", async () => {
  const solidFetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      ...snapshot,
      downloads: {
        ...snapshot.downloads,
        byCatalogInstance: [
          {
            id: "test",
            label: "TMDT Test",
            total: 5,
            byType: {
              dataset_download: 3,
              dataset_access: 1,
              semantic_model_download: 1,
            },
          },
          {
            id: "dace",
            label: "DACE",
            total: 3,
            byType: {
              dataset_download: 1,
              dataset_access: 2,
              semantic_model_download: 0,
            },
          },
        ],
      },
    }),
  }));

  render(
    <StatisticsDashboard
      webId={config.adminWebIds[0]}
      solidFetch={solidFetch}
      config={config}
    />
  );

  const heading = await screen.findByText("Downloads by catalog instance");
  const rows = heading.closest("section").querySelectorAll("tbody tr");
  const instanceHeaders = Array.from(
    heading.closest("section").querySelectorAll("thead th")
  ).map((header) => header.textContent);
  const datasetHeaders = Array.from(
    heading.closest(".statistics-panel").querySelectorAll("table")[1]
      .querySelectorAll("thead th")
  ).map((header) => header.textContent);
  expect(instanceHeaders).toEqual([
    "Catalog instance",
    "Total Downloads",
    "Dataset Downloads",
    "Semantic Model Downloads",
  ]);
  expect(datasetHeaders).toEqual([
    "Dataset",
    "Total Downloads",
    "Dataset Downloads",
    "Semantic Model Downloads",
  ]);
  expect(rows).toHaveLength(2);
  expect(rows[0]).toHaveTextContent("TMDT Test");
  expect(rows[0]).toHaveTextContent("test");
  expect(rows[0]).toHaveTextContent("4");
  expect(rows[0]).toHaveTextContent("3");
  expect(rows[1]).toHaveTextContent("DACE");
  expect(rows[1]).toHaveTextContent("dace");
  expect(rows[1]).toHaveTextContent("1");
  expect(screen.getByText("Air quality")).toBeInTheDocument();
  expect(
    screen.getByText("Catalog downloads").closest(".statistics-metric")
  ).toHaveTextContent("5");
  expect(screen.queryByText("Access clicks")).not.toBeInTheDocument();
});

test("normalizes legacy snapshots using only the two download event types", () => {
  const normalized = normalizeStatisticsSnapshot({
    downloads: {
      total: 8,
      byType: { dataset_download: 4, dataset_access: 3 },
      monthly: [{
        month: "2026-07",
        total: 8,
        byType: {
          dataset_download: 4,
          dataset_access: 3,
          semantic_model_download: 1,
        },
      }],
      datasets: [
        {
          datasetUrl: "https://catalog.example/kept.ttl",
          total: 4,
          byType: { dataset_download: 2, dataset_access: 2 },
        },
        {
          datasetUrl: "https://catalog.example/access-only.ttl",
          total: 3,
          byType: { dataset_access: 3 },
        },
      ],
      byCatalogInstance: [
        {
          id: "test",
          label: "TMDT Test",
          total: "5",
          byType: {
            dataset_download: "3",
            dataset_access: 1,
          },
        },
      ],
    },
  });

  expect(normalized.downloads.total).toBe(4);
  expect(normalized.downloads.byType.dataset_download).toBe(4);
  expect(normalized.downloads.byType).toEqual({
    dataset_download: 4,
    semantic_model_download: 0,
  });
  expect(normalized.downloads.datasets).toHaveLength(1);
  expect(normalized.downloads.datasets[0]).toMatchObject({
    datasetUrl: "https://catalog.example/kept.ttl",
    total: 2,
  });
  expect(normalized.downloads.monthly[0]).toEqual({
    month: "2026-07",
    total: 5,
    byType: {
      dataset_download: 4,
      semantic_model_download: 1,
    },
  });
  expect(normalized.downloads.byCatalogInstance).toEqual([
    {
      id: "test",
      label: "TMDT Test",
      total: 3,
      byType: {
        dataset_download: 3,
        semantic_model_download: 0,
      },
    },
  ]);
  expect(
    normalizeStatisticsSnapshot({ downloads: { total: 2 } }).downloads
      .byCatalogInstance
  ).toEqual([]);
  expect(
    normalizeStatisticsSnapshot({
      downloads: {
        byCatalogInstance: {
          timberconnect: { label: "TimberConnect", total: 2 },
        },
      },
    }).downloads.byCatalogInstance[0]
  ).toMatchObject({ id: "timberconnect", label: "TimberConnect", total: 0 });
  expect(JSON.stringify(normalized.downloads)).not.toContain("dataset_access");
});

test("normalizes the two survey questions with independent aggregates", () => {
  const normalized = normalizeStatisticsSnapshot({
    schemaVersion: 4,
    survey: {
      version: "catalog-usability-v1",
      questions: {
        system_comprehensibility: {
          responseCount: "8",
          positiveCount: "6",
          positiveRate: 0.75,
          ratings: { 1: 1, 2: 0, 3: 1, 4: 3, 5: 3 },
          monthly: [
            {
              month: "2026-07",
              responseCount: 8,
              positiveCount: 6,
              positiveRate: 0.75,
              ratings: { 1: 1, 3: 1, 4: 3, 5: 3 },
            },
          ],
          byCatalogInstance: {
            test: {
              label: "TMDT Test",
              responseCount: 5,
              positiveCount: 4,
              positiveRate: 0.8,
              ratings: { 1: 1, 4: 2, 5: 2 },
              monthly: [],
            },
          },
        },
        dataset_findability: {
          responseCount: 3,
          positiveCount: 1,
          ratings: { 1: 1, 2: 0, 3: 1, 4: 1, 5: 0 },
        },
      },
    },
  });

  expect(normalized.schemaVersion).toBe(4);
  expect(normalized.survey.version).toBe("catalog-usability-v1");
  expect(normalized.survey.questions.system_comprehensibility).toMatchObject({
    responseCount: 8,
    positiveCount: 6,
    positiveRate: 0.75,
    ratings: { 1: 1, 2: 0, 3: 1, 4: 3, 5: 3 },
  });
  expect(
    normalized.survey.questions.system_comprehensibility.monthly[0]
  ).toMatchObject({
    month: "2026-07",
    responseCount: 8,
    positiveCount: 6,
  });
  expect(
    normalized.survey.questions.system_comprehensibility.byCatalogInstance[0]
  ).toMatchObject({
    id: "test",
    label: "TMDT Test",
    responseCount: 5,
    positiveCount: 4,
  });
  expect(normalized.survey.questions.dataset_findability).toMatchObject({
    responseCount: 3,
    positiveCount: 1,
    positiveRate: 1 / 3,
    ratings: { 1: 1, 2: 0, 3: 1, 4: 1, 5: 0 },
  });
});

test("uses independent zero aggregates for snapshots without survey data", () => {
  const questions = normalizeStatisticsSnapshot({ schemaVersion: 3 }).survey
    .questions;

  expect(questions.system_comprehensibility).toEqual({
    responseCount: 0,
    positiveCount: 0,
    positiveRate: 0,
    ratings: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    monthly: [],
    byCatalogInstance: [],
  });
  expect(questions.dataset_findability).toEqual(
    questions.system_comprehensibility
  );
});

test("renders only the three independent summary values for each survey question", async () => {
  const solidFetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      ...snapshot,
      schemaVersion: 4,
      survey: {
        version: "catalog-usability-v1",
        questions: {
          system_comprehensibility: {
            responseCount: 8,
            positiveCount: 6,
            positiveRate: 0.75,
            ratings: { 1: 1, 2: 0, 3: 1, 4: 3, 5: 3 },
            monthly: [
              {
                month: "2026-07",
                responseCount: 8,
                positiveCount: 6,
                positiveRate: 0.75,
              },
            ],
            byCatalogInstance: [
              {
                id: "test",
                label: "TMDT Test",
                responseCount: 5,
                positiveCount: 4,
                positiveRate: 0.8,
              },
            ],
          },
          dataset_findability: {
            responseCount: 3,
            positiveCount: 1,
            positiveRate: 1 / 3,
            ratings: { 1: 1, 2: 0, 3: 1, 4: 1, 5: 0 },
            monthly: [
              {
                month: "2026-07",
                responseCount: 3,
                positiveCount: 1,
                positiveRate: 1 / 3,
              },
            ],
            byCatalogInstance: [
              {
                id: "dace",
                label: "DACE",
                responseCount: 3,
                positiveCount: 1,
                positiveRate: 1 / 3,
              },
            ],
          },
        },
      },
    }),
  }));

  render(
    <StatisticsDashboard
      webId={config.adminWebIds[0]}
      solidFetch={solidFetch}
      config={config}
    />
  );

  const comprehensibilityCard = (
    await screen.findByRole("heading", { name: "System comprehensibility" })
  ).closest(".statistics-survey-card");
  const findabilityCard = screen
    .getByRole("heading", { name: "Dataset findability" })
    .closest(".statistics-survey-card");

  const comprehensibilitySummary = comprehensibilityCard.querySelector(
    ".statistics-survey-summary"
  ).children;
  expect(comprehensibilitySummary[0]).toHaveTextContent("Responses8");
  expect(comprehensibilitySummary[1]).toHaveTextContent("Positive responses6");
  expect(comprehensibilitySummary[2]).toHaveTextContent("Positive rate75 %");

  const findabilitySummary = findabilityCard.querySelector(
    ".statistics-survey-summary"
  ).children;
  expect(findabilitySummary[0]).toHaveTextContent("Responses3");
  expect(findabilitySummary[1]).toHaveTextContent("Positive responses1");
  expect(findabilitySummary[2]).toHaveTextContent("Positive rate33.3 %");
  expect(screen.queryByText("Ratings 4 and 5 are positive.")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: "Rating distribution" })
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: "Responses by month" })
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: "Responses by catalog instance" })
  ).not.toBeInTheDocument();
  expect(screen.queryByText("TMDT Test")).not.toBeInTheDocument();
  expect(screen.queryByText("DACE")).not.toBeInTheDocument();
});

test("shows N/A as the positive rate when a survey question has no responses", async () => {
  const solidFetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => snapshot,
  }));

  render(
    <StatisticsDashboard
      webId={config.adminWebIds[0]}
      solidFetch={solidFetch}
      config={config}
    />
  );

  const card = (
    await screen.findByRole("heading", { name: "System comprehensibility" })
  ).closest(".statistics-survey-card");
  expect(card.querySelector(".statistics-survey-summary").children[2]).toHaveTextContent(
    "Positive rateN/A"
  );
});

test("hides initialization for existing statistics storage", async () => {
  const solidFetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => snapshot,
  }));

  render(
    <StatisticsDashboard
      webId={config.adminWebIds[0]}
      solidFetch={solidFetch}
      config={config}
    />
  );

  await screen.findByText("v1:012345");
  await waitFor(() =>
    expect(mockDetectStatisticsPodInitialization).toHaveBeenCalledWith({
      fetch: solidFetch,
      config,
    })
  );
  expect(
    screen.queryByRole("button", { name: /initialize statistics storage/i })
  ).not.toBeInTheDocument();
});

test("enables initialization only when storage is confirmed uninitialized", async () => {
  mockDetectStatisticsPodInitialization.mockResolvedValue({
    status: "uninitialized",
  });
  const solidFetch = jest.fn(async () => ({ ok: false, status: 404 }));

  render(
    <StatisticsDashboard
      webId={config.adminWebIds[0]}
      solidFetch={solidFetch}
      config={config}
    />
  );

  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: /initialize statistics storage/i })
    ).toBeEnabled()
  );
});

test("hides initialization while setup is running", async () => {
  mockDetectStatisticsPodInitialization.mockResolvedValue({
    status: "uninitialized",
  });
  mockInitializeStatisticsPod.mockReturnValue(new Promise(() => {}));
  const solidFetch = jest.fn(async () => ({ ok: false, status: 404 }));

  render(
    <StatisticsDashboard
      webId={config.adminWebIds[0]}
      solidFetch={solidFetch}
      config={config}
    />
  );

  const initializeButton = await screen.findByRole("button", {
    name: /initialize statistics storage/i,
  });
  fireEvent.click(initializeButton);

  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: /initialize statistics storage/i })
    ).not.toBeInTheDocument()
  );
});

test("renders dashboard timestamps in 24-hour format", async () => {
  const solidFetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      ...snapshot,
      generatedAt: "2026-07-14T22:05:00.000Z",
      registries: [
        {
          id: "test",
          members: [
            { id: "v1:late-account", lastSeen: "2026-07-14T20:15:00.000Z" },
          ],
        },
      ],
      run: {
        ...snapshot.run,
        completedAt: "2026-07-14T22:05:00.000Z",
      },
    }),
  }));

  const { container } = render(
    <StatisticsDashboard
      webId={config.adminWebIds[0]}
      solidFetch={solidFetch}
      config={config}
    />
  );

  await screen.findByText("v1:late-account");
  const dashboardText = container.querySelector(".statistics-dashboard").textContent;
  expect(dashboardText).toContain("00:05");
  expect(dashboardText).toContain("22:15");
  expect(dashboardText).not.toMatch(/\b(?:AM|PM)\b/);
  expect(dashboardText).not.toContain("24:05");
});

test("deduplicates accounts across registries and keeps the newest lastSeen", () => {
  expect(
    aggregateStatisticsAccounts([
      {
        members: [
          { id: "v1:duplicate", lastSeen: "2026-06-01T10:00:00.000Z" },
          { id: "v1:first", lastSeen: null },
        ],
      },
      {
        members: [
          { id: "v1:duplicate", lastSeen: "2026-07-13T11:30:00.000Z" },
          { id: "v1:second", lastSeen: "2026-07-12T08:00:00.000Z" },
        ],
      },
    ])
  ).toEqual([
    { id: "v1:duplicate", lastSeen: "2026-07-13T11:30:00.000Z" },
    { id: "v1:first", lastSeen: null },
    { id: "v1:second", lastSeen: "2026-07-12T08:00:00.000Z" },
  ]);
});

test("paginates the aggregated account list in pages of ten", async () => {
  const accounts = Array.from({ length: 11 }, (_, index) => ({
    id: `v1:account-${String(index + 1).padStart(2, "0")}`,
    lastSeen: null,
  }));
  const solidFetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      ...snapshot,
      registries: [
        { id: "one", label: "Registry One", members: accounts.slice(0, 7) },
        {
          id: "two",
          label: "Registry Two",
          members: [accounts[0], ...accounts.slice(7)],
        },
      ],
    }),
  }));

  render(
    <StatisticsDashboard
      webId={config.adminWebIds[0]}
      solidFetch={solidFetch}
      config={config}
    />
  );

  expect(await screen.findByText("v1:account-01")).toBeInTheDocument();
  expect(screen.getByText("v1:account-10")).toBeInTheDocument();
  expect(screen.queryByText("v1:account-11")).not.toBeInTheDocument();
  expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Next" }));

  expect(screen.queryByText("v1:account-01")).not.toBeInTheDocument();
  expect(screen.getByText("v1:account-11")).toBeInTheDocument();
  expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
});

test("paginates downloaded datasets in pages of ten", async () => {
  const datasets = Array.from({ length: 11 }, (_, index) => ({
    datasetUrl: `https://catalog.example/datasets/${index + 1}.ttl`,
    title: `Dataset ${String(index + 1).padStart(2, "0")}`,
    byType: {
      dataset_download: 1,
      semantic_model_download: 0,
    },
  }));
  const solidFetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      ...snapshot,
      downloads: {
        ...snapshot.downloads,
        datasets,
      },
    }),
  }));

  render(
    <StatisticsDashboard
      webId={config.adminWebIds[0]}
      solidFetch={solidFetch}
      config={config}
    />
  );

  expect(await screen.findByText("Dataset 01")).toBeInTheDocument();
  expect(screen.getByText("Dataset 10")).toBeInTheDocument();
  expect(screen.queryByText("Dataset 11")).not.toBeInTheDocument();
  expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Next" }));

  expect(screen.queryByText("Dataset 01")).not.toBeInTheDocument();
  expect(screen.getByText("Dataset 11")).toBeInTheDocument();
  expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
});

test("does not show dataset pagination for exactly ten datasets", async () => {
  const datasets = Array.from({ length: 10 }, (_, index) => ({
    datasetUrl: `https://catalog.example/datasets/${index + 1}.ttl`,
    title: `Dataset ${String(index + 1).padStart(2, "0")}`,
    byType: {
      dataset_download: 1,
      semantic_model_download: 0,
    },
  }));
  const solidFetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      ...snapshot,
      downloads: {
        ...snapshot.downloads,
        datasets,
      },
    }),
  }));

  render(
    <StatisticsDashboard
      webId={config.adminWebIds[0]}
      solidFetch={solidFetch}
      config={config}
    />
  );

  await screen.findByText("Dataset 10");
  const downloadsPanel = screen
    .getByRole("heading", { name: "Downloads" })
    .closest(".statistics-panel");
  expect(
    downloadsPanel.querySelector(".statistics-pagination")
  ).not.toBeInTheDocument();
});

test("keeps only the latest 24 monthly values", () => {
  const monthly = Array.from({ length: 30 }, (_, index) => ({
    month: `2026-${String(index + 1).padStart(2, "0")}`,
    activeUsers: index,
  }));
  const normalized = normalizeStatisticsSnapshot({ activity: { monthly } });
  expect(normalized.activity.monthly).toHaveLength(24);
  expect(normalized.activity.monthly[0].month).toBe("2026-07");
});

test("returns a clear forbidden error without reading a response body", async () => {
  const solidFetch = jest.fn(async () => ({ ok: false, status: 403 }));
  await expect(
    loadStatisticsSnapshot(solidFetch, config.currentSnapshotUrl)
  ).rejects.toThrow(/cannot read/i);
});
