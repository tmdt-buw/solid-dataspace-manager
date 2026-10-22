import { v4 as uuidv4 } from 'uuid';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faClock, faPlay, faChevronRight, faPlus, faTrashCan, faFlask } from '@fortawesome/free-solid-svg-icons';
import session from '../solidSession';
import { useI18n } from '../i18n';
import { getSyncWorkerConfig } from '../config/runtimeConfig';
import { connectionWorkerCall } from '../dataConnectionClient';
import { ConnectionModal } from './DataConnection';
const de = {
  "Wuppertal - Weather and water stations": "Wuppertal - Wetter- und Gewässerstationen",
  "Station": "Station",
  "Historical retrieval (days)": "Nachladen der Historie (Tage)",
  "Observation history": "Messwerthistorie",
  "Timestamp field (JSON Pointer)": "Zeitstempelfeld (JSON Pointer)",
  "Identity fields (JSON Pointers)": "Identifikationsfelder (JSON Pointer)",
  "Timezone for timestamps without an offset": "Zeitzone für Zeitstempel ohne Zeitversatz",
  "Retrieve consecutive time windows": "Aufeinanderfolgende Zeitfenster abrufen",
  "Initial history (hours)": "Historie beim ersten Lauf (Stunden)",
  "Maximum time window (hours)": "Maximales Zeitfenster (Stunden)",
  "Overlap (minutes)": "Überschneidung (Minuten)",
  "Historical retrieval interval (minutes)": "Intervall zum Nachladen (Minuten)",
  "Data must be a JSON record array. Timestamp and identity fields determine duplicates, including late measurements.": "Die Antwort muss ein JSON-Array mit Messwerten sein. Zeitstempel und Identifikationsfelder bestimmen Duplikate, auch bei verspäteten Messwerten.",
  "Use {from}, {to} and optionally {now} in the URL path or query. Values are UTC timestamps.": "Verwende {from}, {to} und optional {now} im URL-Pfad oder in Abfrageparametern. Die Werte sind UTC-Zeitstempel.",
  "For example /stationId, /sensorId. Leave empty only when each timestamp identifies one record.": "Zum Beispiel /stationId, /sensorId. Nur leer lassen, wenn jeder Zeitstempel genau einen Messwert bezeichnet.",
  "Observation history uses a separate .observations.json index and daily files. Existing files remain unchanged.": "Die Messwerthistorie nutzt einen eigenen .observations.json-Index und Tagesdateien. Bestehende Dateien bleiben erhalten.",
  "Time window": "Zeitfenster",
  "Invalid observation settings.": "Ungültige Einstellungen für die Messwerthistorie.",
  "Observation timestamp is invalid or ambiguous.": "Ein Messzeitpunkt ist ungültig oder wegen der Zeitumstellung mehrdeutig.",
  "Observation identifier is missing.": "Ein Identifikationsfeld fehlt im Messwert.",
  "Observation response must be an array of records.": "Die Antwort muss ein JSON-Array mit Messwerten sein.",
  "Observation history has a different configuration. Use a separate target.": "Die bestehende Messwerthistorie verwendet eine andere Konfiguration. Verwende ein eigenes Ziel.",
  "Observation history is invalid; existing data was left unchanged.": "Die bestehende Messwerthistorie ist ungültig. Vorhandene Daten wurden unverändert gelassen.",
  "Observation history changed concurrently; retry the import.": "Die Messwerthistorie wurde gleichzeitig geändert. Wiederhole den Abruf.",
  "Time placeholders are only allowed in URL paths and query parameters.": "Zeitplatzhalter sind nur im URL-Pfad und in Abfrageparametern erlaubt.",
  "Incremental retrieval requires a {from} placeholder.": "Der fortlaufende Abruf benötigt einen {from}-Platzhalter.",
  "Wuppertal - Climate station": "Wuppertal - Klimastation",
  "Current readings come from Cismet. Historical readings are retrieved from Heidelberg using the source API key.": "Aktuelle Messwerte kommen von Cismet. Historische Messwerte werden mit dem API-Schlüssel der Quelle aus Heidelberg nachgeladen.",
  "Cismet is unavailable; historical readings were retained.": "Cismet ist nicht erreichbar. Historische Messwerte wurden übernommen.",
  "Historical retrieval is pending; current readings were saved. The checkpoint was not advanced.": "Das Nachladen steht aus. Aktuelle Messwerte wurden gespeichert; der Nachladefortschritt wurde beibehalten.",
  "Invalid climate station response.": "Die Klimastation hat eine unerwartete Antwort geliefert.",
  "Climate sources are unavailable. Existing data was retained.": "Die Klimaquellen sind nicht erreichbar. Bestehende Daten wurden erhalten.",
  "Historical retrieval pending": "Historische Messwerte werden nachgeladen",

  'Wuppertal - UDSP sensors': 'Wuppertal - UDSP-Sensoren',
  'Wuppertal - AQ Mesh air stations': 'Wuppertal - AQ-Mesh-Luftstationen',
  'Station entity ID': 'Stations-ID',
  'AQ Mesh retains complete station snapshots with the original measurement timestamps and units. Repeated identical snapshots are skipped.': 'AQ Mesh speichert vollständige Stationsdaten mit den originalen Messzeitpunkten und Einheiten. Identische Wiederholungen werden übersprungen.',
  'Invalid AQ Mesh response. Existing data was retained.': 'AQ Mesh hat eine ungültige Antwort geliefert. Bestehende Daten wurden erhalten.',
  'AQ Mesh has no valid observation timestamp. Existing data was retained.': 'AQ Mesh liefert keinen gültigen Messzeitpunkt. Bestehende Daten wurden erhalten.',
  'AQ Mesh source is unavailable. Existing data was retained.': 'Die AQ-Mesh-Quelle ist nicht erreichbar. Bestehende Daten wurden erhalten.',
  'AQ Mesh TLS connection failed. Existing data was retained.': 'Die verschlüsselte Verbindung zur AQ-Mesh-Quelle ist fehlgeschlagen. Bestehende Daten wurden erhalten.',
  'Wuppertal - Bicycle counters': 'Wuppertal - Fahrradzähler',
  'Open-Meteo - Weather and air quality': 'Open-Meteo - Wetter und Luftqualität',
  'BBK / NINA - Warnings': 'BBK / NINA - Warnmeldungen',
  'Sensor.Community - Measurements and GeoJSON': 'Sensor.Community - Messwerte und GeoJSON',
  'PEGELONLINE - Water levels': 'PEGELONLINE - Wasserstände',
  'Umweltbundesamt - Air quality': 'Umweltbundesamt - Luftqualität',
  'DWD - Health alerts': 'DWD - Gesundheitswarnungen',
  'DWD - Daily climate (ZIP → CSV)': 'DWD - Tagesklima (ZIP → CSV)',
  'Import template': 'Importvorlage',
  'New connection': 'Neue Verbindung',
  'Edit connection': 'Verbindung bearbeiten',
  'Create connection': 'Verbindung anlegen',
  'Save connection': 'Verbindung speichern',
  'History storage': 'Speicherung der Historie',
  'Gzip with existing JSON links retained': 'Gzip mit weiterhin aktuellen JSON-Links',
  'Existing JSON links remain current. Gzip stores the same complete history.': 'Bestehende JSON-Links bleiben aktuell. Gzip speichert dieselbe vollständige Historie.',
  'Compressed history is invalid. Existing data was retained.': 'Die komprimierte Historie ist ungültig. Bestehende Daten wurden erhalten.',
  'Compressed history differs from the original. Existing data was retained.': 'Die komprimierte Historie weicht vom Original ab. Bestehende Daten wurden erhalten.',
  'History access rules could not be preserved. Existing data was retained.': 'Die Zugriffsrechte konnten nicht sicher übernommen werden. Bestehende Daten wurden erhalten.',
  'Gzip history cannot be disabled while existing readers use it.': 'Gzip kann nicht deaktiviert werden, solange bestehende Leser es verwenden.',
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
  'Your session has expired. Please sign in again.': 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.',
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
Object.assign(de, {
  'Add import': 'Import anlegen',
  'New import': 'Neuer Import',
  'Name': 'Name',
  'Template': 'Vorlage',
  'Source settings': 'Quelleneinstellungen',
  'Pod and access': 'Pod und Zugang',
  'Pod owner (WebID)': 'Pod-Besitzer (WebID)',
  'Target folder in Pod': 'Zielordner im Pod',
  'Saved Pod access': 'Gespeicherter Pod-Zugang',
  'Enter credentials': 'Zugangsdaten eingeben',
  'Solid login provider': 'Solid-Anmeldeanbieter',
  'Client ID': 'Client-ID',
  'Client secret': 'Client-Schlüssel',
  'Source API key': 'API-Schlüssel der Quelle',
  'Counter name': 'Name der Messstelle',
  'Counter ID': 'Kennung der Messstelle',
  'Add counter': 'Messstelle hinzufügen',
  'Remove counter': 'Messstelle entfernen',
  'Test and preview': 'Testen und Vorschau',
  'Testing source and Pod access…': 'Quelle und Pod-Zugriff werden geprüft…',
  'Preview successful': 'Prüfung erfolgreich',
  'Files': 'Dateien',
  'Incoming records': 'Gelieferte Messwerte',
  'New records': 'Neue Messwerte',
  'Data preview': 'Datenvorschau',
  'Create import': 'Import anlegen',
  'Source URL': 'Quell-URL',
  'Tenant': 'Mandant',
  'Latitude': 'Breitengrad',
  'Longitude': 'Längengrad',
  'Location name in filenames': 'Ortsname in Dateinamen',
  'Region code (ARS)': 'Regionalschlüssel (ARS)',
  'Radius in kilometres': 'Umkreis in Kilometern',
  'Maximum stations': 'Maximale Anzahl an Stationen',
  'City': 'Stadt',
  'Counters': 'Messstellen',
  'The preview reads data without writing to your Pod.': 'Die Vorschau liest Daten, ohne in deinen Pod zu schreiben.',
  'Owner, template and target folder stay fixed to preserve existing addresses and histories.': 'Besitzer, Vorlage und Zielordner bleiben fest, damit bestehende Adressen und Historien erhalten bleiben.',
  'Leave empty to keep the saved credential.': 'Leer lassen, um den gespeicherten Zugang beizubehalten.',
  'Secrets are stored encrypted and are never displayed again.': 'Schlüssel werden verschlüsselt gespeichert und anschließend nicht mehr angezeigt.',
  'Use a separate folder for each new import. Existing files are not moved or deleted.': 'Verwende für jeden neuen Import einen eigenen Ordner. Bestehende Dateien werden weder verschoben noch gelöscht.',
  'No catalog entry is created automatically. You can register the stored files in the Semantic Data Catalog.': 'Es wird kein Katalogeintrag automatisch angelegt. Du kannst die gespeicherten Dateien im Semantic Data Catalog registrieren.',
  'Test the changed source or access settings before saving.': 'Prüfe die geänderte Quelle oder die Zugangsdaten vor dem Speichern.',
  'Import created.': 'Import angelegt.',
  'Invalid source settings.': 'Ungültige Quelleneinstellungen.',
  'Select between 1 and 25 counters.': 'Wähle zwischen 1 und 25 Messstellen.',
  'Invalid or duplicate counter.': 'Ungültige oder doppelte Messstelle.',
  'Source URL must use the supported provider without credentials.': 'Die Quell-URL muss zum unterstützten Anbieter gehören und darf keine Zugangsdaten enthalten.',
  'Unsupported Solid login provider.': 'Dieser Solid-Anmeldeanbieter ist nicht freigegeben.',
  'Enter the Solid client ID and client secret.': 'Gib die Solid-Client-ID und den zugehörigen Schlüssel ein.',
  'Enter the source API key.': 'Gib den API-Schlüssel der Quelle ein.',
  'Existing owner, template and target folder must be preserved.': 'Besitzer, Vorlage und Zielordner eines bestehenden Imports müssen erhalten bleiben.',
  'Existing counter filenames must be preserved.': 'Die Dateinamen bestehender Messstellen müssen erhalten bleiben.',
  'Existing output names must be preserved. Create a separate import for a new location.': 'Bestehende Dateinamen müssen erhalten bleiben. Lege für einen neuen Standort einen eigenen Import an.',
  'Choose a separate target folder for this import.': 'Wähle für diesen Import einen eigenen Zielordner.',
  'Target folder must be empty for a new import.': 'Der Zielordner muss bei einem neuen Import leer sein.',
  'Pod access must allow reading and writing.': 'Der Pod-Zugang muss Lesen und Schreiben erlauben.',
  'Preview expired. Test the import again.': 'Die Prüfung ist abgelaufen. Prüfe den Import erneut.',
  'Import changed since the preview. Open it again.': 'Der Import wurde seit der Prüfung geändert. Öffne ihn erneut.',
  'A preview is already running. Please wait.': 'Eine Prüfung läuft bereits. Bitte warte kurz.',
  'Too many previews. Please try again shortly.': 'Momentan laufen zu viele Prüfungen. Versuche es gleich erneut.',
  'Import target is outside its Pod namespace.': 'Das Ziel liegt außerhalb des erlaubten Pod-Bereichs.',
  'Invalid import owner.': 'Ungültiger Pod-Besitzer.',
  'Invalid import target.': 'Ungültiger Zielordner.',
  'Invalid import name.': 'Ungültiger Importname.',
  'Invalid import action.': 'Ungültige Importaktion.',
  'Preview failed. Check the source, credentials and Pod access.': 'Die Prüfung ist fehlgeschlagen. Prüfe Quelle, Zugangsdaten und Pod-Zugriff.',
  'Append new records': 'Neue Messwerte anhängen',
  'Update file': 'Datei aktualisieren',
  'Create file': 'Datei anlegen'
});
export default function ManagedImports({
  webId,
  children
}) {
  const {
      language
    } = useI18n(),
    currentWebId = useRef(webId);
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
    [loading, setLoading] = useState(true),
    [metadata, setMetadata] = useState({
      templates: [],
      issuers: [],
      namespace: ''
    }),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [editing, setEditing] = useState(null),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState(null);
  const hasEditor = Boolean(editing);
  const editingRef = useRef(editing);
  editingRef.current = editing;
  const endpoint = useCallback(extra => {
    const url = new URL(getSyncWorkerConfig().apiUrl.replace(/\/+$/, '') + '/participants/imports', window.location.origin);
    url.searchParams.set('webId', webId);
    for (const [key, value] of Object.entries(extra || {})) url.searchParams.set(key, value);
    return url.href;
  }, [webId]);
  const reload = useCallback(async signal => {
    if (!getSyncWorkerConfig().enabled) return;
    const r = await session.fetch(endpoint(), {
      signal
    });
    if (r.status === 404) return;
    if (!r.ok) throw Error('Cannot load scheduled imports.');
    const result = await r.json();
    if (!signal?.aborted && currentWebId.current === webId) {
      setError('');
      setRows(result.imports || []);
      setMetadata({
        templates: result.templates || [],
        issuers: result.issuers || [],
        namespace: result.namespace || '',
        canChooseOwner: result.canChooseOwner === true
      });
    }
  }, [endpoint, webId]);
  useEffect(() => {
    setRows([]);
    setEditing(null);
    setPreview(null);
    setError('');
    setNotice('');
    setBusy(false);
    setMetadata({
      templates: [],
      issuers: [],
      namespace: ''
    });
    setLoading(true);
    const controller = new AbortController(),
      refresh = () => reload(controller.signal).catch(e => {
        if (!controller.signal.aborted) setError(e.message);
      }).finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    refresh();
    const timer = setInterval(refresh, 15000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [reload]);
  useEffect(() => {
    if (!hasEditor || preview?.status !== 'running') return;
    const controller = new AbortController();
    let timer;
    const poll = async () => {
      try {
        const r = await session.fetch(endpoint({
          preview: preview.id
        }), {
          signal: controller.signal
        });
        const data = await r.json();
        if (!r.ok) throw Error(data.error || 'Cannot load scheduled imports.');
        if (controller.signal.aborted || currentWebId.current !== webId) return;
        setPreview(data.preview);
        if (data.preview.status === 'failed') setError(data.preview.error);
        if (data.preview.status === 'running') timer = setTimeout(poll, 1200);
      } catch (e) {
        if (!controller.signal.aborted) {
          setError(e.message);
          setPreview(null);
        }
      }
    };
    poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [preview?.id, preview?.status, hasEditor, endpoint, webId]);
  const template = metadata.templates.find(v => v.id === editing?.provider);
  const defaults = id => Object.fromEntries((metadata.templates.find(p => p.id === id)?.fields || []).map(f => [f.key, JSON.parse(JSON.stringify(f.default))]));
  const target = (owner, token) => {
    try {
      const u = new URL(owner),
        at = u.pathname.indexOf('/profile/');
      if (at < 0) return '';
      return u.origin + u.pathname.slice(0, at) + '/connections/' + (metadata.namespace ? metadata.namespace + '/' : '') + 'imports/' + token + '/';
    } catch {
      return '';
    }
  };
  const open = row => {
    const token = uuidv4(),
      provider = row?.provider || metadata.templates[0]?.id;
    const reference = !row && rows.find(r => r.provider === provider && (r.ownerWebId === webId || metadata.canChooseOwner));
    const owner = row?.ownerWebId || reference?.ownerWebId || webId;
    setEditing({
      id: row?.id,
      token,
      name: row?.name || t(metadata.templates.find(p => p.id === provider)?.name || ''),
      provider,
      ownerWebId: owner,
      targetBase: row?.targetBase || target(owner, token),
      source: row?.source || defaults(provider),
      enabled: row ? row.enabled : true,
      schedule: row?.schedule || metadata.templates.find(p => p.id === provider)?.defaultSchedule || {
        kind: 'interval',
        seconds: 3600
      },
      credentials: {
        issuer: metadata.issuers[0] || '',
        clientId: '',
        clientSecret: '',
        sourceSecret: ''
      },
      credentialImportId: reference?.id || '',
      original: row || null
    });
    setPreview(null);
    setError('');
    setNotice('');
  };
  const update = changes => {
    setEditing(v => ({
      ...v,
      ...changes
    }));
    setPreview(null);
    setError('');
  };
  const source = (key, value) => update({
    source: {
      ...editing.source,
      [key]: value
    }
  });
  const credential = (key, value) => update({
    credentials: {
      ...editing.credentials,
      [key]: value
    }
  });
  const close = () => {
    if (preview?.status === 'running') connectionWorkerCall(webId, session.fetch, 'imports', {
      action: 'cancel-preview',
      previewId: preview.id
    }).catch(() => {});
    setEditing(null);
    setPreview(null);
    setError('');
  };
  const fullChange = Boolean(editing && (!editing.id || editing.original.activated === false || editing.name !== editing.original.name || JSON.stringify(editing.source) !== JSON.stringify(editing.original.source || defaults(editing.provider)) || editing.credentialImportId || ['clientId', 'clientSecret', 'sourceSecret'].some(k => editing.credentials[k]) || (editing.credentials.issuer && editing.credentials.issuer !== metadata.issuers[0])));
  const action = async (payload, success) => {
    const identity = webId;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await connectionWorkerCall(webId, session.fetch, 'imports', payload);
      if (currentWebId.current !== identity) return null;
      setNotice(success || '');
      return result;
    } catch (e) {
      if (currentWebId.current === identity) setError(e.message);
      return null;
    } finally {
      if (currentWebId.current === identity) setBusy(false);
    }
  };
  const test = async () => {
    const draft = {
      name: editing.name,
      provider: editing.provider,
      ownerWebId: editing.ownerWebId,
      targetBase: editing.targetBase,
      source: editing.source,
      enabled: editing.enabled,
      schedule: editing.schedule,
      credentialImportId: editing.credentialImportId || undefined,
      credentials: editing.id || editing.credentialImportId ? Object.fromEntries(Object.entries(editing.credentials).filter(([k, v]) => v && k !== 'issuer')) : editing.credentials
    };
    const result = await action({
      action: 'preview',
      id: editing.id,
      draft
    });
    if (result && editingRef.current) setPreview(result.preview);
  };
  const save = async event => {
    event.preventDefault();
    const payload = fullChange ? {
      action: 'save',
      previewId: preview?.id
    } : {
      id: editing.id,
      action: 'update',
      changes: {
        enabled: editing.enabled,
        schedule: editing.schedule
      }
    };
    const result = await action(payload, editing.id ? 'Import settings saved.' : 'Import created.');
    if (result) {
      setEditing(null);
      setPreview(null);
      await reload().catch(e => setError(e.message));
    }
  };
  const date = value => value ? new Date(value).toLocaleString(language === 'de' ? 'de-DE' : 'en-GB') : t('Waiting for verification');
  const schedule = row => row.schedule.kind === 'daily' ? `${t('Daily')}, ${row.schedule.at} UTC` : `${row.schedule.seconds / 60} ${t('Minutes')}`;
  const testing = preview?.status === 'running';
  const renderCard = row => <article className="dc-card dc-import-card" key={'import:' + row.id}><button className="dc-card-main" onClick={() => open(row)}><span className="dc-source-icon"><FontAwesomeIcon icon={faClock} /></span><span className="dc-card-copy"><strong>{t(row.name)}</strong><span className="dc-badges"><em>{t('Import template')}</em></span><span>{schedule(row)}</span><small>{t('Last successful import')}: {date(row.state.lastSuccessAt)}</small>{row.enabled && <small>{t('Next run')}: {date(row.state.nextRunAt)}</small>}{row.state.result?.warnings?.map(warning => <small className="dc-import-error" key={warning}>{t(warning)}</small>)}{row.state.result?.observation?.backfillPending && <small>{t('Historical retrieval pending')}</small>}{row.state.lastError && <small className="dc-import-error">{t(row.state.lastError)}</small>}</span><span className="dc-card-meta"><span className={`dc-pill ${!row.enabled ? 'dc-pill--paused' : ''}`}>{t(row.state.status === 'running' ? 'Running' : !row.activated ? 'Verification pending' : !row.enabled ? 'Paused' : row.state.status === 'failed' ? 'Failed' : row.state.status === 'success' ? 'Success' : 'Active')}</span>{row.state.result && <small>{t('Files checked')}: {row.state.result.files}, {t('Records added')}: {row.state.result.added}</small>}</span><FontAwesomeIcon icon={faChevronRight} /></button><button className="dc-icon" disabled={busy || !row.enabled || !row.activated || rows.some(r => r.state.status === 'running')} aria-label={`${t('Run now')}: ${t(row.name)}`} onClick={async () => {
          if (await action({
            id: row.id,
            action: 'run'
          }, 'Import started.')) await reload().catch(e => setError(e.message));
        }}><FontAwesomeIcon icon={faPlay} /></button></article>;
  return <>
    {children?.({ rows, loading, busy, available: metadata.templates.length > 0, open, reload, renderCard, name: row => t(row.name), error: editing ? '' : t(error), notice: t(notice) })}
    {editing && <ConnectionModal title={t(editing.id ? 'Edit connection' : 'New connection')} t={t} busy={busy} onClose={close}><form className="dc-editor" onSubmit={save}>
      <div className="dc-modal-body dc-import-editor">
        {editing.provider === 'wuppertal-climate' && <p className="dc-note">{t('Current readings come from Cismet. Historical readings are retrieved from Heidelberg using the source API key.')}</p>}
        {editing.provider === 'udsp-aq-mesh' && <p className="dc-note">{t('AQ Mesh retains complete station snapshots with the original measurement timestamps and units. Repeated identical snapshots are skipped.')}</p>}
        <fieldset disabled={busy || testing}><legend>{t('Source settings')}</legend>
          <label>{t('Name')}<input required maxLength={100} value={editing.name} onChange={e => update({
                name: e.target.value
              })} /></label>
          {metadata.templates.length > 0 && <label>{t('Template')}<select aria-label={t('Template')} disabled={Boolean(editing.id)} value={editing.provider} onChange={e => {
                const provider = e.target.value,
                  reference = rows.find(r => r.provider === provider && r.ownerWebId === editing.ownerWebId);
                update({
                  credentialImportId: editing.credentialImportId && reference ? reference.id : editing.credentialImportId,
                  credentials: {
                    ...editing.credentials,
                    sourceSecret: ''
                  },
                  provider,
                  source: defaults(provider),
                  name: t(metadata.templates.find(p => p.id === provider).name),
                  schedule: metadata.templates.find(p => p.id === provider).defaultSchedule || {
                    kind: 'interval',
                    seconds: 3600
                  }
                });
              }}>{metadata.templates.map(p => <option key={p.id} value={p.id}>{t(p.name)}</option>)}</select></label>}
          {(template?.fields || []).map(f => f.type === 'select' ? <label key={f.key}>{t(f.label)}<select aria-label={t(f.label)} value={editing.source[f.key] ?? f.default} onChange={e => source(f.key, e.target.value)}>{f.options.map(option => <option key={option.value} value={option.value} disabled={f.key === 'historyCompression' && editing.original?.source?.historyCompression === 'gzip' && option.value !== 'gzip'}>{t(option.label)}</option>)}</select></label> : f.type === 'devices' ? <div key={f.key} className="dc-counter-list"><span>{t(f.label)}</span>{editing.source.devices.map((device, i) => <div className="dc-counter" key={i}><label>{t('Counter name')}<input required value={device.name} maxLength={80} disabled={Boolean(editing.original?.source?.devices?.some(d => d.id === device.id))} onChange={e => source('devices', editing.source.devices.map((d, n) => n === i ? {
                    ...d,
                    name: e.target.value
                  } : d))} /></label><label>{t('Counter ID')}<input required value={device.id} disabled={Boolean(editing.original?.source?.devices?.some(d => d.id === device.id))} onChange={e => source('devices', editing.source.devices.map((d, n) => n === i ? {
                    ...d,
                    id: e.target.value
                  } : d))} /></label><button type="button" className="dc-icon" aria-label={`${t('Remove counter')}: ${device.name || i + 1}`} onClick={() => source('devices', editing.source.devices.filter((_, n) => i !== n))}><FontAwesomeIcon icon={faTrashCan} /></button></div>)}<button type="button" className="dc-button" disabled={editing.source.devices.length >= 25} onClick={() => source('devices', [...editing.source.devices, {
                name: '',
                id: ''
              }])}><FontAwesomeIcon icon={faPlus} />{t('Add counter')}</button></div> : <label key={f.key}>{t(f.label)}<input type={f.type === 'number' ? 'number' : f.key === 'sourceUrl' ? 'url' : 'text'} required min={f.min} max={f.max} step={f.key === 'maxStations' ? '1' : 'any'} pattern={f.pattern} disabled={Boolean(editing.id && f.stable)} value={editing.source[f.key] ?? ''} onChange={e => source(f.key, f.type === 'number' ? e.target.value === '' ? '' : Number(e.target.value) : e.target.value)} /></label>)}
          {editing.source.historyCompression === 'gzip' && <p className="dc-note">{t('Existing JSON links remain current. Gzip stores the same complete history.')}</p>}
        </fieldset>
        <fieldset disabled={busy || testing}><legend>{t('Pod and access')}</legend>
          {!editing.id && <label>{t('Saved Pod access')}<select aria-label={t('Saved Pod access')} value={editing.credentialImportId} onChange={e => {
                const id = e.target.value,
                  reference = rows.find(r => r.id === id),
                  owner = reference?.ownerWebId || webId;
                update({
                  credentialImportId: id,
                  ownerWebId: owner,
                  targetBase: target(owner, editing.token)
                });
              }}><option value="">{t('Enter credentials')}</option>{rows.map(r => <option key={r.id} value={r.id}>{t(r.name)}</option>)}</select></label>}
          <label>{t('Pod owner (WebID)')}<input type="url" required value={editing.ownerWebId || webId} disabled={Boolean(editing.id || editing.credentialImportId || !metadata.canChooseOwner)} onChange={e => update({
                ownerWebId: e.target.value,
                targetBase: target(e.target.value, editing.token)
              })} /></label>
          <label>{t('Target folder in Pod')}<input type="url" required disabled={Boolean(editing.id)} value={editing.targetBase} onChange={e => update({
                targetBase: e.target.value
              })} /></label>
          <p className="dc-note">{t(editing.id ? 'Owner, template and target folder stay fixed to preserve existing addresses and histories.' : 'Use a separate folder for each new import. Existing files are not moved or deleted.')}</p>
          {!editing.id && !editing.credentialImportId && <label>{t('Solid login provider')}<select aria-label={t('Solid login provider')} required value={editing.credentials.issuer} onChange={e => credential('issuer', e.target.value)}><option value="" disabled>{t('Solid login provider')}</option>{metadata.issuers.map(issuer => <option key={issuer}>{issuer}</option>)}</select></label>}
          <div className="dc-two"><label>{t('Client ID')}<input autoComplete="off" value={editing.credentials.clientId} required={!editing.id && !editing.credentialImportId} onChange={e => credential('clientId', e.target.value)} /></label><label>{t('Client secret')}<input type="password" autoComplete="new-password" value={editing.credentials.clientSecret} required={!editing.id && !editing.credentialImportId} onChange={e => credential('clientSecret', e.target.value)} /></label></div>
          {template?.requiresSourceSecret && <label>{t('Source API key')}<input type="password" autoComplete="new-password" value={editing.credentials.sourceSecret} required={!editing.id && !rows.some(r => r.id === editing.credentialImportId && r.provider === editing.provider)} onChange={e => credential('sourceSecret', e.target.value)} /></label>}
          {(editing.id || editing.credentialImportId) && <p className="dc-note">{t('Leave empty to keep the saved credential.')}</p>}<p className="dc-note">{t('Secrets are stored encrypted and are never displayed again.')}</p>
        </fieldset>
        <fieldset disabled={busy || testing}><legend>{t('Schedule')}</legend><label>{t('Schedule')}<select aria-label={t('Schedule')} value={editing.schedule.kind} onChange={e => update({
                schedule: e.target.value === 'daily' ? {
                  kind: 'daily',
                  at: '10:03'
                } : {
                  kind: 'interval',
                  seconds: 3600
                }
              })}><option value="interval">{t('Every N minutes')}</option><option value="daily">{t('Daily')}</option></select></label>{editing.schedule.kind === 'daily' ? <label>{t('Time (UTC)')}<input type="time" required value={editing.schedule.at} onChange={e => update({
                schedule: {
                  kind: 'daily',
                  at: e.target.value
                }
              })} /></label> : <label>{t('Minutes')}<input type="number" min="10" max="10080" required value={editing.schedule.seconds / 60} onChange={e => update({
                schedule: {
                  kind: 'interval',
                  seconds: Number(e.target.value) * 60
                }
              })} /></label>}<p className="dc-note">{t('Times use UTC; 10:03 UTC is 12:03 in summer and 11:03 in winter in Germany.')}</p><label className="dc-check"><input type="checkbox" checked={editing.enabled} onChange={e => update({
                enabled: e.target.checked
              })} />{t('Automatic import')}</label></fieldset>
        <div className="dc-import-preview"><p className="dc-note">{t('The preview reads data without writing to your Pod.')}</p><button type="button" className="dc-button" disabled={busy || testing || !metadata.templates.length} onClick={e => {
              if (e.currentTarget.form.reportValidity()) test();
            }}><FontAwesomeIcon icon={faFlask} />{t(testing ? 'Testing source and Pod access…' : 'Test and preview')}</button>
          {testing && <p role="status">{t('Testing source and Pod access…')}</p>}
          {preview?.status === 'success' && <div className="dc-import-preview-result" role="status"><strong>{t('Preview successful')}</strong><p>{t('Files')}: {preview.result.files}</p><ul>{preview.result.resources.map(resource => <li key={resource.path}><strong>{resource.compressedPath || resource.path}</strong><span>{t(resource.mode === 'append' ? 'Append new records' : resource.exists ? 'Update file' : 'Create file')}{resource.records !== undefined && `, ${t('Incoming records')}: ${resource.records}`}{resource.added !== undefined && `, ${t('New records')}: ${resource.added}`}</span>{resource.sample !== undefined && <details><summary>{t('Data preview')}</summary><pre>{JSON.stringify(resource.sample, null, 2)}</pre></details>}</li>)}</ul></div>}
          {fullChange && preview?.status !== 'success' && <p className="dc-note">{t('Test the changed source or access settings before saving.')}</p>}
        </div>
        <p className="dc-note">{t('No catalog entry is created automatically. You can register the stored files in the Semantic Data Catalog.')}</p>
        {error && <div className="dc-alert dc-alert--error" role="alert">{t(error)}</div>}
      </div><footer><button type="button" className="dc-button" disabled={busy} onClick={close}>{t('Cancel')}</button><button className="dc-button dc-button--primary" disabled={busy || testing || (fullChange && preview?.status !== 'success')} type="submit">{t(editing.id ? 'Save connection' : 'Create connection')}</button></footer>
    </form></ConnectionModal>}
  </>;
}
