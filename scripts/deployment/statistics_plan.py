"""One effective statistics policy per destination; never silently union readers."""
from urllib.parse import urlsplit

def statistics_plan(profiles, registries, environment):
    groups = {}
    for profile in profiles:
        if profile['environment'] != environment:
            continue
        stats = profile['public']['statistics']
        if not stats['enabled'] and not stats['adminWebIds']:
            continue
        base = stats['podBaseUrl'].rstrip('/') + '/'
        parsed = urlsplit(base)
        if parsed.scheme != 'https' or not parsed.hostname or parsed.query or parsed.fragment:
            raise ValueError('Ungültiger Statistik-Speicher.')
        if stats['enabled'] and not stats['adminWebIds']:
            raise ValueError('Aktive Statistiken benötigen mindestens eine berechtigte WebID.')
        key = (tuple(sorted(stats['adminWebIds'])), stats['timezone'], stats['workerWebId'], stats['activityResourcePath'])
        if base in groups and groups[base]['_policy'] != key:
            raise ValueError('Profile mit gemeinsamem Statistik-Speicher benötigen identische Leserechte, Zeitzone und Worker-Einstellungen. Für getrennte Rechte einen eigenen Statistik-Pfad verwenden.')
        group = groups.setdefault(base, {'_policy': key, 'podBaseUrl': base, 'enabled': False,
            'adminWebIds': list(key[0]), 'timezone': stats['timezone'], 'workerWebId': stats['workerWebId'],
            'activityResourcePath': stats['activityResourcePath'], 'registries': [], 'eventSources': []})
        group['enabled'] = group['enabled'] or stats['enabled']
        if stats['enabled']:
            expected = base + 'events/catalog-instances/' + profile['id'] + '/downloads/'
            if stats['eventsUrl'].rstrip('/') + '/' != expected:
                raise ValueError('Die Ereignisadresse muss zum Statistik-Speicher und zur Profilkennung gehören: ' + expected)
            registry = next(r for r in registries if r['url'].rstrip('/') == profile['public']['catalog']['defaultRegistry'].rstrip('/'))
            if registry['id'] not in {r['id'] for r in group['registries']}:
                group['registries'].append({'id': registry['id'], 'label': registry['label'], 'url': registry['url']})
            group['eventSources'].append({'id': profile['id'], 'label': profile['public']['branding']['projectName'], 'url': expected})
    result = []
    for base in sorted(groups):
        group = groups[base]
        group.pop('_policy')
        group['registries'].sort(key=lambda r:r['id'])
        group['eventSources'].sort(key=lambda r:r['id'])
        result.append(group)
    return result
