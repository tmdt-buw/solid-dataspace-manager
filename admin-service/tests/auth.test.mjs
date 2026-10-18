import test from "node:test";
import assert from "node:assert/strict";
import {
  generateKeyPair,
  exportJWK,
  SignJWT,
  calculateJwkThumbprint,
  decodeJwt,
} from "jose";
import { createHash, randomUUID } from "node:crypto";
import { createAuthenticator } from "../auth.mjs";
import { createDpopHeader, generateDpopKeyPair } from "@inrupt/solid-client-authn-core";
import { createAdminServer } from "../server.mjs";
import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
const issuer = "https://identity.example/",
  webId = issuer + "alice/profile/card#me",
  url = "https://test.example/admin-api/me";
const signing = await generateKeyPair("ES256"),
  dpopKeys = await generateKeyPair("ES256");
const jwk = await exportJWK(signing.publicKey);
jwk.kid = "key1";
const dpopJwk = await exportJWK(dpopKeys.publicKey);
const thumb = await calculateJwkThumbprint(dpopJwk);
async function token(overrides = {}) {
  return new SignJWT({
    webid: webId,
    client_id: "https://test.example/",
    cnf: { jkt: thumb },
    ...overrides,
  })
    .setProtectedHeader({ alg: "ES256", kid: "key1", typ: "at+jwt" })
    .setIssuer(issuer)
    .setAudience("solid")
    .setIssuedAt()
    .setExpirationTime(overrides.exp ?? "5m")
    .sign(signing.privateKey);
}
async function request(overrides = {}, tokenOverrides = {}) {
  const access = await token(tokenOverrides);
  const proof = await new SignJWT({
    htu: url,
    htm: "GET",
    jti: randomUUID(),
    ath: createHash("sha256").update(access).digest("base64url"),
    ...overrides,
  })
    .setProtectedHeader({ typ: "dpop+jwt", alg: "ES256", jwk: dpopJwk })
    .setIssuedAt()
    .sign(dpopKeys.privateKey);
  return {
    method: "GET",
    headers: { authorization: "DPoP " + access, dpop: proof },
  };
}
function setup(trust = true) {
  let calls = 0;
  const auth = createAuthenticator({
    identityHosts: ["identity.example"],
    issuers: [issuer],
    fetchImpl: async (uri) => {
      calls++;
      let value = uri.endsWith("profile/card")
        ? `<${webId}> <http://www.w3.org/ns/solid/terms#oidcIssuer> <${trust ? issuer : "https://different.example/"}>.`
        : JSON.stringify(
            uri.includes("openid-configuration")
              ? { issuer, jwks_uri: issuer + "jwks" }
              : { keys: [jwk] },
          );
      return new Response(value);
    },
  });
  return { auth, calls: () => calls };
}
test("valid Solid signature, WebID issuer binding and DPoP grant access", async () => {
  const { auth } = setup();
  assert.equal(await auth(await request(), url, new Set([webId])), webId);
});
test("similar and unlisted WebIDs are rejected before any network request", async () => {
  const x = setup();
  await assert.rejects(
    x.auth(await request({}, { webid: webId + "/" }), url, new Set([webId])),
  );
  assert.equal(x.calls(), 0);
});
test("WebID must trust the signing issuer", async () => {
  await assert.rejects(
    setup(false).auth(await request(), url, new Set([webId])),
  );
});
test("DPoP binds URL and HTTP method", async () => {
  for (const override of [{ htu: "https://other.example/" }, { htm: "POST" }])
    await assert.rejects(
      setup().auth(await request(override), url, new Set([webId])),
    );
});
test("a supplied DPoP access-token hash must match", async () => {
  for (const ath of ["", null, 42, "wrong"])
    await assert.rejects(
      setup().auth(await request({ ath }), url, new Set([webId])),
    );
});
test("a proof cannot be replayed", async () => {
  const { auth } = setup(),
    r = await request();
  await auth(r, url, new Set([webId]));
  await assert.rejects(auth(r, url, new Set([webId])));
});
test("Bearer and user-supplied WebID headers never authenticate", async () => {
  await assert.rejects(
    setup().auth(
      {
        method: "GET",
        headers: { authorization: "Bearer fake", "x-webid": webId },
      },
      url,
      new Set([webId]),
    ),
  );
});

// Exercise the real proof generator used by the Manager's installed browser client.
async function browserRequest({ target = url, method = "GET", key = { privateKey: dpopKeys.privateKey, publicKey: dpopJwk }, tokenOverrides = {} } = {}) {
  const access = await token(tokenOverrides);
  const proof = await createDpopHeader(target, method, key);
  assert.equal(decodeJwt(proof).ath, undefined);
  return { method: "GET", headers: { authorization: "DPoP " + access, dpop: proof } };
}
test("Inrupt 3.1.1 browser proofs authenticate without an ath extension", async () => {
  assert.equal(await setup().auth(await browserRequest(), url, new Set([webId])), webId);
});
test("browser proofs still require the token-bound key, target URL and HTTP method", async () => {
  for (const options of [{ key: await generateDpopKeyPair() }, { target: "https://other.example/admin-api/me" }, { method: "POST" }, { tokenOverrides: { exp: 1 } }]) {
    await assert.rejects(setup().auth(await browserRequest(options), url, new Set([webId])));
  }
});
test("a real browser proof cannot be replayed", async () => {
  const { auth } = setup();
  const request = await browserRequest();
  await auth(request, url, new Set([webId]));
  await assert.rejects(auth(request, url, new Set([webId])));
});
test("admin discovery returns the authorized profile with a real browser proof", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "admin-browser-proof-"));
  await fs.mkdir(path.join(directory, "profiles"));
  await fs.writeFile(path.join(directory, "profiles/test.yaml"), JSON.stringify({
    id: "test", environment: "test", domains: ["test.example"],
    administration: { enabled: true, adminWebIds: [webId] },
    public: { branding: { projectName: "Test" }, statistics: { adminWebIds: [webId] } },
  }));
  const api = createAdminServer({ source: directory, profiles: ["test"], authenticate: setup().auth, issuers: [issuer], identityHosts: ["identity.example"] });
  await new Promise((resolve) => api.listen(0, "127.0.0.1", resolve));
  t.after(async () => { await new Promise((resolve) => api.close(resolve)); await fs.rm(directory, { recursive: true, force: true }); });
  const signed = await browserRequest();
  const result = await new Promise((resolve, reject) => {
    const request = http.get({ hostname: "127.0.0.1", port: api.address().port, path: "/admin-api/me", headers: { Host: "test.example", ...signed.headers } }, (response) => {
      let body = ""; response.setEncoding("utf8"); response.on("data", (chunk) => { body += chunk; }); response.on("end", () => resolve({ status: response.statusCode, body: JSON.parse(body) }));
    });
    request.on("error", reject);
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.webId, webId);
  assert.deepEqual(result.body.profiles.map(({ id, canEdit }) => ({ id, canEdit })), [{ id: "test", canEdit: true }]);
});
