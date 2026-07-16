import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export const SUPPORTED_LANGUAGES = ["en", "de"];
export const DEFAULT_LANGUAGE = "en";
export const LANGUAGE_STORAGE_KEY = "solid-dataspace.language";
export const LANGUAGE_EVENT = "solid-dataspace-language-change";
export const LANGUAGE_MESSAGE_TYPE = "solid-dataspace-language-change";
export const PROFILE_LANGUAGE_PREDICATE =
  "https://w3id.org/solid-dataspace-manager#preferredLanguage";

const enToDe = {
  Language: "Sprache",
  English: "Englisch",
  German: "Deutsch",
  General: "Allgemein",
  "Consume and Provide": "Konsumieren und Bereitstellen",
  Applications: "Anwendungen",
  Miscellaneous: "Sonstiges",
  "Solid Data Manager": "Solid Datenmanager",
  "Transaction History": "Transaktionsverlauf",
  "Access Requests": "Zugriffsanfragen",
  "Access Decisions": "Zugriffsentscheidungen",
  "Profile Manager": "Profilmanager",
  Information: "Informationen",
  "Semantic Data Catalog": "Semantischer Datenkatalog",
  "Data Connection": "Datenverbindung",
  "Solid Pod Provider": "Solid-Pod-Anbieter",
  "Environmental Monitoring": "Umweltmonitoring",
  "Solid Health App": "Solid Gesundheits-App",
  "Solid Chatbot": "Solid Chatbot",
  Logout: "Abmelden",
  Login: "Anmelden",
  Open: "Öffnen",
  Back: "Zurück",
  "Not found": "Nicht gefunden",
  "Unknown external link.": "Unbekannter externer Link.",
  "This site uses HTTP and cannot be embedded inside an HTTPS app. Open it in a new tab, or serve it via HTTPS or an HTTPS reverse proxy.":
    "Diese Seite verwendet HTTP und kann nicht in eine HTTPS-App eingebettet werden. Öffne sie in einem neuen Tab oder stelle sie über HTTPS bzw. einen HTTPS-Reverse-Proxy bereit.",
  "Loading...": "Wird geladen...",
  "Loading profile...": "Profil wird geladen...",
  "Loading profileâ€¦": "Profil wird geladen...",
  "Checking profile": "Profil wird geprüft",
  "We are connecting to your Solid Pod and verifying required profile details.":
    "Wir verbinden uns mit deinem Solid-Pod und prüfen die erforderlichen Profildaten.",
  "We are verifying your Solid profile and catalog configuration.":
    "Wir prüfen dein Solid-Profil und die Katalogkonfiguration.",
  "We are verifying your Solid profile and chatbot folder.":
    "Wir prüfen dein Solid-Profil und den Chatbot-Ordner.",
  "Your Profile": "Dein Profil",
  "Language Preference": "Spracheinstellung",
  "Could not save the language preference to your Solid profile. The local choice is still active.":
    "Die Spracheinstellung konnte nicht im Solid-Profil gespeichert werden. Die lokale Auswahl ist weiterhin aktiv.",
  "Solid Pod": "Solid-Pod",
  "Pod URL": "Pod-URL",
  "Web ID": "WebID",
  "Not available": "Nicht verfügbar",
  "Credential Token": "Anmeldetoken",
  Identifier: "Kennung",
  Secret: "Secret",
  "No token found": "Kein Token gefunden",
  "No secret found": "Kein Secret gefunden",
  "Credential token could not be loaded.": "Anmeldetoken konnte nicht geladen werden.",
  "Hide secret": "Secret ausblenden",
  "Show secret": "Secret anzeigen",
  Basics: "Basisdaten",
  Done: "Fertig",
  Edit: "Bearbeiten",
  Avatar: "Avatar",
  "Choose avatar": "Avatar auswählen",
  Name: "Name",
  Organization: "Organisation",
  Role: "Rolle",
  Contact: "Kontakt",
  Email: "E-Mail",
  add: "Hinzufügen",
  "add WebID": "WebID hinzufügen",
  "Remove entry": "Eintrag entfernen",
  "Solid Inbox": "Solid-Inbox",
  "Inbox URL": "Inbox-URL",
  "Not configured": "Nicht konfiguriert",
  "Access requests and decisions are delivered to this inbox.":
    "Zugriffsanfragen und Entscheidungen werden an diese Inbox zugestellt.",
  "Configuring...": "Wird konfiguriert...",
  "Configure Inbox": "Inbox konfigurieren",
  "Reconfigure Inbox": "Inbox neu konfigurieren",
  "Resetting...": "Wird zurückgesetzt...",
  "Reset Inbox": "Inbox zurücksetzen",
  "The catalog metadata is stored in your catalog.":
    "Die Katalog-Metadaten werden in deinem Katalog gespeichert.",
  "Configure Catalog": "Katalog konfigurieren",
  "Reconfigure Catalog": "Katalog neu konfigurieren",
  "Reset Catalog": "Katalog zurücksetzen",
  Registry: "Registry",
  "Research project": "Forschungsprojekt",
  "Private use": "Private Nutzung",
  "Select one or more registries.": "Wähle eine oder mehrere Registries aus.",
  "Registry URL": "Registry-URL",
  "Default registry container in your pod.": "Standard-Registry-Container in deinem Pod.",
  "Members (WebIDs)": "Mitglieder (WebIDs)",
  Save: "Speichern",
  "Saving...": "Wird gespeichert...",
  "Savingâ€¦": "Wird gespeichert...",
  "Profile saved.": "Profil gespeichert.",
  "Profile save failed.": "Profil konnte nicht gespeichert werden.",
  "Profile could not be loaded.": "Profil konnte nicht geladen werden.",
  "Avatar upload failed.": "Avatar-Upload fehlgeschlagen.",
  "Solid inbox configured.": "Solid-Inbox konfiguriert.",
  "Inbox setup failed.": "Inbox-Einrichtung fehlgeschlagen.",
  "Inbox reset completed.": "Inbox wurde zurückgesetzt.",
  "Inbox reset failed.": "Inbox konnte nicht zurückgesetzt werden.",
  "Catalog initialized.": "Katalog initialisiert.",
  "Catalog setup failed.": "Katalog-Einrichtung fehlgeschlagen.",
  "Catalog reset completed.": "Katalog wurde zurückgesetzt.",
  "Catalog reset failed.": "Katalog konnte nicht zurückgesetzt werden.",
  "Reset inbox?": "Inbox zurücksetzen?",
  "This will delete all inbox notifications and recreate a fresh inbox container.":
    "Dadurch werden alle Inbox-Benachrichtigungen gelöscht und ein frischer Inbox-Container erstellt.",
  Cancel: "Abbrechen",
  "Reset catalog?": "Katalog zurücksetzen?",
  "This will delete all catalog metadata in your pod and recreate a fresh catalog structure.":
    "Dadurch werden alle Katalog-Metadaten in deinem Pod gelöscht und eine frische Katalogstruktur erstellt.",
  "grant number": "Förderkennzeichen",
  "Expand sidebar": "Sidebar ausklappen",
  "Collapse sidebar": "Sidebar einklappen",
  "Catalog downloads": "Katalog-Downloads",
  "Loading connections...": "Verbindungen werden geladen...",
  "No Solid inbox found for this profile.": "Keine Solid-Inbox für dieses Profil gefunden.",
  "Failed to load transactions.": "Transaktionen konnten nicht geladen werden.",
  Close: "Schließen",
  Confirm: "Bestätigen",
  Delete: "Löschen",
  Download: "Herunterladen",
  Preview: "Vorschau",
  Rename: "Umbenennen",
  Share: "Teilen",
  "New folder": "Neuer Ordner",
  "New file": "Neue Datei",
  "Upload file": "Datei hochladen",
  "Search files...": "Dateien suchen...",
  "Download failed.": "Download fehlgeschlagen.",
  "Delete failed.": "Löschen fehlgeschlagen.",
  "Add Dataset": "Datensatz hinzufügen",
  "Download Catalog": "Katalog herunterladen",
  "Private Registry": "Private Registry",
  "All datasets & dataset series": "Alle Datensätze und Datensatzreihen",
  "Search datasets...": "Datensätze suchen...",
  "Under Construction": "In Arbeit",
  "This section is not yet available.": "Dieser Bereich ist noch nicht verfügbar.",
  "Add Data Sources": "Datenquellen hinzufügen",
  Workspace: "Arbeitsbereich",
  Connected: "Verbunden",
  Settings: "Einstellungen",
  "Solid login is managed by Solid Dataspace": "Die Solid-Anmeldung wird von Solid Dataspace verwaltet",
  "Please log in in the main Solid Dataspace application. This app will automatically reuse the same Solid session.":
    "Bitte melde dich in der Hauptanwendung Solid Dataspace an. Diese App nutzt automatisch dieselbe Solid-Sitzung.",
  "Provider detected, but Pod URL could not be resolved":
    "Anbieter erkannt, aber Pod-URL konnte nicht ermittelt werden",
  "Solid login was detected, but the Pod URL could not be determined for this provider.":
    "Eine Solid-Anmeldung wurde erkannt, aber die Pod-URL konnte für diesen Anbieter nicht ermittelt werden.",
  "Delete data": "Daten löschen",
  "Disconnect Google Fit? New data will no longer be synchronized.":
    "Google Fit trennen? Neue Daten werden nicht mehr synchronisiert.",
  Steps: "Schritte",
  Calories: "Kalorien",
  Sleep: "Schlaf",
  "Heart rate": "Herzfrequenz",
  Weight: "Gewicht",
  "Solid Logout": "Solid abmelden",
  "Google Logout": "Google abmelden",
  "Enter a valid OIDC issuer or Pod URL.": "Gib einen gültigen OIDC-Issuer oder eine Pod-URL ein.",
  "Back to provider list": "Zurück zur Anbieter-Liste",
  "Log in with selected provider": "Mit ausgewähltem Anbieter anmelden",
  "Solid OIDC Login": "Solid-OIDC-Anmeldung",
  "Your name": "Dein Name",
  "Change profile picture": "Profilbild ändern",
  "from Google Fit": "aus Google Fit",
  "e.g. 30": "z. B. 30",
  "e.g. 175": "z. B. 175",
  "e.g. 72.5": "z. B. 72,5",
  "Loading GeoJSON...": "GeoJSON wird geladen...",
  "Error while generating local weather values.":
    "Fehler beim Generieren lokaler Wetterwerte.",
  "Error while updating catalog weather stations.":
    "Fehler beim Aktualisieren der Katalog-Wetterstationen.",
  "Soil temperature by depth": "Bodentemperatur nach Tiefe",
  "Soil moisture by depth": "Bodenfeuchte nach Tiefe",
  "Soil water column by depth": "Bodenwassersäule nach Tiefe",
  "Soil suction by depth": "Bodensaugspannung nach Tiefe",
};

Object.assign(enToDe, {
  "Suggested providers": "Vorgeschlagene Anbieter",
  "Custom issuer": "Eigener Issuer",
  "Custom Issuer URL": "Eigene Issuer-URL",
  "Register": "Registrieren",
  "Register on selected provider": "Beim ausgewählten Anbieter registrieren",
  "Checking...": "Wird geprüft...",
  "Solid Provider": "Solid-Anbieter",
  "Account login": "Kontoanmeldung",
  "Sign in to the Solid Provider.": "Melde dich beim Solid-Anbieter an.",
  "Password": "Passwort",
  "Remember me": "Angemeldet bleiben",
  "Signing in...": "Anmeldung läuft...",
  "Continue": "Weiter",
  "Register Solid account": "Solid-Konto registrieren",
  "Registration steps": "Registrierungsschritte",
  "Account": "Konto",
  "Pod": "Pod",
  "Create an account on the selected Solid Community Server.":
    "Erstelle ein Konto auf dem ausgewählten Solid Community Server.",
  "Confirm password": "Passwort bestätigen",
  "Remember account login": "Kontoanmeldung merken",
  "Choose the pod name that will be created for this account.":
    "Wähle den Pod-Namen, der für dieses Konto erstellt wird.",
  "Pod name": "Pod-Name",
  "Account and pod created": "Konto und Pod erstellt",
  "You can continue to the Solid provider authorization screen and sign in with the WebID from the new pod.":
    "Du kannst nun zur Autorisierung des Solid-Anbieters wechseln und dich mit der WebID des neuen Pods anmelden.",
  "Continue to Login": "Weiter zur Anmeldung",
  "Create account and pod": "Konto und Pod erstellen",
  "Creating...": "Wird erstellt...",
  "Creating account...": "Konto wird erstellt...",
  "Creating Solid Pod...": "Solid-Pod wird erstellt...",
  "Loading provider account API...": "Konto-API des Anbieters wird geladen...",
  "Preparing account controls...": "Kontosteuerung wird vorbereitet...",
  "Adding email/password login...": "E-Mail-/Passwort-Anmeldung wird hinzugefügt...",
  "Loading created account details...": "Erstellte Kontodetails werden geladen...",
  "Email is required.": "E-Mail ist erforderlich.",
  "Password and confirmation are required.": "Passwort und Bestätigung sind erforderlich.",
  "Passwords do not match.": "Passwörter stimmen nicht überein.",
  "Pod name is required.": "Pod-Name ist erforderlich.",
  "Pod name can use lowercase letters, numbers, dashes, and underscores.":
    "Der Pod-Name darf Kleinbuchstaben, Zahlen, Bindestriche und Unterstriche enthalten.",
  "No account API URL could be derived from this provider.":
    "Aus diesem Anbieter konnte keine Konto-API-URL abgeleitet werden.",
  "This provider does not expose account registration.":
    "Dieser Anbieter stellt keine Kontoregistrierung bereit.",
  "This provider does not expose email/password creation.":
    "Dieser Anbieter stellt keine E-Mail-/Passwort-Erstellung bereit.",
  "This provider does not expose pod creation.":
    "Dieser Anbieter stellt keine Pod-Erstellung bereit.",
  "The provider created no account token.": "Der Anbieter hat kein Konto-Token erstellt.",
  "Registration failed.": "Registrierung fehlgeschlagen.",
  "Email and password are required.": "E-Mail und Passwort sind erforderlich.",
  "No account login endpoint is available.": "Es ist kein Konto-Anmelde-Endpunkt verfügbar.",
  "The provider login returned no account token.":
    "Die Anbieter-Anmeldung hat kein Konto-Token zurückgegeben.",
  "Account login could not be initialized.": "Kontoanmeldung konnte nicht initialisiert werden.",
  "Account login failed.": "Kontoanmeldung fehlgeschlagen.",
  "Back to provider list": "Zurück zur Anbieter-Liste",
  "Loading notifications...": "Benachrichtigungen werden geladen...",
  "No access requests found.": "Keine Zugriffsanfragen gefunden.",
  "No access decisions found.": "Keine Zugriffsentscheidungen gefunden.",
  "Loading decisions...": "Entscheidungen werden geladen...",
  "Refresh": "Aktualisieren",
  "Hide closed": "Geschlossene ausblenden",
  "Clear closed": "Geschlossene löschen",
  "Clear Closed Requests": "Geschlossene Zugriffsanfragen löschen",
  "Clearing...": "Wird gelöscht...",
  "Inbox:": "Inbox:",
  "Untitled dataset": "Unbenannter Datensatz",
  "Requester:": "Anfragende Person:",
  "Requested:": "Angefragt:",
  "Message:": "Nachricht:",
  "Decision:": "Entscheidung:",
  "Decided At:": "Entschieden am:",
  "Decided:": "Entschieden:",
  "Comment:": "Kommentar:",
  "Provider:": "Anbieter:",
  "Expires:": "Läuft ab:",
  "Expiry (optional)": "Ablaufdatum (optional)",
  "Optional comment...": "Optionaler Kommentar...",
  "Approve": "Genehmigen",
  "Deny": "Ablehnen",
  "Revoke": "Widerrufen",
  "Approved": "Genehmigt",
  "Denied": "Abgelehnt",
  "Pending": "Ausstehend",
  "closed": "geschlossen",
  "unknown": "unbekannt",
  "Delete decision": "Entscheidung löschen",
  "Delete Decision": "Entscheidung löschen",
  "Delete this decision?": "Diese Entscheidung löschen?",
  "Prev": "Zurück",
  "Next": "Weiter",
  "Failed to load notifications from the Solid inbox.":
    "Benachrichtigungen konnten nicht aus der Solid-Inbox geladen werden.",
  "Failed to update access decision.": "Zugriffsentscheidung konnte nicht aktualisiert werden.",
  "Failed to clear closed requests.": "Geschlossene Anfragen konnten nicht gelöscht werden.",
  "Failed to load access decisions.": "Zugriffsentscheidungen konnten nicht geladen werden.",
  "Delete Data Connection": "Datenverbindung löschen",
  "Delete Home Assistant connection": "Home-Assistant-Verbindung löschen",
  "Delete permanently?": "Dauerhaft löschen?",
  "This connection and its stored configuration will be permanently removed from your Pod.":
    "Diese Verbindung und ihre gespeicherte Konfiguration werden dauerhaft aus deinem Pod entfernt.",
  "Add Data Connection": "Datenverbindung hinzufügen",
  "Add connection": "Verbindung hinzufügen",
  "Add data connection": "Datenverbindung hinzufügen",
  "Edit Home Assistant": "Home Assistant bearbeiten",
  "Edit Custom API": "Eigene API bearbeiten",
  "Connection type": "Verbindungstyp",
  "Entity selection": "Entitätsauswahl",
  "HTTP endpoint": "HTTP-Endpunkt",
  "Connection": "Verbindung",
  "Source request": "Quellanfrage",
  "Request method": "Anfragemethode",
  "Source endpoint": "Quellendpunkt",
  "Authentication": "Authentifizierung",
  "Long-lived access token": "Langlebiger Zugriffstoken",
  "Storage": "Speicher",
  "Pod storage document": "Pod-Speicherdokument",
  "Entities": "Entitäten",
  "Loading entities...": "Entitäten werden geladen...",
  "Search entities": "Entitäten suchen",
  "All domains": "Alle Domains",
  "Select visible": "Sichtbare auswählen",
  "Clear": "Leeren",
  "No entities match the current filter.": "Keine Entitäten passen zum aktuellen Filter.",
  "Home Assistant entities could not be loaded.":
    "Home-Assistant-Entitäten konnten nicht geladen werden.",
  "No selected Home Assistant entities were found.":
    "Keine ausgewählten Home-Assistant-Entitäten gefunden.",
  "Connection could not be saved.": "Verbindung konnte nicht gespeichert werden.",
  "Connection could not be deleted.": "Verbindung konnte nicht gelöscht werden.",
  "Connections could not be loaded.": "Verbindungen konnten nicht geladen werden.",
  "Custom connection could not be saved.": "Eigene Verbindung konnte nicht gespeichert werden.",
  "Home Assistant or custom API": "Home Assistant oder eigene API",
  "API key": "API-Schlüssel",
  "API key header": "API-Schlüssel-Header",
  "Bearer token": "Bearer-Token",
  "No auth": "Keine Authentifizierung",
  "Header name": "Header-Name",
  "Additional headers JSON": "Zusätzliche Header als JSON",
  "Last update: never": "Letzte Aktualisierung: nie",
  "Active connections": "Aktive Verbindungen",
  "Current valid access links": "Aktuell gültige Zugriffsverknüpfungen",
  "Incoming vs outgoing": "Eingehend vs. ausgehend",
  "Incoming / Outgoing": "Eingehend / Ausgehend",
  "Active datasets": "Aktive Datensätze",
  "Datasets with active access": "Datensätze mit aktivem Zugriff",
  "Tracking not enabled": "Tracking nicht aktiviert",
  "Active Dataspace Connections": "Aktive Dataspace-Verbindungen",
  "Active Connections": "Aktive Verbindungen",
  "No active connections found.": "Keine aktiven Verbindungen gefunden.",
  "No active connections": "Keine aktiven Verbindungen",
  "Direction": "Richtung",
  "Requester / Provider": "Anfragende Person / Anbieter",
  "Dataset": "Datensatz",
  "Last Update": "Letzte Aktualisierung",
  "Expires": "Läuft ab",
  "incoming": "eingehend",
  "outgoing": "ausgehend",
  "Unknown Pod": "Unbekannter Pod",
  "Unknown pod": "Unbekannter Pod",
  "Active connection": "Aktive Verbindung",
  "Plain language": "Einfach erklärt",
  "What is the Solid Dataspace?": "Was ist der Solid Dataspace?",
  "Solid Dataspace brings several tools together so data can be stored in a personal Pod, described with metadata, discovered in a catalog, and shared in a controlled way. You stay in charge of where your data lives and who can access it.":
    "Solid Dataspace verbindet mehrere Werkzeuge, damit Daten in einem persönlichen Pod gespeichert, mit Metadaten beschrieben, in einem Katalog gefunden und kontrolliert geteilt werden können. Du behältst die Kontrolle darüber, wo deine Daten liegen und wer darauf zugreifen darf.",
  "Your data, your rules": "Deine Daten, deine Regeln",
  "Your file manager for the Pod. Upload files, organize folders, and control who can access them.":
    "Dein Dateimanager für den Pod. Lade Dateien hoch, organisiere Ordner und steuere, wer darauf zugreifen darf.",
  "Files and folders": "Dateien und Ordner",
  "Maintain your WebID profile and set up the inbox, catalog, and registry. This is the foundation for everything else.":
    "Pflege dein WebID-Profil und richte Inbox, Katalog und Registry ein. Das ist die Grundlage für alles Weitere.",
  "Profile setup": "Profileinrichtung",
  "Requests arrive here when someone wants to use your data. You decide to approve, deny, or set an expiry date.":
    "Hier kommen Anfragen an, wenn jemand deine Daten nutzen möchte. Du entscheidest über Genehmigung, Ablehnung oder Ablaufdatum.",
  "Requests": "Anfragen",
  "Decisions on your own requests show up here, so you can quickly see if access was granted.":
    "Entscheidungen zu deinen eigenen Anfragen erscheinen hier, damit du schnell siehst, ob Zugriff gewährt wurde.",
  "Responses": "Antworten",
  "The discovery and publishing portal. Providers publish datasets, and others can find them and request access.":
    "Das Portal zum Finden und Veröffentlichen. Anbieter veröffentlichen Datensätze, andere können sie finden und Zugriff anfragen.",
  "Find and publish": "Finden und veröffentlichen",
  "A semantic modeling tool that adds meaning to datasets so they are easier to understand and reuse.":
    "Ein semantisches Modellierungswerkzeug, das Datensätzen Bedeutung hinzufügt, damit sie leichter verständlich und wiederverwendbar sind.",
  "Semantics": "Semantik",
  "For live data and automation. Data streams can be collected, processed, and stored directly in Pods.":
    "Für Live-Daten und Automatisierung. Datenströme können direkt gesammelt, verarbeitet und in Pods gespeichert werden.",
  "Data streams": "Datenströme",
  "Urban Heat Monitoring": "Urbanes Hitze-Monitoring",
  "An example application that uses catalog data to visualize urban heat conditions.":
    "Eine Beispielanwendung, die Katalogdaten nutzt, um urbane Hitzebedingungen zu visualisieren.",
  "Example app": "Beispiel-App",
  "How a data flow works": "So funktioniert ein Datenfluss",
  "From dataset to usage in five simple steps.": "Vom Datensatz zur Nutzung in fünf einfachen Schritten.",
  "Store data:": "Daten speichern:",
  "Files live in your Pod (via the Data Manager or Node-RED).":
    "Dateien liegen in deinem Pod (über den Data Manager oder Node-RED).",
  "Describe:": "Beschreiben:",
  "PLASMA adds meaning with metadata and semantics.":
    "PLASMA ergänzt Bedeutung durch Metadaten und Semantik.",
  "Publish:": "Veröffentlichen:",
  "The Semantic Data Catalog makes datasets discoverable.":
    "Der Semantic Data Catalog macht Datensätze auffindbar.",
  "Request:": "Anfragen:",
  "Others request access through the catalog.": "Andere fragen Zugriff über den Katalog an.",
  "Decide:": "Entscheiden:",
  "You grant or deny access. Everything stays traceable.":
    "Du gewährst oder verweigerst Zugriff. Alles bleibt nachvollziehbar.",
  "Key terms": "Wichtige Begriffe",
  "Quick definitions to get started.": "Kurze Definitionen für den Einstieg.",
  "Your personal data store online, similar to a cloud drive, but under your control.":
    "Dein persönlicher Online-Datenspeicher, ähnlich wie ein Cloud-Laufwerk, aber unter deiner Kontrolle.",
  "Your digital identity that connects you to your Pod and permissions.":
    "Deine digitale Identität, die dich mit deinem Pod und Berechtigungen verbindet.",
  "The entry point for notifications such as access requests and decisions.":
    "Der Eingangspunkt für Benachrichtigungen wie Zugriffsanfragen und Entscheidungen.",
  "A directory that describes what datasets exist and how to find them.":
    "Ein Verzeichnis, das beschreibt, welche Datensätze existieren und wie sie zu finden sind.",
  "Welcome to the Solid Dataspace": "Willkommen im Solid Dataspace",
  "Complete these steps to activate your dataspace access.":
    "Schließe diese Schritte ab, um deinen Dataspace-Zugang zu aktivieren.",
  "Please provide your profile basics.": "Bitte gib deine grundlegenden Profildaten an.",
  "Inbox, Catalog, Registry, Connections & Token":
    "Inbox, Katalog, Registry, Verbindungen und Token",
  "Configure your Solid inbox, catalog, registry settings, connections folder, and a credential token so access requests, metadata, connections, and automated access can work with your pod.":
    "Richte deine Solid-Inbox, deinen Katalog, Registry-Einstellungen, den Verbindungsordner und ein Anmeldetoken ein, damit Zugriffsanfragen, Metadaten, Verbindungen und automatisierter Zugriff mit deinem Pod funktionieren.",
  "I understand that finishing will create and configure my inbox.":
    "Ich verstehe, dass beim Abschließen meine Inbox erstellt und konfiguriert wird.",
  "I understand that finishing will create and configure my catalog.":
    "Ich verstehe, dass beim Abschließen mein Katalog erstellt und konfiguriert wird.",
  "I understand that finishing will create and configure my registry.":
    "Ich verstehe, dass beim Abschließen meine Registry erstellt und konfiguriert wird.",
  "I understand that finishing will create my connections folder.":
    "Ich verstehe, dass beim Abschließen mein Verbindungsordner erstellt wird.",
  "I understand that finishing will create and store the solid-dataspace credential token in my pod.":
    "Ich verstehe, dass beim Abschließen das solid-dataspace-Anmeldetoken in meinem Pod erstellt und gespeichert wird.",
  "I understand that finishing will register me in the selected registries.":
    "Ich verstehe, dass ich beim Abschließen in den ausgewählten Registries registriert werde.",
  "Finish": "Abschließen",
  "Preparing your profile...": "Dein Profil wird vorbereitet...",
  "Add at least one contact email.": "Füge mindestens eine Kontakt-E-Mail hinzu.",
  "Select at least one registry.": "Wähle mindestens eine Registry aus.",
  "Choose whether you want to participate in a research registry or keep a private registry inside your pod.":
    "Wähle, ob du an einer Forschungs-Registry teilnehmen oder eine private Registry in deinem Pod behalten möchtest.",
  "Research registries": "Forschungs-Registries",
  "Connections Folder": "Verbindungsordner",
  "Credential Tokens": "Anmeldetoken",
  "Credential tokens": "Anmeldetoken",
  "Create token": "Token erstellen",
  "Delete token": "Token löschen",
  "Token name": "Token-Name",
  "Token name is required.": "Token-Name ist erforderlich.",
  "Token could not be created.": "Token konnte nicht erstellt werden.",
  "Token could not be deleted.": "Token konnte nicht gelöscht werden.",
  "No credential token endpoint is available.": "Es ist kein Anmeldetoken-Endpunkt verfügbar.",
  "The provider did not return a complete credential token.":
    "Der Anbieter hat kein vollständiges Anmeldetoken zurückgegeben.",
  "Stored credential token is invalid and will be replaced.":
    "Das gespeicherte Anmeldetoken ist ungültig und wird ersetzt.",
  "Stored credential token is invalid; setup will recreate it.":
    "Das gespeicherte Anmeldetoken ist ungültig; die Einrichtung erstellt es neu.",
  "Sync worker access could not be refreshed.":
    "Der Zugriff des Sync Workers konnte nicht aktualisiert werden.",
  "Sync worker registration failed; setup will continue.":
    "Registrierung des Sync Workers fehlgeschlagen; die Einrichtung wird fortgesetzt.",
  "Account overview": "Kontoübersicht",
  "Sign in to account": "Beim Konto anmelden",
  "Sign in to the Solid Provider to load account-level pods, WebIDs, and credential tokens.":
    "Melde dich beim Solid-Anbieter an, um Pods, WebIDs und Anmeldetoken auf Kontoebene zu laden.",
  "Your account": "Dein Konto",
  "Pods": "Pods",
  "Registered Web IDs": "Registrierte WebIDs",
  "Registered WebID": "Registrierte WebID",
  "Link WebID": "WebID verknüpfen",
  "Linking...": "Wird verknüpft...",
  "WebID could not be linked.": "WebID konnte nicht verknüpft werden.",
  "No WebID linking endpoint is available.": "Es ist kein WebID-Verknüpfungsendpunkt verfügbar.",
  "WebID is required.": "WebID ist erforderlich.",
  "Enter a valid WebID URL.": "Gib eine gültige WebID-URL ein.",
  "Account information could not be loaded.": "Kontoinformationen konnten nicht geladen werden.",
  "Some account sections could not be loaded.": "Einige Kontobereiche konnten nicht geladen werden.",
  "The stored account login is no longer accepted by the provider account API.":
    "Die gespeicherte Kontoanmeldung wird von der Konto-API des Anbieters nicht mehr akzeptiert.",
  "The stored account login is no longer accepted by the provider.":
    "Die gespeicherte Kontoanmeldung wird vom Anbieter nicht mehr akzeptiert.",
  "No pod creation endpoint is available.": "Es ist kein Pod-Erstellungsendpunkt verfügbar.",
  "Pod could not be created.": "Pod konnte nicht erstellt werden.",
  "Account login is required to create a pod.":
    "Zum Erstellen eines Pods ist eine Kontoanmeldung erforderlich.",
  "Account login is required to create a token.":
    "Zum Erstellen eines Tokens ist eine Kontoanmeldung erforderlich.",
  "Account login is required to create the Solid Dataspace credential token.":
    "Zum Erstellen des Solid-Dataspace-Anmeldetokens ist eine Kontoanmeldung erforderlich.",
  "Account login is required to delete a token.":
    "Zum Löschen eines Tokens ist eine Kontoanmeldung erforderlich.",
  "Account login is required to link a WebID.":
    "Zum Verknüpfen einer WebID ist eine Kontoanmeldung erforderlich.",
});

Object.assign(enToDe, {
  Notice: "Hinweis",
  "Confirm Delete": "Löschen bestätigen",
  "Choose Solid Pod Provider": "Solid-Pod-Anbieter auswählen",
  "Please select a provider or enter your own Solid OIDC Issuer:":
    "Wähle einen Anbieter aus oder gib deinen eigenen Solid-OIDC-Issuer ein:",
  "Open in new tab": "In neuem Tab öffnen",
  "Custom API": "Eigene API",
  Port: "Port",
  Token: "Token",
  None: "Keine",
  "Home Assistant token": "Home-Assistant-Token",
  "Building API": "Gebäude-API",
  "Deleting...": "Wird gelöscht...",
  "Catalog data source": "Katalog-Datenquelle",
  "Own pod": "Eigener Pod",
  "Your Pod": "Dein Pod",
  "Pod setup": "Pod-Einrichtung",
  "Registry Mode": "Registry-Modus",
  Work: "Arbeit",
  "Upload profile photo": "Profilfoto hochladen",
  "Upload profile photo (optional)": "Profilfoto hochladen (optional)",
  "Profile avatar": "Profilavatar",
  "No photo": "Kein Foto",
  "Uploading...": "Wird hochgeladen...",
  Remove: "Entfernen",
  "Add email": "E-Mail hinzufügen",
  "The inbox will be created in a": "Die Inbox wird in einem",
  "The catalog metadata will be created in a":
    "Die Katalog-Metadaten werden in einem",
  "container in your pod.": "Container in deinem Pod erstellt.",
  "The private registry will always be created in your pod root under":
    "Die private Registry wird immer in deinem Pod-Root unter",
  "Connection settings will be stored in your pod under":
    "Verbindungseinstellungen werden in deinem Pod unter",
  ". The background sync worker will be granted access to this container so it can update selected data sources without an open browser tab.":
    ". Der Hintergrund-Sync-Worker erhält Zugriff auf diesen Container, damit er ausgewählte Datenquellen ohne geöffneten Browser-Tab aktualisieren kann.",
  "A credential token named": "Ein Anmeldetoken namens",
  "will be created and stored in your Solid Pod with its identifier and secret under":
    "wird mit Kennung und Secret in deinem Solid-Pod unter",
  "Loading profile…": "Profil wird geladen...",
  "Avatar upload failed. Please try again.":
    "Avatar-Upload fehlgeschlagen. Bitte versuche es erneut.",
  "Failed to load profile information.":
    "Profilinformationen konnten nicht geladen werden.",
  "Failed to load profile.": "Profil konnte nicht geladen werden.",
  "Saving failed. Please try again.":
    "Speichern fehlgeschlagen. Bitte versuche es erneut.",
  "Setup step failed:": "Einrichtungsschritt fehlgeschlagen:",
  "This provider does not expose credential token creation.":
    "Dieser Anbieter stellt keine Erstellung von Anmeldetoken bereit.",
  "No access to ACL.": "Kein Zugriff auf ACL.",
  "Access expired.": "Zugriff abgelaufen.",
  "Catalog URL": "Katalog-URL",
  "Solid Dataspace Catalog": "Solid-Dataspace-Katalog",
  "Owner WebID": "Eigentümer-WebID",
  Owners: "Eigentümer",
  "Public Registry": "Öffentliche Registry",
  "Failed to load decisions.": "Zugriffsentscheidungen konnten nicht geladen werden.",
  "Failed to parse decision.": "Zugriffsentscheidung konnte nicht gelesen werden.",
  "Failed to parse notification.": "Benachrichtigung konnte nicht gelesen werden.",
  "Sync worker registration failed; setup will continue.":
    "Registrierung des Sync Workers fehlgeschlagen; die Einrichtung wird fortgesetzt.",
  "https://homeassistant.example or 192.168.1.50":
    "https://homeassistant.example oder 192.168.1.50",
  "https://api.example.org or 192.168.1.20":
    "https://api.example.org oder 192.168.1.20",
  Catalog: "Katalog",
  Inbox: "Eingang",
  Comment: "Kommentar",
  expired: "abgelaufen",
  "Create pod": "Pod erstellen",
  "Client ID": "Client-ID",
  "Client secret": "Client-Secret",
  "Credential token": "Anmeldetoken",
  "Loading account information...": "Kontoinformationen werden geladen...",
  "No entries found.": "Keine Einträge gefunden.",
  "Account action failed.": "Kontoaktion fehlgeschlagen.",
  "Token WebID": "Token-WebID",
});

Object.assign(enToDe, {
  Administration: "Administration",
  "Statistics Dashboard": "Statistik-Dashboard",
  "Initialize statistics storage": "Statistikspeicher initialisieren",
  "Preparing statistics storage...": "Statistikspeicher wird vorbereitet...",
  "Checking statistics containers...": "Statistik-Container werden gepr\u00fcft...",
  "Securing statistics ACLs...": "Statistik-ACLs werden gesetzt...",
  "Statistics storage and ACLs are ready. New values appear after the next worker run.":
    "Statistikspeicher und ACLs sind bereit. Neue Werte erscheinen nach dem n\u00e4chsten Worker-Lauf.",
  "Statistics storage could not be initialized.":
    "Statistikspeicher konnte nicht initialisiert werden.",
  "Statistics storage is not configured.": "Statistikspeicher ist nicht konfiguriert.",
  "The current WebID is not a configured statistics admin.":
    "Die aktuelle WebID ist nicht als Statistik-Admin konfiguriert.",
  "Statistics worker WebID is not configured.":
    "Die WebID des Statistik-Workers ist nicht konfiguriert.",
  "An authenticated Solid fetch is required.":
    "Ein authentifizierter Solid-Zugriff ist erforderlich.",
  "No statistics snapshot exists yet. Initialize the storage and wait for the next worker run.":
    "Es ist noch kein Statistik-Snapshot vorhanden. Initialisiere den Speicher und warte auf den n\u00e4chsten Worker-Lauf.",
  "The current admin cannot read the statistics snapshot.":
    "Der aktuelle Admin kann den Statistik-Snapshot nicht lesen.",
  "The statistics snapshot could not be loaded.":
    "Der Statistik-Snapshot konnte nicht geladen werden.",
  "The statistics snapshot does not contain valid JSON.":
    "Der Statistik-Snapshot enth\u00e4lt kein g\u00fcltiges JSON.",
  "Statistics are disabled in the runtime configuration.":
    "Statistiken sind in der Laufzeitkonfiguration deaktiviert.",
  "Loading statistics snapshot...": "Statistik-Snapshot wird geladen...",
  "Statistics unavailable": "Statistiken nicht verf\u00fcgbar",
  Worker: "Worker",
  Snapshot: "Snapshot",
  "Last run": "Letzter Lauf",
  Successful: "Erfolgreich",
  Partial: "Teilweise",
  Failed: "Fehlgeschlagen",
  "Solid accounts": "Solid Accounts",
  "Active users": "Aktive Nutzer",
  "active users": "aktive Nutzer",
  active: "aktiv",
  "Catalog actions": "Katalogaktionen",
  "Catalog entries": "Katalogeintr\u00e4ge",
  datasets: "Datasets",
  series: "Serien",
  "Active users by month": "Aktive Nutzer pro Monat",
  "Active users over the last 24 months": "Aktive Nutzer der letzten 24 Monate",
  "No monthly values available yet.": "Noch keine Monatswerte vorhanden.",
  "Solid Dataspace": "Solid Dataspace",
  Pseudonym: "Pseudonym",
  "Last online": "Zuletzt online",
  "No accounts in the snapshot.": "Keine Accounts im Snapshot.",
  "Downloads and access clicks": "Downloads und Zugriffe",
  "Downloads by catalog instance": "Downloads je Kataloginstanz",
  "Catalog instance": "Kataloginstanz",
  "Dataset downloads": "Dataset-Downloads",
  "Dataset access clicks": "Dataset-Zugriffe",
  "Semantic model downloads": "Semantic-Model-Downloads",
  "Unknown dataset": "Unbekanntes Dataset",
  Total: "Gesamt",
  Downloads: "Downloads",
  "Access clicks": "Zugriffe",
  Models: "Modelle",
  "No catalog actions available yet.": "Noch keine Katalogaktionen vorhanden.",
  "Dataset metadata quality": "Dataset-Metadatenqualit\u00e4t",
  "Series metadata quality": "Serien-Metadatenqualit\u00e4t",
  entries: "Eintr\u00e4ge",
  "Metadata quality": "Metadatenqualit\u00e4t",
  "With semantic model": "Mit Semantic Model",
  Field: "Feld",
  Completed: "Ausgef\u00fcllt",
  Rate: "Quote",
  "No field rates available yet.": "Noch keine Feldquoten vorhanden.",
  Statistics: "Statistik",
});

const deToEn = Object.entries(enToDe).reduce((acc, [en, de]) => {
  acc[de] = en;
  return acc;
}, {});

const dynamicTranslations = [
  {
    en: /^The statistics snapshot could not be loaded \((\d+)\)\.$/,
    de: ([, status]) =>
      `Der Statistik-Snapshot konnte nicht geladen werden (${status}).`,
    dePattern: /^Der Statistik-Snapshot konnte nicht geladen werden \((\d+)\)\.$/,
    enText: ([, status]) =>
      `The statistics snapshot could not be loaded (${status}).`,
  },
  {
    en: /^ACL for statistics container '(.+)' could not be saved \((\d+)\)\.$/,
    de: ([, container, status]) =>
      `Die ACL f\u00fcr den Statistik-Container '${container}' konnte nicht gespeichert werden (${status}).`,
    dePattern:
      /^Die ACL f\u00fcr den Statistik-Container '(.+)' konnte nicht gespeichert werden \((\d+)\)\.$/,
    enText: ([, container, status]) =>
      `ACL for statistics container '${container}' could not be saved (${status}).`,
  },
  {
    en: /^Statistics container '(.+)' is not accessible \((\d+)\)\.$/,
    de: ([, container, status]) =>
      `Auf den Statistik-Container '${container}' kann nicht zugegriffen werden (${status}).`,
    dePattern:
      /^Auf den Statistik-Container '(.+)' kann nicht zugegriffen werden \((\d+)\)\.$/,
    enText: ([, container, status]) =>
      `Statistics container '${container}' is not accessible (${status}).`,
  },
  {
    en: /^Statistics storage was created, but (\d+) ACL\(s\) could not be secured\.$/,
    de: ([, count]) =>
      `Der Statistikspeicher wurde erstellt, aber ${count} ACL(s) konnten nicht abgesichert werden.`,
    dePattern:
      /^Der Statistikspeicher wurde erstellt, aber (\d+) ACL\(s\) konnten nicht abgesichert werden\.$/,
    enText: ([, count]) =>
      `Statistics storage was created, but ${count} ACL(s) could not be secured.`,
  },
  {
    en: /^Showing (\d+) request\(s\)$/,
    de: ([, count]) => `${count} Zugriffsanfrage(n) angezeigt`,
    dePattern: /^(\d+) Zugriffsanfrage\(n\) angezeigt$/,
    enText: ([, count]) => `Showing ${count} request(s)`,
  },
  {
    en: /^Showing (\d+) decision\(s\)$/,
    de: ([, count]) => `${count} Zugriffsentscheidung(en) angezeigt`,
    dePattern: /^(\d+) Zugriffsentscheidung\(en\) angezeigt$/,
    enText: ([, count]) => `Showing ${count} decision(s)`,
  },
  {
    en: /^Page (\d+) of (\d+)$/,
    de: ([, page, total]) => `Seite ${page} von ${total}`,
    dePattern: /^Seite (\d+) von (\d+)$/,
    enText: ([, page, total]) => `Page ${page} of ${total}`,
  },
  {
    en: /^Delete (\d+) closed request\(s\)\?$/,
    de: ([, count]) => `${count} geschlossene Zugriffsanfrage(n) löschen?`,
    dePattern: /^(\d+) geschlossene Zugriffsanfrage\(n\) löschen\?$/,
    enText: ([, count]) => `Delete ${count} closed request(s)?`,
  },
  {
    en: /^(\d+) selected$/,
    de: ([, count]) => `${count} ausgewählt`,
    dePattern: /^(\d+) ausgewählt$/,
    enText: ([, count]) => `${count} selected`,
  },
  {
    en: /^(\d+) total$/,
    de: ([, count]) => `${count} insgesamt`,
    dePattern: /^(\d+) insgesamt$/,
    enText: ([, count]) => `${count} total`,
  },
  {
    en: /^(\d+) data source point\(s\), (\d+) link\(s\)$/,
    de: ([, points, links]) => `${points} Datenquellenpunkt(e), ${links} Verbindung(en)`,
    dePattern: /^(\d+) Datenquellenpunkt\(e\), (\d+) Verbindung\(en\)$/,
    enText: ([, points, links]) => `${points} data source point(s), ${links} link(s)`,
  },
  {
    en: /^Last update: (.+)$/,
    de: ([, value]) => `Letzte Aktualisierung: ${value}`,
    dePattern: /^Letzte Aktualisierung: (.+)$/,
    enText: ([, value]) => `Last update: ${value}`,
  },
  {
    en: /^Delete token (.+)$/,
    de: ([, value]) => `Token ${value} löschen`,
    dePattern: /^Token (.+) löschen$/,
    enText: ([, value]) => `Delete token ${value}`,
  },
  {
    en: /^Delete (.+)$/,
    de: ([, value]) => `${value} löschen`,
    dePattern: /^(.+) löschen$/,
    enText: ([, value]) => `Delete ${value}`,
  },
];

function normalizeTranslationKey(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function translateDynamicText(body, target) {
  for (const entry of dynamicTranslations) {
    if (target === "de") {
      const match = body.match(entry.en);
      if (match) return entry.de(match);
      continue;
    }

    const match = body.match(entry.dePattern);
    if (match) return entry.enText(match);
  }
  return "";
}

function withOriginalWhitespace(original, translated) {
  const leading = original.match(/^\s*/)?.[0] || "";
  const trailing = original.match(/\s*$/)?.[0] || "";
  return `${leading}${translated}${trailing}`;
}

export function normalizeLanguage(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized.startsWith("de")) return "de";
  if (normalized.startsWith("en")) return "en";
  return DEFAULT_LANGUAGE;
}

export function getLanguageFromUrl() {
  if (typeof window === "undefined") return "";
  try {
    const params = new URLSearchParams(window.location.search);
    const value = params.get("lang") || params.get("language");
    return value && SUPPORTED_LANGUAGES.includes(normalizeLanguage(value))
      ? normalizeLanguage(value)
      : "";
  } catch {
    return "";
  }
}

export function readStoredLanguage() {
  if (typeof window === "undefined") return "";
  try {
    const value = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return value ? normalizeLanguage(value) : "";
  } catch {
    return "";
  }
}

export function hasStoredLanguage() {
  if (typeof window === "undefined") return false;
  try {
    return Boolean(window.localStorage.getItem(LANGUAGE_STORAGE_KEY));
  } catch {
    return false;
  }
}

export function writeStoredLanguage(language) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, normalizeLanguage(language));
  } catch {
    // Ignore storage failures.
  }
}

export function resolveInitialLanguage() {
  return getLanguageFromUrl() || readStoredLanguage() || DEFAULT_LANGUAGE;
}

export function resolveInitialLanguageSource() {
  const urlLanguage = getLanguageFromUrl();
  if (urlLanguage) return { language: urlLanguage, source: "url" };
  const storedLanguage = readStoredLanguage();
  if (storedLanguage) return { language: storedLanguage, source: "local" };
  return { language: DEFAULT_LANGUAGE, source: "default" };
}

export function translateText(value, language) {
  if (typeof value !== "string" || !value.trim()) return value;
  const body = normalizeTranslationKey(value);
  const target = normalizeLanguage(language);

  if (target === "de") {
    if (enToDe[body]) return withOriginalWhitespace(value, enToDe[body]);
    if (deToEn[body]) return value;
    const dynamic = translateDynamicText(body, target);
    return dynamic ? withOriginalWhitespace(value, dynamic) : value;
  }

  if (deToEn[body]) return withOriginalWhitespace(value, deToEn[body]);
  if (enToDe[body]) return value;
  const dynamic = translateDynamicText(body, target);
  return dynamic ? withOriginalWhitespace(value, dynamic) : value;
}

export function translate(key, language) {
  return translateText(key, language);
}

function shouldSkipElement(element) {
  if (!element || !element.tagName) return false;
  return ["SCRIPT", "STYLE", "NOSCRIPT", "CODE", "PRE", "TEXTAREA"].includes(
    element.tagName
  );
}

function translateAttributes(element, language) {
  ["title", "placeholder", "aria-label", "alt"].forEach((name) => {
    if (!element.hasAttribute?.(name)) return;
    const current = element.getAttribute(name);
    const next = translateText(current, language);
    if (next !== current) element.setAttribute(name, next);
  });
}

function translateNode(node, language) {
  if (!node) return;

  if (node.nodeType === Node.TEXT_NODE) {
    const next = translateText(node.nodeValue || "", language);
    if (next !== node.nodeValue) node.nodeValue = next;
    return;
  }

  if (node.nodeType !== Node.ELEMENT_NODE || shouldSkipElement(node)) return;
  translateAttributes(node, language);
  node.childNodes.forEach((child) => translateNode(child, language));
}

export function applyDocumentTranslations(language, root) {
  if (typeof document === "undefined") return;
  const targetRoot = root || document.body;
  if (!targetRoot) return;
  document.documentElement.lang = normalizeLanguage(language);
  translateNode(targetRoot, language);
}

export function installDomTranslator(getLanguage) {
  if (typeof document === "undefined" || typeof MutationObserver === "undefined") {
    return () => {};
  }

  let scheduled = false;
  const run = () => {
    scheduled = false;
    applyDocumentTranslations(getLanguage());
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(run);
  };

  const observer = new MutationObserver(schedule);
  if (document.body) {
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["title", "placeholder", "aria-label", "alt"],
    });
    schedule();
  }

  return () => observer.disconnect();
}

export function dispatchLanguageChange(language) {
  if (typeof window === "undefined") return;
  const normalized = normalizeLanguage(language);
  window.dispatchEvent(
    new CustomEvent(LANGUAGE_EVENT, {
      detail: { language: normalized },
    })
  );
}

export function subscribeToLanguageMessages(callback) {
  if (typeof window === "undefined") return () => {};

  const handleEvent = (event) => {
    const language = normalizeLanguage(event?.detail?.language);
    callback(language);
  };

  const handleStorage = (event) => {
    if (event.key !== LANGUAGE_STORAGE_KEY || !event.newValue) return;
    callback(normalizeLanguage(event.newValue));
  };

  const handleMessage = (event) => {
    const data = event.data || {};
    if (data.type !== LANGUAGE_MESSAGE_TYPE || !data.language) return;
    callback(normalizeLanguage(data.language));
  };

  window.addEventListener(LANGUAGE_EVENT, handleEvent);
  window.addEventListener("storage", handleStorage);
  window.addEventListener("message", handleMessage);

  return () => {
    window.removeEventListener(LANGUAGE_EVENT, handleEvent);
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener("message", handleMessage);
  };
}

const I18nContext = createContext({
  language: DEFAULT_LANGUAGE,
  setLanguage: () => {},
  syncError: "",
  t: (value) => value,
});

export function I18nProvider({
  children,
  language: controlledLanguage,
  onLanguageChange,
}) {
  const [internalLanguage, setInternalLanguage] = useState(resolveInitialLanguage);
  const [syncError, setSyncError] = useState("");
  const language = normalizeLanguage(controlledLanguage || internalLanguage);
  const languageRef = useRef(language);
  languageRef.current = language;

  const setLanguage = useCallback(
    async (nextLanguage, options = {}) => {
      const normalized = normalizeLanguage(nextLanguage);
      if (!controlledLanguage) {
        setInternalLanguage(normalized);
      }
      writeStoredLanguage(normalized);
      dispatchLanguageChange(normalized);

      try {
        await onLanguageChange?.(normalized, options);
        setSyncError("");
      } catch (error) {
        console.warn("Language preference sync failed:", error);
        setSyncError(
          "Could not save the language preference to your Solid profile. The local choice is still active."
        );
      }
    },
    [controlledLanguage, onLanguageChange]
  );

  useEffect(() => {
    applyDocumentTranslations(language);
  }, [language]);

  useEffect(() => installDomTranslator(() => languageRef.current), []);

  useEffect(
    () =>
      subscribeToLanguageMessages((nextLanguage) => {
        if (nextLanguage === languageRef.current) return;
        if (!controlledLanguage) {
          setInternalLanguage(nextLanguage);
        }
      }),
    [controlledLanguage]
  );

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      syncError,
      t: (key) => translate(key, language),
    }),
    [language, setLanguage, syncError]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}

export function LanguageSelect({ className = "", compact = false, label }) {
  const { language, setLanguage, t } = useI18n();

  return (
    <label className={`language-select ${className}`.trim()}>
      {!compact && <span className="language-select__label">{label || t("Language")}</span>}
      <select
        value={language}
        onChange={(event) => setLanguage(event.target.value)}
        aria-label={t("Language")}
        title={t("Language")}
      >
        <option value="en">{language === "de" ? "Englisch" : "English"}</option>
        <option value="de">Deutsch</option>
      </select>
    </label>
  );
}
