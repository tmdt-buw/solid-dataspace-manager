import { ensureWorkspaceSession, revokeWorkspaceSession, workspaceReturnTarget } from "./workspaceAccess";
import session from "./solidSession";
jest.mock("./solidSession", () => ({ info: { isLoggedIn: true, webId: "https://pod.example/alice/profile/card#me" }, fetch: jest.fn() }));
beforeEach(() => { window.__APP_CONFIG__={accessGateway:true};session.info.isLoggedIn=true;session.fetch.mockReset(); });
test("workspace session uses the existing authenticated Solid fetch", async () => {
  session.fetch.mockResolvedValue({ok:true}); await ensureWorkspaceSession();
  expect(session.fetch).toHaveBeenCalledWith(window.location.origin+"/access-api/session", expect.objectContaining({method:"POST",credentials:"same-origin",headers:{"X-Dataspace-Access":"1"}}));
});
test("an unauthenticated or rejected session never opens a workspace", async () => {
  session.info.isLoggedIn=false; await expect(ensureWorkspaceSession()).rejects.toThrow(); expect(session.fetch).not.toHaveBeenCalled();
  session.info.isLoggedIn=true;session.fetch.mockResolvedValue({ok:false});await expect(ensureWorkspaceSession()).rejects.toThrow();
});
test("return targets stay in the selected workspace on this origin", () => {
  expect(workspaceReturnTarget("/node-red/?view=flows","https://test.example")).toBe("/node-red/?view=flows");
  for(const url of ["https://evil.example/plasma/","//evil.example/node-red/","/admin","javascript:alert(1)"])
    expect(workspaceReturnTarget(url,"https://test.example")).toBe("/web/node-red");
});
test("logout must revoke the workspace cookie before local logout", async () => {
  window.fetch=jest.fn(async()=>({ok:false}));await expect(revokeWorkspaceSession()).rejects.toThrow();
  expect(window.fetch).toHaveBeenCalledWith("/access-api/logout",expect.objectContaining({method:"POST",credentials:"same-origin"}));
});
