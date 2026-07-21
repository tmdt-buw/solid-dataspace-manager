import {
  createSolidDataset,
  createThing,
  getBoolean,
  getStringNoLocale,
  getThing,
  setBoolean,
  setStringNoLocale,
  setThing,
} from "@inrupt/solid-client";
import {
  hasStatisticsConsent,
  saveStatisticsConsent,
  STATISTICS_CONSENT_PREDICATE,
} from "./statisticsConsent";

const mockGetSolidDataset = jest.fn();
const mockSaveSolidDatasetAt = jest.fn();

jest.mock("@inrupt/solid-client", () => {
  const actual = jest.requireActual("@inrupt/solid-client");
  return {
    ...actual,
    getSolidDataset: (...args) => mockGetSolidDataset(...args),
    saveSolidDatasetAt: (...args) => mockSaveSolidDatasetAt(...args),
  };
});

const WEB_ID = "https://pod.example/alice/profile/card#me";

describe("statistics consent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("only an explicit true profile value grants consent", () => {
    const withoutConsent = createThing({ url: WEB_ID });
    const denied = setBoolean(
      withoutConsent,
      STATISTICS_CONSENT_PREDICATE,
      false
    );
    const granted = setBoolean(
      withoutConsent,
      STATISTICS_CONSENT_PREDICATE,
      true
    );

    expect(hasStatisticsConsent(null)).toBe(false);
    expect(hasStatisticsConsent(withoutConsent)).toBe(false);
    expect(hasStatisticsConsent(denied)).toBe(false);
    expect(hasStatisticsConsent(granted)).toBe(true);
  });

  test("persists consent in a freshly loaded profile without losing other data", async () => {
    const solidFetch = jest.fn();
    let profile = createThing({ url: WEB_ID });
    profile = setStringNoLocale(
      profile,
      "http://www.w3.org/2006/vcard/ns#fn",
      "Alice"
    );
    const dataset = setThing(createSolidDataset(), profile);
    mockGetSolidDataset.mockResolvedValue(dataset);
    mockSaveSolidDatasetAt.mockImplementation(async (_url, updated) => updated);

    await expect(saveStatisticsConsent(WEB_ID, solidFetch)).resolves.toBe(true);

    expect(mockGetSolidDataset).toHaveBeenCalledWith(
      "https://pod.example/alice/profile/card",
      { fetch: solidFetch }
    );
    const [profileUrl, savedDataset, options] =
      mockSaveSolidDatasetAt.mock.calls[0];
    expect(profileUrl).toBe("https://pod.example/alice/profile/card");
    expect(options).toEqual({ fetch: solidFetch });

    const savedProfile = getThing(savedDataset, WEB_ID);
    expect(getBoolean(savedProfile, STATISTICS_CONSENT_PREDICATE)).toBe(true);
    expect(
      getStringNoLocale(savedProfile, "http://www.w3.org/2006/vcard/ns#fn")
    ).toBe("Alice");
  });

  test("rejects calls without an authenticated session", async () => {
    await expect(saveStatisticsConsent("", jest.fn())).rejects.toThrow(
      /WebID and authenticated Solid fetch/i
    );
    await expect(saveStatisticsConsent(WEB_ID, null)).rejects.toThrow(
      /WebID and authenticated Solid fetch/i
    );
    expect(mockGetSolidDataset).not.toHaveBeenCalled();
  });
});
