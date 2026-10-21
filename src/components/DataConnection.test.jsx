import React from 'react';
import {fireEvent,render,screen,within,waitFor} from '@testing-library/react';
import DataConnection from './DataConnection';
import session from '../solidSession';
let mockLanguage = 'en';
import {prepareDataConnectionSetup} from '../dataConnectionSetup';
import {loadCustomConnections,loadHomeAssistantConnections,deleteCustomConnection,saveCustomConnection,saveHomeAssistantConnection} from '../solidConnections';
import {registerSyncWorkerParticipant} from '../syncWorkerRegistration';
import {connectionWorkerCall,loadConnectionStatus} from '../dataConnectionClient';
jest.mock('../solidSession',()=>({__esModule:true,default:{fetch:jest.fn()}}));
jest.mock('../i18n',()=>({useI18n:()=>({language:mockLanguage})}));
jest.mock('../config/runtimeConfig',()=>({getDataspaceId:()=> 'test',getSyncWorkerConfig:()=>({enabled:true,apiUrl:'/sync-worker',intervalMinutes:10})}));
jest.mock('../dataConnectionSetup',()=>({prepareDataConnectionSetup:jest.fn()}));
jest.mock('../syncWorkerRegistration',()=>({registerSyncWorkerParticipant:jest.fn()}));
jest.mock('../dataConnectionClient',()=>({loadConnectionStatus:jest.fn(async()=>null),connectionWorkerCall:jest.fn()}));
jest.mock('../solidConnections',()=>({loadCustomConnections:jest.fn(),loadHomeAssistantConnections:jest.fn(),deleteCustomConnection:jest.fn(),deleteHomeAssistantConnection:jest.fn(),saveCustomConnection:jest.fn(),saveHomeAssistantConnection:jest.fn(),loadConnectionLastSync:jest.fn(async()=>null)}));
Object.defineProperty(global,'crypto',{value:require('crypto').webcrypto,configurable:true});
const webId='https://pod.example/alice/profile/card#me';
beforeEach(()=>{jest.clearAllMocks();mockLanguage='en';session.fetch.mockResolvedValue({ok:true,json:async()=>({imports:[],templates:[]})});prepareDataConnectionSetup.mockResolvedValue({ready:true});loadCustomConnections.mockResolvedValue([]);loadHomeAssistantConnections.mockResolvedValue([]);connectionWorkerCall.mockResolvedValue({ok:true,status:200,preview:'{}',pages:1,bytes:2});});
test('missing setup gates connection creation',async()=>{prepareDataConnectionSetup.mockResolvedValue({ready:false});render(<DataConnection webId={webId}/>);expect(await screen.findByRole('heading',{name:'Set up Data Connection'})).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Add connection'}));expect(screen.getByRole('button',{name:'Own API'})).toBeDisabled();expect(screen.getByRole('button',{name:'Stream'})).toBeDisabled();});
test('REST editor previews through the authenticated worker and closes with Escape',async()=>{render(<DataConnection webId={webId}/>);fireEvent.click(await screen.findByRole('button',{name:'Add connection'})); await waitFor(()=>expect(screen.getByRole('button',{name:'Own API'})).toBeEnabled()); fireEvent.click(screen.getByRole('button',{name:'Own API'}));const dialog=screen.getByRole('dialog');fireEvent.change(within(dialog).getByLabelText('Name'),{target:{value:'Example API'}});fireEvent.change(within(dialog).getByLabelText('URL including query parameters'),{target:{value:'https://api.example/data'}});fireEvent.click(within(dialog).getByRole('button',{name:'Test request'}));expect(await screen.findByText(/Connection test succeeded/)).toBeInTheDocument();expect(connectionWorkerCall).toHaveBeenCalledWith(webId,expect.any(Function),'preview',expect.objectContaining({kind:'custom',connection:expect.objectContaining({endpoint:'https://api.example/data'})}));fireEvent.keyDown(dialog,{key:'Escape'});expect(screen.queryByRole('dialog')).not.toBeInTheDocument();});
test('deletion explains data retention and only calls configuration removal after confirmation',async()=>{loadCustomConnections.mockResolvedValue([{kind:'custom',id:'one',name:'Example',endpoint:'https://api.example/',method:'GET'}]);render(<DataConnection webId={webId}/>);fireEvent.click(await screen.findByRole('button',{name:'Delete connection: Example'}));expect(screen.getByText(/Collected data and archives stay/)).toBeInTheDocument();expect(deleteCustomConnection).not.toHaveBeenCalled();fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Delete'}));expect(await screen.findByText('Connection removed; collected data retained.')).toBeInTheDocument();expect(deleteCustomConnection).toHaveBeenCalledWith(webId,expect.any(Function),'one');});
test('editing an existing RDF connection preserves its data model and file',async()=>{
  const connection={kind:'home-assistant',id:'legacy',name:'Legacy HA',endpoint:'https://ha.example/',dataModel:'sosa-observation',storageDocumentUrl:'https://pod.example/alice/connections/test/legacy.ttl',selectedEntities:['sensor.temperature'],encryptedAccessToken:'worker-aes-gcm-v1:stored'};
  loadHomeAssistantConnections.mockResolvedValue([connection]);
  saveHomeAssistantConnection.mockResolvedValue(connection);
  render(<DataConnection webId={webId}/>);
  fireEvent.click(await screen.findByRole('button',{name:/^Legacy HA /}));
  expect(screen.getByLabelText('Pod RDF file (optional)')).toHaveValue(connection.storageDocumentUrl);
  fireEvent.click(screen.getByRole('button',{name:'Save connection'}));
  expect(await screen.findByText('Connection settings saved.')).toBeInTheDocument();
  expect(saveHomeAssistantConnection).toHaveBeenCalledWith(webId,expect.any(Function),expect.objectContaining({dataModel:'sosa-observation',storageDocumentUrl:connection.storageDocumentUrl,encryptedAccessToken:connection.encryptedAccessToken}));
});
test('a new XML POST connection defaults to original files and shows binary previews without parsing',async()=>{
  connectionWorkerCall.mockResolvedValue({ok:true,status:200,pages:1,bytes:3,binary:true,files:[{contentType:'application/pdf',bytes:3}],preview:''});
  render(<DataConnection webId={webId}/>);
  fireEvent.click(await screen.findByRole('button',{name:'Add connection'})); await waitFor(()=>expect(screen.getByRole('button',{name:'Own API'})).toBeEnabled()); fireEvent.click(screen.getByRole('button',{name:'Own API'}));
  const dialog=screen.getByRole('dialog');
  expect(within(dialog).getByLabelText('Storage mode')).toHaveValue('original');
  fireEvent.change(within(dialog).getByLabelText('Name'),{target:{value:'XML export'}});
  fireEvent.change(within(dialog).getByLabelText('URL including query parameters'),{target:{value:'https://api.example/export'}});
  fireEvent.change(within(dialog).getByLabelText('Method'),{target:{value:'POST'}});
  fireEvent.change(within(dialog).getByLabelText('Request Content-Type'),{target:{value:'application/xml'}});
  fireEvent.change(within(dialog).getByLabelText('Request body'),{target:{value:'<query>export</query>'}});
  fireEvent.click(within(dialog).getByLabelText('This POST only queries data; repeating it does not change the source.'));
  fireEvent.click(within(dialog).getByRole('button',{name:'Test request'}));
  expect(await screen.findByText('Binary response received. It will be saved as an original file.')).toBeInTheDocument();
  expect(connectionWorkerCall).toHaveBeenCalledWith(webId,expect.any(Function),'preview',expect.objectContaining({connection:expect.objectContaining({options:expect.objectContaining({requestContentType:'application/xml',requestBody:'<query>export</query>',storageMode:'original'})})}));
});
test('editing an existing REST source keeps JSON history and old pagination settings',async()=>{
  loadCustomConnections.mockResolvedValue([{kind:'custom',id:'old',name:'Old API',endpoint:'https://api.example/data',method:'GET',options:{responsePath:'/items',nextPagePath:'/next',maxPages:3}}]);
  render(<DataConnection webId={webId}/>);
  fireEvent.click(await screen.findByRole('button',{name:/^Old API /}));
  expect(screen.getByLabelText('Storage mode')).toHaveValue('history');
  expect(screen.getByLabelText('Response path (JSON Pointer)')).toHaveValue('/items');
  expect(screen.getByLabelText('Pagination')).toHaveValue('json');
  expect(screen.getByLabelText('Maximum response size (MiB)')).toHaveValue(2);
});

test('stream mode inherits the actual worker interval and preview keeps all format choices',async()=>{
 loadConnectionStatus.mockResolvedValue({syncIntervalSeconds:120,streams:[]});
 connectionWorkerCall.mockResolvedValue({ok:true,status:200,stream:true,bytes:10,events:1,preview:'data: sample'});
 render(<DataConnection webId={webId}/>);fireEvent.click(await screen.findByRole('button',{name:'Add connection'})); await waitFor(()=>expect(screen.getByRole('button',{name:'Own API'})).toBeEnabled()); fireEvent.click(screen.getByRole('button',{name:'Own API'}));
 fireEvent.change(screen.getByLabelText('Name'),{target:{value:'Events'}});fireEvent.change(screen.getByLabelText('URL including query parameters'),{target:{value:'https://api.example/events'}});
 fireEvent.change(screen.getByLabelText('Connection mode'),{target:{value:'stream'}});
 expect(screen.getByLabelText('Use worker interval (120 Seconds)')).toBeChecked();
 expect(screen.queryByLabelText('Storage mode')).not.toBeInTheDocument();
 for(const value of ['sse','ndjson','json-seq','raw']){fireEvent.change(screen.getByLabelText('Stream format'),{target:{value}});expect(screen.getByLabelText('Stream format')).toHaveValue(value);}
 fireEvent.click(screen.getByRole('button',{name:'Test stream (5 seconds)'}));
 expect(await screen.findByText('Stream preview ended without saving data.')).toBeInTheDocument();
 expect(connectionWorkerCall).toHaveBeenCalledWith(webId,expect.any(Function),'preview',expect.objectContaining({connection:expect.objectContaining({options:expect.objectContaining({mode:'stream',streamFormat:'raw',streamIntervalSeconds:0})})}));
 expect(saveCustomConnection).not.toHaveBeenCalled();
});
test('saving a stream activates streams only without triggering existing periodic connections',async()=>{
 saveCustomConnection.mockImplementation(async(_w,_f,value)=>value);
 render(<DataConnection webId={webId}/>);fireEvent.click(await screen.findByRole('button',{name:'Add connection'})); await waitFor(()=>expect(screen.getByRole('button',{name:'Own API'})).toBeEnabled()); fireEvent.click(screen.getByRole('button',{name:'Own API'}));
 fireEvent.change(screen.getByLabelText('Name'),{target:{value:'Events'}});fireEvent.change(screen.getByLabelText('URL including query parameters'),{target:{value:'https://api.example/events'}});fireEvent.change(screen.getByLabelText('Connection mode'),{target:{value:'stream'}});
 fireEvent.click(screen.getByRole('button',{name:'Save connection'}));expect(await screen.findByText('Connection settings saved.')).toBeInTheDocument();
 expect(registerSyncWorkerParticipant).toHaveBeenCalledWith(expect.objectContaining({streamsOnly:true}));
 expect(saveCustomConnection).toHaveBeenCalledWith(webId,expect.any(Function),expect.objectContaining({options:expect.objectContaining({mode:'stream',streamIntervalSeconds:0})}));
});

test('clearing a custom stream interval keeps the field available for typing',async()=>{
 render(<DataConnection webId={webId}/>);fireEvent.click(await screen.findByRole('button',{name:'Add connection'})); await waitFor(()=>expect(screen.getByRole('button',{name:'Own API'})).toBeEnabled()); fireEvent.click(screen.getByRole('button',{name:'Own API'}));fireEvent.change(screen.getByLabelText('Connection mode'),{target:{value:'stream'}});
 fireEvent.click(screen.getByRole('checkbox',{name:/Use worker interval/}));
 fireEvent.change(screen.getByLabelText(/Stream storage interval/),{target:{value:''}});
 expect(screen.getByRole('checkbox',{name:/Use worker interval/})).not.toBeChecked();
 fireEvent.change(screen.getByLabelText(/Stream storage interval/),{target:{value:'30'}});expect(screen.getByLabelText(/Stream storage interval/)).toHaveValue(30);
});

const importRow = {
 id:'one', provider:'bicycle', name:'Bicycle counters', ownerWebId:webId,
 targetBase:'https://pod.example/alice/connections/test/bicycles/', source:{devices:[]},
 enabled:false, activated:true, schedule:{kind:'daily',at:'10:10'}, state:{status:'success',lastSuccessAt:'2026-10-21T05:00:00Z'}
};
const importMetadata = { imports:[importRow], templates:[{id:'bicycle',name:'Bicycle counters',fields:[],defaultSchedule:{kind:'daily',at:'10:10'}}],issuers:['https://pod.example'],namespace:'test'};
function includeImports(metadata = importMetadata) {
 session.fetch.mockResolvedValue({ok:true,json:async()=>metadata});
}
test('one alphabetically sorted list searches and filters across APIs, streams, Home Assistant and imports',async()=>{
 includeImports();
 loadCustomConnections.mockResolvedValue([{kind:'custom',id:'one',name:'A weather API',endpoint:'https://api.example/weather',method:'GET'},{kind:'custom',id:'events',name:'C events',endpoint:'https://api.example/events',options:{mode:'stream'}}]);
 loadHomeAssistantConnections.mockResolvedValue([{kind:'home-assistant',id:'house',name:'D house',endpoint:'https://home.example/',selectedEntities:[]}]);
 const {container}=render(<DataConnection webId={webId}/>);
 await screen.findByText('D house');await screen.findByText('Bicycle counters');
 expect(container.querySelectorAll('.dc-list')).toHaveLength(1);
 expect([...container.querySelectorAll('.dc-list .dc-card-copy > strong')].map(x=>x.textContent)).toEqual(['A weather API','Bicycle counters','C events','D house']);
 expect(screen.queryByText('Scheduled imports')).not.toBeInTheDocument();
 expect(screen.getAllByRole('button',{name:'Add connection'})).toHaveLength(1);
 fireEvent.change(screen.getByLabelText('Search connections'),{target:{value:'bicycle'}});
 expect(container.querySelectorAll('.dc-card')).toHaveLength(1);
 expect(screen.getByText('Bicycle counters')).toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('Search connections'),{target:{value:''}});
 fireEvent.change(screen.getByLabelText('Connection type'),{target:{value:'import'}});
 expect(container.querySelectorAll('.dc-card')).toHaveLength(1);
 fireEvent.change(screen.getByLabelText('State'),{target:{value:'active'}});
 expect(await screen.findByText('No matching connections')).toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('State'),{target:{value:'paused'}});
 expect(screen.getByText('Bicycle counters')).toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('State'),{target:{value:'all'}});
 for(const [type,title] of [['custom','A weather API'],['stream','C events'],['home-assistant','D house']]){
  fireEvent.change(screen.getByLabelText('Connection type'),{target:{value:type}});
  expect(container.querySelectorAll('.dc-card')).toHaveLength(1);expect(screen.getByText(title)).toBeInTheDocument();
 }
 expect(connectionWorkerCall).not.toHaveBeenCalled();
 expect(saveCustomConnection).not.toHaveBeenCalled();expect(saveHomeAssistantConnection).not.toHaveBeenCalled();
});
test('the four creation choices open the correct existing editors without writing configuration',async()=>{
 includeImports();render(<DataConnection webId={webId}/>);await screen.findByText('Bicycle counters');
 for(const choice of ['Own API','Stream','Home Assistant','Import template']){
  fireEvent.click(screen.getByRole('button',{name:'Add connection'}));
  await waitFor(()=>expect(screen.getByRole('button',{name:choice,exact:true})).toBeEnabled());
  expect(within(screen.getByRole('dialog')).getAllByRole('button')).toHaveLength(6);
  fireEvent.click(screen.getByRole('button',{name:choice,exact:true}));
  if(choice==='Own API')expect(screen.getByLabelText('Connection mode')).toHaveValue('periodic');
  if(choice==='Stream')expect(screen.getByLabelText('Connection mode')).toHaveValue('stream');
  if(choice==='Home Assistant')expect(screen.getByRole('button',{name:'Load entities'})).toBeInTheDocument();
  if(choice==='Import template'){expect(screen.getByLabelText('Template')).toHaveValue('bicycle');expect(screen.getByRole('button',{name:'Create connection'})).toBeDisabled();}
  fireEvent.keyDown(screen.getByRole('dialog'),{key:'Escape'});
 }
 expect(connectionWorkerCall).not.toHaveBeenCalled();expect(saveCustomConnection).not.toHaveBeenCalled();expect(saveHomeAssistantConnection).not.toHaveBeenCalled();
});
test('existing imports remain editable without personal setup and keep owner and target locked',async()=>{
 includeImports();prepareDataConnectionSetup.mockResolvedValue({ready:false});render(<DataConnection webId={webId}/>);
 fireEvent.click(await screen.findByRole('button',{name:/^Bicycle counters Import template/}));
 expect(screen.getByLabelText('Target folder in Pod')).toHaveValue(importRow.targetBase);expect(screen.getByLabelText('Target folder in Pod')).toBeDisabled();expect(screen.getByLabelText('Pod owner (WebID)')).toBeDisabled();
 fireEvent.change(screen.getByLabelText('Time (UTC)'),{target:{value:'11:10'}});
 fireEvent.click(screen.getByRole('button',{name:'Save connection'}));
 expect(await screen.findByText('Import settings saved.')).toBeInTheDocument();
 expect(connectionWorkerCall).toHaveBeenLastCalledWith(webId,expect.any(Function),'imports',{id:'one',action:'update',changes:{enabled:false,schedule:{kind:'daily',at:'11:10'}}});
 fireEvent.click(screen.getByRole('button',{name:'Add connection'}));expect(screen.getByRole('button',{name:'Own API'})).toBeDisabled();expect(screen.getByRole('button',{name:'Import template',exact:true})).toBeEnabled();
});
test('an import-only account has no empty-connections message or misleading bulk API run',async()=>{
 includeImports();render(<DataConnection webId={webId}/>);await screen.findByText('Bicycle counters');
 expect(screen.queryByText('No connections yet')).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'Retrieve APIs now'})).not.toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Run now: Bicycle counters'})).toBeDisabled();
});
test('refresh reloads both data sources and importing uses only the import run action',async()=>{
 includeImports({...importMetadata,imports:[{...importRow,enabled:true}]});render(<DataConnection webId={webId}/>);await screen.findByText('Bicycle counters');
 await waitFor(()=>expect(screen.getByRole('button',{name:'Refresh'})).toBeEnabled());
 const count=session.fetch.mock.calls.length, native=loadCustomConnections.mock.calls.length;
 fireEvent.click(screen.getByRole('button',{name:'Refresh'}));
 await waitFor(()=>expect(session.fetch.mock.calls.length).toBeGreaterThan(count));await waitFor(()=>expect(loadCustomConnections.mock.calls.length).toBeGreaterThan(native));
 await waitFor(()=>expect(screen.getByRole('button',{name:'Refresh'})).toBeEnabled());
 fireEvent.click(screen.getByRole('button',{name:'Run now: Bicycle counters'}));
 expect(await screen.findByText('Import started.')).toBeInTheDocument();
 expect(connectionWorkerCall).toHaveBeenCalledWith(webId,expect.any(Function),'imports',{id:'one',action:'run'});
});
test('German labels cover shared list, filters and all creation choices',async()=>{
 mockLanguage='de';includeImports();render(<DataConnection webId={webId}/>);await screen.findByText('Bicycle counters');
 expect(screen.getByRole('region',{name:'Verbindungen'})).toBeInTheDocument();expect(screen.getByLabelText('Verbindungsart')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Verbindung hinzufügen'}));
 for(const label of ['Eigene API','Stream','Home Assistant','Importvorlage'])expect(screen.getByRole('button',{name:label,exact:true})).toBeInTheDocument();
 expect(document.body.textContent).not.toContain('\u00b7');
});
test('generic observation history exposes identity fields and dynamic windows and persists the chosen configuration',async()=>{
 saveCustomConnection.mockImplementation(async(_w,_f,value)=>({...value,storageDocumentUrl:'https://pod.example/alice/connections/test/measurements.json'}));
 render(<DataConnection webId={webId}/>);fireEvent.click(await screen.findByRole('button',{name:'Add connection'}));await waitFor(()=>expect(screen.getByRole('button',{name:'Own API'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'Own API'}));
 fireEvent.change(screen.getByLabelText('Name'),{target:{value:'Generic weather'}});fireEvent.change(screen.getByLabelText('URL including query parameters'),{target:{value:'https://api.example/readings?from={from}&to={to}'}});
 fireEvent.change(screen.getByLabelText('Storage mode'),{target:{value:'observations'}});
 fireEvent.change(screen.getByLabelText('Timestamp field (JSON Pointer)'),{target:{value:'/observedAt'}});fireEvent.change(screen.getByLabelText('Identity fields (JSON Pointers)'),{target:{value:'/stationId, /sensorId'}});
 fireEvent.click(screen.getByLabelText('Retrieve consecutive time windows'));
 expect(screen.getByLabelText('Initial history (hours)')).toHaveValue(24);expect(screen.getByLabelText('Maximum time window (hours)')).toHaveValue(6);expect(screen.getByLabelText('Overlap (minutes)')).toHaveValue(30);
 expect(screen.getByText(/Existing files remain unchanged/)).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Save connection'}));await screen.findByText('Connection settings saved.');
 expect(saveCustomConnection).toHaveBeenCalledWith(webId,expect.any(Function),expect.objectContaining({options:expect.objectContaining({storageMode:'observations',responseMode:'json',incremental:true,recordTimestampPath:'/observedAt',recordKeyPaths:'/stationId, /sensorId',windowHours:6})}));
});
test('invalid incremental configuration is rejected before saving any Pod settings',async()=>{
 render(<DataConnection webId={webId}/>);fireEvent.click(await screen.findByRole('button',{name:'Add connection'}));await waitFor(()=>expect(screen.getByRole('button',{name:'Own API'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'Own API'}));
 fireEvent.change(screen.getByLabelText('Name'),{target:{value:'Invalid window'}});fireEvent.change(screen.getByLabelText('URL including query parameters'),{target:{value:'https://api.example/readings'}});fireEvent.change(screen.getByLabelText('Storage mode'),{target:{value:'observations'}});fireEvent.click(screen.getByLabelText('Retrieve consecutive time windows'));fireEvent.click(screen.getByRole('button',{name:'Save connection'}));
 expect((await screen.findAllByText('Incremental retrieval requires a {from} placeholder.')).length).toBeGreaterThan(0);expect(saveCustomConnection).not.toHaveBeenCalled();
});
