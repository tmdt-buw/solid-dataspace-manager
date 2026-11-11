"""Scoped, recoverable deployment. Only the configured environment is mutable."""
import base64, contextlib, copy, json, os, secrets, shutil, subprocess, tempfile, time
from pathlib import Path
import yaml
from config_store import ConfigError, canonical, revision, compile_config, read_config
from compile_config import login_routes
from statistics_plan import statistics_plan

WORKSPACE_SERVICES=('node-red','plasma-mariadb-sms','plasma-fuseki','plasma-sms','plasma-dps','plasma-frontend')

def encode(content):return None if content is None else base64.b64encode(content).decode()
def snapshot(path):return path.read_bytes() if path.exists() else None

def atomic(path,data,mode=None):
    path.parent.mkdir(parents=True,exist_ok=True)
    if data is None:path.unlink(missing_ok=True);return
    tmp=path.with_name(path.name+'.next');tmp.write_bytes(data)
    os.chmod(tmp,mode if mode is not None else (path.stat().st_mode & 0o777 if path.exists() else 0o600));tmp.replace(path)

def clone_workspaces(compose,profile,stack):
    """Create service definitions and fresh volumes, never copy user data."""
    common=compose['name'];identifier=profile['id']
    if profile['environment']=='test' and identifier=='test':return {},[]
    wanted={a['id'] for a in profile['public']['apps'] if a['enabled']}
    needed=[s for s in WORKSPACE_SERVICES if ('node-red' if s=='node-red' else 'plasma') in wanted and f'{identifier}-{s}' not in compose['services']]
    if not needed:return {},[]
    candidates=[k for k in compose['services'] if k=='node-red' or k.endswith('-node-red')]
    template_prefix='' if 'node-red' in candidates else candidates[0][:-len('node-red')]
    network=f'workspace-{identifier}';compose.setdefault('networks',{})[network]={'internal':True}
    files={};password=secrets.token_urlsafe(32);root_password=secrets.token_urlsafe(40)
    for name in needed:
        key=f'{identifier}-{name}';base=copy.deepcopy(compose['services'][template_prefix+name]);base.pop('container_name',None)
        original_networks=base.get('networks',{})
        base['networks']={network:{'aliases':[name]}}
        if 'edge' in original_networks:base['networks']['edge']={'aliases':[f'{common}-{identifier}-{name}']}
        if base.get('depends_on'):base['depends_on']={f'{identifier}-{dep.removeprefix(template_prefix)}':v for dep,v in base['depends_on'].items()}
        base['profiles']=['workspaces'];base['cpus']=min(float(base.get('cpus',1)),1);base['mem_limit']=base.get('mem_limit','1g')
        mounts=[]
        for volume in base.get('volumes',[]):
            if volume['type']=='volume':
                label=f"{common}_{identifier}_{name}_{volume['target'].strip('/').replace('/','_')}"
                # SMS and Fuseki must share ontology volume only within the new profile.
                if volume['target']=='/var/ontologies':label=f'{common}_{identifier}_plasma_ontologies'
                compose.setdefault('volumes',{})[label]={'name':label}
                mounts.append({**volume,'source':label})
            elif volume['type']=='bind':
                if name!='node-red' or volume['target']!='/data/settings.js':raise ConfigError('Unbekannte Arbeitsbereich-Vorlage.')
                target=stack/'workspace-config'/key/'settings.js'
                files[target]=Path(volume['source']).read_bytes()
                mounts.append({**volume,'source':str(target)})
        base['volumes']=mounts
        if name=='plasma-mariadb-sms':base.setdefault('environment',{}).update({'MARIADB_PASSWORD':password,'MARIADB_ROOT_PASSWORD':root_password})
        if name=='plasma-sms':base.setdefault('environment',{})['plasma.maria.password']=password
        # Generated secrets belong to a private env file, never to the public manifest/UI.
        private=base.pop('environment',{})
        if private:
            target=stack/'secrets'/f'admin-{key}.env'
            files[target]=''.join(f"{k}='{str(v).replace(chr(39), chr(92)+chr(39))}'\n" for k,v in private.items()).encode()
            base.setdefault('env_file',[]).append(str(target))
        compose['services'][key]=base
    return files,[f'{identifier}-{s}' for s in needed]

class Deployment:
    def __init__(self,source,live,state,stack,environment,api_container='solid-dataspace-live-test-admin-api-1',caddy='solid-caddy-1'):
        self.source=Path(source);self.live=Path(live);self.state=Path(state);self.stack=Path(stack);self.environment=environment;self.api_container=api_container;self.caddy=caddy
        self.journal=self.state/'deployment-journal.json'
    def run(self,args,**kwargs):
        try:return subprocess.run(args,check=True,capture_output=True,text=True,timeout=kwargs.pop('timeout',180),**kwargs)
        except subprocess.CalledProcessError as e:raise ConfigError('Der Dienst konnte nicht aktualisiert werden. Die vorherige Konfiguration wird wiederhergestellt.',500) from e
    def probe(self,payload):
        result=subprocess.run(['docker','exec','-i',self.api_container,'node','preflight.mjs'],input=json.dumps(payload),capture_output=True,text=True,timeout=120)
        try:response=json.loads(result.stdout)
        except ValueError:raise ConfigError('Die Verbindungsprüfung ist derzeit nicht erreichbar.',503)
        if not response.get('ok'):raise ConfigError(response.get('error','Connection check failed.'))
    def preflight(self,before,after,registries,policy):self.probe({'before':before,'after':after,'registries':registries,'policy':policy})
    def compose(self,*args,file=None,timeout=180):
        return self.run(['docker','compose','--project-directory',str(self.stack),'-f',str(file or self.stack/'docker-compose.yml'),'--profile','workspaces',*args],timeout=timeout)
    def caddy_run(self,verb,path='/etc/caddy/Caddyfile'):
        self.run(['docker','exec',self.caddy,'caddy',verb,'--config',path,'--adapter','caddyfile'],timeout=45)
    def recover(self):
        if not self.journal.exists():return
        rec=json.loads(self.journal.read_text())
        # Remove only containers created by this attempt; retain their volumes.
        for service in rec.get('newServices',[]):
            name=f'{self.stack.name}-{service}-1'
            check=subprocess.run(['docker','container','inspect',name],capture_output=True)
            if check.returncode==0:self.run(['docker','rm','-f',name])
        for filename,data in rec['files'].items():
            path=Path(filename);current=snapshot(path)
            if filename in rec.get('sources',[]) and current not in (None if data is None else base64.b64decode(data),None if rec['next'].get(filename) is None else base64.b64decode(rec['next'][filename])):continue
            atomic(path,None if data is None else base64.b64decode(data),rec.get('modes',{}).get(filename))
        old_services=[s for s in rec.get('services',[]) if s not in rec.get('newServices',[])]
        if old_services:self.compose('up','-d','--no-deps','--force-recreate','--wait','--wait-timeout','120',*old_services)
        self.caddy_run('reload')
        for path in (self.state/'history').glob('*.json'):
            entry=json.loads(path.read_text())
            if entry.get('profileId')==rec['profileId'] and ((entry.get('kind')=='platform' and revision(entry.get('policy'))==rec.get('policyRevision')) or (entry.get('kind')!='platform' and revision(entry.get('profile'))==rec['revision'])) and entry.get('status') in ('applying','applied'):
                entry['status']='rolled-back';entry['error']='Interrupted deployment was restored.';atomic(path,(canonical(entry)+'\n').encode())
        self.journal.unlink()
    @contextlib.contextmanager
    def __call__(self,before,after,source,new_registry=None,policy_candidate=None):
        if after['environment']!=self.environment:raise ConfigError('Keine Berechtigung für diese Umgebung.',403)
        self.recover()
        staging=Path(tempfile.mkdtemp(prefix='admin-deploy-',dir=self.live.parent))
        try:
            staged_source=staging/'source';shutil.copytree(source,staged_source)
            compile_config(staged_source,staging/'before')
            if (self.live/'sites.caddy').read_bytes()!=(staging/'before/sites.caddy').read_bytes():raise ConfigError('Die aktive Konfiguration weicht von den YAML-Dateien ab. Bitte zuerst abgleichen.',409)
            source_file=Path(source)/'profiles'/f"{after['id']}.yaml"
            source_changes={source_file:yaml.safe_dump(after,allow_unicode=True,sort_keys=False).encode()}
            if new_registry:
                registry_file=Path(source)/'registries.yaml';data=yaml.safe_load(registry_file.read_text());data['registries'].append(new_registry);source_changes[registry_file]=yaml.safe_dump(data,allow_unicode=True,sort_keys=False).encode()
            if policy_candidate:source_changes[Path(source)/'administration.yaml']=yaml.safe_dump(policy_candidate,allow_unicode=True,sort_keys=False).encode()
            for path,data in source_changes.items():atomic(staged_source/path.relative_to(source),data)
            compile_config(staged_source,staging/'after')
            profiles,registries=read_config(staged_source)
            scoped_profiles=[p for p in profiles if p['environment']==self.environment]
            scoped_registries=[r for r in registries if r.get('environment',self.environment)==self.environment]
            replacements={self.live/'sites.caddy':(staging/'after/sites.caddy').read_bytes()}
            for profile in profiles:
                for name in ['config.js','env.js','catalog-vocabulary.ttl']:
                    generated=staging/'after/runtime'/profile['id']/name;target=self.live/'runtime'/profile['id']/name
                    if profile['environment']!=self.environment:
                        if generated.read_bytes()!=(staging/'before/runtime'/profile['id']/name).read_bytes():raise ConfigError('Diese Änderung würde produktive Profile verändern.',409)
                    elif snapshot(target)!=generated.read_bytes():replacements[target]=generated.read_bytes()
            compose_path=self.stack/'docker-compose.yml';compose=yaml.safe_load(compose_path.read_text());original_compose=copy.deepcopy(compose)
            workspace_files,new_services=clone_workspaces(compose,after,self.stack);replacements.update(workspace_files)
            services=list(new_services)
            topology_changed=new_registry is not None
            domains_changed=before is None or before['domains']!=after['domains']
            policy=yaml.safe_load((staged_source/'administration.yaml').read_text())['environments'][self.environment]
            settings=policy.get('runtime',{})
            old_policy=yaml.safe_load((Path(source)/'administration.yaml').read_text())['environments'][self.environment]
            runtime_changed=settings!=old_policy.get('runtime',{})
            if topology_changed:
                search=[{'id':r['id'],'url':r['url'].rstrip('/')+'/','fusekiUrl':'http://semantic-data-catalog-fuseki:3030/catalog-'+r['id']} for r in scoped_registries]
                for name in ['semantic-data-catalog-backend','semantic-data-catalog-indexer']:
                    compose['services'][name].setdefault('environment',{})['CATALOG_REGISTRIES_JSON']=json.dumps(search,separators=(',',':'))
                    services.append(name)
                # Compile the environment's registry set into its own Fuseki config.
                reg_doc=yaml.safe_load((staged_source/'registries.yaml').read_text());reg_doc['registries']=scoped_registries
                isolated=staging/'isolated';shutil.copytree(staged_source,isolated)
                for p in (isolated/'profiles').glob('*.yaml'):
                    if yaml.safe_load(p.read_text())['environment']!=self.environment:p.unlink()
                (isolated/'registries.yaml').write_text(yaml.safe_dump(reg_doc))
                compile_config(isolated,staging/'registry-runtime')
                replacements[self.stack/'generated/fuseki.ttl']=(staging/'registry-runtime/fuseki.ttl').read_bytes()
                services.insert(0,'semantic-data-catalog-fuseki')
                worker=compose['services']['solid-data-connection-sync-worker'].setdefault('environment',{})
                worker['PUBLIC_CACHE_REGISTRIES_JSON']=json.dumps(scoped_registries,separators=(',',':'));worker['STATISTICS_REGISTRIES_JSON']=json.dumps(scoped_registries,separators=(',',':'))
            if domains_changed:
                scoped_origins=['https://'+d for p in scoped_profiles for d in p['domains']]
                if 'account-handoff' in compose['services']:
                    compose['services']['account-handoff'].setdefault('environment',{})['DATASPACE_ORIGINS']=json.dumps(scoped_origins,separators=(',',':'))
                    replacements[self.live/f'login-{self.environment}.caddy']=login_routes(self.environment, self.stack.name, scoped_origins).encode()
                    services.append('account-handoff')
                origins=','.join('https://'+d for p in profiles for d in p['domains'])
                compose['services']['solid-data-connection-sync-worker'].setdefault('environment',{})['WORKER_ALLOWED_ORIGINS']=origins
            if topology_changed or domains_changed:services.append('solid-data-connection-sync-worker')
            if runtime_changed:
                worker=compose['services']['solid-data-connection-sync-worker'].setdefault('environment',{})
                for key,env in [('syncTickSeconds','WORKER_SYNC_TICK_SECONDS'),('catalogCacheSeconds','PUBLIC_CACHE_CATALOG_REFRESH_SECONDS'),('monitoringCacheSeconds','PUBLIC_CACHE_MONITORING_REFRESH_SECONDS')]:
                    if key in settings and settings[key]!=old_policy.get('runtime',{}).get(key):worker[env]=str(settings[key]);services.append('solid-data-connection-sync-worker')
                for name in ['semantic-data-catalog-backend','semantic-data-catalog-indexer']:
                    if 'indexIntervalSeconds' in settings and settings['indexIntervalSeconds']!=old_policy.get('runtime',{}).get('indexIntervalSeconds'):compose['services'][name].setdefault('environment',{}).update({'CATALOG_INDEX_INTERVAL_SECONDS':str(settings['indexIntervalSeconds']),'CATALOG_INDEX_MAX_AGE_SECONDS':str(settings['indexIntervalSeconds'] * 3)});services.append(name)
            old_profiles, old_registries = read_config(Path(source))
            old_statistics = statistics_plan(old_profiles, old_registries, self.environment)
            new_statistics = statistics_plan(profiles, registries, self.environment)
            statistics_changed = old_statistics != new_statistics
            if statistics_changed:
                worker = compose['services']['solid-data-connection-sync-worker'].setdefault('environment', {})
                worker['STATISTICS_PROFILES_JSON'] = json.dumps(new_statistics, separators=(',', ':'), ensure_ascii=False)
                worker['STATISTICS_ENABLED'] = str(any(p['enabled'] for p in new_statistics)).lower()
                services.append('solid-data-connection-sync-worker')
            # Test must remain a read-only cache preview even when other settings change.
            if self.environment=='test' and 'solid-data-connection-sync-worker' in services:
                compose['services']['solid-data-connection-sync-worker'].setdefault('environment',{}).update({'WORKER_READ_ONLY':'false','WORKER_CONNECTION_NAMESPACE':'test','STATISTICS_ENABLED':'false','ENVIRONMENTAL_SCENARIO_ENABLED':'false'})
            if compose!=original_compose:replacements[compose_path]=yaml.safe_dump(compose,sort_keys=False).encode()
            services=list(dict.fromkeys(services))
            check=staging/'Caddyfile.check';check.write_text((self.live.parent/'Caddyfile').read_text().replace('/config/consolidated/sites.caddy',f'/config/{staging.name}/after/sites.caddy'))
            if self.live/f'login-{self.environment}.caddy' in replacements:
                (staging/f'login-{self.environment}.caddy').write_bytes(replacements[self.live/f'login-{self.environment}.caddy'])
                check.write_text(check.read_text().replace(f'/config/consolidated/login-{self.environment}.caddy',f'/config/{staging.name}/login-{self.environment}.caddy'))
            self.caddy_run('validate',f'/config/{staging.name}/Caddyfile.check')
            # Durable journal precedes all writes, including source and newly-created files.
            all_files={**replacements,**source_changes}
            record={'profileId':after['id'],'revision':revision(after),'policyRevision':revision(policy_candidate['environments'][self.environment]) if policy_candidate else None,'services':services,'newServices':new_services,'sources':[str(p) for p in source_changes],'files':{str(p):encode(snapshot(p)) for p in all_files},'next':{str(p):encode(data) for p,data in all_files.items()},'modes':{str(p):p.stat().st_mode&0o777 for p in all_files if p.exists()}}
            atomic(self.journal,(canonical(record)+'\n').encode(),0o600)
            try:
                for path,data in replacements.items():atomic(path,data,0o644 if path.name in ['config.js','env.js','catalog-vocabulary.ttl','sites.caddy','login-test.caddy','login-prod.caddy','fuseki.ttl','settings.js'] else None)
                if services:
                    self.compose('config','--quiet')
                    self.compose('up','-d','--no-deps','--force-recreate','--wait','--wait-timeout','150',*services,timeout=210)
                self.caddy_run('reload')
                yield
                # Verify the routed configuration once the source and runtime agree.
                if domains_changed or services:
                    last=None
                    for attempt in range(20):
                        try:
                            self.probe({'operation':'health','profile':after})
                            if services:self.probe({'operation':'services','profile':after,'services':services,'statisticsFingerprint':__import__('hashlib').sha256(json.dumps(new_statistics,separators=(',',':'),ensure_ascii=False).encode()).hexdigest() if statistics_changed and self.environment!='test' else None})
                            last=None;break
                        except ConfigError as error:last=error;time.sleep(2)
                    if last:raise last
                self.journal.unlink()
            except Exception:
                self.recover();raise
        finally:shutil.rmtree(staging,ignore_errors=True)
