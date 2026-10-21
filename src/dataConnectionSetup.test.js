import { prepareDataConnectionSetup } from './dataConnectionSetup';
import { connectionContainerExists, ensureConnectionsContainer } from './solidConnections';
import { registerSyncWorkerParticipant } from './syncWorkerRegistration';
import { getSyncWorkerConfig } from './config/runtimeConfig';
jest.mock('./solidConnections',()=>({connectionContainerExists:jest.fn(),ensureConnectionsContainer:jest.fn()}));
jest.mock('./syncWorkerRegistration',()=>({registerSyncWorkerParticipant:jest.fn(),resolveOidcIssuer:()=> 'https://pod.example'}));
jest.mock('./config/runtimeConfig',()=>({getSyncWorkerConfig:jest.fn()}));
const webId='https://pod.example/alice/profile/card#me',solidFetch=jest.fn();
beforeEach(()=>{jest.clearAllMocks();getSyncWorkerConfig.mockReturnValue({enabled:true});connectionContainerExists.mockResolvedValue(false);registerSyncWorkerParticipant.mockResolvedValue({registered:true});});
test('inspection does not create storage when setup is missing',async()=>{const status=await prepareDataConnectionSetup({webId,solidFetch});expect(status.ready).toBe(false);expect(ensureConnectionsContainer).not.toHaveBeenCalled();});
test('service access provisions storage without creating personal credentials',async()=>{const status=await prepareDataConnectionSetup({webId,solidFetch,provision:true});expect(status.ready).toBe(true);expect(ensureConnectionsContainer).toHaveBeenCalledWith(webId,solidFetch);expect(registerSyncWorkerParticipant).toHaveBeenCalledWith({webId,solidFetch,oidcIssuer:'https://pod.example'});});
test('registration failure stays visible and does not unlock the UI',async()=>{connectionContainerExists.mockResolvedValue(true);registerSyncWorkerParticipant.mockRejectedValue(new Error('Denied'));expect((await prepareDataConnectionSetup({webId,solidFetch})).error).toBe('Denied');});
test('disabled profiles never create or register anything',async()=>{getSyncWorkerConfig.mockReturnValue({enabled:false});const status=await prepareDataConnectionSetup({webId,solidFetch,provision:true});expect(status.ready).toBe(false);expect(ensureConnectionsContainer).not.toHaveBeenCalled();expect(registerSyncWorkerParticipant).not.toHaveBeenCalled();});

test('a failed inspection stays distinct from missing setup and never creates storage',async()=>{connectionContainerExists.mockRejectedValue(new TypeError('offline'));const status=await prepareDataConnectionSetup({webId,solidFetch});expect(status.inspectionFailed).toBe(true);expect(status.error).toBe('offline');expect(ensureConnectionsContainer).not.toHaveBeenCalled();});
