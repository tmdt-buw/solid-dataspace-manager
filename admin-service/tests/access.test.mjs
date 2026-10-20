import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createAccessGateway } from "../access.mjs";

async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "workspace-test-"));
  await fs.mkdir(path.join(dir, "profiles"));
  const profile = { id: "test", environment: "test", domains: ["test.example"], public: {
    accessGateway: true, providers: [{ enabled: true, issuer: "https://issuer.example/" }],
    apps: [{ id: "node-red", enabled: true }, { id: "plasma", enabled: true }] } };
  await fs.writeFile(path.join(dir, "profiles/test.yaml"), JSON.stringify(profile));
  const key = path.join(dir, "key"); await fs.writeFile(key, Buffer.alloc(32, 7));
  const forwarded = [];
  const upstream = http.createServer(async (req, res) => {
    let body = ""; for await (const c of req) body += c;
    forwarded.push({ path: req.url, headers: req.headers, body });
    res.writeHead(200, { "Content-Type": "application/json" }); res.end('{"ok":true}');
  });
  upstream.on("upgrade", (req, socket) => {
    socket.on("error", () => {});
    socket.write("HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n");
  });
  await new Promise(r => upstream.listen(0, "127.0.0.1", r));
  const gateway = createAccessGateway({ source: dir, environment: "test", keyFile: key,
    authenticate: async req => { if (req.headers.authorization !== "DPoP verified") throw Error(); return "https://pod.example/alice/profile/card#me"; },
    resolveUpstream: (p, app, url) => "http://127.0.0.1:" + upstream.address().port + url });
  const server = http.createServer(async (req, res) => { if (!await gateway.handle(req, res)) { res.statusCode = 404; res.end(); } });
  server.on("upgrade", gateway.upgrade);
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const request = (url, options = {}) => new Promise((resolve, reject) => {
    const req = http.request("http://127.0.0.1:" + server.address().port + url,
      { method: options.method || "GET", headers: { Host: "test.example", ...options.headers } }, res => {
        const chunks = []; res.on("data", c => chunks.push(c));
        res.on("end", () => resolve(new Response(Buffer.concat(chunks), { status: res.statusCode,
          headers: Object.fromEntries(Object.entries(res.headers).map(([k,v]) => [k, Array.isArray(v) ? v.join(", ") : v])) })));
      }); req.on("error", reject); req.end(options.body);
  });
  const login = async () => {
    const response = await request("/access-api/session", { method: "POST", headers: { Authorization: "DPoP verified", "X-Dataspace-Access": "1" } });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("set-cookie"), /HttpOnly; Secure; SameSite=Strict/);
    return response.headers.get("set-cookie").split(";")[0];
  };
  t.after(async () => { gateway.close(); server.closeAllConnections(); upstream.closeAllConnections(); server.close(); upstream.close(); await fs.rm(dir, { recursive: true }); });
  return { server, gateway, request, login, forwarded };
}
test("workspaces require login and browser navigation returns to the regular Solid login", async t => {
  const f = await fixture(t);
  assert.equal((await f.request("/node-red/flows")).status, 401);
  assert.equal((await f.request("/plasma/api/sms/modelings")).status, 401);
  const response = await f.request("/node-red/", { headers: { Accept: "text/html" } });
  assert.equal(response.status, 303); assert.match(response.headers.get("location"), /^\/workspace-login\?/);
  assert.equal(f.forwarded.length, 0);
});
test("authenticated sessions work for both apps, enforce origin, and logout revokes them", async t => {
  const f = await fixture(t), cookie = await f.login();
  for (const url of ["/node-red/flows", "/plasma/api/sms/modelings"])
    assert.equal((await f.request(url, { headers: { Cookie: cookie } })).status, 200);
  assert.equal((await f.request("/node-red/flows", { method: "POST", headers: { Cookie: cookie, Origin: "https://evil.example" } })).status, 403);
  assert.equal((await f.request("/node-red/flows", { method: "POST", headers: { Cookie: cookie, Origin: "https://test.example" }, body: "[]" })).status, 200);
  assert.ok(f.forwarded.every(r => !r.headers.cookie && !r.headers.authorization));
  assert.equal((await f.request("/access-api/logout", { method: "POST", headers: { Cookie: cookie, Origin: "https://test.example", "X-Dataspace-Access": "1" } })).status, 200);
  assert.equal((await f.request("/node-red/flows", { headers: { Cookie: cookie } })).status, 401);
});
test("worker calls use a verified Solid identity, never the browser cookie or a claimed foreign WebID", async t => {
  const f = await fixture(t), cookie = await f.login();
  const own = { webId: "https://pod.example/alice/profile/card#me" };
  const headers = { Cookie: cookie, "Content-Type": "application/json" };
  assert.equal((await f.request("/sync-worker/participants", { method: "POST", headers, body: JSON.stringify(own) })).status, 401);
  headers.Authorization = "DPoP verified";
  assert.equal((await f.request("/sync-worker/participants", { method: "POST", headers, body: JSON.stringify({ webId: "https://pod.example/bob/profile/card#me" }) })).status, 403);
  assert.equal((await f.request("/sync-worker/participants", { method: "POST", headers, body: JSON.stringify(own) })).status, 200);
  const sent = f.forwarded.at(-1);
  assert.equal(sent.path, "/participants"); assert.ok(sent.headers["x-dataspace-signature"]);
  assert.equal(JSON.parse(Buffer.from(sent.headers["x-dataspace-assertion"], "base64url")).webId, own.webId);
});
test("WebSockets require the same session and are closed on logout", async t => {
  const f = await fixture(t), cookie = await f.login();
  const socket = net.connect(f.server.address().port, "127.0.0.1");
  socket.on("error", () => {}); t.after(() => socket.destroy());
  const connected = new Promise(resolve => socket.once("data", data => resolve(data.toString())));
  socket.write("GET /node-red/comms HTTP/1.1\r\nHost: test.example\r\nOrigin: https://test.example\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nCookie: " + cookie + "\r\n\r\n");
  assert.match(await connected, /^HTTP\/1.1 101/);
  const closed = new Promise(resolve => socket.once("close", resolve));
  await f.request("/access-api/logout", { method: "POST", headers: { Cookie: cookie, Origin: "https://test.example", "X-Dataspace-Access": "1" } });
  await closed;
});

test("REST preview and credential sealing require verified owner identity", async t => {
  const f = await fixture(t);
  for (const path of ["/sync-worker/participants/seal", "/sync-worker/participants/preview", "/sync-worker/participants/imports"]) {
    const body = JSON.stringify({ webId: "https://pod.example/alice/profile/card#me" });
    assert.equal((await f.request(path, { method: "POST", body })).status, 401);
    assert.equal((await f.request(path, { method: "POST", headers: { Authorization: "DPoP verified" }, body })).status, 200);
    assert.ok(f.forwarded.at(-1).headers["x-dataspace-signature"]);
  }
});
