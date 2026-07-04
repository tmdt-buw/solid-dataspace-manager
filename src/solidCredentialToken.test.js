import {
  createSolidDataset,
  createThing,
  getSolidDataset,
  setStringNoLocale,
  setThing,
  setUrl,
} from "@inrupt/solid-client";
import {
  decryptCredentialSecret,
  encryptCredentialSecret,
  loadCredentialToken,
} from "./solidCredentialToken";

jest.mock("@inrupt/solid-client", () => {
  const actual = jest.requireActual("@inrupt/solid-client");
  return {
    ...actual,
    getSolidDataset: jest.fn(),
  };
});

const SDM_NS = "https://w3id.org/solid-dataspace-manager#";
const SDM_TOKEN_NAME = `${SDM_NS}tokenName`;
const SDM_TOKEN_IDENTIFIER = `${SDM_NS}tokenIdentifier`;
const SDM_TOKEN_SECRET = `${SDM_NS}encryptedTokenSecret`;
const SDM_TOKEN_WEBID = `${SDM_NS}tokenWebId`;
const SDM_TOKEN_ALGORITHM = `${SDM_NS}encryptionAlgorithm`;
const WEB_ID = "https://solid.example/alice/profile/card#me";
const TOKEN_NAME = "solid-dataspace";
const TOKEN_DOCUMENT = "https://solid.example/alice/token/solid-dataspace.ttl";
const TOKEN_THING = `${TOKEN_DOCUMENT}#it`;
const CLIENT_SECRET =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" +
  "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";
const ENCRYPTED_SECRET_BLOB =
  "Q2hWRVFCQU5GMDRXWGdKRlNFZGJYbGxUSEZKZkRGMUJ EUTFBR0I1Q1hCZEVA==".replace(
    /\s/g,
    ""
  );

function mockCredentialTokenDataset({
  id = "client-id",
  name = TOKEN_NAME,
  secret,
  webId = WEB_ID,
  algorithm,
}) {
  let tokenThing = createThing({ url: TOKEN_THING });
  tokenThing = setStringNoLocale(tokenThing, SDM_TOKEN_NAME, name);
  tokenThing = setStringNoLocale(tokenThing, SDM_TOKEN_IDENTIFIER, id);
  tokenThing = setStringNoLocale(tokenThing, SDM_TOKEN_SECRET, secret);
  tokenThing = setUrl(tokenThing, SDM_TOKEN_WEBID, webId);
  if (algorithm) {
    tokenThing = setStringNoLocale(tokenThing, SDM_TOKEN_ALGORITHM, algorithm);
  }
  getSolidDataset.mockResolvedValue(setThing(createSolidDataset(), tokenThing));
}

beforeEach(() => {
  getSolidDataset.mockReset();
});

test("round-trips encrypted secrets with an explicit format prefix", () => {
  const secret = CLIENT_SECRET;
  const encrypted = encryptCredentialSecret(secret, WEB_ID, TOKEN_NAME);

  expect(encrypted).toMatch(/^demo-xor-v1:/);
  expect(encrypted).not.toContain(secret);
  expect(decryptCredentialSecret(encrypted, WEB_ID, TOKEN_NAME)).toBe(secret);
});

test("continues to read legacy encrypted secrets without the format prefix", () => {
  const secret = CLIENT_SECRET;
  const encrypted = encryptCredentialSecret(secret, WEB_ID, TOKEN_NAME).replace(
    /^demo-xor-v1:/,
    ""
  );

  expect(decryptCredentialSecret(encrypted, WEB_ID, TOKEN_NAME)).toBe(secret);
});

test("loads encrypted credential token secrets through the profile token path", async () => {
  mockCredentialTokenDataset({
    secret: encryptCredentialSecret(CLIENT_SECRET, WEB_ID, TOKEN_NAME),
    algorithm: "demo-xor-v1",
  });

  const token = await loadCredentialToken(WEB_ID, jest.fn(), TOKEN_NAME);

  expect(token.secret).toBe(CLIENT_SECRET);
});

test("loads legacy plaintext credential token secrets when no algorithm is stored", async () => {
  const secret = CLIENT_SECRET;
  mockCredentialTokenDataset({ secret });

  const token = await loadCredentialToken(WEB_ID, jest.fn(), TOKEN_NAME);

  expect(token.secret).toBe(secret);
});

test("loads legacy plaintext credential token secrets even when the old algorithm field is present", async () => {
  mockCredentialTokenDataset({
    secret: CLIENT_SECRET,
    algorithm: "demo-xor-v1",
  });

  const token = await loadCredentialToken(WEB_ID, jest.fn(), TOKEN_NAME);

  expect(token.secret).toBe(CLIENT_SECRET);
});

test("rejects base64 credential blobs instead of treating them as plaintext secrets", async () => {
  mockCredentialTokenDataset({
    secret: ENCRYPTED_SECRET_BLOB,
    algorithm: "demo-xor-v1",
  });

  await expect(loadCredentialToken(WEB_ID, jest.fn(), TOKEN_NAME)).rejects.toThrow(
    "Credential token secret could not be decoded."
  );
});

test("rejects prefixed credential token secrets when they cannot be decoded", async () => {
  mockCredentialTokenDataset({
    secret: "demo-xor-v1:not-valid-base64",
    algorithm: "demo-xor-v1",
  });

  await expect(loadCredentialToken(WEB_ID, jest.fn(), TOKEN_NAME)).rejects.toThrow(
    "Credential token secret could not be decoded."
  );
});
