import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { sessionRecovery } from '../solidSession';
import { revokeWorkspaceSession } from '../workspaceAccess';
import { getEnabledProviders } from '../config/runtimeConfig';
import { useI18n } from '../i18n';
import './SessionExpiryBoundary.css';
const inactive = { expired: false, busy: false, error: '', issuer: '' };
const emptySubscribe = () => () => {};
const inactiveSnapshot = () => inactive;
const de = {
  'Session expired': 'Sitzung abgelaufen',
  'Your session has expired. Please sign in again.': 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.',
  'After signing in, you will return to this page.': 'Nach der Anmeldung kehrst du zu dieser Seite zurück.',
  'Sign in again': 'Neu anmelden', 'Opening sign-in…': 'Anmeldung wird geöffnet…',
  'Solid login provider': 'Solid-Anbieter', 'Choose your Solid login provider.': 'Wähle deinen Solid-Anbieter.',
  'Sign-in could not be started. Please try again.': 'Die Anmeldung konnte nicht gestartet werden. Bitte versuche es erneut.'
};
export default function SessionExpiryBoundary({ children, onLogin, recovery = sessionRecovery }) {
  const { language } = useI18n();
  const t = value => language === 'de' ? de[value] || value : value;
  const state = useSyncExternalStore(recovery?.subscribe || emptySubscribe, recovery?.getSnapshot || inactiveSnapshot, inactiveSnapshot);
  const dialog = useRef(null), action = useRef(null);
  const [issuer, setIssuer] = useState('');
  useEffect(() => {
    if (!state.expired) return undefined;
    const previous = document.activeElement, overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; action.current?.focus();
    window.__SOLID_DATASPACE_AUTH__?.notify?.();
    return () => { document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus?.(); };
  }, [state.expired]);
  const trapFocus = event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); }
    if (event.key !== 'Tab') return;
    const controls = [...dialog.current.querySelectorAll('button:not(:disabled),select:not(:disabled),input:not(:disabled)')];
    if (!controls.length) { event.preventDefault(); dialog.current.focus(); return; }
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && (document.activeElement === first || !dialog.current.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !dialog.current.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
  };
  return <>
    <div className="session-app-content" inert={state.expired ? true : undefined} aria-hidden={state.expired ? 'true' : undefined}>{children}</div>
    {state.expired && createPortal(<div className="session-expiry-backdrop" onKeyDown={trapFocus}>
      <section className="session-expiry-modal" role="alertdialog" aria-modal="true" aria-labelledby="session-expiry-title" aria-describedby="session-expiry-message" tabIndex={-1} ref={dialog}>
        <div className="session-expiry-icon" aria-hidden="true">↪</div>
        <h2 id="session-expiry-title">{t('Session expired')}</h2>
        <p id="session-expiry-message">{t('Your session has expired. Please sign in again.')}</p>
        <p className="session-expiry-note">{t('After signing in, you will return to this page.')}</p>
        {!state.issuer && <label>{t('Solid login provider')}<input type="url" value={issuer} onChange={event => setIssuer(event.target.value)} list="session-expiry-providers" placeholder="https://solid.example" disabled={state.busy}/><datalist id="session-expiry-providers">{getEnabledProviders().map(provider => <option key={provider.issuer} value={provider.issuer}/>)}</datalist></label>}
        {state.error && <p className="session-expiry-error" role="alert">{t(state.error)}</p>}
        <button type="button" ref={action} disabled={state.busy} onClick={() => recovery.reauthenticate({ revoke: revokeWorkspaceSession, login: onLogin, issuer: state.issuer || issuer })}>{t(state.busy ? 'Opening sign-in…' : 'Sign in again')}</button>
      </section>
    </div>, document.body)}
  </>;
}
