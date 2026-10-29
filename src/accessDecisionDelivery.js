import {
  addUrl, createThing, getSolidDataset, getThing, getThingAll, getUrl, getUrlAll,
  getStringNoLocale, setThing, setStringNoLocale, setUrl, removeAll, saveSolidDatasetAt,
} from '@inrupt/solid-client';
import { SDM, buildAccessDecisionTurtle, parseAccessDecisionThing, parseAccessRequestThing } from './accessRequestModel';
const NS = 'https://w3id.org/solid-dataspace-manager#';
const TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const DELIVERY = NS + 'AccessDecisionDelivery';
const stringFields = ['requestId', 'datasetIdentifier', 'datasetTitle', 'requesterName', 'requesterEmail', 'scenarioRunId', 'applicationId', 'applicationName', 'purpose', 'dataCategory', 'outputVisibility', 'publicationScope', 'donationMode'];
const urlFields = ['requesterWebId', 'datasetAccessUrl', 'datasetSemanticModelUrl', 'catalogUrl', 'catalogDatasetUrl'];
const fresh = fetch => (url, init = {}) => fetch(url, { ...init, cache: 'no-store' });
const findRequest = (doc, url) => getThing(doc, url) || getThingAll(doc).find(thing => getUrlAll(thing, TYPE).includes(SDM.AccessRequest));

export function decisionDeliveries(doc) {
  return getThingAll(doc).filter(thing => getUrlAll(thing, TYPE).includes(DELIVERY)).map(thing => ({
    ...parseAccessDecisionThing(thing.url, addUrl(thing, TYPE, SDM.AccessDecision)),
    deliveryStatus: getStringNoLocale(thing, NS + 'deliveryStatus') || 'pending',
    deliveryError: getStringNoLocale(thing, NS + 'deliveryError') || '',
  })).sort((a, b) => Date.parse(b.decidedAt) - Date.parse(a.decidedAt));
}
export const hasUndeliveredDecision = item => item.deliveries?.some(event => event.deliveryStatus !== 'delivered') || false;
export const canClearClosedRequest = item => ['denied', 'revoked', 'expired', 'archived'].includes(item.status) && !hasUndeliveredDecision(item);

export async function recordAccessDecision({ fetch, item, decision, note = '', expiresAt = '', decidedAt, decidedBy, preserveExisting = false }) {
  fetch = fresh(fetch);
  const doc = await getSolidDataset(item.id, { fetch });
  let request = findRequest(doc, item.id);
  if (!request) throw new Error('Access request is unavailable.');
  const current = parseAccessRequestThing(item.id, request);
  if (preserveExisting && (current.status !== decision || String(current.decidedAt) !== String(decidedAt))) {
    throw new Error('The decision changed. Refresh before retrying delivery.');
  }
  // Refresh source fields instead of writing stale values from an open card.
  const eventId = crypto.randomUUID();
  const eventUrl = `${item.id.split('#')[0]}#decision-${eventId}`;
  let event = setUrl(createThing({ url: eventUrl }), TYPE, DELIVERY);
  for (const key of stringFields) if (current[key]) event = setStringNoLocale(event, NS + key, current[key]);
  for (const key of urlFields) if (current[key]) event = setUrl(event, NS + key, current[key]);
  for (const mode of current.requestedModes || []) event = addUrl(event, SDM.requestedMode, mode);
  for (const [key, value] of Object.entries({ decision, decisionId: eventId, decidedAt, decisionComment: note, expiresAt, deliveryStatus: 'pending' })) {
    if (value) event = setStringNoLocale(event, NS + key, value);
  }
  event = setUrl(event, SDM.decidedBy, decidedBy);
  event = setUrl(event, NS + 'requestResourceUrl', item.id);
  for (const [key, value] of Object.entries({ status: decision, decidedAt, decisionComment: note, expiresAt })) {
    request = removeAll(request, NS + key);
    if (value) request = setStringNoLocale(request, NS + key, value);
  }
  request = setUrl(request, SDM.decidedBy, decidedBy);
  await saveSolidDatasetAt(item.id, setThing(setThing(doc, request), event), { fetch });
  return eventUrl;
}

export async function deliverAccessDecision({ fetch, requestUrl, eventUrl }) {
  fetch = fresh(fetch);
  let doc = await getSolidDataset(requestUrl, { fetch });
  let thing = getThing(doc, eventUrl);
  if (!thing || !getUrlAll(thing, TYPE).includes(DELIVERY)) throw new Error('Saved decision is unavailable.');
  if (getStringNoLocale(thing, NS + 'deliveryStatus') === 'delivered') return { delivered: true };
  const event = decisionDeliveries(doc).find(item => item.id === eventUrl);
  let error = '';
  try {
    const profile = await getSolidDataset(event.requesterWebId.split('#')[0], { fetch });
    const inbox = getUrl(getThing(profile, event.requesterWebId), 'http://www.w3.org/ns/ldp#inbox');
    if (!inbox) throw new Error('No Solid inbox found for this profile.');
    const body = buildAccessDecisionTurtle({ item: event, decision: event.decision, note: event.decisionComment, expiresAt: event.expiresAt, decidedAt: event.decidedAt instanceof Date ? event.decidedAt.toISOString() : event.decidedAt, decidedBy: event.decidedBy, decisionId: event.decisionId, requestResourceUrl: requestUrl });
    const response = await fetch(inbox, { method: 'POST', headers: { 'Content-Type': 'text/turtle', Slug: 'access-decision-' + event.decisionId }, body });
    if (!response.ok) throw new Error(`Inbox rejected decision (${response.status}).`);
  } catch (failure) { error = failure.message || 'Decision delivery failed.'; }
  // Update only this event. A newer decision and all prior events remain intact.
  doc = await getSolidDataset(requestUrl, { fetch });
  thing = getThing(doc, eventUrl);
  if (!thing) throw new Error('Saved decision is unavailable.');
  thing = setStringNoLocale(thing, NS + 'deliveryStatus', error ? 'failed' : 'delivered');
  thing = removeAll(thing, NS + 'deliveryError');
  if (error) thing = setStringNoLocale(thing, NS + 'deliveryError', error);
  await saveSolidDatasetAt(requestUrl, setThing(doc, thing), { fetch });
  return { delivered: !error, error };
}
