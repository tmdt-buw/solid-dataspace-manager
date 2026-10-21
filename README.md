# Solid Dataspace

Solid Dataspace is a web application for managing data in Solid Pods and authenticating with Solid.

## Access Request Inbox

The manager includes an inbox UI for Solid access request notifications. Dataset owners can review requests, approve or deny access, and optionally set an expiry date.

## Dataspace instance configuration

Set `APP_DATASPACE_ID` to the registry ID represented by this Manager deployment. The Manager adds
that value as `dataspaceId` when embedding Environmental Monitoring, so the application loads only
the matching aggregate partition. IDs are normalized to a bounded registry identifier. A missing or
invalid value fails closed by requesting the explicit unconfigured partition instead of the combined
cross-instance endpoint.

The repository's Compose file accepts `DATASPACE_ID` and falls back to
`STATISTICS_REGISTRY_CONTEXT`. In the central `solid-dataspace` Compose stack, one resolved ID is
passed to both the Manager and the catalog to keep their instance selection aligned.

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in development mode.
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

### `npm test`

Runs the test suite once.

### `npm run build`

Builds the app for production to the `build` folder.

### Production routing and legal pages

Legal notice and privacy notice open in accessible dialogs from login, registration, onboarding and the shared app footer. `legal/content.json` remains the canonical bilingual text. `scripts/build-legal-pages.cjs` generates `src/legalContent.generated.json` for the dialogs alongside the public documents; do not edit the generated module directly. Existing public URLs remain available for bookmarks and the Community Solid Server.

The Docker image serves `build/` with the checked-in `serve.json`. Use this configuration when previewing the production build:

```sh
npm run build
npx serve@14.2.6 --config serve.json -l 3301
# In a second terminal:
npm run check:production-routes -- http://127.0.0.1:3301
```

Do not add `serve -s`: that option prepends a catch-all rewrite ahead of the legal-page aliases.
The configuration keeps the `.html` links and explicitly serves their extensionless aliases before the application's fallback. The fallback excludes `/legal/**` because `serve` applies rewrite rules recursively. Both must work because browsers may have cached the previous permanent redirects. The static German and English legal pages are public and do not require a Solid session.

Routing changes require rebuilding and redeploying the Manager image; the existing Caddy proxy can stay unchanged.

### `npm run eject`

Ejects the build configuration. This is a one-way operation.

## License

This project is licensed under the Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).


## Citation

If you use this repository, please cite it using the metadata in [CITATION.cff](CITATION.cff).


Data Connection also offers an explicit **Continuous stream** mode for SSE,
NDJSON, JSON sequences and raw bytes. It defaults to the actual worker interval
for closing storage sections without reopening the source connection. The
responsive DE/EN editor supports an optional interval override, bounded preview,
connection status and pause. Streams use a separate `.stream.json` index; existing
polling connections, histories and original files are retained. The worker README
documents replay behavior, resource limits and outbox backup requirements.


## Unified connection management

Data Connection displays APIs, streams, Home Assistant and provider imports in a
single Connections list with shared search, type and active/paused filters.
Add connection first offers Own API, Stream, Home Assistant and Import template.
The chosen type opens its existing editor with the corresponding defaults.
Provider imports remain accessible without personal connection setup. Their
existing owner and target folder stay fixed, and source changes still require a
successful read-only preview. Retrieving personal APIs uses the existing bulk
sync action; each import template retains its individual run button.

This is a presentation change. Existing Pod addresses, credentials, schedules,
worker definitions and collected histories are not migrated or rewritten.


Own API connections can store a deduplicated Observation history with configurable
timestamp/identity JSON Pointers, source timezone and optional dynamic URL time
windows. Daily files and a separate observation index preserve existing connection
outputs. The Import template chooser includes Wuppertal - Climate station, combining
Cismet current readings with authenticated Heidelberg backfill. The UI is available
in German and English; source keys are never included in template defaults.


## Session expiry and reauthentication

The Dataspace host guards its shared Solid session, including the sessions passed
to embedded apps and the fetch function exposed through the host bridge. The
non-dismissible session dialog covers every host route, including iframe apps.
It responds to the SDK sessionExpired event or the recorded token expiration,
including after a suspended browser tab resumes. HTTP 401/403, other HTTP errors
and failed network requests alone never trigger reauthentication.

While expired, new shared-session requests are blocked locally and existing form
components remain mounted behind the modal. Requests are never replayed. Sign in
again revokes the workspace cookie, clears the local SDK login and starts the
normal Solid login. Revocation/login failures stay retryable in the dialog.
The return path, query and fragment are kept in tab-local storage for up to one
hour and restored after a successful login. External destinations and OAuth
callback parameters are rejected or removed. No credentials are kept in this
recovery record. Provider sessions, saved Pod data and server-side imports are
not removed. The dialog follows the host language and supports mobile layouts
and keyboard navigation.
