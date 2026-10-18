# Admin Area: live Test deployment

The Manager serves `/admin` with the existing Dataspace sidebar, horizontal section navigation and a mobile selector. The existing Statistics Dashboard, YAML settings, header and version are retained. The interface and review dialogs support German and English.

## Active scope and roles

Available at `/admin` on Test and the production profile domains after the 0.3.98 rollout. Reload to pick up source and runtime changes. Test and production use separate API/controller services, state and sockets; each service can edit only its own environment.

- Profile admins: `administration.adminWebIds` in `config/profiles/<id>.yaml`. Multiple exact Solid WebIDs are supported; at least one admin remains. These admins can change branding, menus and profile admin membership.
- Operators: `environments.test.operatorWebIds` in `config/administration.yaml`. Operators can create Test profiles, manage domains, providers, registry assignment, workspaces and environment-wide intervals. Operator membership is server-managed YAML, not writable through the API.
- Statistics readers: the existing `public.statistics.adminWebIds`. This role grants Statistics access without configuration editing. Operators do not automatically gain access to statistics data. Existing Pod ACLs still apply.

The initial operator and profile admin in both environments is the WebID already listed by all existing Statistics configurations:
`https://solid-community-server.tmdt.info/solidtestpod/profile/card#me`

Admin authentication continues to trust only the existing server-side identity hosts/issuers (`solid-community-server.tmdt.info`, `solidcommunity.net`). Editing public login choices does not extend this trust policy. Adding another issuer for privileged administration requires a separate server policy change.

## Profile creation and URLs

Choose **Create profile**, copy a template from the same environment, choose a stable ID, project name, primary domain and aliases, an existing publicly readable registry, and profile admin WebIDs. New domains must resolve exclusively to `serverAddresses` in the operator policy. The interface performs validation before a second, explicit activation step.

This creates a domain profile within the shared Test stack, not another complete Dataspace stack. New Node-RED and PLASMA workspaces are optional, start disabled, and receive separate networks and empty named volumes if selected. Existing user data is not copied. Registry resources must already exist; no Pod resources or ACLs are created or modified. New registry configuration is restricted to Test's runtime, search storage and cache.

The first domain is primary. Other domains can remain aliases or be listed in `redirectDomains` for a permanent redirect, retaining the request path and query. Keep the currently used address as an alias during the first save, then open the new address before removing or redirecting the old one. This keeps authentication and activation polling on a working origin.

Test and production each use a separate account handoff in their stack. `login-test.caddy` and `login-prod.caddy` route the exact origins to their own stack; the original production handoff remains the fallback. The compiler regenerates this fragment together with the domain configuration.

## Activation and recovery

Profile edits use draft → validated review → private backup → activation → health checks. Relevant changes update generated runtime files, Caddy routing, Test login origins and the affected Test services. Configuration revisions reject stale drafts and preserve intervening manual edits. Jobs run asynchronously; after a reload, the interface resumes checking the stored job ID.

The Operations section additionally controls the actual scheduler, catalog-cache, monitoring-cache and search-index intervals for this environment. It updates only services affected by the changed interval. These fields differ from the UI's per-connection suggested sync interval. Test remains read-only: statistics collection and privileged sync/scenario writes remain disabled. Credentials and Pod permissions are not changed.

Former `pending-deployment` proposals can be loaded for a new review/activation, or discarded. They are not applied automatically. History shows backups and activation outcomes; profile restoration loads a previous configuration as a draft. Global operator-policy records are not exposed to ordinary profile admins.

Transactions stage and validate Caddy configuration before writing live files. A durable private deployment journal precedes source/runtime/Compose mutations. Failed activation restores prior configuration and affected services; newly provisioned containers are removed while volumes are retained. Startup recovery runs before new jobs are accepted. No generic shell command or arbitrary Compose payload is accepted by the API.

## Service boundary and deployment

- `admin-api`: same-origin `/admin-api/*`, Solid token signature/issuer/WebID binding plus DPoP method/URL/token/replay verification; YAML read-only; no Docker socket. Bounded public network checks reject private addresses and redirects.
- `admin-controller`: private mode-0600 Unix socket, no IP network, independent role/environment/revision checks. It has the Docker socket for controlled Test Compose operations and Caddy validation/reload. It is privileged and must not have a public HTTP port.
- Each stack sets its own `ADMIN_ENVIRONMENT` (`test` or `prod`). Operator policy and preview/job/history records are private. Only public profile configuration is served through `config.js`/`env.js`.

Live Compose: `/srv/solid-dataspace-live-test/docker-compose.yml`, mirrored in `solid-dataspace/docker-compose.test.yml`. Frontend source changes are live; API/controller source changes require a targeted restart. The Dockerfiles include the controller/compiler and API preflight modules. The Manager GitHub workflow publishes versioned API/controller images alongside the Manager. The production updater receives immutable digests resolved from the successful release commit. No Pod data or ACLs are migrated by deployment.

The CLI `/srv/update-dataspace-config.sh` remains for ordinary YAML edits. It deliberately rejects domain/registry topology changes; the Admin controller coordinates those additional dependencies. Both paths share `config/.configuration.lock`. Do not restore only YAML while an activation is running. For manual recovery, first stop accepting Admin changes, inspect the private journal/history and restore runtime, source and Compose together; do not start a second worker against the same data.

## Backups and verification

- Before expansion: `/srv/solid-backups/admin-area-expansion-20261018T051924Z`.
- Earlier Admin introduction: `/srv/solid-backups/admin-area-20261017T180251Z`.
- Private history/backups and jobs: `/srv/solid-config/admin/state/{history,jobs}`.
- Temporary recovery journal: `/srv/solid-config/admin/state/deployment-journal.json`.

Automated tests cover role/environment boundaries, provisioning, fresh workspace storage, DNS/provider/registry validation, concurrent/stale changes, rollback, Solid authentication, HTTP rules and UI workflows. Browser checks use real React components with isolated API fixtures at 360, 390, 768 and 1440 px, in German and English, including native dialogs.

A live local-controller check temporarily changed the Test logo alternative text and the actual catalog-cache interval (300 to 301 seconds), confirmed activation, then restored both. This is deployment verification, not a signed-in browser test of the user's own Solid session. New external domains/workspaces have been tested with staged configurations and fixtures; no unrequested live project was created. Pod/DACE data remain unchanged. Production activation adds the Admin Area while preserving the existing branding, registry, workspaces and other public settings.

Production rollout backup: `/srv/solid-backups/release-rollout-20261018T060816Z`. Production state/socket: `/srv/solid-config/admin-prod/{state,ipc}`. Test state/socket: `/srv/solid-config/admin/{state,ipc}`.
