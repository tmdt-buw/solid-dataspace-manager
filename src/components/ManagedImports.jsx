import React, { useEffect, useState, useCallback, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faClock, faPlay, faChevronRight } from '@fortawesome/free-solid-svg-icons';
import session from '../solidSession';
import { useI18n } from '../i18n';
import { getSyncWorkerConfig } from '../config/runtimeConfig';
import { connectionWorkerCall } from '../dataConnectionClient';
import { ConnectionModal } from './DataConnection';
const de = {
  'Wuppertal · UDSP sensors': 'Wuppertal · UDSP-Sensoren',
  'Wuppertal · Bicycle counters': 'Wuppertal · Fahrradzähler',
  'Open-Meteo · Weather and air quality': 'Open-Meteo · Wetter und Luftqualität',
  'BBK / NINA · Warnings': 'BBK / NINA · Warnmeldungen',
  'Sensor.Community · Measurements and GeoJSON': 'Sensor.Community · Messwerte und GeoJSON',
  'PEGELONLINE · Water levels': 'PEGELONLINE · Wasserstände',
  'Umweltbundesamt · Air quality': 'Umweltbundesamt · Luftqualität',
  'DWD · Health alerts': 'DWD · Gesundheitswarnungen',
  'DWD · Daily climate (ZIP → CSV)': 'DWD · Tagesklima (ZIP → CSV)',
  'Scheduled imports': 'Geplante Importe',
  'Existing sources, filenames and histories are retained.': 'Bestehende Quellen, Dateinamen und Historien bleiben erhalten.',
  'Import settings': 'Importeinstellungen',
  'Schedule': 'Zeitplan',
  'Every N minutes': 'Alle N Minuten',
  'Daily': 'Täglich',
  'Minutes': 'Minuten',
  'Time (UTC)': 'Uhrzeit (UTC)',
  'Times use UTC; 10:03 UTC is 12:03 in summer and 11:03 in winter in Germany.': 'Zeiten gelten in UTC; 10:03 UTC entspricht in Deutschland 12:03 Uhr im Sommer und 11:03 Uhr im Winter.',
  'Automatic import': 'Automatischer Import',
  'Save': 'Speichern',
  'Cancel': 'Abbrechen',
  'Close': 'Schließen',
  'Run now': 'Jetzt ausführen',
  'Active': 'Aktiv',
  'Paused': 'Pausiert',
  'Running': 'Läuft',
  'Failed': 'Fehlgeschlagen',
  'Success': 'Erfolgreich',
  'Verification pending': 'Übernahme noch nicht freigegeben',
  'Last successful import': 'Letzter erfolgreicher Import',
  'Next run': 'Nächster Lauf',
  'Waiting for verification': 'Wartet auf Prüfung',
  'Target in Pod': 'Ziel im Pod',
  'Files checked': 'Dateien geprüft',
  'Files updated': 'Dateien aktualisiert',
  'Records added': 'Messwerte ergänzt',
  'Import started.': 'Import gestartet.',
  'Import settings saved.': 'Importeinstellungen gespeichert.',
  'Cannot load scheduled imports.': 'Geplante Importe konnten nicht geladen werden.',
  'Import is paused or another import is running.': 'Der Import ist pausiert oder ein anderer Import läuft.',
  'Import is running. Try again after completion.': 'Der Import läuft. Bitte nach Abschluss erneut versuchen.',
  'Invalid import schedule.': 'Ungültiger Importzeitplan.',
  'Invalid import settings.': 'Ungültige Importeinstellungen.',
  'Import takeover has not been approved.': 'Die Importübernahme wurde noch nicht freigegeben.',
  'Import is not accessible.': 'Kein Zugriff auf diesen Import.',
  'Import settings could not be saved.': 'Importeinstellungen konnten nicht gespeichert werden.',
  'Import failed. Check source, credential and Pod access.': 'Import fehlgeschlagen. Prüfe Quelle, Zugangsdaten und Pod-Zugriff.',
  'Provider preparation failed.': 'Die Quelldaten konnten nicht aufbereitet werden.',
  'Provider returned no resources.': 'Die Quelle hat keine Dateien geliefert.',
  'Existing history is not a JSON record array.': 'Die bestehende Historie hat nicht das erwartete JSON-Format.',
  'Source record has no valid timestamp.': 'Ein Messwert hat keinen gültigen Zeitstempel.',
  'Pod write verification failed.': 'Die gespeicherten Pod-Daten konnten nicht bestätigt werden.',
  'Import credential owner differs.': 'Die Zugangsdaten gehören nicht zum vorgesehenen Pod.',
  'Pod resource changed concurrently; import stopped.': 'Die Pod-Datei wurde gleichzeitig geändert; der Import wurde gestoppt.'
};
export default function ManagedImports({
  webId
}) {
  const {
    language
  } = useI18n();
  const currentWebId = useRef(webId);
  currentWebId.current = webId;
  const t = value => {
    if (language !== 'de') return value;
    const match = /^(Source returned|Pod read returned|Pod write returned|Pod container creation returned) HTTP (\d+)\.$/.exec(value || '');
    if (match) return `${{
      'Source returned': 'Quelle meldet',
      'Pod read returned': 'Lesen im Pod meldet',
      'Pod write returned': 'Schreiben im Pod meldet',
      'Pod container creation returned': 'Ordneranlage im Pod meldet'
    }[match[1]]} HTTP ${match[2]}.`;
    return de[value] || value;
  };
  const [rows, setRows] = useState([]),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [editing, setEditing] = useState(null),
    [busy, setBusy] = useState(false);
  const reload = useCallback(async signal => {
    const config = getSyncWorkerConfig();
    if (!config.enabled) return;
    const url = new URL(config.apiUrl.replace(/\/+$/, '') + '/participants/imports', window.location.origin);
    url.searchParams.set('webId', webId);
    const r = await session.fetch(url.href, {
      signal
    });
    if (r.status === 404) return;
    if (!r.ok) throw Error('Cannot load scheduled imports.');
    const result = await r.json();
    if (!signal?.aborted && currentWebId.current === webId) setRows(result.imports || []);
  }, [webId]);
  useEffect(() => {
    setRows([]);
    setEditing(null);
    setError('');
    setBusy(false);
    setNotice('');
    const controller = new AbortController();
    const refresh = () => reload(controller.signal).catch(e => {
      if (!controller.signal.aborted) setError(e.message);
    });
    refresh();
    const timer = setInterval(refresh, 15000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [reload]);
  const action = async (id, action, changes) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await connectionWorkerCall(webId, session.fetch, 'imports', {
        id,
        action,
        changes
      });
      if (currentWebId.current !== webId) return;
      setEditing(null);
      setNotice(action === 'run' ? 'Import started.' : 'Import settings saved.');
      await reload();
    } catch (e) {
      if (currentWebId.current === webId) setError(e.message);
    } finally {
      if (currentWebId.current === webId) setBusy(false);
    }
  };
  const date = value => value ? new Date(value).toLocaleString(language === 'de' ? 'de-DE' : 'en-GB') : t('Waiting for verification');
  const schedule = row => row.schedule.kind === 'daily' ? `${t('Daily')} · ${row.schedule.at} UTC` : `${row.schedule.seconds / 60} ${t('Minutes')}`;
  if (!rows.length && !error) return null;
  return <section className="dc-imports" aria-label={t('Scheduled imports')}>
    <h2>{t('Scheduled imports')}</h2><p className="dc-note">{t('Existing sources, filenames and histories are retained.')}</p>
    {error && <div className="dc-alert dc-alert--error" role="alert">{t(error)}</div>}{notice && <div className="dc-alert" role="status">{t(notice)}</div>}
    <div className="dc-list">{rows.map(row => <article className="dc-card" key={row.id}>
      <button className="dc-card-main" onClick={() => setEditing({
          ...row,
          schedule: {
            ...row.schedule
          }
        })}>
        <span className="dc-source-icon"><FontAwesomeIcon icon={faClock} /></span>
        <span className="dc-card-copy"><strong>{t(row.name)}</strong><span>{schedule(row)}</span><small>{t('Last successful import')}: {date(row.state.lastSuccessAt)}</small>{row.enabled && <small>{t('Next run')}: {date(row.state.nextRunAt)}</small>}{row.state.lastError && <small className="dc-import-error">{t(row.state.lastError)}</small>}</span>
        <span className="dc-card-meta"><span className={`dc-pill ${!row.enabled ? 'dc-pill--paused' : ''}`}>{t(row.state.status === 'running' ? 'Running' : !row.activated ? 'Verification pending' : !row.enabled ? 'Paused' : row.state.status === 'failed' ? 'Failed' : row.state.status === 'success' ? 'Success' : 'Active')}</span>{row.state.result && <small>{t('Files checked')}: {row.state.result.files} · {t('Records added')}: {row.state.result.added}</small>}</span><FontAwesomeIcon icon={faChevronRight} />
      </button><button className="dc-icon" disabled={busy || !row.enabled || !row.activated || rows.some(r => r.state.status === 'running')} aria-label={`${t('Run now')}: ${t(row.name)}`} onClick={() => action(row.id, 'run')}><FontAwesomeIcon icon={faPlay} /></button>
    </article>)}</div>
    {editing && <ConnectionModal title={t('Import settings')} t={t} busy={busy} onClose={() => setEditing(null)}><form onSubmit={e => {
        e.preventDefault();
        action(editing.id, 'update', {
          enabled: editing.enabled,
          schedule: editing.schedule
        });
      }}><div className="dc-modal-body"><h3>{t(editing.name)}</h3><p className="dc-import-target"><strong>{t('Target in Pod')}</strong><br />{editing.targetBase}</p><fieldset disabled={busy}><legend>{t('Schedule')}</legend><label>{t('Schedule')}<select value={editing.schedule.kind} onChange={e => setEditing({
                ...editing,
                schedule: e.target.value === 'daily' ? {
                  kind: 'daily',
                  at: '10:03'
                } : {
                  kind: 'interval',
                  seconds: 3600
                }
              })}><option value="interval">{t('Every N minutes')}</option><option value="daily">{t('Daily')}</option></select></label>{editing.schedule.kind === 'daily' ? <label>{t('Time (UTC)')}<input type="time" required value={editing.schedule.at} onChange={e => setEditing({
                ...editing,
                schedule: {
                  kind: 'daily',
                  at: e.target.value
                }
              })} /></label> : <label>{t('Minutes')}<input type="number" min="10" max="10080" required value={editing.schedule.seconds / 60} onChange={e => setEditing({
                ...editing,
                schedule: {
                  kind: 'interval',
                  seconds: Number(e.target.value) * 60
                }
              })} /></label>}<p className="dc-note">{t('Times use UTC; 10:03 UTC is 12:03 in summer and 11:03 in winter in Germany.')}</p><label className="dc-check"><input type="checkbox" checked={editing.enabled} disabled={!editing.activated} onChange={e => setEditing({
                ...editing,
                enabled: e.target.checked
              })} />{t('Automatic import')}</label></fieldset>{error && <div className="dc-alert dc-alert--error" role="alert">{t(error)}</div>}</div><footer><button type="button" className="dc-button" disabled={busy} onClick={() => setEditing(null)}>{t('Cancel')}</button><button className="dc-button dc-button--primary" disabled={busy} type="submit">{t('Save')}</button></footer></form></ConnectionModal>}
  </section>;
}
