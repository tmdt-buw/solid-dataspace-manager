import { EventEmitter } from 'events';
import { createSessionRecovery, SessionExpiredError, safeReturnTarget } from './sessionRecovery';
const origin='https://dataspace.example',webId='https://pod.example/alice/profile/card#me';
function fixture({storage = new Map(), loggedIn=true, time=1000, href=origin+'/web/catalog?dataset=abc#details'}={}) {
 const session={info:{isLoggedIn:loggedIn,webId:loggedIn?webId:undefined,expirationDate:loggedIn?10000:undefined},events:new EventEmitter(),fetch:jest.fn(),login:jest.fn().mockResolvedValue(),logout:jest.fn().mockImplementation(async()=>{session.info.isLoggedIn=false;session.events.emit('logout');})};
 const originals={fetch:session.fetch,login:session.login,logout:session.logout};
 const location={origin,href},history={replaceState:jest.fn(),state:{router:'preserve'}},browser={addEventListener:jest.fn(),removeEventListener:jest.fn()};
 const recovery=createSessionRecovery(session,{storage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},location,history,now:()=>time,resolveIssuer:()=> 'https://pod.example',setInterval:()=>1,clearInterval:()=>{},window:browser});
 return {session,recovery,originals,storage,history,location,browser,setTime:t=>{time=t;}};
}
test('a confirmed SDK expiration blocks every consumer of the shared fetch and opens one recovery state',async()=>{
 const f=fixture(),notify=jest.fn();f.recovery.subscribe(notify);f.session.events.emit('sessionExpired');f.session.events.emit('sessionExpired');
 expect(f.recovery.getSnapshot().expired).toBe(true);expect(notify).toHaveBeenCalledTimes(1);
 await expect(f.session.fetch('https://pod.example/file')).rejects.toBeInstanceOf(SessionExpiredError);
 await expect(f.session.fetch('/sync-worker/participants/imports')).rejects.toBeInstanceOf(SessionExpiredError);
 expect(f.originals.fetch).not.toHaveBeenCalled();expect(f.originals.logout).not.toHaveBeenCalled();f.recovery.dispose();
});
test.each([401,403,404,429,500,502,503])('HTTP %i by itself never triggers recovery or logout',async status=>{
 const f=fixture();f.originals.fetch.mockResolvedValue({status,ok:false});expect((await f.session.fetch('/resource')).status).toBe(status);expect(f.recovery.getSnapshot().expired).toBe(false);expect(f.originals.logout).not.toHaveBeenCalled();f.recovery.dispose();
});
test.each([new TypeError('Failed to fetch'),Object.assign(new Error('Timed out'),{name:'AbortError'})])('network errors remain ordinary retryable errors',async error=>{
 const f=fixture();f.originals.fetch.mockRejectedValue(error);await expect(f.session.fetch('/resource')).rejects.toBe(error);expect(f.recovery.getSnapshot().expired).toBe(false);expect(f.originals.logout).not.toHaveBeenCalled();f.recovery.dispose();
});
test('a suspended tab checks the actual latest expiry on resume and before a protected request',async()=>{
 const f=fixture();f.setTime(11000);f.session.info.expirationDate=20000;expect(f.recovery.check()).toBe(false);
 f.setTime(21000);const focus=f.browser.addEventListener.mock.calls.find(c=>c[0]==='focus')[1];focus();expect(f.recovery.getSnapshot().expired).toBe(true);
 await expect(f.session.fetch('/resource')).rejects.toBeInstanceOf(SessionExpiredError);f.recovery.dispose();
});
test('no date and a logged-out initial page do not constitute evidence of expiration',()=>{
 const f=fixture({loggedIn:false});expect(f.recovery.check()).toBe(false);f.recovery.dispose();
 const active=fixture();delete active.session.info.expirationDate;active.setTime(9999999);expect(active.recovery.check()).toBe(false);active.recovery.dispose();
});
test('re-login revokes the workspace before clearing SDK credentials and starting the selected issuer',async()=>{
 const f=fixture(),calls=[];f.recovery.check();f.session.events.emit('sessionExpired');const logout=f.originals.logout.getMockImplementation();f.originals.logout.mockImplementation(async opts=>{calls.push('logout');expect(opts).toEqual({logoutType:'app'});return logout();});
 const revoke=jest.fn(async()=>calls.push('revoke')),login=jest.fn(async issuer=>{calls.push('login');await f.session.login({oidcIssuer:issuer});});
 await Promise.all([f.recovery.reauthenticate({revoke,login}),f.recovery.reauthenticate({revoke,login})]);expect(calls).toEqual(['revoke','logout','login']);expect(login).toHaveBeenCalledWith('https://pod.example/');expect(f.recovery.getSnapshot().busy).toBe(true);
 const next=fixture({storage:f.storage,loggedIn:true,href:origin+'/?code=oauth-code&state=oauth-state'});expect(next.recovery.canRestore()).toBe(true);next.recovery.restored();expect(next.history.replaceState).toHaveBeenCalledWith({router:'preserve'},'','/web/catalog?dataset=abc#details');expect(next.recovery.getSnapshot().expired).toBe(false);expect([...f.storage.keys()].some(k=>k.endsWith(':reauthentication'))).toBe(false);next.recovery.dispose();f.recovery.dispose();
});
test('failed workspace revocation does not clear credentials or start a login, and can be retried',async()=>{
 const f=fixture();f.session.events.emit('sessionExpired');const login=jest.fn();await f.recovery.reauthenticate({revoke:()=>Promise.reject(new Error('offline')),login});expect(login).not.toHaveBeenCalled();expect(f.originals.logout).not.toHaveBeenCalled();expect(f.recovery.getSnapshot()).toMatchObject({expired:true,busy:false,error:'Sign-in could not be started. Please try again.'});
 await f.recovery.reauthenticate({revoke:async()=>{},login});expect(login).toHaveBeenCalledTimes(1);f.recovery.dispose();
});
test('failed login keeps the return address and allows another attempt',async()=>{
 const f=fixture();f.session.events.emit('sessionExpired');await f.recovery.reauthenticate({revoke:async()=>{},login:()=>Promise.reject(new Error('issuer offline'))});expect(f.recovery.getSnapshot().busy).toBe(false);
 const reload=fixture({storage:f.storage,loggedIn:false});expect(reload.recovery.canRestore()).toBe(false);expect(reload.recovery.getSnapshot().expired).toBe(true);reload.recovery.dispose();f.recovery.dispose();
});
test('an explicit logout does not prompt for another login',async()=>{const f=fixture();await f.session.logout({logoutType:'app'});f.setTime(99999);expect(f.recovery.check()).toBe(false);f.session.events.emit('sessionExpired');expect(f.recovery.getSnapshot().expired).toBe(false);f.recovery.dispose();});
test('return destinations reject external and ambiguous URLs and remove OAuth callback parameters',()=>{
 for(const target of ['https://evil.example/path','//evil.example/path','/%2f%2fevil.example/path','/\\evil.example/path'])expect(safeReturnTarget(target,origin)).toBe('/');
 expect(safeReturnTarget('/data-connection?code=private&state=private&lang=de#tab',origin)).toBe('/data-connection?lang=de#tab');
 expect(safeReturnTarget('/web/node-red?tab=flows#flow-1',origin)).toBe('/web/node-red?tab=flows#flow-1');
});
test('expired recovery records do not revive an old login request',()=>{const f=fixture();f.session.events.emit('sessionExpired');const next=fixture({storage:f.storage,loggedIn:false,time:1000+3600001});expect(next.recovery.getSnapshot().expired).toBe(false);next.recovery.dispose();f.recovery.dispose();});
