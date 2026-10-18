import test from "node:test";
import assert from "node:assert/strict";
import {
  generateKeyPair,
  exportJWK,
  SignJWT,
  calculateJwkThumbprint,
} from "jose";
import { createHash, randomUUID } from "node:crypto";
import { createAuthenticator } from "../auth.mjs";
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
    .setExpirationTime("5m")
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
test("DPoP access-token hash is mandatory", async () => {
  for (const ath of ["", undefined, "wrong"])
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
