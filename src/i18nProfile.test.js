import { PROFILE_LANGUAGE_PREDICATE } from "./i18n";
import { loadProfileLanguage, saveProfileLanguage } from "./i18nProfile";
const mockGetSolidDataset = jest.fn();
const mockSaveSolidDatasetAt = jest.fn();

jest.mock("@inrupt/solid-client", () => ({
  createThing: jest.fn(({ url }) => ({ url })),
  getSolidDataset: (...args) => mockGetSolidDataset(...args),
  getStringNoLocale: (thing, predicate) => thing?.[predicate] || "",
  getThing: (dataset, url) => dataset?.things?.[url] || null,
  getThingAll: (dataset) => Object.values(dataset?.things || {}),
  removeAll: (thing, predicate) => {
    const next = { ...thing };
    delete next[predicate];
    return next;
  },
  saveSolidDatasetAt: (...args) => mockSaveSolidDatasetAt(...args),
  setStringNoLocale: (thing, predicate, value) => ({
    ...thing,
    [predicate]: value,
  }),
  setThing: (dataset, thing) => ({
    ...dataset,
    things: {
      ...(dataset?.things || {}),
      [thing.url]: thing,
    },
  }),
}));

describe("i18nProfile", () => {
  const webId = "https://alice.example/profile/card#me";
  const fetcher = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("loads a supported profile language", async () => {
    mockGetSolidDataset.mockResolvedValueOnce({
      things: {
        [webId]: {
          url: webId,
          [PROFILE_LANGUAGE_PREDICATE]: "de",
        },
      },
    });

    await expect(loadProfileLanguage(webId, fetcher)).resolves.toBe("de");
    expect(mockGetSolidDataset).toHaveBeenCalledWith("https://alice.example/profile/card", {
      fetch: fetcher,
    });
  });

  test("ignores missing or unsupported profile languages", async () => {
    mockGetSolidDataset.mockResolvedValueOnce({
      things: {
        [webId]: {
          url: webId,
          [PROFILE_LANGUAGE_PREDICATE]: "fr",
        },
      },
    });

    await expect(loadProfileLanguage(webId, fetcher)).resolves.toBe("");
  });

  test("writes normalized language to the profile thing", async () => {
    const dataset = {
      things: {
        [webId]: {
          url: webId,
          [PROFILE_LANGUAGE_PREDICATE]: "en",
        },
      },
    };
    mockGetSolidDataset.mockResolvedValueOnce(dataset);
    mockSaveSolidDatasetAt.mockImplementation(async (_url, savedDataset) => savedDataset);

    await saveProfileLanguage(webId, fetcher, "de-DE");

    expect(mockSaveSolidDatasetAt).toHaveBeenCalledWith(
      "https://alice.example/profile/card",
      expect.objectContaining({
        things: expect.objectContaining({
          [webId]: expect.objectContaining({
            [PROFILE_LANGUAGE_PREDICATE]: "de",
          }),
        }),
      }),
      { fetch: fetcher }
    );
  });
});
