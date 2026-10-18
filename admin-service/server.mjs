import { createAccessGateway } from "./access.mjs";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { createAuthenticator } from "./auth.mjs";
import { pathToFileURL } from "node:url";

export function createAdminServer({
  source,
  profiles,
  socketPath,
  identityHosts,
  issuers,
  authenticate,
  environment,
  accessGateway,
}) {
  const limits = new Map();
  const authenticators = new Map(),
    replayStore = new Map();
  async function policy() {
    if (!environment) return {};
    return (
      parse(await fs.readFile(path.join(source, "administration.yaml"), "utf8"))
        .environments[environment] || {}
    );
  }
  let inFlight = 0;
  async function configuration() {
    const result = [];
    const ids = environment
      ? (await fs.readdir(path.join(source, "profiles")))
          .filter((x) => /^[a-z0-9-]+\.yaml$/.test(x))
          .map((x) => x.slice(0, -5))
      : profiles;
    for (const id of ids) {
      if (!/^[a-z0-9-]+$/.test(id)) throw Error("Invalid scope");
      const p = parse(
        await fs.readFile(path.join(source, "profiles", id + ".yaml"), "utf8"),
      );
      if (
        p.administration?.enabled &&
        (!environment || p.environment === environment)
      )
        result.push(p);
    }
    return result;
  }
  async function controller(operation, body) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(body);
      const req = http.request(
        {
          socketPath,
          path: operation,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(data),
          },
          timeout: 65000,
        },
        (res) => {
          let raw = "";
          res.on("data", (c) => {
            raw += c;
            if (raw.length > 2000000) req.destroy(Error("Response too large"));
          });
          res.on("end", () => {
            try {
              resolve({ status: res.statusCode, body: JSON.parse(raw) });
            } catch {
              reject(Error("Invalid controller response"));
            }
          });
        },
      );
      req.on("timeout", () => req.destroy(Error("Controller timed out")));
      req.on("error", reject);
      req.end(data);
    });
  }
  async function readBody(req) {
    let raw = "";
    for await (const chunk of req) {
      raw += chunk;
      if (Buffer.byteLength(raw) > 262144)
        throw Object.assign(Error("Anfrage zu groß."), { status: 413 });
    }
    try {
      return JSON.parse(raw);
    } catch {
      throw Object.assign(Error("Ungültige Anfrage."), { status: 400 });
    }
  }
  function send(res, status, body) {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      ...(status === 401
        ? { "WWW-Authenticate": 'DPoP realm="dataspace-admin"' }
        : {}),
    });
    res.end(JSON.stringify(body));
  }
  return http.createServer(
    { maxHeaderSize: 40000, requestTimeout: 15000, headersTimeout: 10000 },
    async (req, res) => {
      try {
        if (accessGateway && await accessGateway.handle(req, res)) return;
        if (req.url === "/health" && req.method === "GET") {
          send(res, 200, { status: "ok" });
          return;
        }
        const adminPolicy = await policy();
        const configs = await configuration(),
          host = req.headers.host;
        const current = configs.find((p) => p.domains.includes(host));
        if (!current) {
          send(res, 421, { error: "Unbekannter Verwaltungs-Host." });
          return;
        }
        const origin = "https://" + host;
        if (req.headers.origin && req.headers.origin !== origin) {
          send(res, 403, { error: "Fremder Ursprung nicht erlaubt." });
          return;
        }
        if (
          req.method === "POST" &&
          (!req.headers["content-type"]?.startsWith("application/json") ||
            req.headers["x-dataspace-admin"] !== "1")
        ) {
          send(res, 415, { error: "Ungültiger Änderungsaufruf." });
          return;
        }
        const key = req.socket.remoteAddress,
          now = Date.now();
        for (const [k, v] of limits) if (v.until < now) limits.delete(k);
        const rate = limits.get(key) || { count: 0, until: now + 60000 };
        rate.count++;
        limits.set(key, rate);
        if (rate.count > 180 || inFlight >= 12) {
          send(res, 429, { error: "Zu viele Anfragen. Bitte kurz warten." });
          return;
        }
        const allowedWebIds = new Set([
          ...(adminPolicy.operatorWebIds || []),
          ...configs.flatMap((p) => [
            ...p.administration.adminWebIds,
            ...p.public.statistics.adminWebIds,
          ]),
        ]);
        let actor;
        inFlight++;
        try {
          const trustedIssuers = [
            ...new Set([...issuers, ...(adminPolicy.issuers || [])]),
          ];
          const trustedHosts = [
            ...new Set([
              ...identityHosts,
              ...(adminPolicy.identityHosts || []),
              ...trustedIssuers.map((x) => new URL(x).hostname),
            ]),
          ];
          const key = JSON.stringify([trustedIssuers, trustedHosts]);
          if (!authenticate && !authenticators.has(key)) {
            if (authenticators.size > 5) authenticators.clear();
            authenticators.set(
              key,
              createAuthenticator({
                identityHosts: trustedHosts,
                issuers: trustedIssuers,
                replayStore,
              }),
            );
          }
          const verify = authenticate || authenticators.get(key);
          actor = await verify(
            req,
            origin + req.url.split("?")[0],
            allowedWebIds,
          );
        } catch {
          send(res, 401, {
            error: "Bitte mit einer berechtigten Solid-WebID anmelden.",
          });
          return;
        } finally {
          inFlight--;
        }
        const isOperator = (adminPolicy.operatorWebIds || []).includes(actor);
        const accessible = configs.filter(
          (p) =>
            isOperator ||
            p.administration.adminWebIds.includes(actor) ||
            p.public.statistics.adminWebIds.includes(actor),
        );
        if (req.url === "/admin-api/me" && req.method === "GET") {
          send(res, 200, {
            webId: actor,
            isOperator,
            environment,
            profiles: accessible.map((p) => ({
              id: p.id,
              label: p.public.branding.projectName,
              environment: p.environment,
              canEdit:
                isOperator || p.administration.adminWebIds.includes(actor),
              canReadStatistics:
                p.public.statistics.adminWebIds.includes(actor),
            })),
            currentProfile: current.id,
          });
          return;
        }
        const jobMatch = /^\/admin-api\/jobs\/([0-9a-f]{32})$/.exec(req.url);
        if (jobMatch && req.method === "GET") {
          const result = await controller("/jobs", {
            actor,
            profileId: current.id,
            jobId: jobMatch[1],
          });
          send(res, result.status, result.body);
          return;
        }
        if (
          req.url === "/admin-api/profiles/preview" &&
          req.method === "POST"
        ) {
          if (!isOperator) {
            send(res, 403, {
              error: "Diese Änderung erfordert Betreiberrechte.",
            });
            return;
          }
          const body = await readBody(req);
          const result = await controller("/create-preview", {
            ...body,
            actor,
            profileId: body.id,
          });
          send(res, result.status, result.body);
          return;
        }
        const match =
          /^\/admin-api\/profiles\/([a-z0-9-]+)(?:\/(preview|apply|history|platform-preview|discard)(?:\/([0-9a-f]{32}))?)?$/.exec(
            req.url,
          );
        if (!match) {
          send(res, 404, { error: "Nicht gefunden." });
          return;
        }
        const [, profileId, operation, entryId] = match;
        if (
          !accessible.some((p) => p.id === profileId) &&
          !(isOperator && operation === "apply")
        ) {
          send(res, 403, { error: "Keine Berechtigung für dieses Profil." });
          return;
        }
        if (
          ["preview", "apply", "platform-preview", "discard"].includes(
            operation,
          ) &&
          req.method === "POST"
        ) {
          const body = await readBody(req);
          const result = await controller("/" + operation, {
            ...body,
            actor,
            profileId,
            requestHost: host,
          });
          send(res, result.status, result.body);
          return;
        }
        if ((!operation || operation === "history") && req.method === "GET") {
          const result = await controller(operation ? "/history" : "/read", {
            actor,
            profileId,
            entryId,
          });
          send(res, result.status, result.body);
          return;
        }
        send(res, 405, { error: "Methode nicht erlaubt." });
      } catch (e) {
        send(res, e.status || 503, {
          error: e.status
            ? e.message
            : "Verwaltungsdienst derzeit nicht erreichbar.",
        });
      }
    },
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const accessGateway = createAccessGateway({ source: process.env.ADMIN_SOURCE, environment: process.env.ADMIN_ENVIRONMENT, keyFile: process.env.WORKER_ACCESS_KEY_FILE });
  const server = createAdminServer({
    accessGateway,
    source: process.env.ADMIN_SOURCE,
    environment: process.env.ADMIN_ENVIRONMENT,
    profiles: (process.env.ADMIN_PROFILES || "test").split(","),
    socketPath: process.env.ADMIN_SOCKET,
    identityHosts: process.env.ADMIN_IDENTITY_HOSTS.split(","),
    issuers: process.env.ADMIN_ISSUERS.split(","),
  });
  server.on("upgrade", accessGateway.upgrade);
  server.on("close", accessGateway.close);
  server.listen(Number(process.env.PORT || 3012), "0.0.0.0", () =>
    console.log("Dataspace admin API ready"),
  );
}
