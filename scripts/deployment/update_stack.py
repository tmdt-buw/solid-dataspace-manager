"""Update a consolidated stack without replacing live source mounts.

By default reapply the currently pinned images. For a published release pass
--manifest images.json containing {"services": {"service-name": "repo@sha256:..."}}.
Only explicitly selected image pins change; existing secrets and volumes remain.
"""
import argparse
import datetime
import json
import re
import shutil
import subprocess
from pathlib import Path
import yaml

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('environment', choices=['prod', 'test'])
parser.add_argument('--manifest', type=Path)
parser.add_argument('--service', action='append', default=[])
args = parser.parse_args()
project = 'solid-dataspace-prod' if args.environment == 'prod' else 'solid-dataspace-live-test'
directory = Path('/srv') / project
path = directory / 'docker-compose.yml'
compose = yaml.safe_load(path.read_text())
for service in args.service:
    if service not in compose['services']:
        raise SystemExit('Unknown service: ' + service)
command = ['docker', 'compose', '--profile', 'workspaces', '--project-directory', str(directory)]
if args.manifest:
    manifest = json.loads(args.manifest.read_text())['services']
    if not isinstance(manifest, dict) or not manifest:
        raise SystemExit('The release manifest must contain service image pins.')
    if args.environment == 'test' and set(manifest) & {'solid-dataspace-manager','semantic-data-catalog-frontend'}:
        raise SystemExit('The live frontends are source-mounted. Update their source and dependencies instead of replacing them with release images.')
    if args.service and set(manifest) - set(args.service):
        raise SystemExit('Manifest contains services outside the selected update.')
    for service, image in manifest.items():
        if service not in compose['services'] or not isinstance(image,str) or not re.fullmatch(r'[a-zA-Z0-9./_-]+@sha256:[a-f0-9]{64}', image):
            raise SystemExit('Release images must use known services and immutable SHA-256 digests.')
    # Pull and verify every image before changing the running deployment definition.
    for image in set(manifest.values()):
        subprocess.run(['docker','pull',image],check=True)
    stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    backup=Path('/srv/solid-backups')/('stack-update-'+stamp);backup.mkdir(mode=0o700)
    shutil.copy2(path,backup/'docker-compose.yml')
    for service,image in manifest.items():
        compose['services'][service]['image']=image
        compose['services'][service]['pull_policy']='if_not_present'
    path.write_text(yaml.safe_dump(compose,sort_keys=False))
subprocess.run(command+['config','--quiet'],check=True)
subprocess.run(command+['up','-d','--wait','--wait-timeout','180',*args.service],check=True)
print(project + ': pinned deployment applied; live mounts and data volumes preserved.')
