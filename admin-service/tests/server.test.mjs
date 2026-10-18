import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { createAdminServer } from "../server.mjs";
const actor = "https://identity.example/admin#me";
async function setup(t, auth = async () => actor) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "admin-http-"));
  await fs.mkdir(path.join(dir, "profiles"));
  const profile = {
    id: "test",
    environment: "test",
    domains: ["test.example"],
    administration: { enabled: true, adminWebIds: [actor] },
    public: {
      branding: { projectName: "Test" },
      statistics: { adminWebIds: [actor] },
    },
  };
  await fs.writeFile(
    path.join(dir, "profiles/test.yaml"),
    JSON.stringify(profile),
  );
  const calls = [];
  const controller = http.createServer(async (req, res) => {
    let raw = "";
    for await (const b of req) raw += b;
    calls.push(JSON.parse(raw));
    res.end(JSON.stringify({ ok: true }));
  });
  const socketPath = path.join(dir, "control.sock");
  await new Promise((r) => controller.listen(socketPath, r));
  const api = createAdminServer({
    source: dir,
    profiles: ["test"],
    socketPath,
    identityHosts: ["identity.example"],
    issuers: ["https://identity.example/"],
    authenticate: auth,
  });
  await new Promise((r) => api.listen(0, "127.0.0.1", r));
  t.after(async () => {
    await new Promise((r) => api.close(r));
    await new Promise((r) => controller.close(r));
    await fs.rm(dir, { recursive: true, force: true });
  });
  const call = (route, options = {}) =>
    new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port: api.address().port,
          path: route,
          method: options.method || "GET",
          headers: { Host: "test.example", ...options.headers },
        },
        (res) => {
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () =>
            resolve(
              new Response(Buffer.concat(chunks), {
                status: res.statusCode,
                headers: res.headers,
              }),
            ),
          );
        },
      );
      req.on("error", reject);
      req.end(options.body);
    });
  return { call, calls };
}
test("authenticated discovery exposes only the deployment scope", async (t) => {
  const { call } = await setup(t);
  const r = await call("/admin-api/me");
  assert.equal(r.status, 200);
  assert.deepEqual(
    (await r.json()).profiles.map((p) => p.id),
    ["test"],
  );
});
test("production paths remain forbidden even for a valid test admin", async (t) => {
  const { call, calls } = await setup(t);
  assert.equal((await call("/admin-api/profiles/dace")).status, 403);
  assert.equal(calls.length, 0);
});
test("spoofed actor and profile in request body are overwritten with verified scope", async (t) => {
  const { call, calls } = await setup(t);
  const r = await call("/admin-api/profiles/test/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Dataspace-Admin": "1" },
    body: JSON.stringify({ actor: "attacker", profileId: "dace" }),
  });
  assert.equal(r.status, 200);
  assert.equal(calls[0].actor, actor);
  assert.equal(calls[0].profileId, "test");
});
test("cross-origin writes and unrecognized hosts are refused", async (t) => {
  const { call, calls } = await setup(t);
  assert.equal(
    (
      await call("/admin-api/me", {
        headers: { Origin: "https://evil.example" },
      })
    ).status,
    403,
  );
  assert.equal(
    (await call("/admin-api/me", { headers: { Host: "prod.example" } })).status,
    421,
  );
  assert.equal(calls.length, 0);
});
test("auth failures do not return profiles or call the controller", async (t) => {
  const { call, calls } = await setup(t, async () => {
    throw Error("invalid");
  });
  const r = await call("/admin-api/me");
  assert.equal(r.status, 401);
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.equal(calls.length, 0);
  assert.match(r.headers.get("www-authenticate"), /^DPoP/);
});
test("write requests require JSON and the admin request header", async (t) => {
  const { call, calls } = await setup(t);
  assert.equal(
    (
      await call("/admin-api/profiles/test/apply", {
        method: "POST",
        body: "{}",
      })
    ).status,
    415,
  );
  assert.equal(calls.length, 0);
});
