"""Apply immutable releases with validation, an exclusive lock and rollback.

Without --manifest the existing image pins are reapplied. Live source mounts,
secrets and data volumes are preserved. Image rollback does not revert Pod data.
"""
import argparse, datetime, fcntl, json, os, re, subprocess, time, uuid
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import urlopen
import yaml

def atomic(path, data):
    temporary = path.with_name(path.name + '.release-next')
    temporary.write_bytes(data)
    os.chmod(temporary, path.stat().st_mode & 0o777 if path.exists() else 0o600)
    temporary.replace(path)

def compose_command(directory, file):
    result = ['docker', 'compose', '--profile', 'workspaces', '--project-directory', str(directory), '-f', str(file)]
    for name in ('docker-compose.override.yml', 'docker-compose.override.yaml'):
        override = directory / name
        if override.exists(): result += ['-f', str(override)]
    return result

class ServiceStarting(RuntimeError):
    pass

def verify_route(url, route, profile_id, *, opener=urlopen, clock=time.monotonic, pause=time.sleep, startup_timeout=60):
    # Compose considers services without a healthcheck ready as soon as the
    # process starts. Allow their listener and reverse proxy to become ready.
    deadline = clock() + startup_timeout
    while True:
        try:
            with opener(url, timeout=max(0.1, min(15, deadline-clock()))) as response:
                data = response.read(65537)
                if response.status != 200 or len(data) > 65536:
                    raise RuntimeError('Updated route is unavailable: ' + url)
                if route.endswith('/health'):
                    value = json.loads(data)
                    if value.get('status') != 'ok' and value.get('ok') is not True:
                        raise ServiceStarting('Updated service is not ready: ' + url)
                elif ('"dataspaceId": "' + profile_id + '"').encode() not in data:
                    raise RuntimeError('Unexpected runtime profile: ' + url)
            return
        except HTTPError as error:
            if error.code not in (502, 503, 504):
                raise
            failure = error
        except (URLError, TimeoutError, ConnectionError, ServiceStarting) as error:
            failure = error
        remaining = deadline - clock()
        if remaining <= 0:
            raise RuntimeError('Updated route did not become ready: ' + url) from failure
        pause(min(2, remaining))

def verify_routes(environment, services, source):
    profiles = [yaml.safe_load(p.read_text()) for p in (source/'profiles').glob('*.yaml')]
    paths = set()
    if 'semantic-data-catalog-backend' in services: paths.add('/api/health')
    if 'solid-data-connection-sync-worker' in services: paths.add('/sync-worker/health')
    if 'solid-dataspace-manager' in services: paths.add('/config.js')
    for profile in profiles:
        if profile['environment'] != environment: continue
        for route in sorted(paths):
            verify_route('https://' + profile['domains'][0] + route, route, profile['id'])

def update(environment, manifest=None, services=(), *, srv=Path('/srv'), source=None, run=subprocess.run, health=verify_routes):
    source = source or Path(__file__).resolve().parents[3]/'solid-dataspace/config'
    directory = srv / ('solid-dataspace-prod' if environment == 'prod' else 'solid-dataspace-live-test')
    file = directory/'docker-compose.yml'
    with (source/'.configuration.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        original = file.read_bytes()
        current = yaml.safe_load(original)
        selected = list(dict.fromkeys(services))
        if any(s not in current['services'] for s in selected): raise ValueError('Unknown update service.')
        pins = json.loads(Path(manifest).read_text())['services'] if manifest else {}
        if manifest and (not isinstance(pins, dict) or not pins): raise ValueError('The release manifest must contain service image pins.')
        if environment == 'test' and set(pins) & {'solid-dataspace-manager','semantic-data-catalog-frontend'}:
            raise ValueError('Live frontends are source-mounted and cannot be replaced with release images.')
        if selected and set(pins)-set(selected): raise ValueError('Manifest contains services outside the selected update.')
        for service, image in pins.items():
            if service not in current['services'] or not isinstance(image,str) or not re.fullmatch(r'[a-zA-Z0-9./_-]+@sha256:[a-f0-9]{64}',image):
                raise ValueError('Expected a known service and an immutable SHA-256 image digest.')
        selected = selected or list(pins) or list(current['services'])
        command = compose_command(directory, file)
        # Remember which selected services were running. A failed update must
        # not leave previously stopped services running.
        active = run(command+['ps','--services','--status','running'], check=True, capture_output=True, text=True).stdout.split()
        stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
        backup = srv/'solid-backups'/('stack-update-'+stamp)
        backup.mkdir(mode=0o700, parents=True)
        (backup/'docker-compose.yml').write_bytes(original)
        state = {'status':'prepared','environment':environment,'services':selected,'previouslyRunning':active}
        def record(status, **extra):
            state.update(status=status, **extra)
            (backup/'result.json').write_text(json.dumps(state, indent=2)+'\n')
        for service,image in pins.items():
            current['services'][service].update(image=image,pull_policy='if_not_present')
        staged = directory/('.release-'+uuid.uuid4().hex+'.yml')
        staged.write_text(yaml.safe_dump(current,sort_keys=False))
        try:
            run(compose_command(directory,staged)+['config','--quiet'],check=True)
            for image in sorted(set(pins.values())): run(['docker','pull',image],check=True)
            if pins: atomic(file,staged.read_bytes())
            record('applying')
            try:
                run(command+['up','-d','--no-deps','--wait','--wait-timeout','180',*selected],check=True)
                health(environment,selected,source)
            except BaseException as error:
                # SIGINT/KeyboardInterrupt gets the same rollback as a failed service.
                atomic(file,original)
                try:
                    restore = [s for s in selected if s in active]
                    stop = [s for s in selected if s not in active]
                    if stop: run(command+['stop',*stop],check=True)
                    if restore:
                        run(command+['up','-d','--no-deps','--force-recreate',*restore],check=True)
                        # Older controllers acquire the configuration lock at
                        # startup. Restoration has been issued; release it
                        # before waiting for those processes to become ready.
                        fcntl.flock(lock,fcntl.LOCK_UN)
                        run(command+['up','-d','--no-deps','--wait','--wait-timeout','180',*restore],check=True)
                        health(environment,restore,source)
                    record('rolled-back',error=str(error))
                except BaseException as rollback_error:
                    record('rollback-failed',error=str(error),rollbackError=str(rollback_error))
                    raise RuntimeError('Update failed and rollback needs attention. Backup: '+str(backup)) from rollback_error
                raise RuntimeError('Update failed; previous configuration and service versions restored. Backup: '+str(backup)) from error
            record('applied')
            return backup
        finally: staged.unlink(missing_ok=True)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('environment',choices=['prod','test'])
    parser.add_argument('--manifest',type=Path)
    parser.add_argument('--service',action='append',default=[])
    args=parser.parse_args()
    backup=update(args.environment,args.manifest,args.service)
    print(args.environment+': update verified. Backup: '+str(backup))

if __name__=='__main__':main()
