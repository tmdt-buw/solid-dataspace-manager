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

### `npm run eject`

Ejects the build configuration. This is a one-way operation.

## License

This project is licensed under the Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).


## Citation

If you use this repository, please cite it using the metadata in [CITATION.cff](CITATION.cff).
