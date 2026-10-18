import test from "node:test";
import assert from "node:assert/strict";
import { checkProfile, isPublicAddress } from "../preflight.mjs";
const profile = {
  id: "test",
  domains: ["test.example"],
  administration: { adminWebIds: [] },
  public: {
    providers: [],
    catalog: { defaultRegistry: "https://pod.example/registry" },
    statistics: { adminWebIds: [] },
  },
};
test("DNS checks reject private, loopback and reserved addresses", () => {
  for (const value of [
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "192.0.2.1",
  ])
    assert.equal(isPublicAddress(value), false, value);
  assert.equal(isPublicAddress("132.195.160.191"), true);
});
test("a new hostname must resolve exclusively to configured server addresses", async () => {
  await assert.rejects(
    checkProfile(
      profile,
      { ...profile, domains: [...profile.domains, "new.example"] },
      [],
      { serverAddresses: ["132.195.160.191"] },
      null,
      async () => [{ address: "8.8.8.8" }],
    ),
    /DNS does not point/,
  );
});
test("a changed provider is checked before activation", async () => {
  const candidate = {
    ...profile,
    public: {
      ...profile.public,
      providers: [{ enabled: true, issuer: "https://issuer.example/" }],
    },
  };
  await assert.rejects(
    checkProfile(profile, candidate, [], {}, async () => ({
      text: JSON.stringify({ issuer: "https://other.example/" }),
    })),
    /valid issuer metadata/,
  );
});
test("provider label edits do not fetch remote metadata", async () => {
  const before = {
    ...profile,
    public: {
      ...profile.public,
      providers: [
        { label: "before", enabled: true, issuer: "https://issuer.example/" },
      ],
    },
  };
  const after = structuredClone(before);
  after.public.providers[0].label = "after";
  await checkProfile(before, after, [], {}, async () => {
    throw Error("unexpected network request");
  });
});
test("a registry change requires a reachable RDF resource", async () => {
  const after = structuredClone(profile);
  after.public.catalog.defaultRegistry = "https://pod.example/new";
  await assert.rejects(
    checkProfile(
      profile,
      after,
      [{ url: after.public.catalog.defaultRegistry }],
      {},
      async () => ({ text: "<html/>", type: "text/html" }),
    ),
    /RDF resource/,
  );
});

// The controller invokes this module as a CLI; imported unit tests alone must not mask a broken entry point.
import { spawnSync } from "node:child_process";
test("CLI returns machine-readable confirmation for an unchanged profile", () => {
  const result = spawnSync(
    process.execPath,
    [new URL("../preflight.mjs", import.meta.url).pathname],
    {
      input: JSON.stringify({
        before: profile,
        after: profile,
        registries: [],
        policy: {},
      }),
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { ok: true });
});
test("invalid RDF cannot pass a registry check", async () => {
  const after = structuredClone(profile);
  after.public.catalog.defaultRegistry = "https://pod.example/new";
  await assert.rejects(
    checkProfile(
      profile,
      after,
      [{ url: after.public.catalog.defaultRegistry }],
      {},
      async () => ({ text: "this is not Turtle", type: "text/turtle" }),
    ),
  );
});

test('registry container URLs are canonicalized before checking Turtle',async()=>{const after=structuredClone(profile);after.public.catalog.defaultRegistry='https://pod.example/new';const calls=[];await checkProfile(profile,after,[{url:after.public.catalog.defaultRegistry}],{},async url=>{calls.push(url);return {text:'<https://pod.example/new/> a <http://www.w3.org/ns/ldp#Container> .',type:'text/turtle'}});assert.deepEqual(calls,['https://pod.example/new/'])});
