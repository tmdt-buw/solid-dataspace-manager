const { TextDecoder, TextEncoder } = require("util");
global.TextDecoder = TextDecoder;
global.TextEncoder = TextEncoder;

const React = require("react");
const { fireEvent, render, screen, waitFor } = require("@testing-library/react");
const { Parser, Store, Writer, DataFactory } = require("n3");

const mockFetch = jest.fn();
jest.mock("./solidSession", () => ({
  __esModule: true,
  default: { fetch: (...args) => mockFetch(...args) },
}));
jest.mock("./solidCredentialToken", () => ({ loadCredentialToken: async () => null }));
jest.mock("./i18n", () => ({
  useI18n: () => ({ t: (text) => text, syncError: "" }),
  LanguageSelect: () => null,
}));
jest.mock("./components/ContentLoadingState", () => () => <div role="status">Loading</div>);
// ACL setup is unrelated to registry reconciliation. RDF reads, PATCH writes,
// POST registrations and DELETE requests use the real installed Solid SDK.
jest.mock("@inrupt/solid-client", () => ({
  ...jest.requireActual("@inrupt/solid-client"),
  getSolidDatasetWithAcl: async () => ({}),
  hasResourceAcl: () => true,
  getResourceAcl: () => ({}),
  setPublicResourceAccess: (acl) => acl,
  saveAclFor: async () => ({}),
}));

const Profile = require("./components/Profile").default;
const { loadRegistryConfig, saveRegistryConfig, REGISTRY_PRESETS } = require("./solidCatalog");
const { namedNode, quad } = DataFactory;
const WEB_ID = "https://pod.example/alice/profile/card#me";
const PROFILE_URL = WEB_ID.split("#")[0];
const PRIVATE = "https://pod.example/alice/registry/";
const A = `${REGISTRY_PRESETS[0].url}/`;
const B = `${REGISTRY_PRESETS[1].url}/`;
const REGISTRY = "https://w3id.org/solid-dataspace-manager#registry";
const MEMBER = "http://xmlns.com/foaf/0.1/member";
const CONTAINS = "http://www.w3.org/ns/ldp#contains";

function response(url, status, body = "", extraHeaders = {}) {
  const headers = {
    "content-type": "text/turtle",
    link: `<http://www.w3.org/ns/ldp#${url.endsWith("/") ? "BasicContainer" : "Resource"}>; rel="type"`,
    ...extraHeaders,
  };
  return {
    url, status, statusText: String(status), ok: status >= 200 && status < 300,
    headers: { get: (name) => headers[name.toLowerCase()] || null },
    text: async () => body,
    clone: () => response(url, status, body, extraHeaders),
  };
}

function createPod(registries = [A]) {
  const documents = new Map();
  const failures = new Map();
  const containers = new Set([A, B, PRIVATE]);
  let sequence = 0;
  const put = (url, turtle) => documents.set(url,
    new Store(new Parser({ baseIRI: url }).parse(turtle)));
  put(PROFILE_URL, `
    <${WEB_ID}> <http://www.w3.org/2006/vcard/ns#fn> "Alice";
      <https://w3id.org/solid-dataspace-manager#registryMode> "research";
      <https://w3id.org/solid-dcat-profile#catalog> <https://pod.example/alice/catalog/cat.ttl#it>.
    ${registries.map((url) => `<${WEB_ID}> <${REGISTRY}> <${url.replace(/\/+$/, "")}>.`).join("\n")}
  `);
  const addMember = (registry, webId = WEB_ID) => {
    const url = `${registry}member-${++sequence}`;
    put(url, `<#it> <${MEMBER}> <${webId}>.`);
    return url;
  };
  registries.forEach((url) => addMember(url));
  const members = (registry) => [...documents].filter(([url]) =>
    new URL(".", url).href === registry).flatMap(([, store]) =>
    store.getObjects(null, namedNode(MEMBER), null).map((term) => term.value));
  const fetch = jest.fn(async (url, options = {}) => {
    const method = options.method || "GET";
    const failure = failures.get(`${method} ${url}`);
    if (failure) return response(url, failure);
    if (method === "GET") {
      if (containers.has(url)) {
        const refs = [...documents.keys()].filter((entry) => new URL(".", entry).href === url);
        return response(url, 200,
          `<${url}> a <http://www.w3.org/ns/ldp#BasicContainer>.\n` +
          refs.map((entry) => `<${url}> <${CONTAINS}> <${entry}>.`).join("\n"));
      }
      const store = documents.get(url);
      return store ? response(url, 200, new Writer().quadsToString(store.getQuads())) : response(url, 404);
    }
    if (method === "DELETE") {
      return response(url, documents.delete(url) ? 204 : 404);
    }
    if (method === "POST") {
      const entry = `${url}member-${++sequence}`;
      put(entry, options.body);
      return response(url, 201, "", { location: entry });
    }
    if (method === "PUT") {
      if (url.endsWith("/")) containers.add(url);
      else put(url, options.body || "");
      return response(url, 201);
    }
    if (method === "PATCH") {
      const store = documents.get(url);
      if (!store) return response(url, 404);
      // Apply the SPARQL DELETE/INSERT DATA emitted by solid-client 2.x;
      // replacing the whole document here would hide SDK changelog behaviour.
      for (const [, operation, turtle] of options.body.matchAll(/(DELETE|INSERT) DATA\s*\{([\s\S]*?)\}/g)) {
        const quads = new Parser({ baseIRI: url }).parse(turtle);
        if (operation === "DELETE") store.removeQuads(quads);
        else store.addQuads(quads);
      }
      return response(url, 205);
    }
    throw new Error(`Unexpected ${method} ${url}`);
  });
  mockFetch.mockImplementation(fetch);
  return { documents, failures, fetch, members, addMember };
}

const config = (registries, mode = "research") => ({ mode, registries, privateRegistry: PRIVATE });
const selected = async () => (await loadRegistryConfig(WEB_ID, mockFetch)).registries;

async function saveProfile() {
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await screen.findByText("Profile saved.");
  fireEvent.click(screen.getByRole("button", { name: "OK" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeEnabled());
}

beforeEach(() => jest.clearAllMocks());

test("repeated saves on one Profile page add then remove a registry", async () => {
  const pod = createPod();
  render(<Profile webId={WEB_ID} />);
  await screen.findByRole("heading", { name: "Your Profile" });
  fireEvent.click(screen.getByTitle("DACE"));
  await saveProfile();
  expect(pod.members(B)).toContain(WEB_ID);
  fireEvent.click(screen.getByTitle("DACE"));
  await saveProfile();
  expect(pod.members(B)).not.toContain(WEB_ID);
  expect(await selected()).toEqual([A.replace(/\/+$/, "")]);
  expect(pod.fetch.mock.calls.some(([, options]) => options?.method === "PATCH")).toBe(true);
});

test("a denied departure is shown, keeps the old selection and can be retried", async () => {
  const pod = createPod([A, B]);
  const entry = [...pod.documents.keys()].find((url) => url.startsWith(B));
  pod.failures.set(`DELETE ${entry}`, 403);
  const log = jest.spyOn(console, "error").mockImplementation(() => {});
  try {
    render(<Profile webId={WEB_ID} />);
    await screen.findByRole("heading", { name: "Your Profile" });
    fireEvent.click(screen.getByTitle("DACE"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText(/Could not leave registry.*HTTP 403/);
    expect(screen.queryByText("Profile saved.")).not.toBeInTheDocument();
    expect(await selected()).toContain(B.replace(/\/+$/, ""));
    expect(pod.members(B)).toContain(WEB_ID);
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    pod.failures.clear();
    await saveProfile();
    expect(pod.members(B)).not.toContain(WEB_ID);
    expect(await selected()).not.toContain(B.replace(/\/+$/, ""));
  } finally { log.mockRestore(); }
});

test.each(["Reconfigure Catalog", "Reset Catalog"])("%s also removes deselected memberships", async (action) => {
  const pod = createPod([A, B]);
  render(<Profile webId={WEB_ID} />);
  await screen.findByRole("heading", { name: "Your Profile" });
  fireEvent.click(screen.getByTitle("DACE"));
  fireEvent.click(screen.getByRole("button", { name: action }));
  if (action === "Reset Catalog") {
    const buttons = await screen.findAllByRole("button", { name: "Reset Catalog" });
    fireEvent.click(buttons[buttons.length - 1]);
  }
  await screen.findByText(action === "Reset Catalog" ? "Catalog reset completed." : "Catalog initialized.");
  expect(pod.members(B)).not.toContain(WEB_ID);
  expect(await selected()).toEqual([A.replace(/\/+$/, "")]);
});

test("removal deletes all matching entries and preserves other members", async () => {
  const pod = createPod([A, B]);
  pod.addMember(B);
  const other = "https://pod.example/bob/profile/card#me";
  pod.addMember(B, other);
  await saveRegistryConfig(WEB_ID, mockFetch, config([A]));
  expect(pod.members(B)).toEqual([other]);
  expect(pod.members(A)).toEqual([WEB_ID]);
});

test.each(["GET", "DELETE"])("%s failure on a membership cannot commit the new selection", async (method) => {
  const pod = createPod([A, B]);
  const entry = [...pod.documents.keys()].find((url) => url.startsWith(B));
  pod.failures.set(`${method} ${entry}`, 403);
  await expect(saveRegistryConfig(WEB_ID, mockFetch, config([A]))).rejects.toThrow("HTTP 403");
  expect(await selected()).toContain(B.replace(/\/+$/, ""));
});

test("an already deleted membership is harmless on retry", async () => {
  const pod = createPod([A, B]);
  [...pod.documents.keys()].filter((url) => url.startsWith(B)).forEach((url) => pod.documents.delete(url));
  await saveRegistryConfig(WEB_ID, mockFetch, config([A]));
  expect(await selected()).toEqual([A.replace(/\/+$/, "")]);
});

test("switching to private use removes public memberships", async () => {
  const pod = createPod([A, B]);
  await saveRegistryConfig(WEB_ID, mockFetch, config([A, B], "private"));
  expect(pod.members(A)).toEqual([]);
  expect(pod.members(B)).toEqual([]);
  expect(pod.members(PRIVATE)).toEqual([WEB_ID]);
  expect((await loadRegistryConfig(WEB_ID, mockFetch)).mode).toBe("private");
});

test("a profile read failure causes no membership writes", async () => {
  const pod = createPod([A, B]);
  pod.failures.set(`GET ${PROFILE_URL}`, 503);
  await expect(saveRegistryConfig(WEB_ID, mockFetch, config([A]))).rejects.toThrow();
  expect(pod.fetch.mock.calls.every(([, options]) => !options?.method || options.method === "GET")).toBe(true);
});

test("a failed profile write after removal can be retried", async () => {
  const pod = createPod([A, B]);
  pod.failures.set(`PATCH ${PROFILE_URL}`, 500);
  await expect(saveRegistryConfig(WEB_ID, mockFetch, config([A]))).rejects.toThrow();
  expect(pod.members(B)).toEqual([]);
  expect(await selected()).toContain(B.replace(/\/+$/, ""));
  pod.failures.clear();
  await saveRegistryConfig(WEB_ID, mockFetch, config([A]));
  expect(await selected()).toEqual([A.replace(/\/+$/, "")]);
});

test("profile operations preserve changes made after the form loaded", async () => {
  const pod = createPod();
  render(<Profile webId={WEB_ID} />);
  await screen.findByRole("heading", { name: "Your Profile" });
  const predicate = namedNode("https://example.org/changedElsewhere");
  pod.documents.get(PROFILE_URL).addQuad(quad(namedNode(WEB_ID), predicate, namedNode("https://example.org/value")));
  await saveProfile();
  expect(pod.documents.get(PROFILE_URL).getObjects(namedNode(WEB_ID), predicate, null)).toHaveLength(1);
});
