import preset from './dace.json';

export const labelFor = (labels, language) => labels?.[language] || labels?.en || labels?.de || '';
const copy = value => JSON.parse(JSON.stringify(value));
const identifier = () => `custom-${crypto.randomUUID()}`;
export function createDaceProfile(origin) {
  const profile = copy(preset);
  const base = new URL(`/catalog-vocabulary/${profile.id}/`, origin).href;
  profile.fields.forEach(field => {
    field.scheme = `${base}${field.id}`;
    field.values.forEach(value => { value.iri = `${field.scheme}/${value.id}`; });
  });
  return profile;
}
export function createProfile(origin) {
  return {id: identifier(), label: {de: 'Neues Katalogprofil', en: 'New catalog profile'}, enabled: true, multipleThemes: false, fields: []};
}
export function duplicateProfile(profile) {
  const result = copy(profile);
  result.id = identifier();
  result.multipleThemes = profile.multipleThemes ?? profile.id === 'dace-ce-v1';
  result.label = {de: `${profile.label.de} (Kopie)`, en: `${profile.label.en} (copy)`};
  result.enabled = true;
  return result;
}
export function createField(profile, origin) {
  const id = identifier();
  return {id, scheme: new URL(`/catalog-vocabulary/${profile.id}/${id}`, origin).href,
    label: {de: 'Neue Kategorie', en: 'New category'}, help: {de: '', en: ''}, enabled: true,
    multiple: true, required: false, form: true, details: true, filter: true, values: []};
}
export function createValue(field) {
  const id = identifier();
  return {id, iri: `${field.scheme}/${id}`, label: {de: 'Neuer Wert', en: 'New value'}, enabled: true, exclusive: false};
}
export function moveItem(items, index, offset) {
  const next = [...items], target = index + offset;
  if (target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
