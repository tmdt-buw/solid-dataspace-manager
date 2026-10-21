import React from 'react';
import {render,screen,fireEvent,act} from '@testing-library/react';
import SessionExpiryBoundary from './SessionExpiryBoundary';
jest.mock('../solidSession',()=>({sessionRecovery:undefined}));
jest.mock('../workspaceAccess',()=>({revokeWorkspaceSession:jest.fn()}));
jest.mock('../config/runtimeConfig',()=>({getEnabledProviders:()=>[{issuer:'https://pod.example'}]}));
let mockLanguage='de';jest.mock('../i18n',()=>({useI18n:()=>({language:mockLanguage})}));
function store(){let value={expired:false,busy:false,error:'',issuer:'https://pod.example'};const callbacks=new Set();return {getSnapshot:()=>value,subscribe:fn=>{callbacks.add(fn);return()=>callbacks.delete(fn);},reauthenticate:jest.fn(),set:patch=>{value={...value,...patch};for(const f of callbacks)f();}};}
test.each(['de','en'])('one blocking, keyboard-accessible modal covers any app (%s)',lang=>{
 mockLanguage=lang;const recovery=store(),login=jest.fn();render(<SessionExpiryBoundary recovery={recovery} onLogin={login}><main><button>Background app</button></main></SessionExpiryBoundary>);
 expect(screen.queryByRole('alertdialog')).toBeNull();act(()=>recovery.set({expired:true}));const dialog=screen.getByRole('alertdialog');const button=screen.getByRole('button',{name:lang==='de'?'Neu anmelden':'Sign in again'});expect(button).toHaveFocus();expect(document.querySelector('.session-app-content')).toHaveAttribute('inert');expect(screen.queryByRole('button',{name:'Background app'})).toBeNull();
 fireEvent.keyDown(dialog,{key:'Escape'});expect(dialog).toBeInTheDocument();fireEvent.keyDown(button,{key:'Tab'});expect(button).toHaveFocus();fireEvent.click(button);expect(recovery.reauthenticate).toHaveBeenCalledWith(expect.objectContaining({login,issuer:'https://pod.example'}));
 act(()=>recovery.set({busy:true}));expect(button).toBeDisabled();act(()=>recovery.set({expired:false}));expect(screen.queryByRole('alertdialog')).toBeNull();expect(screen.getByRole('button',{name:'Background app'})).toBeInTheDocument();
});
test('failed re-login remains in the modal with an actionable message',()=>{mockLanguage='de';const recovery=store();recovery.set({expired:true,error:'Sign-in could not be started. Please try again.'});render(<SessionExpiryBoundary recovery={recovery}/>);expect(screen.getByRole('alert')).toHaveTextContent('Bitte versuche es erneut');expect(screen.getByRole('button',{name:'Neu anmelden'})).toBeEnabled();});
