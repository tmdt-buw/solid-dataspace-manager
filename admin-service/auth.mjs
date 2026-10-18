import { createSolidTokenVerifier } from "@solid/access-token-verifier";
import { createLocalJWKSet, decodeJwt } from "jose";
import { Parser, Store, DataFactory } from "n3";
import { createHash } from "node:crypto";
import { readPublic } from "./preflight.mjs";

export function createAuthenticator({
  identityHosts,
  issuers,
  fetchImpl = async (url, options) =>
    new Response((await readPublic(url, options.headers.Accept)).text),
  replayStore,
}) {
  const allowedHosts = new Set(identityHosts),
    allowedIssuers = new Set(issuers);
  const cache = new Map(),
    replays = replayStore || new Map();
  async function safeFetch(url, accept) {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.port ||
      !allowedHosts.has(parsed.hostname)
    )
      throw Error("Untrusted identity URL");
    parsed.hash = "";
    const response = await fetchImpl(parsed.href, {
      headers: { Accept: accept },
      redirect: "error",
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) throw Error("Identity resource unavailable");
    let size = 0,
      text = "";
    const decoder = new TextDecoder();
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 262144) throw Error("Identity response too large");
      text += decoder.decode(chunk, { stream: true });
    }
    return text + decoder.decode();
  }
  async function cached(key, load) {
    const entry = cache.get(key);
    if (entry && entry.expires > Date.now()) return entry.value;
    const value = await load();
    if (cache.size > 200) cache.clear();
    cache.set(key, { value, expires: Date.now() + 30000 });
    return value;
  }
  const verifier = createSolidTokenVerifier(
    {
      isDuplicateJTI(jti) {
        const now = Date.now();
        for (const [key, expiry] of replays)
          if (expiry < now) replays.delete(key);
        if (replays.has(jti)) return true;
        if (replays.size > 10000) throw Error("Proof capacity exceeded");
        replays.set(jti, now + 180000);
        return false;
      },
    },
    {
      getKeySet(issuer) {
        return cached("keys:" + issuer, async () => {
          if (!allowedIssuers.has(issuer)) throw Error("Untrusted issuer");
          const metadata = JSON.parse(
            await safeFetch(
              new URL(
                ".well-known/openid-configuration",
                issuer.endsWith("/") ? issuer : issuer + "/",
              ).href,
              "application/json",
            ),
          );
          if (metadata.issuer !== issuer) throw Error("Issuer mismatch");
          return createLocalJWKSet(
            JSON.parse(await safeFetch(metadata.jwks_uri, "application/json")),
          );
        });
      },
    },
    {
      getIssuers(webid) {
        return cached("webid:" + webid, async () => {
          const text = await safeFetch(webid, "text/turtle");
          const doc = new URL(webid);
          doc.hash = "";
          const store = new Store(
            new Parser({ baseIRI: doc.href, format: "text/turtle" }).parse(
              text,
            ),
          );
          return store
            .getObjects(
              DataFactory.namedNode(webid),
              DataFactory.namedNode(
                "http://www.w3.org/ns/solid/terms#oidcIssuer",
              ),
              null,
            )
            .filter((x) => x.termType === "NamedNode")
            .map((x) => x.value);
        });
      },
    },
  );
  return async (request, url, allowedWebIds) => {
    const authorization = request.headers.authorization || "",
      proof = request.headers.dpop || "";
    if (
      !authorization.startsWith("DPoP ") ||
      authorization.length > 16384 ||
      !proof ||
      proof.length > 16384
    )
      throw Error("Solid login required");
    // This prefilter only bounds network access. Authorization uses the verified claims below.
    const token = authorization.slice(5),
      claims = decodeJwt(token),
      dpop = decodeJwt(proof);
    if (!allowedWebIds.has(claims.webid) || !allowedIssuers.has(claims.iss))
      throw Error("Identity not allowed");
    if (dpop.ath !== createHash("sha256").update(token).digest("base64url"))
      throw Error("DPoP token binding missing");
    const verified = await verifier(authorization, {
      header: proof,
      method: request.method,
      url,
    });
    if (!allowedWebIds.has(verified.webid)) throw Error("Identity not allowed");
    return verified.webid;
  };
}
