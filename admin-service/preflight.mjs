import dns from "node:dns/promises";
import https from "node:https";
import { BlockList, isIP } from "node:net";
import { Parser } from "n3";
import { pathToFileURL } from "node:url";
const blocked = new BlockList();
for (const [ip, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
])
  blocked.addSubnet(ip, prefix, "ipv4");
export function isPublicAddress(ip) {
  if (isIP(ip) === 4) return !blocked.check(ip, "ipv4");
  return (
    isIP(ip) === 6 &&
    /^[23][0-9a-f]{3}:/i.test(ip) &&
    !/^2001:db8:/i.test(ip) &&
    !/^2002:/i.test(ip)
  );
}
export async function addresses(host) {
  const records = await dns.lookup(host, { all: true });
  if (!records.length || records.some((x) => !isPublicAddress(x.address)))
    throw Error("The address must resolve to a public server.");
  return records;
}
export async function readPublic(url, accept = "application/json") {
  const u = new URL(url);
  if (u.protocol !== "https:" || u.username || u.password || u.port || u.hash)
    throw Error("A complete HTTPS address is required.");
  const records = await addresses(u.hostname),
    chosen = records[0];
  return new Promise((resolve, reject) => {
    const req = https.get(
      u,
      {
        headers: { Accept: accept },
        lookup: (host, opts, cb) =>
          opts?.all
            ? cb(null, [chosen])
            : cb(null, chosen.address, chosen.family),
        timeout: 8000,
      },
      (res) => {
        let chunks = [],
          size = 0;
        res.on("data", (chunk) => {
          size += chunk.length;
          if (size > 262144) req.destroy(Error("Response too large."));
          else chunks.push(chunk);
        });
        res.on("end", () => {
          if (res.statusCode < 200 || res.statusCode >= 300)
            reject(
              Error(
                "The configured address is not reachable (HTTP " +
                  res.statusCode +
                  ").",
              ),
            );
          else
            resolve({
              text: Buffer.concat(chunks).toString("utf8"),
              type: res.headers["content-type"] || "",
            });
        });
      },
    );
    req.on("timeout", () => req.destroy(Error("The connection timed out.")));
    req.on("error", reject);
  });
}
export async function checkProfile(
  before,
  after,
  registries,
  policy,
  read = readPublic,
  resolve = addresses,
) {
  const added = after.domains.filter((x) => !before?.domains?.includes(x));
  for (const domain of added) {
    const values = await resolve(domain);
    if (
      !values.length ||
      values.some((x) => !policy.serverAddresses?.includes(x.address))
    )
      throw Error("DNS does not point to this server: " + domain);
  }
  const oldIssuers = new Set(
    before?.public.providers.filter((x) => x.enabled).map((x) => x.issuer) ||
      [],
  );
  for (const provider of after.public.providers.filter(
    (x) => x.enabled && !oldIssuers.has(x.issuer),
  )) {
    const base = provider.issuer.endsWith("/")
      ? provider.issuer
      : provider.issuer + "/";
    const metadata = JSON.parse(
      (await read(new URL(".well-known/openid-configuration", base).href)).text,
    );
    if (
      metadata.issuer?.replace(/\/$/, "") !==
        provider.issuer.replace(/\/$/, "") ||
      !metadata.authorization_endpoint ||
      !metadata.token_endpoint ||
      !metadata.jwks_uri
    )
      throw Error("The login provider does not publish valid issuer metadata.");
    for (const field of [
      "authorization_endpoint",
      "token_endpoint",
      "jwks_uri",
    ]) {
      const endpoint = new URL(metadata[field]);
      if (
        endpoint.protocol !== "https:" ||
        endpoint.hostname !== new URL(provider.issuer).hostname ||
        endpoint.username ||
        endpoint.password ||
        endpoint.port
      )
        throw Error("Login endpoints must use HTTPS on the issuer host.");
    }
    const keys = JSON.parse((await read(metadata.jwks_uri)).text);
    if (!Array.isArray(keys.keys) || !keys.keys.length)
      throw Error("The login provider has no verification keys.");
  }
  if (
    !before ||
    before.public.catalog.defaultRegistry !==
      after.public.catalog.defaultRegistry
  ) {
    const registry = registries.find(
      (r) =>
        r.url.replace(/\/$/, "") ===
        after.public.catalog.defaultRegistry.replace(/\/$/, ""),
    );
    if (!registry) throw Error("Unknown registry.");
    const response = await read(
      registry.url.replace(/\/$/, "") + "/",
      "text/turtle",
    );
    if (
      !response.type.includes("text/turtle") &&
      !response.type.includes("application/n-triples")
    )
      throw Error("The registry must be an accessible RDF resource.");
    new Parser({ baseIRI: registry.url, format: "text/turtle" }).parse(
      response.text,
    );
  }
  return { ok: true };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    let raw = "";
    for await (const chunk of process.stdin) raw += chunk;
    const input = JSON.parse(raw);
    if (input.operation === "services") {
      const paths = [];
      if (input.services.includes("solid-data-connection-sync-worker"))
        paths.push("/sync-worker/health");
      if (input.services.includes("semantic-data-catalog-backend"))
        paths.push("/api/health");
      if (input.services.some((s) => s.endsWith("-node-red")))
        paths.push(input.profile.public.accessGateway ? "/config.js" : "/node-red/");
      if (input.services.some((s) => s.endsWith("-plasma-frontend")))
        paths.push(input.profile.public.accessGateway ? "/config.js" : "/plasma/");
      if (input.statisticsFingerprint) {
        const status = JSON.parse((await readPublic("https://" + input.profile.domains[0] + "/sync-worker/statistics/health")).text);
        if (!status.policy?.ready || status.policy.fingerprint !== input.statisticsFingerprint)
          throw Error("Statistics permissions have not been applied yet.");
      }
      for (const path of paths)
        await readPublic(
          "https://" + input.profile.domains[0] + path,
          "application/json, text/html",
        );
    } else if (input.operation === "health") {
      const response = await readPublic(
        "https://" + input.profile.domains[0] + "/config.js",
        "application/javascript",
      );
      if (!response.text.includes('"dataspaceId": "' + input.profile.id + '"'))
        throw Error("The new address does not serve the expected profile.");
    } else
      await checkProfile(
        input.before,
        input.after,
        input.registries,
        input.policy,
      );
    process.stdout.write(JSON.stringify({ ok: true }));
  } catch (e) {
    process.stdout.write(JSON.stringify({ ok: false, error: e.message }));
    process.exitCode = 1;
  }
}
