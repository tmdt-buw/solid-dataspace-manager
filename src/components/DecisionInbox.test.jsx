import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { createSolidDataset, createThing, setThing, setUrl, setStringNoLocale } from '@inrupt/solid-client';
import DecisionInbox from './DecisionInbox';
const mockDocs=new Map();
jest.mock('../solidSession',()=>({__esModule:true,default:{fetch:jest.fn()}}));
jest.mock('@inrupt/solid-client',()=>({...jest.requireActual('@inrupt/solid-client'),getSolidDataset:async url=>mockDocs.get(url),getContainedResourceUrlAll:doc=>doc.contained||[]}));
const webId='https://pod.example/bob/profile/card#me',inbox='https://pod.example/bob/inbox/',NS='https://w3id.org/solid-dataspace-manager#';
function decision(name,status,minute,resource='https://pod.example/alice/data.csv') {
 const url=inbox+name;let thing=setUrl(createThing({url}),'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',NS+'AccessDecision');
 for(const[k,v]of Object.entries({requesterWebId:webId,datasetAccessUrl:resource}))thing=setUrl(thing,NS+k,v);
 for(const[k,v]of Object.entries({decision:status,datasetIdentifier:'same-id',datasetTitle:name,decidedAt:`2026-10-29T12:${minute}:00Z`}))thing=setStringNoLocale(thing,NS+k,v);
 mockDocs.set(url,setThing(createSolidDataset(),thing));return url;
}
beforeEach(()=>{mockDocs.clear();localStorage.clear();mockDocs.set(webId,setThing(createSolidDataset(),setUrl(createThing({url:webId}),'http://www.w3.org/ns/ldp#inbox',inbox)));});
test('revoked decisions are visible by default and the prior approval remains in history',async()=>{
 mockDocs.set(inbox,{contained:[decision('approval','approved','00'),decision('revocation','revoked','10')]});render(<DecisionInbox webId={webId}/>);
 await screen.findByText('revocation');expect(screen.queryByText('approval')).not.toBeInTheDocument();expect(screen.getByLabelText('Hide closed')).not.toBeChecked();
 fireEvent.click(screen.getByLabelText('Show decision history'));expect(screen.getByText('approval')).toBeInTheDocument();
 fireEvent.click(screen.getByLabelText('Hide closed'));expect(screen.queryByText('revocation')).not.toBeInTheDocument();expect(screen.getByText('Hidden by filters:',{exact:false})).toBeInTheDocument();
});
test('identical dataset identifiers from different Pods are not merged',async()=>{
 mockDocs.set(inbox,{contained:[decision('Alice','approved','00'),decision('Charlie','revoked','10','https://pod.example/charlie/data.csv')]});render(<DecisionInbox webId={webId}/>);
 await screen.findByText('Alice');expect(screen.getByText('Charlie')).toBeInTheDocument();
});
