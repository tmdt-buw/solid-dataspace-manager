import { connectionContainerExists, ensureConnectionsContainer } from './solidConnections';
import { registerSyncWorkerParticipant, resolveOidcIssuer } from './syncWorkerRegistration';
import { getSyncWorkerConfig } from './config/runtimeConfig';
export async function prepareDataConnectionSetup({
  webId,
  solidFetch,
  provision = false
}) {
  const status = {
    ready: false,
    connectionsReady: false,
    credentialReady: true,
    workerRegistered: false,
    workerReason: '',
    error: '',
    inspectionFailed: false
  };
  if (!webId || typeof solidFetch !== 'function') return {
    ...status,
    error: 'Sign in with Solid to manage connections.'
  };
  const config = getSyncWorkerConfig();
  if (!config.enabled) return {
    ...status,
    error: 'Data Connection is disabled for this profile.',
    workerReason: 'not-configured'
  };
  try {
    status.connectionsReady = await connectionContainerExists(webId, solidFetch);
    if (!status.connectionsReady && provision) {
      await ensureConnectionsContainer(webId, solidFetch);
      status.connectionsReady = true;
    }
    if (!status.connectionsReady) return status;
    const result = await registerSyncWorkerParticipant({
      webId,
      solidFetch,
      oidcIssuer: resolveOidcIssuer({
        webId
      })
    });
    status.workerRegistered = result?.registered === true;
    status.workerReason = result?.reason || '';
    status.ready = status.workerRegistered;
    if (!status.ready) { status.error = 'Background worker registration failed.'; status.inspectionFailed = true; }
  } catch (error) {
    status.inspectionFailed = true;
    status.error = error.message || 'Data Connection setup failed.';
  }
  return status;
}
