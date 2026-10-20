import { createSolidDataset, getSolidDataset, saveSolidDatasetAt, deleteFile } from "@inrupt/solid-client";
import { saveCustomConnection, deleteCustomConnection, deleteHomeAssistantConnection, normalizeHomeAssistantConnection } from "./solidConnections";
import { sealConnectionCredential } from "./dataConnectionClient";

jest.mock("./dataConnectionClient",()=>({ SEALED_SECRET_PREFIX:"worker-aes-gcm-v1:",sealConnectionCredential:jest.fn() }));
jest.mock("./config/runtimeConfig",()=>({getDataspaceId:()=>"test"}));
jest.mock("./solidCatalog",()=>({getPodRoot:()=>"https://pod.example/alice/"}));
jest.mock("@inrupt/solid-client",()=>({...jest.requireActual("@inrupt/solid-client"),getSolidDataset:jest.fn(),saveSolidDatasetAt:jest.fn(),deleteFile:jest.fn()}));
const webId="https://pod.example/alice/profile/card#me", fetch=jest.fn();
let stored;
beforeEach(()=>{
  jest.clearAllMocks();stored=null;
  getSolidDataset.mockImplementation(async url=>{
    if(url.endsWith("/"))return createSolidDataset();
    if(stored)return stored;
    throw Object.assign(new Error("not found"),{statusCode:404});
  });
  saveSolidDatasetAt.mockImplementation(async(url,dataset)=>{stored=dataset;return dataset;});
  sealConnectionCredential.mockResolvedValue("worker-aes-gcm-v1:sealed");
});
test("new REST credentials are sealed and stored in the isolated Test folder",async()=>{
  const result=await saveCustomConnection(webId,fetch,{id:"one",name:"Source",url:"https://api.example",port:"443",sourceEndpoint:"/data?limit=5",authType:"basic",authSecret:"private-test-value",options:{username:"alice",responsePath:"/items"}});
  expect(result.documentUrl).toBe("https://pod.example/alice/connections/test/custom-one.ttl");
  expect(sealConnectionCredential).toHaveBeenCalledWith(webId,fetch,"custom-connection-one","private-test-value","");
  expect(JSON.stringify(stored)).not.toContain("private-test-value");
  expect(result.authType).toBe("basic");expect(result.authSecret).toBe("");
  expect(result.options.responsePath).toBe("/items");
  expect(result.storageDocumentUrl).toContain("/connections/test/");
});
test("saving outside Test is rejected before network writes",async()=>{
  await expect(saveCustomConnection(webId,fetch,{id:"one",name:"Source",url:"https://api.example",port:"443",storageDocumentUrl:"https://pod.example/alice/connections/prod.json"})).rejects.toThrow(/Pod storage/);
  expect(saveSolidDatasetAt).not.toHaveBeenCalled();
});
test("removing connections never deletes histories or custom storage targets",async()=>{
  await deleteCustomConnection(webId,fetch,"one");await deleteHomeAssistantConnection(webId,fetch,"two");
  expect(deleteFile.mock.calls.map(args=>args[0])).toEqual(["https://pod.example/alice/connections/test/custom-one.ttl","https://pod.example/alice/connections/test/homeassistant-two.ttl"]);
  expect(getSolidDataset).not.toHaveBeenCalled();
});
test.each(["sdm-entity-snapshot", "sosa-observation"])("existing %s connections retain RDF storage within Test",dataModel=>{
  const connection={id:"legacy",webId,url:"https://ha.example",port:"443",accessToken:"test-token",dataModel,storageDocumentUrl:"https://pod.example/alice/connections/test/legacy.ttl"};
  expect(normalizeHomeAssistantConnection(connection)).toEqual(expect.objectContaining({dataModel,storageDocumentUrl:connection.storageDocumentUrl}));
  expect(()=>normalizeHomeAssistantConnection({...connection,storageDocumentUrl:"https://pod.example/alice/connections/legacy.ttl"})).toThrow(/Pod storage/);
  expect(()=>normalizeHomeAssistantConnection({...connection,dataModel:"solid-sync-json"})).toThrow(/Pod storage/);
});
