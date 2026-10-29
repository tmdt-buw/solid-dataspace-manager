/** @jest-environment node */
global.crypto = require('node:crypto').webcrypto;
const mockDocs=new Map(),mockSaves=[];
jest.mock('@inrupt/solid-client',()=>({...jest.requireActual('@inrupt/solid-client'),
 getSolidDataset:async url=>{if(!mockDocs.has(url))throw Error('missing');return mockDocs.get(url)},
 saveSolidDatasetAt:async(url,doc)=>{mockDocs.set(url,doc);mockSaves.push(url);return doc},
}));
const s=require('@inrupt/solid-client');
const {recordAccessDecision,deliverAccessDecision,decisionDeliveries,canClearClosedRequest}=require('./accessDecisionDelivery');
const NS='https://w3id.org/solid-dataspace-manager#',url='https://pod.example/alice/inbox/request',owner='https://pod.example/alice/profile/card#me',requester='https://pod.example/bob/profile/card#me',inbox='https://pod.example/bob/inbox/';
const item={id:url,requesterWebId:requester};
beforeEach(()=>{mockDocs.clear();mockSaves.length=0;
 let request=s.setUrl(s.createThing({url}),'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',NS+'AccessRequest');
 for(const[k,v]of Object.entries({requesterWebId:requester,catalogDatasetUrl:'https://pod.example/alice/catalog/ds/a.ttl#it',datasetAccessUrl:'https://pod.example/alice/private.csv'}))request=s.setUrl(request,NS+k,v);
 for(const[k,v]of Object.entries({requestId:'request-one',status:'pending'}))request=s.setStringNoLocale(request,NS+k,v);
 mockDocs.set(url,s.setThing(s.createSolidDataset(),request));
 mockDocs.set(requester.split('#')[0],s.setThing(s.createSolidDataset(),s.setUrl(s.createThing({url:requester}),'http://www.w3.org/ns/ldp#inbox',inbox)));
});
test('failed delivery persists, retry sends the same decision and never changes resource ACLs',async()=>{
 const eventUrl=await recordAccessDecision({fetch:jest.fn(),item,decision:'revoked',decidedAt:'2026-10-29T12:00:00Z',decidedBy:owner});
 const fetch=jest.fn().mockResolvedValueOnce({ok:false,status:403}).mockResolvedValue({ok:true,status:201});
 expect((await deliverAccessDecision({fetch,requestUrl:url,eventUrl})).delivered).toBe(false);
 let events=decisionDeliveries(mockDocs.get(url));expect(events[0]).toMatchObject({deliveryStatus:'failed',decision:'revoked',decidedBy:owner,requestId:'request-one'});
 expect(canClearClosedRequest({status:'revoked',deliveries:events})).toBe(false);
 expect((await deliverAccessDecision({fetch,requestUrl:url,eventUrl})).delivered).toBe(true);
 expect(fetch.mock.calls[0][1].body).toBe(fetch.mock.calls[1][1].body);
 expect(fetch.mock.calls[1][1].body).toContain('sdm:decisionId');
 expect(fetch.mock.calls.every(([target])=>target===inbox)).toBe(true);
 expect(mockSaves.every(target=>target===url)).toBe(true);
 await deliverAccessDecision({fetch,requestUrl:url,eventUrl});expect(fetch).toHaveBeenCalledTimes(2);
});
test('approval and revocation remain separate durable events',async()=>{
 await recordAccessDecision({fetch:jest.fn(),item,decision:'approved',decidedAt:'2026-10-29T12:00:00Z',decidedBy:owner});
 const revoked=await recordAccessDecision({fetch:jest.fn(),item,decision:'revoked',decidedAt:'2026-10-29T12:10:00Z',decidedBy:owner});
 const events=decisionDeliveries(mockDocs.get(url));expect(events.map(e=>e.decision)).toEqual(['revoked','approved']);expect(events[0].id).toBe(revoked);
 expect(s.getStringNoLocale(s.getThing(mockDocs.get(url),url),NS+'status')).toBe('revoked');
});

test('a delivery-only retry of a changed legacy decision cannot overwrite its newer state',async()=>{
 await recordAccessDecision({fetch:jest.fn(),item,decision:'revoked',decidedAt:'2026-10-29T12:10:00Z',decidedBy:owner});
 const before=mockDocs.get(url),writes=mockSaves.length;
 await expect(recordAccessDecision({fetch:jest.fn(),item,decision:'approved',decidedAt:'2026-10-29T12:00:00Z',decidedBy:owner,preserveExisting:true})).rejects.toThrow('decision changed');
 expect(mockDocs.get(url)).toBe(before);expect(mockSaves).toHaveLength(writes);
});
