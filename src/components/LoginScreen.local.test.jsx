import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import LoginScreen from "./LoginScreen";
import { loadAccountIndex, readRememberedAccountLogin } from "../cssAccountApi";
jest.mock("./LoginParticleCloud", () => () => null);
jest.mock("./LegalLinks", () => () => null);
jest.mock("../i18n", () => ({ LanguageSelect: () => null }));
jest.mock("../config/runtimeConfig", () => ({ getBranding: () => ({}), getEnabledProviders: () => [{id:"test",label:"Test",issuer:"https://provider.example"}] }));
jest.mock("../cssAccountApi", () => ({...jest.requireActual("../cssAccountApi"),loadAccountIndex:jest.fn(),readRememberedAccountLogin:jest.fn(),clearStoredAccountToken:jest.fn()}));
const originalLocation = window.location;
afterEach(() => { window.location = originalLocation; });
beforeEach(() => {
 delete window.location;
 window.location = { protocol: "https:", hostname: "solid-dataspace-test.tmdt.info" }; window.__APP_CONFIG__ = {}; jest.clearAllMocks(); readRememberedAccountLogin.mockReturnValue({}); loadAccountIndex.mockResolvedValue({controls:{}}); });
test("OIDC mode starts the provider login without collecting account credentials", async () => {
 window.__APP_CONFIG__.loginMode="oidc"; const onLogin=jest.fn().mockResolvedValue(); render(<LoginScreen onLogin={onLogin}/>);
 fireEvent.click(screen.getByRole("button",{name:"Login"}));
 await waitFor(()=>expect(onLogin).toHaveBeenCalledWith("https://provider.example"));
 expect(loadAccountIndex).not.toHaveBeenCalled(); expect(screen.queryByRole("button",{name:"Register"})).toBeNull();
});
test("OIDC startup failures are visible and allow retry", async () => {
 window.__APP_CONFIG__.loginMode="oidc";render(<LoginScreen onLogin={jest.fn().mockRejectedValue(Error("Provider unavailable"))}/>);
 fireEvent.click(screen.getByRole("button",{name:"Login"}));
 await waitFor(()=>expect(screen.getByRole("alert").textContent).toBe("Provider unavailable"));
 expect(screen.getByRole("button",{name:"Login"}).disabled).toBe(false);
});
test("existing deployments keep their account login flow by default", async () => {
 const onLogin=jest.fn();render(<LoginScreen onLogin={onLogin}/>);fireEvent.click(screen.getByRole("button",{name:"Login"}));
 await waitFor(()=>expect(loadAccountIndex).toHaveBeenCalled());expect(onLogin).not.toHaveBeenCalled();
});

test.each(["localhost", "127.0.0.1", "[::1]"])("%s uses the provider login when runtime config is missing", async hostname => {
 window.location = { hostname, protocol: "http:" };
 delete window.__APP_CONFIG__;
 const onLogin=jest.fn().mockResolvedValue();render(<LoginScreen onLogin={onLogin}/>);
 fireEvent.click(screen.getByRole("button",{name:"Login"}));
 await waitFor(()=>expect(onLogin).toHaveBeenCalledWith("https://provider.example"));
 expect(loadAccountIndex).not.toHaveBeenCalled();
 expect(screen.queryByRole("button",{name:"Register"})).toBeNull();
});
