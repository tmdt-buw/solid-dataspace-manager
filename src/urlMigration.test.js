import {
  CURRENT_TMDT_ORIGIN,
  migrateLegacyTmdtUrl,
} from "./urlMigration";

describe("legacy TMDT URL migration", () => {
  test("replaces only the exact legacy origin and preserves the remaining URL", () => {
    expect(
      migrateLegacyTmdtUrl(
        "https://tmdt-solid-community-server.de/alice/profile/card#me"
      )
    ).toBe(`${CURRENT_TMDT_ORIGIN}/alice/profile/card#me`);
    expect(
      migrateLegacyTmdtUrl(
        "https://tmdt-solid-community-server.de/semanticdatacatalog/public/test/"
      )
    ).toBe(`${CURRENT_TMDT_ORIGIN}/semanticdatacatalog/public/test/`);
  });

  test.each([
    "https://sub.tmdt-solid-community-server.de/alice/profile/card#me",
    "https://tmdt-solid-community-server.de.evil.example/alice/profile/card#me",
    "https://tmdt-solid-community-server.de:8443/alice/profile/card#me",
    "https://user:password@tmdt-solid-community-server.de/alice/profile/card#me",
    "http://tmdt-solid-community-server.de/alice/profile/card#me",
    "not a URL",
  ])("does not rewrite a non-exact legacy origin: %s", (value) => {
    expect(migrateLegacyTmdtUrl(value)).toBe(value);
  });
});
