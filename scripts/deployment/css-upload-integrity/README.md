# CSS upload integrity patch

This patch is for the installed Community Solid Server 7.2.0 image, including the existing Node security and login-language changes. It is deliberately guarded by source checksums. It must be reviewed again when the upstream CSS version changes.

The previous six-second write-lock expiry raced uploads without cancelling the underlying write. Files were also opened at their final paths before the request finished. This could leave truncated files, including after a failed overwrite.

The patch:

- Keeps the resource write lock until the write and its cleanup complete. The default write deadline is 30 minutes; `CSS_UPLOAD_TIMEOUT_MS` may override it between 1 second and 24 hours. Request-body timeout uses the same setting. Header timeout remains unchanged.
- Stages the complete body and metadata on the same filesystem, then publishes with rename. Failed commits restore the previous representation using temporary hard links. Existing ACL resources are not rewritten.
- Waits for stream completion and fsync before publishing body bytes. Broken connections and premature EOF remove staged data.
- Reserves `.css-upload-` filenames in every path component, rejects HTTP access to them and hides them from container listings. The actual server was checked for conflicting existing names before installation.
- Leaves the previous resource accessible after aborted uploads. Successfully completed uploads intentionally replace the selected destination. This patch cannot recover files truncated before installation.

File body publication is atomic. Body and metadata publication is not a filesystem-wide transaction: a machine crash between their renames can leave complete new body bytes with previous metadata. Hidden recovery hard links are retained if rollback fails. A hard process termination can also leave temporary files; inspect these offline before removing them. Do not run a filename-based cleanup while uploads are active. ACL files remain separate and unchanged throughout ordinary document uploads.

## Build and checks

Build from this directory with `docker build -t local/solid-css:upload-integrity-test .`. The required base image is the installed `local/solid-css:cve-2026-111497-20261102t191037z` image.

Run `upload.test.cjs` with Node's test runner inside the patched image, mounted read-only under `/tests`. Tests use synthetic temporary files, including a 200 MiB upload, interruption, rollback, different content types, hidden staging, long writes, deadline cancellation, and retained ACL bytes.

Additional HTTP/browser checks were run against a separate Pod server bound to localhost only. Never start the isolated server with live Pod storage mounted: server startup manages its resource-lock directory.

## Deployment

The shared Pod server is independent of the Dataspace application release images. Its deployment file is `/srv/solid/docker-compose.deploy.yml`. The reproducible build context is copied to `/srv/solid/upload-integrity-20261105/`. Test and Prod use this same Pod server.

Before deployment, save the current Compose file, image ID, relevant source files, and affected Pod resources with their ACLs. Retain the previous image for rollback. Recreate only the `css` service after checks, then verify OIDC discovery, public and restricted reads, container health, and unchanged protected-file checksums. No Pod-directory migration or permission migration is needed.
