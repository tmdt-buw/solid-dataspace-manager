import { accountLoginRedirect } from "./accountLoginHandoff";
const issuer = "https://solid-community-server.tmdt.info";
const originalLocation = window.location;
beforeEach(() => {
  window.__APP_CONFIG__ = {};
  delete window.location;
  window.location = { protocol: "https:", hostname: "solid-dataspace-test.tmdt.info", assign: jest.fn() };
});
afterEach(() => { window.location = originalLocation; });

for (const language of ["de", "en"]) {
  test(`carries selected ${language} language and selected account through the handoff`, () => {
    const submit = jest.spyOn(HTMLFormElement.prototype, "submit").mockImplementation(function () {
      const form = new FormData(this);
      const target = new URL(form.get("authorizationUrl"));
      expect(this.method).toBe("post");
      expect(this.action).toBe(`${issuer}/.account/dataspace-login/`);
      expect(form.get("authorization")).toBe("selected-account-token");
      expect(target.searchParams.get("ui_locales")).toBe(language);
      expect(target.searchParams.get("state")).toBe("oidc-state");
      expect(target.searchParams.get("code_challenge")).toBe("challenge");
      expect(target.href).not.toContain("selected-account-token");
    });
    accountLoginRedirect(issuer, "selected-account-token", language)(`${issuer}/.oidc/auth?state=oidc-state&code_challenge=challenge&ui_locales=fr`);
    expect(submit).toHaveBeenCalledTimes(1);expect(document.querySelector("form")).toBeNull();submit.mockRestore();
  });
}
test("ordinary OIDC sign-in without an account token also carries the language", () => {
  const original = window.location;
  delete window.location;
  window.location = { assign: jest.fn() };
  try {
    accountLoginRedirect(issuer, undefined, "de")(`${issuer}/.oidc/auth?state=test`);
    expect(window.location.assign).toHaveBeenCalledWith(`${issuer}/.oidc/auth?state=test&ui_locales=de`);
  } finally { window.location = original; }
});
test("leaves other providers to the OIDC library", () => {
  expect(accountLoginRedirect("https://another-solid.example", "token", "de")).toBeUndefined();
});
test("never submits account credentials to another endpoint", () => {
  expect(() => accountLoginRedirect(issuer, "token", "en")("https://attacker.example/.oidc/auth")).toThrow();
});

test.each(["localhost", "127.0.0.1", "[::1]"])("%s never posts an account token to the server handoff", hostname => {
  window.location = { hostname, protocol: "http:", assign: jest.fn() };
  const submit = jest.spyOn(HTMLFormElement.prototype, "submit").mockImplementation(() => {});
  try {
    accountLoginRedirect(issuer, "stale-account-token", "de")(`${issuer}/.oidc/auth?state=local`);
    expect(window.location.assign).toHaveBeenCalledWith(`${issuer}/.oidc/auth?state=local&ui_locales=de`);
    expect(submit).not.toHaveBeenCalled();
    expect(document.querySelector("form")).toBeNull();
  } finally { submit.mockRestore(); }
});
