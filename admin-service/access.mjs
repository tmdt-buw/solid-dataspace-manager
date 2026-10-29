import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { parse } from "yaml";
import { createAuthenticator } from "./auth.mjs";

const COOKIE = "__Host-dataspace-workspace";
const TTL = 8 * 60 * 60 * 1000;
const workerPrefix = "/sync-worker";
const participantPath = /^\/sync-worker\/participants(?:\/status|\/sync|\/seal|\/preview|\/imports|\/relocations)?(?:\?|$)/;
const workspacePath = /^\/(node-red|plasma)(?:\/|$)/;
const tokenHash = token => createHash("sha256").update(token).digest("hex");
function cookie(req) {
  const values = String(req.headers.cookie || "").split(";").map(s => s.trim()).filter(s => s.startsWith(COOKIE + "="));
  return values.length === 1 ? values[0].slice(COOKIE.length + 1) : "";
}
function json(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff", ...headers });
  res.end(JSON.stringify(body));
}
async function body(req) {
  let text = "";
  for await (const chunk of req) {
    text += chunk;
    if (Buffer.byteLength(text) > 262144) throw Error("Request too large.");
  }
  return text ? JSON.parse(text) : {};
}
function cleanHeaders(req, host) {
  const headers = { ...req.headers, host, "x-forwarded-host": req.headers.host, "x-forwarded-proto": "https" };
  for (const key of ["authorization", "dpop", "cookie", "x-dataspace-assertion", "x-dataspace-signature", "proxy-authorization"])
    delete headers[key];
  return headers;
}
export function createAccessGateway({ source, environment, keyFile, authenticate, now = Date.now,
  resolveUpstream, sessionTtl = TTL }) {
  const sessions = new Map(), authenticators = new Map(), replayStore = new Map();
  const stack = environment === "prod" ? "solid-dataspace-prod" : "solid-dataspace-live-test";
  async function profile(req) {
    if (!/^[a-z0-9.-]+$/.test(req.headers.host || "")) throw Error("Unknown host.");
    for (const file of await fs.readdir(path.join(source, "profiles"))) {
      if (!/^[a-z0-9-]+\.yaml$/.test(file)) continue;
      const p = parse(await fs.readFile(path.join(source, "profiles", file), "utf8"));
      if (p.environment === environment && p.domains.includes(req.headers.host) && p.public.accessGateway === true) return p;
    }
    throw Error("Access gateway is not enabled for this host.");
  }
  async function verify(req, p) {
    const issuers = [...new Set(p.public.providers.filter(x => x.enabled).flatMap(x => [x.issuer, x.issuer.replace(/\/$/, "") + "/"]))];
    const hosts = [...new Set(issuers.map(x => new URL(x).hostname))];
    const key = JSON.stringify(issuers);
    if (!authenticate && !authenticators.has(key)) {
      if (authenticators.size > 30) authenticators.clear();
      authenticators.set(key, createAuthenticator({ issuers, identityHosts: hosts, replayStore, allowPublicWebIds: true }));
    }
    const actor = await (authenticate || authenticators.get(key))(req,
      "https://" + req.headers.host + req.url.split("?")[0],
      { has: value => { try { const u = new URL(value); return u.protocol === "https:" && !u.username && !u.password; } catch { return false; } } });
    return actor;
  }
  function revoke(token) {
    const key = tokenHash(token), session = sessions.get(key);
    if (session) for (const socket of session.sockets) socket.destroy();
    sessions.delete(key);
  }
  function getSession(req, p) {
    const token = cookie(req), session = sessions.get(tokenHash(token));
    if (!session || session.expires <= now() || session.host !== req.headers.host || session.profileId !== p.id) {
      if (session && session.expires <= now()) revoke(token);
      return null;
    }
    return session;
  }
  function originAllowed(req, required = false) {
    return (!required && !req.headers.origin) || req.headers.origin === "https://" + req.headers.host;
  }
  function upstream(p, app, url) {
    if (resolveUpstream) return new URL(resolveUpstream(p, app, url));
    if (app === "worker") return new URL(url, "http://" + stack + "-solid-data-connection-sync-worker:8080");
    const prefix = environment === "test" && p.id === "test" ? stack : stack + "-" + p.id;
    if (app === "node-red") return new URL(url, "http://" + prefix + "-node-red:1880");
    const stripped = url.slice("/plasma".length) || "/";
    const service = /^\/api\/sms(?:\/|\?|$)/.test(stripped) ? "plasma-sms:8181"
      : /^\/api\/dps(?:\/|\?|$)/.test(stripped) ? "plasma-dps:8182" : "plasma-frontend:80";
    // Keep the configured authority even for a path beginning with //.
    const target = new URL("http://" + prefix + "-" + service);
    const q = stripped.indexOf("?"); target.pathname = q < 0 ? stripped : stripped.slice(0, q); target.search = q < 0 ? "" : stripped.slice(q);
    return target;
  }
  function available(p, app) { return p.public.apps.some(x => x.id === app && x.enabled); }
  function proxy(req, res, target, extraHeaders = {}, payload) {
    const headers = { ...cleanHeaders(req, target.host), ...extraHeaders };
    if (payload !== undefined) { headers["content-length"] = Buffer.byteLength(payload); delete headers["transfer-encoding"]; }
    const outgoing = http.request(target, { method: req.method, headers, timeout: 60000 }, incoming => {
      const headers = { ...incoming.headers, "cache-control": "no-store" };
      delete headers["set-cookie"]; // Workspace apps cannot replace the gateway session.
      res.writeHead(incoming.statusCode || 502, headers);
      incoming.on("error", () => res.destroy()); incoming.pipe(res);
    });
    outgoing.on("timeout", () => outgoing.destroy(Error("Upstream timeout")));
    outgoing.on("error", () => { if (!res.headersSent) json(res, 502, { error: "Workspace service unavailable." }); else res.destroy(); });
    res.on("close", () => { if (!res.writableEnded) outgoing.destroy(); });
    if (payload !== undefined) outgoing.end(payload);
    else {
      let bytes = 0;
      req.on("data", chunk => { bytes += chunk.length; if (bytes > 16 * 1024 * 1024) { outgoing.destroy(); req.destroy(); } });
      req.pipe(outgoing);
    }
  }
  async function handle(req, res) {
    if (!(req.url.startsWith("/access-api/") || participantPath.test(req.url) || workspacePath.test(req.url))) return false;
    try {
      const p = await profile(req);
      if (!originAllowed(req) || req.headers["sec-fetch-site"] === "cross-site") { json(res, 403, { error: "Origin is not allowed." }); return true; }
      if (req.url === "/access-api/session" && req.method === "POST") {
        if (req.headers["x-dataspace-access"] !== "1") { json(res, 400, { error: "Invalid session request." }); return true; }
        const actor = await verify(req, p);
        let token = cookie(req), current = getSession(req, p);
        if (current && current.webId !== actor) { revoke(token); current = null; }
        if (!current) {
          if (sessions.size >= 5000) { json(res, 503, { error: "Session capacity reached." }); return true; }
          token = randomBytes(32).toString("base64url");
          current = { webId: actor, profileId: p.id, host: req.headers.host, sockets: new Set() };
        }
        current.expires = now() + sessionTtl; sessions.set(tokenHash(token), current);
        json(res, 200, { webId: actor }, { "Set-Cookie": COOKIE + "=" + token + "; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=" + Math.floor(sessionTtl / 1000) });
        return true;
      }
      if (req.url === "/access-api/logout" && req.method === "POST") {
        if (!originAllowed(req, true) || req.headers["x-dataspace-access"] !== "1") { json(res, 403, { error: "Origin is required." }); return true; }
        revoke(cookie(req));
        json(res, 200, { ok: true }, { "Set-Cookie": COOKIE + "=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0" }); return true;
      }
      if (participantPath.test(req.url)) {
        if (p.public.syncWorker?.enabled === false) { json(res, 403, { error: "Data Connection is disabled for this profile." }); return true; }
        const actor = await verify(req, p);
        const data = await body(req);
        const webId = data.webId || new URL(req.url, "https://" + req.headers.host).searchParams.get("webId");
        if (webId !== actor) { json(res, 403, { error: "Only your own WebID can be managed." }); return true; }
        const key = await fs.readFile(keyFile); if (key.length < 32) throw Error("Invalid worker key.");
        const targetPath = req.url.slice(workerPrefix.length);
        const assertion = Buffer.from(JSON.stringify({ webId: actor, isProfileAdmin: p.administration?.enabled === true && p.administration.adminWebIds?.includes(actor) === true, method: req.method, path: targetPath,
          body: createHash("sha256").update(JSON.stringify(data)).digest("hex"),
          nonce: randomBytes(16).toString("hex"), expires: now() + 20000 })).toString("base64url");
        proxy(req, res, upstream(p, "worker", targetPath), { "content-type": "application/json",
          "x-dataspace-assertion": assertion, "x-dataspace-signature": createHmac("sha256", key).update(assertion).digest("hex") },
          ["GET", "HEAD"].includes(req.method) ? "" : JSON.stringify(data));
        return true;
      }
      const app = workspacePath.exec(req.url)?.[1];
      if (!app || !available(p, app)) { json(res, 403, { error: "Application disabled for this profile." }); return true; }
      const session = getSession(req, p);
      if (!session) {
        if (req.method === "GET" && req.headers.accept?.includes("text/html")) {
          res.writeHead(303, { Location: "/workspace-login?returnTo=" + encodeURIComponent(req.url), "Cache-Control": "no-store" }); res.end();
        } else json(res, 401, { error: "Sign in to Solid Dataspace to open this workspace." });
        return true;
      }
      if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && !originAllowed(req, true)) {
        json(res, 403, { error: "Origin is required for workspace changes." }); return true;
      }
      proxy(req, res, upstream(p, app, req.url)); return true;
    } catch {
      json(res, 401, { error: "A valid Solid login for this profile is required." }); return true;
    }
  }
  async function upgrade(req, socket, head) {
    try {
      const p = await profile(req), app = workspacePath.exec(req.url)?.[1], session = getSession(req, p);
      if (!session || !app || !available(p, app) || !originAllowed(req, true) || req.headers["sec-fetch-site"] === "cross-site") throw Error();
      const target = upstream(p, app, req.url);
      const outgoing = http.request(target, { headers: cleanHeaders(req, target.host), timeout: 10000 });
      session.sockets.add(socket);
      socket.on("close", () => { session.sockets.delete(socket); outgoing.destroy(); });
      outgoing.on("upgrade", (response, remote, buffered) => {
        remote.setTimeout(0); session.sockets.add(remote); remote.on("close", () => { session.sockets.delete(remote); socket.destroy(); });
        socket.on("close", () => remote.destroy());
        socket.write("HTTP/1.1 101 Switching Protocols\r\n" + Object.entries(response.headers).map(([k, v]) => k + ": " + v).join("\r\n") + "\r\n");
        if (head.length) remote.write(head); if (buffered.length) socket.write(buffered);
        remote.pipe(socket); socket.pipe(remote);
      });
      outgoing.on("response", () => socket.destroy()); outgoing.on("timeout", () => outgoing.destroy());
      outgoing.on("error", () => socket.destroy()); outgoing.end();
    } catch { socket.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n"); }
  }
  const timer = setInterval(() => {
    for (const [key, session] of sessions) if (session.expires <= now()) {
      for (const socket of session.sockets) socket.destroy(); sessions.delete(key);
    }
  }, 30000); timer.unref();
  return { handle, upgrade, close() { clearInterval(timer); for (const s of sessions.values()) for (const socket of s.sockets) socket.destroy(); sessions.clear(); } };
}
