import {
  createThing,
  getUrl,
  setUrl,
} from "@inrupt/solid-client";
import {
  deriveLocalCssPodUrl,
  ensurePodStorageLink,
  PIM_STORAGE,
} from "./solidStorage";

describe("Solid storage discovery helpers", () => {
  test("derives the Pod root only from a local CSS profile-card WebID", () => {
    expect(
      deriveLocalCssPodUrl(
        "https://solid-community-server.tmdt.info/solidtestpod/profile/card#me"
      )
    ).toBe("https://solid-community-server.tmdt.info/solidtestpod/");
    expect(
      deriveLocalCssPodUrl("https://pod.example/nested/alice/profile/card#me")
    ).toBe("https://pod.example/nested/alice/");
  });

  test.each([
    "http://pod.example/alice/profile/card#me",
    "https://user:password@pod.example/alice/profile/card#me",
    "https://pod.example/alice/profile/card?view=1#me",
    "https://pod.example/alice/profile/card#other",
    "https://pod.example/alice/profile#me",
    "https://pod.example/profile/card#me",
    "https://pod.example/alice%2Fother/profile/card#me",
    "https://pod.example/alice%5Cother/profile/card#me",
  ])("does not derive storage from an unsafe or unsupported WebID: %s", (webId) => {
    expect(deriveLocalCssPodUrl(webId)).toBe("");
  });

  test("adds a missing pim:storage link without replacing an advertised Pod", () => {
    const webId = "https://pod.example/alice/profile/card#me";
    const profile = createThing({ url: webId });
    const completed = ensurePodStorageLink(profile, webId);
    expect(getUrl(completed, PIM_STORAGE)).toBe("https://pod.example/alice/");

    const externalStorage = "https://storage.example/alice/";
    const advertised = setUrl(profile, PIM_STORAGE, externalStorage);
    expect(getUrl(ensurePodStorageLink(advertised, webId), PIM_STORAGE)).toBe(
      externalStorage
    );
  });
});
