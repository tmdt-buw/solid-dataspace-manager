"""Validate public profile manifests and render domain-specific runtime configuration.

Usage: python3 compile_config.py CONFIG_DIRECTORY OUTPUT_DIRECTORY
Output is staged; this command never changes a running service.
"""
import copy
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlsplit

import yaml
import jsonschema

APP_PATHS = {
    'solid-data-manager': ['/solid-data-manager', '/solid-data-manager/*'],
    'catalog': ['/catalog', '/catalog/', '/semantic-data-catalog', '/semantic-data-catalog/*', '/web/catalog'],
    'plasma': ['/plasma', '/plasma/*', '/web/plasma'],
    'node-red': ['/node-red', '/node-red/*', '/web/node-red'],
    'data-connection': ['/data-connection'],
    'environmental-monitoring': ['/environmental-monitoring', '/environmental-monitoring/*', '/web/environmental-monitoring'],
    'solid-health-app': ['/solid-health-app', '/solid-health-app/*', '/web/solid-health-app', '/web/solid-health-app/*'],
    'solid-health-questionnaire': ['/solid-health-questionnaire', '/solid-health-questionnaire/*', '/web/solid-health-questionnaire'],
    'city-tours': ['/city-tours', '/city-tours/*', '/web/city-tours'],
}
PUBLIC_KEYS = {'cityToursLegacyContinuousWebIds', 'dataspaceId', 'plasmaUrl', 'apps', 'providers', 'branding', 'fundingLogos', 'fundingGrantNumber', 'syncWorker', 'statistics', 'catalog'}


def read_config(directory):
    schema = json.loads((directory / 'schema.json').read_text())
    registries = yaml.safe_load((directory / 'registries.yaml').read_text())['registries']
    profiles = [yaml.safe_load(path.read_text()) for path in sorted((directory / 'profiles').glob('*.yaml'))]
    ids, domains, registry_ids, registry_urls = set(), set(), set(), set()
    for registry in registries:
        url = urlsplit(registry['url'])
        if not re.fullmatch(r'[a-z0-9][a-z0-9-]*', registry['id']) or url.scheme != 'https' or not url.hostname or url.username or url.password or url.query or url.fragment:
            raise ValueError('Invalid registry ID or URL.')
        key = registry['url'].rstrip('/') + '/'
        if key in registry_urls or registry['id'] in registry_ids:
            raise ValueError('Duplicate registry.')
        registry_urls.add(key); registry_ids.add(registry['id'])
    for profile in profiles:
        jsonschema.validate(profile, schema)
        if profile['id'] in ids:
            raise ValueError('Duplicate profile ID.')
        ids.add(profile['id'])
        if set(profile['public']) - PUBLIC_KEYS:
            raise ValueError('Unknown public configuration property.')
        if profile['public']['dataspaceId'] != profile['id']:
            raise ValueError('Profile and public dataspace ID differ.')
        redirects=profile.get('redirectDomains',[])
        if not set(redirects)<=set(profile['domains'][1:]):raise ValueError('Invalid redirect domains.')
        for domain in profile['domains']:
            if domain in domains or not re.fullmatch(r'[a-z0-9.-]+', domain):
                raise ValueError('Invalid or duplicate domain.')
            domains.add(domain)
        apps = profile['public']['apps']
        if {app['id'] for app in apps} != set(APP_PATHS) or len(apps) != len(APP_PATHS):
            raise ValueError('Every known app must have exactly one configuration.')
        for app in apps:
            if not isinstance(app.get('visible'), bool) or not isinstance(app.get('enabled'), bool):
                raise ValueError('App visibility and enablement must be booleans.')
        if profile['public']['catalog']['defaultRegistry'].rstrip('/') + '/' not in registry_urls:
            raise ValueError('Unknown default registry.')
    if not profiles:
        raise ValueError('No profiles configured.')
    return profiles, registries


def site(profile):
    key = profile['id']
    environment = profile['environment']
    common = 'solid-dataspace-prod' if environment == 'prod' else 'solid-dataspace-live-test'
    workspace = common if environment == 'test' and key == 'test' else f'{common}-{key}'
    redirects=profile.get('redirectDomains',[])
    aliases=[d for d in profile['domains'] if d not in redirects]
    lines = [', '.join(aliases) + ' {']
    for url, name in [('/config.js', 'config.js'), ('/semantic-data-catalog/env.js', 'env.js')]:
        lines += [f'  route {url} {{', '    header Cache-Control "no-store"', '    header Vary "Host"',
                  '    header Content-Type "application/javascript; charset=utf-8"',
                  f'    root * /config/consolidated/runtime/{key}', f'    rewrite * /{name}', '    file_server', '  }']
    if profile.get('administration', {}).get('enabled'):
        lines += [f'  reverse_proxy /admin-api/* {common}-admin-api:3012']
    disabled = [path for app in profile['public']['apps'] if not app['enabled'] for path in APP_PATHS[app['id']]]
    if disabled:
        lines += ['  @disabled path ' + ' '.join(disabled), '  route @disabled {', '    respond "Application disabled for this profile." 403', '  }']
    lines += ['  @standaloneCatalog path /catalog /catalog/', '  route @standaloneCatalog {',
              '    rewrite * /semantic-data-catalog/', f'    reverse_proxy {common}-semantic-data-catalog-frontend:5000', '  }']
    for path, service, port in [('semantic-data-catalog','semantic-data-catalog-frontend',5000),('environmental-monitoring','environmental-monitoring',5173),('solid-data-manager','solid-data-manager',3002),('solid-health-app','solid-health-app',3000),('solid-health-questionnaire','solid-health-questionnaire',3007),('city-tours','city-tours',3006)]:
        lines += [f'  redir /{path} /{path}/ 308', f'  reverse_proxy /{path}/* {common}-{service}:{port}']
    lines += [f'  reverse_proxy /api/* {common}-semantic-data-catalog-backend:8000',
              '  route /sync-worker* {', '    uri strip_prefix /sync-worker', f'    reverse_proxy {common}-solid-data-connection-sync-worker:8080', '  }',
              '  redir /node-red /node-red/ 308', f'  reverse_proxy /node-red/* {workspace}-node-red:1880',
              '  redir /plasma /plasma/ 308', '  route /plasma/* {', '    uri strip_prefix /plasma',
              '    @plasmaSms path /api/sms /api/sms/*', f'    reverse_proxy @plasmaSms {workspace}-plasma-sms:8181',
              '    @plasmaDps path /api/dps /api/dps/*', f'    reverse_proxy @plasmaDps {workspace}-plasma-dps:8182',
              f'    reverse_proxy {workspace}-plasma-frontend:80', '  }',
              '  @removed path /solid-chatbot /solid-chatbot/* /solid-tours /solid-tours/*',
              '  route @removed {', '    respond "This legacy application has been retired." 410', '  }',
              '  route /web/* {', '    rewrite * /', f'    reverse_proxy {common}-solid-dataspace-manager:3001', '  }',
              f'  reverse_proxy {common}-solid-dataspace-manager:3001', '}']
    if redirects:
        lines += ['', ', '.join(redirects)+' {', f'  redir https://{profile["domains"][0]}{{uri}} 308', '}']
    return '\n'.join(lines)


def compile_config(directory, output):
    profiles, registries = read_config(directory)
    output.mkdir(parents=True, exist_ok=True)
    sites = []
    for profile in profiles:
        public = copy.deepcopy(profile['public'])
        profile_registries=[r for r in registries if r.get('environment',profile['environment'])==profile['environment']]
        public['registries'] = profile_registries
        if profile.get('administration', {}).get('enabled'):
            public['administration'] = {'enabled': True, 'apiUrl': '/admin-api'}
        runtime = output / 'runtime' / profile['id']
        runtime.mkdir(parents=True, exist_ok=True)
        (runtime / 'config.js').write_text('window.__APP_CONFIG__ = ' + json.dumps(public, ensure_ascii=False) + ';\n')
        stats = public['statistics']
        catalog = {'PUBLIC_CACHE_URL':'/sync-worker/public-cache','CATALOG_REGISTRIES':profile_registries,
                   'CATALOG_DEFAULT_REGISTRY':public['catalog']['defaultRegistry'],
                   'STATISTICS_ENABLED':stats['enabled'],'STATISTICS_POD_BASE_URL':stats['podBaseUrl'],
                   'STATISTICS_EVENTS_URL':stats['eventsUrl'],'STATISTICS_REGISTRY_CONTEXT':profile['id']}
        (runtime / 'env.js').write_text('window._env_ = ' + json.dumps(catalog,ensure_ascii=False) + ';\n')
        sites.append(site(profile))
    (output / 'sites.caddy').write_text('\n\n'.join(sites) + '\n')
    for environment,stack in [('test','solid-dataspace-live-test'),('prod','solid-dataspace-prod')]:
        origins=['https://'+domain for profile in profiles if profile['environment']==environment for domain in profile['domains']]
        (output / f'login-{environment}.caddy').write_text(
            f'@{environment}_profile_login header Origin '+' '.join(origins)+f'\nreverse_proxy @{environment}_profile_login {stack}-account-handoff:8080\n'
            if origins else f'# No {environment} login origins.\n')
    search = [{'id':entry['id'],'url':entry['url'].rstrip('/')+'/',
               'fusekiUrl':'http://semantic-data-catalog-fuseki:3030/catalog-'+entry['id']} for entry in registries]
    (output / 'search-registries.json').write_text(json.dumps(search,indent=2)+'\n')
    (output / 'worker-registries.json').write_text(json.dumps(registries,indent=2)+'\n')
    (output / 'allowed-origins.json').write_text(json.dumps(['https://'+domain for p in profiles for domain in p['domains']],indent=2)+'\n')
    fuseki = ['PREFIX fuseki: <http://jena.apache.org/fuseki#>', 'PREFIX ja: <http://jena.hpl.hp.com/2005/11/Assembler#>', 'PREFIX tdb2: <http://jena.apache.org/2016/tdb#>', '[] a fuseki:Server .']
    for entry in registries:
        key = entry['id']
        fuseki.append(f'''<#service-{key}> a fuseki:Service ;
  fuseki:name "catalog-{key}" ;
  fuseki:endpoint [ fuseki:operation fuseki:query ; fuseki:name "query" ] ;
  fuseki:endpoint [ fuseki:operation fuseki:update ; fuseki:name "update" ] ;
  fuseki:dataset <#dataset-{key}> .
<#dataset-{key}> a tdb2:DatasetTDB2 ;
  tdb2:location "/fuseki/databases/{key}" ;
  ja:context [ ja:cxtName "arq:queryTimeout" ; ja:cxtValue "15000" ] ;
  ja:context [ ja:cxtName "arq:httpServiceAllowed" ; ja:cxtValue false ] ;
  ja:context [ ja:cxtName "arq:enablePropertyFunctions" ; ja:cxtValue false ] ;
  ja:context [ ja:cxtName "tdb:unionDefaultGraph" ; ja:cxtValue true ] .''')
    (output / 'fuseki.ttl').write_text('\n\n'.join(fuseki)+'\n')
    return profiles


if __name__ == '__main__':
    profiles = compile_config(Path(sys.argv[1]),Path(sys.argv[2]))
    print(f'Validated and rendered {len(profiles)} profiles.')
