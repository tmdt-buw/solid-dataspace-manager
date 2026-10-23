"""Validate and apply branding, app visibility and domain profile configuration.

Registry topology changes require an explicit search/worker deployment; this
command rejects them before changing live configuration.
"""
import argparse
import fcntl
import datetime
import json
import shutil
import subprocess
from pathlib import Path
from compile_config import compile_config

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('config',type=Path)
args=parser.parse_args()
# Serialize CLI updates and Admin Area transactions against the same YAML source.
configuration_lock=(args.config/'.configuration.lock').open('a')
fcntl.flock(configuration_lock,fcntl.LOCK_EX)
live=Path('/srv/solid-config/consolidated')
stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
staging=Path('/srv/solid-config')/('profiles-staging-'+stamp)
compile_config(args.config,staging)
for name in ['search-registries.json','worker-registries.json','allowed-origins.json']:
    if json.loads((staging/name).read_text())!=json.loads((live/name).read_text()):
        shutil.rmtree(staging)
        raise SystemExit('Registry or hostname topology changed. Deploy corresponding search stores, worker settings and login origins together before applying this configuration.')
# Validate using a staged runtime root; no live files are modified on failure.
base=Path('/srv/solid-config/Caddyfile').read_text()
check=staging/'Caddyfile.check'
check.write_text(base.replace('/config/consolidated/sites.caddy','/config/'+staging.name+'/sites.caddy'))
subprocess.run(['docker','exec','solid-caddy-1','caddy','validate','--config','/config/'+staging.name+'/Caddyfile.check','--adapter','caddyfile'],check=True)
backup=Path('/srv/solid-backups')/('profiles-'+stamp);backup.mkdir(mode=0o700)
shutil.copytree(live,backup/'consolidated')
try:
    # Replace each complete runtime document; readers never see half-written JSON.
    for source in staging.rglob('*'):
        if source.is_file() and source.name!='Caddyfile.check':
            target=live/source.relative_to(staging);target.parent.mkdir(parents=True,exist_ok=True)
            temporary=target.with_name(target.name+'.next');shutil.copy2(source,temporary);temporary.replace(target)
    subprocess.run(['docker','exec','solid-caddy-1','caddy','reload','--config','/etc/caddy/Caddyfile','--adapter','caddyfile'],check=True)
except Exception:
    shutil.copytree(backup/'consolidated',live,dirs_exist_ok=True)
    subprocess.run(['docker','exec','solid-caddy-1','caddy','reload','--config','/etc/caddy/Caddyfile','--adapter','caddyfile'],check=True)
    raise
finally:
    shutil.rmtree(staging)
print('Profile configuration applied without rebuilding or restarting the apps.')
