import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLink, faPlus, faSearch, faXmark, faRotate, faPlay, faTrash, faServer, faChevronRight } from '@fortawesome/free-solid-svg-icons';
import session from '../solidSession';
import { useI18n } from '../i18n';
import { getDataspaceId, getSyncWorkerConfig } from '../config/runtimeConfig';
import { prepareDataConnectionSetup } from '../dataConnectionSetup';
import { registerSyncWorkerParticipant } from '../syncWorkerRegistration';
import { connectionWorkerCall, loadConnectionStatus } from '../dataConnectionClient';
import { loadCustomConnections, loadHomeAssistantConnections, saveCustomConnection, saveHomeAssistantConnection, deleteCustomConnection, deleteHomeAssistantConnection, loadConnectionLastSync } from '../solidConnections';
import './DataConnection.css';
const de = {
  "Stream could not be started. Check settings and Pod access.": "Stream konnte nicht gestartet werden. Prüfe Einstellungen und Pod-Zugriff.",
  "Stream settings could not be checked. Collection is stopped.": "Stream-Einstellungen konnten nicht geprüft werden. Die Erfassung ist gestoppt.",
  "Too many active streams.": "Zu viele aktive Streams.",
  "Invalid stream settings or storage path.": "Ungültige Stream-Einstellungen oder ungültiger Speicherpfad.",
  "JSON sequence records must start with a record separator.": "JSON-Sequenz-Datensätze müssen mit einem Datensatz-Trennzeichen beginnen.",
  "Stream event ID exceeds 4096 bytes.": "Die Stream-Ereignis-ID überschreitet 4096 Byte.",
  "Stream rate limit exceeded.": "Die maximale Empfangsrate des Streams wurde überschritten.",
  "Stream idle timeout.": "Zeitlimit ohne Stream-Empfang erreicht.",
  "Stream connection timed out.": "Zeitlimit für den Stream-Verbindungsaufbau erreicht.",
  "Connection mode": "Verbindungsmodus",
  "Periodic retrieval": "Regelmäßiger Abruf",
  "Continuous stream": "Kontinuierlicher Stream",
  "Stream format": "Stream-Format",
  "Raw data": "Rohdaten",
  "Stream storage interval": "Speicherintervall des Streams",
  "Use worker interval": "Worker-Intervall verwenden",
  "Seconds": "Sekunden",
  "Maximum segment size (MiB)": "Maximale Abschnittsgröße (MiB)",
  "Idle timeout (seconds)": "Zeitlimit ohne Empfang (Sekunden)",
  "The connection stays open. The interval closes storage sections; full sections can be saved earlier.": "Die Verbindung bleibt offen. Das Intervall schließt Speicherabschnitte ab; volle Abschnitte können früher gespeichert werden.",
  "Streams use a separate .stream.json index. Existing histories and files are retained.": "Streams verwenden einen eigenen .stream.json-Index. Bestehende Historien und Dateien bleiben erhalten.",
  "Test stream (5 seconds)": "Stream testen (5 Sekunden)",
  "Stream preview ended without saving data.": "Stream-Probe beendet, ohne Daten zu speichern.",
  "Binary stream preview (hex)": "Binäre Stream-Vorschau (Hex)",
  "Connected": "Verbunden",
  "Connecting": "Verbindet",
  "Reconnecting": "Verbindet erneut",
  "Storage pending": "Speichern ausstehend",
  "Stopped": "Gestoppt",
  "Source ended the stream": "Quelle hat den Stream beendet",
  "Stream error": "Stream-Fehler",
  "A connection interruption occurred; the source may not replay all events.": "Es gab eine Unterbrechung; die Quelle liefert möglicherweise nicht alle Ereignisse nach.",
  "Stream storage interval must be between 10 and 86400 seconds.": "Das Speicherintervall muss zwischen 10 und 86400 Sekunden liegen.",
  "Stream segments must be between 1 and 8 MiB.": "Stream-Abschnitte müssen zwischen 1 und 8 MiB groß sein.",
  "Stream idle timeout must be between 15 and 3600 seconds.": "Das Zeitlimit ohne Empfang muss zwischen 15 und 3600 Sekunden liegen.",
  "SSE streams use GET.": "SSE-Streams verwenden GET.",
  "Stream segment is pending. Check Pod access; received data is retained.": "Ein Abschnitt wartet auf Speicherung. Prüfe den Pod-Zugriff; empfangene Daten bleiben gesichert.",
  "Stream interrupted. Retrying; check source and credentials.": "Stream unterbrochen. Ein neuer Versuch läuft; prüfe Quelle und Zugangsdaten.",
  "Interval": "Intervall",
  "Events": "Ereignisse",
  "Check stream connections": "Stream-Verbindungen prüfen",
  "Connection timeout (seconds)": "Zeitlimit für den Verbindungsaufbau (Sekunden)",
  "SSE requires text/event-stream.": "SSE erfordert den Inhaltstyp text/event-stream.",
  "Invalid NDJSON stream record.": "Ungültiger NDJSON-Datensatz im Stream.",
  "Invalid or incomplete JSON sequence record.": "Ungültiger oder unvollständiger JSON-Sequenz-Datensatz.",
  "Stream record exceeds 1 MiB.": "Ein Stream-Ereignis überschreitet 1 MiB.",

  "Request Content-Type": "Inhaltstyp der Anfrage",
  "Request body": "Anfrageinhalt",
  "Request encoding": "Kodierung der Anfrage",
  "Text (UTF-8)": "Text (UTF-8)",
  "Binary as Base64": "Binärdaten als Base64",
  "Response handling": "Verarbeitung der Antwort",
  "Automatic detection": "Automatisch erkennen",
  "JSON": "JSON",
  "Text (CSV, XML, RDF, …)": "Text (CSV, XML, RDF, …)",
  "File / binary": "Datei / Binärdaten",
  "Storage mode": "Speicherart",
  "Original files": "Originaldateien",
  "JSON history": "JSON-Historie",
  "Pod index file (optional)": "Indexdatei im Pod (optional)",
  "Original files keep their bytes and versions. The index records media types and links to each download.": "Originaldateien behalten ihre Bytes und Versionen. Der Index enthält die Inhaltstypen und Links zu jedem Download.",
  "Pagination": "Folgeseiten",
  "No pagination": "Keine Folgeseiten",
  "JSON next-page field": "JSON-Feld für die nächste Seite",
  "HTTP Link header": "HTTP-Link-Header",
  "Maximum response size (MiB)": "Maximale Antwortgröße (MiB)",
  "Follow redirects": "Weiterleitungen folgen",
  "Credentials stay on the original host; POST bodies are not forwarded to other hosts.": "Zugangsdaten bleiben beim ursprünglichen Host; POST-Inhalte werden nicht an andere Hosts weitergegeben.",
  "Binary response received. It will be saved as an original file.": "Binärantwort empfangen. Sie wird als Originaldatei gespeichert.",
  "The request body must be valid Base64.": "Der Anfrageinhalt muss gültiges Base64 sein.",
  "Enter a valid request Content-Type.": "Gib einen gültigen Inhaltstyp für die Anfrage ein.",
  "Field selection requires JSON history storage.": "Die Auswahl einzelner Felder erfordert die JSON-Historie.",
  "Binary responses require original-file storage.": "Binärantworten erfordern die Speicherung als Originaldatei.",
  "JSON pagination requires a next-page path.": "JSON-Folgeseiten erfordern einen Pfad zur nächsten Seite.",
  "JSON paths require a JSON response.": "JSON-Pfade erfordern eine JSON-Antwort.",
  "Response limit must be 1–32 MiB for original files or 1–2 MiB for JSON history.": "Das Antwortlimit muss für Originaldateien 1–32 MiB und für die JSON-Historie 1–2 MiB betragen.",
  "The response cannot be decoded with its declared charset. Use original/binary mode to preserve it.": "Die Antwort lässt sich mit dem angegebenen Zeichensatz nicht lesen. Verwende Originaldateien und den Binärmodus, um sie zu erhalten.",
  "Combined API response exceeds the configured size limit. No partial response was saved.": "Die gesamte Antwort überschreitet das eingestellte Größenlimit. Es wurde keine unvollständige Antwort gespeichert.",
  "Request body exceeds 64 KiB.": "Der Anfrageinhalt überschreitet 64 KiB.",
  "Files": "Dateien",
  "pages": "Seiten",

  'Add connection': 'Verbindung hinzufügen',
  'Search connections': 'Verbindungen suchen',
  'All sources': 'Alle Quellen',
  'REST API': 'REST-API',
  'All states': 'Alle Zustände',
  'Active': 'Aktiv',
  'Paused': 'Pausiert',
  'Run now': 'Jetzt synchronisieren',
  'Refresh': 'Aktualisieren',
  'No connections yet': 'Noch keine Verbindungen',
  'Connect a REST API or Home Assistant to collect data in your Pod.': 'Verbinde eine REST-API oder Home Assistant, um Daten in deinem Pod zu sammeln.',
  'No matching connections': 'Keine passenden Verbindungen',
  'Edit connection': 'Verbindung bearbeiten',
  'New connection': 'Neue Verbindung',
  'Source': 'Quelle',
  'Authentication': 'Authentifizierung',
  'Response': 'Antwort',
  'Storage': 'Speicherung',
  'Name': 'Name',
  'Description': 'Beschreibung',
  'URL including query parameters': 'URL einschließlich Abfrageparameter',
  'Method': 'Methode',
  'Additional headers (JSON)': 'Zusätzliche Header (JSON)',
  'JSON request body': 'JSON-Anfrageinhalt',
  'This POST only queries data; repeating it does not change the source.': 'Dieser POST fragt nur Daten ab; wiederholte Aufrufe verändern die Quelle nicht.',
  'None': 'Keine',
  'Bearer token': 'Bearer-Token',
  'API key': 'API-Schlüssel',
  'Basic authentication': 'Basic-Authentifizierung',
  'Username': 'Benutzername',
  'Token / password': 'Token / Passwort',
  'Header name': 'Header-Name',
  'Leave empty to keep the saved credential.': 'Leer lassen, um die gespeicherten Zugangsdaten zu behalten.',
  'Response path (JSON Pointer)': 'Antwortpfad (JSON Pointer)',
  'Next-page URL path (optional)': 'Pfad zur URL der nächsten Seite (optional)',
  'Maximum pages': 'Maximale Seitenzahl',
  'Timeout in seconds': 'Zeitlimit in Sekunden',
  'Automatic synchronization': 'Automatische Synchronisation',
  'Pod JSON file (optional)': 'JSON-Datei im Pod (optional)',
  'Pod RDF file (optional)': 'RDF-Datei im Pod (optional)',
  'The existing RDF storage format is preserved.': 'Das bestehende RDF-Speicherformat bleibt erhalten.',
  'Default: a separate file for this connection.': 'Standard: eine eigene Datei für diese Verbindung.',
  'Recent entries stay in the current file. Older entries are archived in the same Pod folder.': 'Aktuelle Einträge bleiben in der Datei. Ältere Einträge werden im selben Pod-Ordner archiviert.',
  'Test request': 'Anfrage testen',
  'Load entities': 'Entitäten laden',
  'Testing…': 'Wird geprüft…',
  'Save connection': 'Verbindung speichern',
  'Saving…': 'Wird gespeichert…',
  'Cancel': 'Abbrechen',
  'Close': 'Schließen',
  'Delete connection': 'Verbindung entfernen',
  'Only the connection settings will be deleted. Collected data and archives stay in your Pod.': 'Nur die Verbindungseinstellungen werden entfernt. Gesammelte Daten und Archive bleiben in deinem Pod.',
  'Delete': 'Entfernen',
  'Set up Data Connection': 'Data Connection einrichten',
  'Checking setup…': 'Einrichtung wird geprüft…',
  'The worker receives access to the connection folder. Your personal account password is not needed.': 'Der Worker erhält Zugriff auf den Verbindungsordner. Dein persönliches Kontopasswort wird nicht benötigt.',
  'Retry': 'Erneut versuchen',
  'Connection settings saved.': 'Verbindungseinstellungen gespeichert.',
  'Connection removed; collected data retained.': 'Verbindung entfernt; gesammelte Daten behalten.',
  'Waiting for the first synchronization': 'Wartet auf die erste Synchronisation',
  'Last update': 'Letzte Aktualisierung',
  'Synchronization failed': 'Synchronisation fehlgeschlagen',
  'Some connections failed': 'Einige Verbindungen fehlgeschlagen',
  'Synchronization complete': 'Synchronisation abgeschlossen',
  'No active connections': 'Keine aktiven Verbindungen',
  'Synchronization running…': 'Synchronisation läuft…',
  'Test connections are stored separately from production connections.': 'Testverbindungen werden getrennt von produktiven Verbindungen gespeichert.',
  'No catalog entry is created automatically. You can register the stored file in the Semantic Data Catalog.': 'Es wird kein Katalogeintrag automatisch angelegt. Du kannst die gespeicherte Datei im Semantic Data Catalog registrieren.',
  'Selected entities': 'Ausgewählte Entitäten',
  'Select at least one entity.': 'Wähle mindestens eine Entität aus.',
  'Filter entities': 'Entitäten filtern',
  'Select visible': 'Sichtbare auswählen',
  'Clear selection': 'Auswahl leeren',
  'Preview': 'Vorschau',
  'Preview shortened for display.': 'Vorschau für die Anzeige gekürzt.',
  'Connection test succeeded.': 'Verbindung erfolgreich geprüft.',
  'Source returned invalid JSON.': 'Die Quelle hat ungültiges JSON geliefert.',
  'Check the URL, authentication and response settings.': 'Prüfe URL, Authentifizierung und Antworteinstellungen.',
  'Enter a name and a valid HTTP(S) URL.': 'Gib einen Namen und eine gültige HTTP(S)-URL ein.',
  'Headers must be a JSON object.': 'Header müssen ein JSON-Objekt sein.',
  'Use the authentication fields for credentials.': 'Verwende die Authentifizierungsfelder für Zugangsdaten.',
  'Authenticated sources require HTTPS.': 'Quellen mit Zugangsdaten erfordern HTTPS.',
  'Confirm that this POST only queries data.': 'Bestätige, dass dieser POST nur Daten abfragt.',
  'Data Connection is disabled for this profile.': 'Data Connection ist für dieses Profil deaktiviert.',
  'Background worker registration failed.': 'Die Anmeldung beim Hintergrunddienst ist fehlgeschlagen.',
  'Sign in with Solid to manage connections.': 'Melde dich mit Solid an, um Verbindungen zu verwalten.',
  'Data Connection setup failed.': 'Data Connection konnte nicht eingerichtet werden.',
  'Automatic data collection supports GET and POST only.': 'Automatische Datenerfassung unterstützt nur GET und POST.',
  'The request body must be valid JSON.': 'Der Anfrageinhalt muss gültiges JSON sein.',
  'Use a JSON Pointer such as /data/items.': 'Verwende einen JSON Pointer wie /data/items.',
  'Connection test failed. Check the final HTTPS URL, credential, network access and response size.': 'Verbindungstest fehlgeschlagen. Prüfe die endgültige HTTPS-URL, Zugangsdaten, Erreichbarkeit und Antwortgröße.',
  'Source request timed out.': 'Das Zeitlimit für die Anfrage wurde überschritten.',
  'The source returned invalid JSON.': 'Die Quelle hat ungültiges JSON geliefert.',
  'The configured response path was not found.': 'Der konfigurierte Antwortpfad wurde nicht gefunden.',
  'Home Assistant rejected the access token.': 'Home Assistant hat das Zugriffstoken abgelehnt.',
  'Please wait before testing another connection.': 'Bitte warte kurz, bevor du eine weitere Verbindung prüfst.',
  'Connection encryption is unavailable.': 'Die Verschlüsselung für Zugangsdaten ist nicht verfügbar.',
  'Enter an authentication credential.': 'Gib die Zugangsdaten ein.',
  'Every 10 minutes': 'Alle 10 Minuten',
  'entities': 'Entitäten',
  'Source type': 'Quelltyp',
  'State': 'Zustand'
};
const newForm = () => ({
  id: `api-${Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, "0")).join("")}`,
  kind: 'custom',
  name: '',
  description: '',
  endpoint: '',
  method: 'GET',
  authType: 'none',
  secret: '',
  encryptedSecret: '',
  authHeader: 'X-API-Key',
  headersJson: '',
  storageDocumentUrl: '',
  selectedEntities: [],
  options: {
    enabled: true,
    mode: 'periodic',
    streamFormat: 'sse',
    streamIntervalSeconds: 0,
    streamSegmentMiB: 1,
    streamIdleSeconds: 300,
    username: '',
    requestBody: '',
    requestContentType: 'application/json',
    requestEncoding: 'text',
    storageMode: 'original',
    responseMode: 'auto',
    pagination: 'none',
    maxResponseMiB: 8,
    followRedirects: true,
    responsePath: '',
    nextPagePath: '',
    maxPages: 1,
    timeoutSeconds: 20,
    readOnlyPost: false
  }
});
const sourceLabel = value => {
  try {
    const u = new URL(value);
    return u.origin + u.pathname;
  } catch {
    return value;
  }
};
export function ConnectionModal({
  title,
  onClose,
  busy,
  children,
  t
}) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement,
      overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.querySelector('input,button,select,textarea')?.focus();
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);
  const keyDown = event => {
    if (event.key === 'Escape' && !busy) {
      event.stopPropagation();
      onClose();
    }
    if (event.key !== 'Tab') return;
    const nodes = [...ref.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]')].filter(x => x.getClientRects().length);
    const first = nodes[0],
      last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };
  return createPortal(<div className="dc-overlay" onMouseDown={e => {
    if (e.target === e.currentTarget && !busy) onClose();
  }}>
    <section className="dc-modal" role="dialog" aria-modal="true" aria-labelledby="dc-modal-title" ref={ref} onKeyDown={keyDown} translate="no">
      <header><h2 id="dc-modal-title">{title}</h2><button type="button" className="dc-icon" aria-label={t('Close')} onClick={onClose} disabled={busy}><FontAwesomeIcon icon={faXmark} /></button></header>
      {children}
    </section>
  </div>, document.body);
}
export default function DataConnection({
  webId
}) {
  const {
    language
  } = useI18n();
  const t = value => language === 'de' ? de[value] || value : value;
  const [setup, setSetup] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [connections, setConnections] = useState([]),
    [lastSync, setLastSync] = useState({}),
    [status, setStatus] = useState(null);
  const [query, setQuery] = useState(''),
    [kind, setKind] = useState('all'),
    [state, setState] = useState('all');
  const [form, setForm] = useState(null),
    [editing, setEditing] = useState(false),
    [remove, setRemove] = useState(null);
  const [entities, setEntities] = useState([]),
    [entityQuery, setEntityQuery] = useState(''),
    [preview, setPreview] = useState(null);
  const mounted = useRef(true);
  const currentWebId = useRef(webId);
  currentWebId.current = webId;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const reload = useCallback(async () => {
    const [home, api, current] = await Promise.all([loadHomeAssistantConnections(webId, session.fetch), loadCustomConnections(webId, session.fetch), loadConnectionStatus(webId, session.fetch)]);
    const rows = [...home, ...api].sort((a, b) => a.name.localeCompare(b.name));
    const times = await Promise.all(rows.map(async c => {
      try {
        return [c.kind + c.id, await loadConnectionLastSync(c.options?.mode === 'stream' ? c.storageDocumentUrl + '.stream.json' : c.storageDocumentUrl, session.fetch)];
      } catch {
        return [c.kind + c.id, null];
      }
    }));
    if (mounted.current && currentWebId.current === webId) {
      setConnections(rows);
      setStatus(current);
      setLastSync(Object.fromEntries(times));
    }
  }, [webId]);
  useEffect(() => {
    let cancelled = false;
    setSetup(null);
    setConnections([]);
    setError('');
    prepareDataConnectionSetup({
      webId,
      solidFetch: session.fetch
    }).then(async result => {
      if (cancelled) return;
      setSetup(result);
      if (result.ready) await reload();
    }).catch(e => {
      if (!cancelled) setError(e.message);
    });
    return () => {
      cancelled = true;
    };
  }, [webId, reload]);
  const hasStreams = connections.some(c => c.options?.mode === 'stream');
  useEffect(() => {
    if (!setup?.ready) return undefined;
    const timer = setInterval(() => reload().catch(e => setError(e.message)), hasStreams ? 10000 : 60000);
    return () => clearInterval(timer);
  }, [setup?.ready, reload, hasStreams]);
  const run = async action => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (e) {
      setError(e.message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const update = (key, value) => {
    setForm(current => ({
      ...current,
      [key]: value
    }));
    setPreview(null);
  };
  const option = (key, value) => {
    setForm(current => ({
      ...current,
      options: {
        ...current.options,
        [key]: value
      }
    }));
    setPreview(null);
  };
  const open = c => {
    setError('');
    setPreview(null);
    setEntities([]);
    setEntityQuery('');
    setEditing(Boolean(c));
    if (!c) {
      setForm(newForm());
      return;
    }
    setForm({
      ...newForm(),
      ...c,
      endpoint: c.endpoint || c.url,
      secret: c.accessToken || c.authSecret || '',
      encryptedSecret: c.encryptedAccessToken || c.encryptedAuthSecret || '',
      options: {
        ...newForm().options,
        ...c.options,
        storageMode: c.options?.storageMode || 'history',
        pagination: c.options?.pagination || (c.options?.nextPagePath ? 'json' : 'none'),
        maxResponseMiB: c.options?.maxResponseMiB || (c.options?.storageMode === 'original' ? 8 : 2),
        followRedirects: c.options?.followRedirects === true
      },
      selectedEntities: c.selectedEntities || []
    });
  };
  const parsedForm = () => {
    let url;
    try {
      url = new URL(form.endpoint);
    } catch {
      throw new Error('Enter a name and a valid HTTP(S) URL.');
    }
    if (!form.name.trim() || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) throw new Error('Enter a name and a valid HTTP(S) URL.');
    const hasCredential = form.kind === 'home-assistant' || form.authType !== 'none';
    if (hasCredential && url.protocol !== 'https:') throw new Error('Authenticated sources require HTTPS.');
    let headers;
    try {
      headers = JSON.parse(form.headersJson || '{}');
    } catch {
      throw new Error('Headers must be a JSON object.');
    }
    if (!headers || Array.isArray(headers) || typeof headers !== 'object') throw new Error('Headers must be a JSON object.');
    if (Object.keys(headers).some(k => /^(authorization|cookie|proxy-authorization|x-api-key)$/i.test(k))) throw new Error('Use the authentication fields for credentials.');
    if (form.method === 'POST' && !form.options.readOnlyPost) throw new Error('Confirm that this POST only queries data.');
    if (!['GET', 'POST'].includes(form.method)) throw new Error('Automatic data collection supports GET and POST only.');
    if (form.method === 'POST' && form.options.requestEncoding === 'text' && /^(application|text)\/(?:[^;]+\+)?json(?:;|$)/i.test(form.options.requestContentType)) {
      try {
        JSON.parse(form.options.requestBody || '{}');
      } catch {
        throw new Error('The request body must be valid JSON.');
      }
    }
    for (const pointer of [form.options.responsePath, form.options.nextPagePath].filter(Boolean)) if (!pointer.startsWith('/') || /~(?![01])/.test(pointer)) throw new Error('Use a JSON Pointer such as /data/items.');
    if (form.options.requestEncoding === 'base64' && !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(form.options.requestBody)) throw new Error('The request body must be valid Base64.');
    if (form.kind === 'custom' && form.options.mode === 'stream') {
      const interval = Number(form.options.streamIntervalSeconds);
      if (form.options.streamIntervalSeconds === '' || (interval !== 0 && (!Number.isInteger(interval) || interval < 10 || interval > 86400))) throw new Error('Stream storage interval must be between 10 and 86400 seconds.');
      if (form.options.streamFormat === 'sse' && form.method !== 'GET') throw new Error('SSE streams use GET.');
    }
    return {
      ...form,
      headers,
      url: url.origin + (form.kind === 'home-assistant' ? url.pathname : ''),
      port: url.port || (url.protocol === 'https:' ? '443' : '80'),
      sourceEndpoint: url.pathname + url.search
    };
  };
  const testRequest = () => run(async () => {
    const connection = parsedForm();
    const result = await connectionWorkerCall(webId, session.fetch, 'preview', {
      kind: form.kind,
      connection
    });
    if (result.entities) setEntities(result.entities);
    setPreview(result);
  });
  const save = event => {
    event.preventDefault();
    run(async () => {
      const values = parsedForm();
      if (values.kind === 'home-assistant' && !values.selectedEntities.length) throw new Error('Select at least one entity.');
      const saved = values.kind === 'home-assistant' ? await saveHomeAssistantConnection(webId, session.fetch, {
        ...values,
        accessToken: values.secret,
        encryptedAccessToken: values.encryptedSecret,
        dataModel: values.dataModel || 'solid-sync-json',
        syncIntervalMinutes: '10'
      }) : await saveCustomConnection(webId, session.fetch, {
        ...values,
        authSecret: values.secret,
        encryptedAuthSecret: values.encryptedSecret
      });
      await registerSyncWorkerParticipant({
        webId,
        solidFetch: session.fetch,
        storageDocumentUrl: saved.storageDocumentUrl,
        streamsOnly: values.kind === 'custom' && values.options.mode === 'stream'
      });
      setForm(null);
      await reload();
      setNotice('Connection settings saved.');
    });
  };
  const filtered = connections.filter(c => (kind === 'all' || (kind === 'stream' ? c.options?.mode === 'stream' : c.kind === kind && c.options?.mode !== 'stream')) && (state === 'all' || (c.options?.enabled === false ? 'paused' : 'active') === state) && `${c.name} ${c.description || ''} ${sourceLabel(c.endpoint || c.url)}`.toLowerCase().includes(query.toLowerCase()));
  const filteredEntities = entities.filter(e => `${e.friendlyName} ${e.entityId}`.toLowerCase().includes(entityQuery.toLowerCase()));
  const statusLabel = {
    failed: 'Synchronization failed',
    partial: 'Some connections failed',
    success: 'Synchronization complete',
    running: 'Synchronization running…',
    'no-connection': 'No active connections',
    'no-selected-entities': 'No active connections'
  }[status?.lastStatus];
  const errorBox = error && <div className="dc-alert dc-alert--error" role="alert">{t(error)}</div>;
  const workerIntervalSeconds = status?.syncIntervalSeconds || (getSyncWorkerConfig().intervalMinutes || 10) * 60;
  const streamLabels = {connected:'Connected',connecting:'Connecting',reconnecting:'Reconnecting','storage-error':'Storage pending',stopped:'Stopped',ended:'Source ended the stream',error:'Stream error'};
  const streamStatus = c => status?.streams?.find(row => row.id === c.id);
  const rdfStorage = form?.kind === 'home-assistant' && ['sdm-entity-snapshot', 'sosa-observation'].includes(form.dataModel);
  const field = (label, key, type = 'text', extra = {}) => <label>{t(label)}<input type={type} value={form[key] || ''} onChange={e => update(key, e.target.value)} disabled={busy} {...extra} /></label>;
  return <div className="data-connection" translate="no">
    <div className="toolbar toolbar--title data-connection__header"><div className="crumb"><FontAwesomeIcon icon={faLink} className="crumb-icon" /><span>Data Connection</span></div></div>
    <div className="dc-workspace">
      {!setup?.ready ? <section className="dc-empty"><span className="dc-source-icon"><FontAwesomeIcon icon={faLink} /></span><h2>{t(setup ? 'Set up Data Connection' : 'Checking setup…')}</h2><p>{t('The worker receives access to the connection folder. Your personal account password is not needed.')}</p>{setup?.error && <div role="alert">{t(setup.error)}</div>}{errorBox}<button className="dc-button dc-button--primary" disabled={busy || !setup} onClick={() => run(async () => {
          const result = await prepareDataConnectionSetup({
            webId,
            solidFetch: session.fetch,
            provision: true
          });
          setSetup(result);
          if (result.ready) await reload();
        })}>{t('Set up Data Connection')}</button></section> : <>
        <div className="dc-tools"><label className="dc-search"><FontAwesomeIcon icon={faSearch} /><input aria-label={t('Search connections')} placeholder={t('Search connections')} value={query} onChange={e => setQuery(e.target.value)} /></label><button className="dc-button dc-button--primary" onClick={() => open(null)}><FontAwesomeIcon icon={faPlus} />{t('Add connection')}</button><button className="dc-button" disabled={busy} onClick={() => run(reload)} aria-label={t('Refresh')}><FontAwesomeIcon icon={faRotate} /></button><button className="dc-button" disabled={busy || !connections.length} onClick={() => run(async () => {
            const result = await connectionWorkerCall(webId, session.fetch, 'sync', {streamsOnly: connections.every(c => c.options?.mode === 'stream')});
            setStatus(result.status);
            await reload();
          })}><FontAwesomeIcon icon={faPlay} />{t('Run now')}</button></div>
        <div className="dc-filters"><select aria-label={t('Source type')} value={kind} onChange={e => setKind(e.target.value)}><option value="all">{t('All sources')}</option><option value="custom">{t('REST API')}</option><option value="home-assistant">Home Assistant</option><option value="stream">{t('Continuous stream')}</option></select><select aria-label={t('State')} value={state} onChange={e => setState(e.target.value)}><option value="all">{t('All states')}</option><option value="active">{t('Active')}</option><option value="paused">{t('Paused')}</option></select><span>{t('Interval')}: {workerIntervalSeconds} {t('Seconds')}</span></div>
        {getDataspaceId() === 'test' && <p className="dc-note">{t('Test connections are stored separately from production connections.')}</p>}
        {errorBox}{notice && <div className="dc-alert" role="status">{t(notice)}</div>}
        {statusLabel && connections.some(c => c.options?.mode !== 'stream') && <div className={`dc-status ${['failed', 'partial'].includes(status?.lastStatus) ? 'dc-status--error' : ''}`} role="status"><strong>{t(statusLabel)}</strong>{status?.lastError && <span>{status.lastError}</span>}</div>}
        <div className="dc-list">{filtered.map(c => <article className="dc-card" key={c.kind + c.id}><button className="dc-card-main" onClick={() => open(c)}><span className={`dc-source-icon ${c.kind === 'home-assistant' ? 'dc-source-icon--green' : ''}`}><FontAwesomeIcon icon={c.kind === 'home-assistant' ? faServer : faLink} /></span><span className="dc-card-copy"><strong>{c.name}</strong><span>{c.description || sourceLabel(c.endpoint || c.url)}</span><span className="dc-badges"><em>{c.kind === 'home-assistant' ? 'Home Assistant' : c.options?.mode === 'stream' ? t('Continuous stream') : t('REST API')}</em><em>{c.kind === 'home-assistant' ? `${c.selectedEntities.length} ${t('entities')}` : c.method}</em></span></span><span className="dc-card-meta"><span className={`dc-pill ${c.options?.enabled === false ? 'dc-pill--paused' : ''}`}>{t(c.options?.enabled === false ? 'Paused' : c.options?.mode === 'stream' ? streamLabels[streamStatus(c)?.status] || 'Connecting' : 'Active')}</span>{c.options?.mode === 'stream' && streamStatus(c)?.possibleGap && <small>{t('A connection interruption occurred; the source may not replay all events.')}</small>}{c.options?.mode === 'stream' && streamStatus(c)?.lastError && <small>{t(streamStatus(c).lastError)}</small>}<small>{lastSync[c.kind + c.id] ? `${t('Last update')}: ${new Date(lastSync[c.kind + c.id]).toLocaleString(language === 'de' ? 'de-DE' : 'en-GB')}` : t('Waiting for the first synchronization')}</small></span><FontAwesomeIcon icon={faChevronRight} /></button><button className="dc-icon dc-delete" aria-label={`${t('Delete connection')}: ${c.name}`} onClick={() => {
              setError('');
              setRemove(c);
            }}><FontAwesomeIcon icon={faTrash} /></button></article>)}</div>
        {!filtered.length && <section className="dc-empty"><span className="dc-source-icon"><FontAwesomeIcon icon={faLink} /></span><h2>{t(connections.length ? 'No matching connections' : 'No connections yet')}</h2><p>{t('Connect a REST API or Home Assistant to collect data in your Pod.')}</p></section>}
      </>}
    </div>
    {form && <ConnectionModal title={t(editing ? 'Edit connection' : 'New connection')} t={t} busy={busy} onClose={() => setForm(null)}><form onSubmit={save} className="dc-editor"><div className="dc-modal-body">
      {!editing && <div className="dc-types">{['custom', 'home-assistant'].map(k => <button type="button" key={k} className={form.kind === k ? 'selected' : ''} disabled={busy} onClick={() => {
              update('kind', k);
              setEntities([]);
            }}>{k === 'custom' ? t('REST API') : 'Home Assistant'}</button>)}</div>}
      <fieldset disabled={busy}><legend>{t('Source')}</legend>{field('Name', 'name', 'text', {
              required: true,
              maxLength: 120
            })}{field('URL including query parameters', 'endpoint', 'url', {
              required: true,
              placeholder: 'https://api.example.org/data?limit=100'
            })}{form.kind === 'custom' && <>{field('Description', 'description')}<label>{t('Connection mode')}<select value={form.options.mode} onChange={e => setForm(current => ({...current,method:e.target.value === 'stream' && current.options.streamFormat === 'sse' ? 'GET' : current.method,options:{...current.options,mode:e.target.value,...(e.target.value === 'stream' ? {storageMode:'original',pagination:'none',nextPagePath:'',responsePath:''} : {})}}))}><option value="periodic">{t('Periodic retrieval')}</option><option value="stream">{t('Continuous stream')}</option></select></label><label>{t('Method')}<select value={form.method} onChange={e => update('method', e.target.value)}><option>GET</option><option>POST</option></select></label>{form.method === 'POST' && <><label>{t('Request Content-Type')}<input value={form.options.requestContentType} onChange={e => option('requestContentType', e.target.value)} list="dc-request-types" placeholder="application/json" /></label><datalist id="dc-request-types">{['application/json','application/xml','application/x-www-form-urlencoded','text/plain','text/turtle','application/sparql-query','application/octet-stream'].map(type => <option key={type} value={type} />)}</datalist><label>{t('Request encoding')}<select value={form.options.requestEncoding} onChange={e => option('requestEncoding', e.target.value)}><option value="text">{t('Text (UTF-8)')}</option><option value="base64">{t('Binary as Base64')}</option></select></label><label>{t('Request body')}<textarea value={form.options.requestBody} onChange={e => option('requestBody', e.target.value)} rows={4} /></label><label className="dc-check"><input type="checkbox" checked={form.options.readOnlyPost} onChange={e => option('readOnlyPost', e.target.checked)} />{t('This POST only queries data; repeating it does not change the source.')}</label></>}</>}</fieldset>
      <fieldset disabled={busy}><legend>{t('Authentication')}</legend>{form.kind === 'custom' && <label>{t('Authentication')}<select value={form.authType} onChange={e => update('authType', e.target.value)}><option value="none">{t('None')}</option><option value="bearer">{t('Bearer token')}</option><option value="api-key">{t('API key')}</option><option value="basic">{t('Basic authentication')}</option></select></label>}{form.authType === 'basic' && <label>{t('Username')}<input value={form.options.username} onChange={e => option('username', e.target.value)} /></label>}{form.authType === 'api-key' && field('Header name', 'authHeader')}{(form.kind === 'home-assistant' || form.authType !== 'none') && <>{field('Token / password', 'secret', 'password', {
                autoComplete: 'new-password'
              })}{form.encryptedSecret && <p className="dc-note">{t('Leave empty to keep the saved credential.')}</p>}</>}{form.kind === 'custom' && <label>{t('Additional headers (JSON)')}<textarea value={form.headersJson} onChange={e => update('headersJson', e.target.value)} placeholder='{"Accept": "application/json"}' rows={3} /></label>}</fieldset>
      {form.kind === 'custom' && form.options.mode !== 'stream' && <fieldset disabled={busy}>
        <legend>{t('Response')}</legend>
        <label>{t('Storage mode')}<select value={form.options.storageMode} onChange={e => {
          const mode = e.target.value;
          setForm(current => ({...current, options: {...current.options, storageMode: mode,
            responsePath: mode === 'original' ? '' : current.options.responsePath,
            maxResponseMiB: Math.min(current.options.maxResponseMiB, mode === 'original' ? 32 : 2)}}));
        }}><option value="original">{t('Original files')}</option><option value="history">{t('JSON history')}</option></select></label>
        <label>{t('Response handling')}<select value={form.options.responseMode} onChange={e => option('responseMode',e.target.value)}>
          <option value="auto">{t('Automatic detection')}</option><option value="json">JSON</option><option value="text">{t('Text (CSV, XML, RDF, …)')}</option><option value="binary">{t('File / binary')}</option>
        </select></label>
        {form.options.storageMode === 'history' && <label>{t('Response path (JSON Pointer)')}<input value={form.options.responsePath} onChange={e => option('responsePath', e.target.value)} placeholder="/data/items" /></label>}
        <label>{t('Pagination')}<select value={form.options.pagination} onChange={e => setForm(current => ({...current,options:{...current.options,pagination:e.target.value,nextPagePath:e.target.value === 'json' ? current.options.nextPagePath : ''}}))}>
          <option value="none">{t('No pagination')}</option><option value="json">{t('JSON next-page field')}</option><option value="link">{t('HTTP Link header')}</option>
        </select></label>
        {form.options.pagination === 'json' && <label>{t('Next-page URL path (optional)')}<input value={form.options.nextPagePath} onChange={e => option('nextPagePath', e.target.value)} placeholder="/links/next" required /></label>}
        <div className="dc-two">{form.options.pagination !== 'none' && <label>{t('Maximum pages')}<input type="number" min="1" max="20" value={form.options.maxPages} onChange={e => option('maxPages', Number(e.target.value))} /></label>}
          <label>{t('Timeout in seconds')}<input type="number" min="1" max="60" value={form.options.timeoutSeconds} onChange={e => option('timeoutSeconds', Number(e.target.value))} /></label>
          <label>{t('Maximum response size (MiB)')}<input type="number" min="1" max={form.options.storageMode === 'original' ? 32 : 2} value={form.options.maxResponseMiB} onChange={e => option('maxResponseMiB',Number(e.target.value))}/></label>
        </div>
        <label className="dc-check"><input type="checkbox" checked={form.options.followRedirects} onChange={e => option('followRedirects',e.target.checked)}/>{t('Follow redirects')}</label>
        {form.options.followRedirects && <p className="dc-note">{t('Credentials stay on the original host; POST bodies are not forwarded to other hosts.')}</p>}
      </fieldset>}
      {form.kind === 'custom' && form.options.mode === 'stream' && <fieldset disabled={busy}>
        <legend>{t('Continuous stream')}</legend>
        <label>{t('Stream format')}<select value={form.options.streamFormat} onChange={e => setForm(current => ({...current,method:e.target.value === 'sse' ? 'GET' : current.method,options:{...current.options,streamFormat:e.target.value}}))}>
          <option value="sse">SSE</option><option value="ndjson">NDJSON</option><option value="json-seq">JSON-Sequences</option><option value="raw">{t('Raw data')}</option>
        </select></label>
        <label className="dc-check"><input type="checkbox" checked={form.options.streamIntervalSeconds !== '' && !Number(form.options.streamIntervalSeconds)} onChange={e => option('streamIntervalSeconds',e.target.checked ? 0 : workerIntervalSeconds)}/>{t('Use worker interval')} ({workerIntervalSeconds} {t('Seconds')})</label>
        {(form.options.streamIntervalSeconds === '' || Number(form.options.streamIntervalSeconds) !== 0) && <label>{t('Stream storage interval')} ({t('Seconds')})<input type="number" min="10" max="86400" value={form.options.streamIntervalSeconds} onChange={e => option('streamIntervalSeconds',e.target.value === '' ? '' : Number(e.target.value))}/></label>}
        <p className="dc-note">{t('The connection stays open. The interval closes storage sections; full sections can be saved earlier.')}</p>
        <div className="dc-two"><label>{t('Maximum segment size (MiB)')}<input type="number" min="1" max="8" value={form.options.streamSegmentMiB} onChange={e => option('streamSegmentMiB',Number(e.target.value))}/></label>
        <label>{t('Connection timeout (seconds)')}<input type="number" min="1" max="60" value={form.options.timeoutSeconds} onChange={e => option('timeoutSeconds',Number(e.target.value))}/></label>
        <label>{t('Idle timeout (seconds)')}<input type="number" min="15" max="3600" value={form.options.streamIdleSeconds} onChange={e => option('streamIdleSeconds',Number(e.target.value))}/></label></div>
        <label className="dc-check"><input type="checkbox" checked={form.options.followRedirects} onChange={e => option('followRedirects',e.target.checked)}/>{t('Follow redirects')}</label>
        <p className="dc-note">{t('Streams use a separate .stream.json index. Existing histories and files are retained.')}</p>
      </fieldset>}
      <div className="dc-preview"><button type="button" className="dc-button" onClick={testRequest} disabled={busy}>{t(busy ? 'Testing…' : form.kind === 'home-assistant' ? 'Load entities' : form.options.mode === 'stream' ? 'Test stream (5 seconds)' : 'Test request')}</button>{preview && <><p role="status">{t('Connection test succeeded.')} {preview.status ? `HTTP ${preview.status} · ${preview.stream ? `${preview.events} ${t('Events')}` : `${preview.pages} ${t('pages')}`} · ${preview.bytes} B` : ''}</p>{preview.binary && <p>{t(preview.stream ? 'Binary stream preview (hex)' : 'Binary response received. It will be saved as an original file.')}</p>}{preview.files?.length > 0 && <ul aria-label={t('Files')}>{preview.files.map((file,index) => <li key={index}>{file.contentType} · {file.bytes} B</li>)}</ul>}{preview.stream && <p>{t('Stream preview ended without saving data.')}</p>}{preview.preview && <pre>{preview.preview}</pre>}{preview.previewTruncated && <p>{t('Preview shortened for display.')}</p>}</>}</div>
      {form.kind === 'home-assistant' && <fieldset disabled={busy}><legend>{t('Selected entities')} ({form.selectedEntities.length})</legend><input aria-label={t('Filter entities')} placeholder={t('Filter entities')} value={entityQuery} onChange={e => setEntityQuery(e.target.value)} /><div className="dc-filters"><button type="button" className="dc-button" onClick={() => update('selectedEntities', [...new Set([...form.selectedEntities, ...filteredEntities.map(e => e.entityId)])])}>{t('Select visible')}</button><button type="button" className="dc-button" onClick={() => update('selectedEntities', [])}>{t('Clear selection')}</button></div><div className="dc-entities">{(entities.length ? filteredEntities : form.selectedEntities.map(id => ({
                entityId: id,
                friendlyName: id
              }))).map(e => <label className="dc-check" key={e.entityId}><input type="checkbox" checked={form.selectedEntities.includes(e.entityId)} onChange={event => update('selectedEntities', event.target.checked ? [...form.selectedEntities, e.entityId] : form.selectedEntities.filter(id => id !== e.entityId))} /><span><strong>{e.friendlyName}</strong><small>{e.entityId}</small></span><span>{e.state}</span></label>)}</div></fieldset>}
      <fieldset disabled={busy}><legend>{t('Storage')}</legend>{field(rdfStorage ? 'Pod RDF file (optional)' : form.kind === 'custom' && form.options.storageMode === 'original' ? 'Pod index file (optional)' : 'Pod JSON file (optional)', 'storageDocumentUrl', 'text', {
              placeholder: `connections/${getDataspaceId() === 'test' ? 'test/' : ''}my-source.${rdfStorage ? 'ttl' : 'json'}`
            })}<p className="dc-note">{t('Default: a separate file for this connection.')}</p><p className="dc-note">{t(rdfStorage ? 'The existing RDF storage format is preserved.' : form.kind === 'custom' && form.options.storageMode === 'original' ? 'Original files keep their bytes and versions. The index records media types and links to each download.' : 'Recent entries stay in the current file. Older entries are archived in the same Pod folder.')}</p><label className="dc-check"><input type="checkbox" checked={form.options.enabled !== false} onChange={e => option('enabled', e.target.checked)} />{t('Automatic synchronization')}</label><p className="dc-note">{t('No catalog entry is created automatically. You can register the stored file in the Semantic Data Catalog.')}</p></fieldset>
      {errorBox}</div><footer><button type="button" className="dc-button" disabled={busy} onClick={() => setForm(null)}>{t('Cancel')}</button><button className="dc-button dc-button--primary" disabled={busy} type="submit">{t(busy ? 'Saving…' : 'Save connection')}</button></footer></form></ConnectionModal>}
    {remove && <ConnectionModal title={t('Delete connection')} t={t} busy={busy} onClose={() => setRemove(null)}><div className="dc-modal-body"><h3>{remove.name}</h3><p>{t('Only the connection settings will be deleted. Collected data and archives stay in your Pod.')}</p>{errorBox}</div><footer><button className="dc-button" disabled={busy} onClick={() => setRemove(null)}>{t('Cancel')}</button><button className="dc-button dc-button--danger" disabled={busy} onClick={() => run(async () => {
          await (remove.kind === 'home-assistant' ? deleteHomeAssistantConnection : deleteCustomConnection)(webId, session.fetch, remove.id);
          if (remove.options?.mode === 'stream') await connectionWorkerCall(webId, session.fetch, 'sync', {streamsOnly:true});
          setRemove(null);
          await reload();
          setNotice('Connection removed; collected data retained.');
        })}>{t('Delete')}</button></footer></ConnectionModal>}
  </div>;
}
