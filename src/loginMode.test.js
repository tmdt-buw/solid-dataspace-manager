import { usesProviderLogin } from "./loginMode";
test.each(["localhost", "127.0.0.1", "[::1]"])("recognizes the exact loopback host %s", hostname => {
  expect(usesProviderLogin({}, { protocol: "http:", hostname })).toBe(true);
});
test.each(["localhost.attacker.example", "127.0.0.1.attacker.example", "solid-dataspace-test.tmdt.info"])("does not change the account login for %s", hostname => {
  expect(usesProviderLogin({}, { protocol: "https:", hostname })).toBe(false);
});
test("keeps explicit provider mode for other origins", () => {
  expect(usesProviderLogin({ loginMode: "oidc" }, { protocol: "https:", hostname: "other.example" })).toBe(true);
});
