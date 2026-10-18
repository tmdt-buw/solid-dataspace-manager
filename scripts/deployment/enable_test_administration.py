"""Bootstrap the live-test admin policy from its existing statistics administrators.
No production profile is enabled or modified. Existing settings are preserved.
"""
import argparse,sys,fcntl
from pathlib import Path
import yaml
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'admin-service'))
from controller import RuntimeTransaction
p=argparse.ArgumentParser(description=__doc__);p.add_argument('source',type=Path);args=p.parse_args()
source=args.source.resolve()
configuration_lock=(source/'.configuration.lock').open('a')
fcntl.flock(configuration_lock,fcntl.LOCK_EX)
file=source/'profiles/test.yaml';before=yaml.safe_load(file.read_text())
if before['environment']!='test' or before['id']!='test':raise SystemExit('Only the test profile may be bootstrapped.')
if before.get('administration',{}).get('enabled'):raise SystemExit('Administration is already enabled; no changes made.')
admins=before['public']['statistics']['adminWebIds']
if not admins:raise SystemExit('An initial admin WebID must be configured before enabling administration.')
after={**before,'administration':{'enabled':True,'adminWebIds':admins}}
state=Path('/srv/solid-config/admin/state');state.mkdir(exist_ok=True,parents=True,mode=0o700)
runtime=RuntimeTransaction('/srv/solid-config/consolidated',state,'/srv/solid-config/Caddyfile','solid-caddy-1')
original=file.read_text()
with runtime(before,after,source):
 temp=file.with_suffix('.yaml.next');temp.write_text(original.rstrip()+'\n'+yaml.safe_dump({'administration':after['administration']},sort_keys=False));temp.replace(file)
print('Test administration enabled. Existing public YAML settings preserved.')
