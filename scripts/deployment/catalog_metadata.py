"""Bounded, declarative catalog profiles. No executable configuration or remote fetches."""
import json
import re
from urllib.parse import urlsplit


def validate_catalog_metadata(catalog, before=None):
    def check(ok, message):
        if not ok:
            raise ValueError(message)
    def keys(value, allowed):
        check(isinstance(value, dict) and not set(value) - set(allowed), 'Unbekannte Felder im Katalogprofil.')
    def labels(value, limit=160):
        keys(value, ['de', 'en'])
        check(set(value) == {'de', 'en'}, 'Deutsch und Englisch müssen angegeben werden.')
        for text in value.values():
            check(isinstance(text, str) and len(text) <= limit and (limit > 160 or bool(text.strip())) and not any(ord(c) < 32 for c in text), 'Ungültiger Text im Katalogprofil.')
    def items(value, limit):
        check(isinstance(value, list) and len(value) <= limit, 'Zu viele Einträge im Katalogprofil.')
        ids = set()
        for item in value:
            check(isinstance(item, dict), 'Ungültiger Eintrag im Katalogprofil.')
            identifier = item.get('id')
            check(isinstance(identifier, str) and re.fullmatch(r'[a-z0-9][a-z0-9-]{0,79}', identifier) and identifier not in ids, 'Kennungen müssen eindeutig sein.')
            ids.add(identifier)
        return value
    def boolean(obj, key):
        check(type(obj.get(key)) is bool, 'Ungültiger Schalter im Katalogprofil: ' + key)
    def uri(value):
        check(isinstance(value, str) and len(value) <= 500 and not re.search(r'[\s<>"\\]', value), 'Ungültige Kategorie-Adresse.')
        try:
            u = urlsplit(value)
            check(u.scheme == 'https' and u.hostname and not u.username and not u.password and not u.query and not u.fragment and '/catalog-vocabulary/' in u.path, 'Ungültige Kategorie-Adresse.')
        except ValueError:
            raise ValueError('Ungültige Kategorie-Adresse.')
    keys(catalog, ['defaultRegistry', 'metadataProfile', 'metadataProfiles'])
    check(len(json.dumps(catalog)) < 160000, 'Das Katalogprofil ist zu groß.')
    profiles = items(catalog.get('metadataProfiles', []), 8)
    for profile in profiles:
        keys(profile, ['id', 'label', 'enabled', 'fields', 'multipleThemes'])
        labels(profile.get('label')); boolean(profile, 'enabled')
        if 'multipleThemes' in profile: boolean(profile, 'multipleThemes')
        uris = set()
        for field in items(profile.get('fields'), 24):
            keys(field, ['id', 'scheme', 'label', 'help', 'enabled', 'multiple', 'required', 'form', 'details', 'filter', 'values'])
            labels(field.get('label')); labels(field.get('help'), 800); uri(field.get('scheme'))
            check(field['scheme'] not in uris, 'Doppelte Kategorie-Adresse.'); uris.add(field['scheme'])
            for key in ['enabled', 'multiple', 'required', 'form', 'details', 'filter']: boolean(field, key)
            check(not field['required'] or (field['enabled'] and field['form']), 'Pflichtfelder müssen im Formular sichtbar und aktiv sein.')
            for value in items(field.get('values'), 80):
                keys(value, ['id', 'iri', 'label', 'enabled', 'exclusive'])
                labels(value.get('label')); uri(value.get('iri')); boolean(value, 'enabled'); boolean(value, 'exclusive')
                check(value['iri'].startswith(field['scheme'].rstrip('/') + '/') and value['iri'] not in uris, 'Auswahlwert gehört nicht eindeutig zur Kategorie.'); uris.add(value['iri'])
            check(not field['required'] or any(v['enabled'] for v in field['values']), 'Pflichtfelder benötigen aktive Auswahlwerte.')
    selected = catalog.get('metadataProfile', '')
    check(isinstance(selected, str) and (not selected or any(p['id'] == selected and p['enabled'] for p in profiles)), 'Das ausgewählte Katalogprofil ist nicht aktiv.')
    # Definitions can already be referenced by external Pods. Retain identities even
    # when there are no local references: inspecting all Pods is neither safe nor complete.
    if before:
        def retain(old, new, children, identity=None):
            mapped = {v['id']: v for v in new}
            for previous in old:
                check(previous['id'] in mapped, 'Verwendbare Definitionen bitte deaktivieren statt löschen.')
                current = mapped[previous['id']]
                if identity: check(previous[identity] == current[identity], 'Technische Kennungen dürfen nicht verändert werden.')
                if children:
                    key, next_children, next_identity = children
                    retain(previous[key], current[key], next_children, next_identity)
        retain(before.get('metadataProfiles', []), profiles, ('fields', ('values', None, 'iri'), 'scheme'))


def vocabulary_turtle(catalog):
    lines = ['@prefix skos: <http://www.w3.org/2004/02/skos/core#> .']
    # A duplicated profile intentionally reuses concept identities. One concept can
    # have only one preferred label per language, so publish the selected definition first.
    profiles = sorted(catalog.get('metadataProfiles', []), key=lambda p: p['id'] != catalog.get('metadataProfile'))
    seen = set()
    for profile in profiles:
        for field in profile['fields']:
            for identifier, labels, kind, scheme in [(field['scheme'], field['label'], 'ConceptScheme', None)] + [(v['iri'], v['label'], 'Concept', field['scheme']) for v in field['values']]:
                if identifier in seen: continue
                seen.add(identifier)
                lines.append(f'<{identifier}> a skos:{kind} ; skos:prefLabel {json.dumps(labels["de"], ensure_ascii=False)}@de, {json.dumps(labels["en"], ensure_ascii=False)}@en' + (f' ; skos:inScheme <{scheme}>' if scheme else '') + ' .')
    return '\n'.join(lines) + '\n'
