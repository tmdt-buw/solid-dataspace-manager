import React from 'react';
import {fireEvent,render,screen,within} from '@testing-library/react';
import DataConnection from './DataConnection';
import {prepareDataConnectionSetup} from '../dataConnectionSetup';
import {loadCustomConnections,loadHomeAssistantConnections,deleteCustomConnection,saveCustomConnection,saveHomeAssistantConnection} from '../solidConnections';
import {registerSyncWorkerParticipant} from '../syncWorkerRegistration';
import {connectionWorkerCall,loadConnectionStatus} from '../dataConnectionClient';
jest.mock('../solidSession',()=>({__esModule:true,default:{fetch:jest.fn()}}));
jest.mock('../i18n',()=>({useI18n:()=>({language:'en'})}));
jest.mock('../config/runtimeConfig',()=>({getDataspaceId:()=> 'test',getSyncWorkerConfig:()=>({intervalMinutes:10})}));
jest.mock('../dataConnectionSetup',()=>({prepareDataConnectionSetup:jest.fn()}));
jest.mock('../syncWorkerRegistration',()=>({registerSyncWorkerParticipant:jest.fn()}));
jest.mock('../dataConnectionClient',()=>({loadConnectionStatus:jest.fn(async()=>null),connectionWorkerCall:jest.fn()}));
jest.mock('../solidConnections',()=>({loadCustomConnections:jest.fn(),loadHomeAssistantConnections:jest.fn(),deleteCustomConnection:jest.fn(),deleteHomeAssistantConnection:jest.fn(),saveCustomConnection:jest.fn(),saveHomeAssistantConnection:jest.fn(),loadConnectionLastSync:jest.fn(async()=>null)}));
Object.defineProperty(global,'crypto',{value:require('crypto').webcrypto,configurable:true});
const webId='https://pod.example/alice/profile/card#me';
beforeEach(()=>{jest.clearAllMocks();prepareDataConnectionSetup.mockResolvedValue({ready:true});loadCustomConnections.mockResolvedValue([]);loadHomeAssistantConnections.mockResolvedValue([]);connectionWorkerCall.mockResolvedValue({ok:true,status:200,preview:'{}',pages:1,bytes:2});});
test('missing setup gates connection creation',async()=>{prepareDataConnectionSetup.mockResolvedValue({ready:false});render(<DataConnection webId={webId}/>);expect(await screen.findByRole('heading',{name:'Set up Data Connection'})).toBeInTheDocument();expect(screen.queryByRole('button',{name:'Add connection'})).not.toBeInTheDocument();});
test('REST editor previews through the authenticated worker and closes with Escape',async()=>{render(<DataConnection webId={webId}/>);fireEvent.click(await screen.findByRole('button',{name:'Add connection'}));const dialog=screen.getByRole('dialog');fireEvent.change(within(dialog).getByLabelText('Name'),{target:{value:'Example API'}});fireEvent.change(within(dialog).getByLabelText('URL including query parameters'),{target:{value:'https://api.example/data'}});fireEvent.click(within(dialog).getByRole('button',{name:'Test request'}));expect(await screen.findByText(/Connection test succeeded/)).toBeInTheDocument();expect(connectionWorkerCall).toHaveBeenCalledWith(webId,expect.any(Function),'preview',expect.objectContaining({kind:'custom',connection:expect.objectContaining({endpoint:'https://api.example/data'})}));fireEvent.keyDown(dialog,{key:'Escape'});expect(screen.queryByRole('dialog')).not.toBeInTheDocument();});
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
  fireEvent.click(await screen.findByRole('button',{name:'Add connection'}));
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
 render(<DataConnection webId={webId}/>);fireEvent.click(await screen.findByRole('button',{name:'Add connection'}));
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
 render(<DataConnection webId={webId}/>);fireEvent.click(await screen.findByRole('button',{name:'Add connection'}));
 fireEvent.change(screen.getByLabelText('Name'),{target:{value:'Events'}});fireEvent.change(screen.getByLabelText('URL including query parameters'),{target:{value:'https://api.example/events'}});fireEvent.change(screen.getByLabelText('Connection mode'),{target:{value:'stream'}});
 fireEvent.click(screen.getByRole('button',{name:'Save connection'}));expect(await screen.findByText('Connection settings saved.')).toBeInTheDocument();
 expect(registerSyncWorkerParticipant).toHaveBeenCalledWith(expect.objectContaining({streamsOnly:true}));
 expect(saveCustomConnection).toHaveBeenCalledWith(webId,expect.any(Function),expect.objectContaining({options:expect.objectContaining({mode:'stream',streamIntervalSeconds:0})}));
});

test('clearing a custom stream interval keeps the field available for typing',async()=>{
 render(<DataConnection webId={webId}/>);fireEvent.click(await screen.findByRole('button',{name:'Add connection'}));fireEvent.change(screen.getByLabelText('Connection mode'),{target:{value:'stream'}});
 fireEvent.click(screen.getByRole('checkbox',{name:/Use worker interval/}));
 fireEvent.change(screen.getByLabelText(/Stream storage interval/),{target:{value:''}});
 expect(screen.getByRole('checkbox',{name:/Use worker interval/})).not.toBeChecked();
 fireEvent.change(screen.getByLabelText(/Stream storage interval/),{target:{value:'30'}});expect(screen.getByLabelText(/Stream storage interval/)).toHaveValue(30);
});
