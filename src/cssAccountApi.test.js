import {
  clearRememberedAccountLogin,
  getRememberedAccountLoginKey,
  readRememberedAccountLogin,
  storeRememberedAccountLogin,
} from "./cssAccountApi";

const accountIndexUrl = "https://solid.example/.account/";

beforeEach(() => {
  window.localStorage.clear();
});

test("stores and reads remembered account login email by provider origin", () => {
  storeRememberedAccountLogin(accountIndexUrl, {
    email: " alice@example.org ",
  });

  expect(readRememberedAccountLogin(accountIndexUrl)).toEqual({
    email: "alice@example.org",
  });
});

test("does not store remembered account login without an email", () => {
  storeRememberedAccountLogin(accountIndexUrl, { email: "" });

  expect(
    window.localStorage.getItem(getRememberedAccountLoginKey(accountIndexUrl))
  ).toBeNull();
});

test("clears remembered account login", () => {
  storeRememberedAccountLogin(accountIndexUrl, {
    email: "alice@example.org",
  });

  clearRememberedAccountLogin(accountIndexUrl);

  expect(readRememberedAccountLogin(accountIndexUrl)).toEqual({ email: "" });
});
