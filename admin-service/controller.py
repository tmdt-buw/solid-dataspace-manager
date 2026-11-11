"""Local, socket-only configuration controller. Run as the deployment user.
The public API has only this narrow interface, no Docker or shell access.
"""
import base64, contextlib, datetime, fcntl, http.server, json, os, shutil, socketserver, subprocess, tempfile, threading, uuid
from pathlib import Path
import yaml
from config_store import ConfigStore, ConfigError, canonical, revision, compile_config

class RuntimeTransaction:
    def __init__(self,live,state,caddy_config,container):
        self.live=Path(live);self.state=Path(state);self.caddy_config=Path(caddy_config);self.container=container
    def run(self,verb,path):
        subprocess.run(['docker','exec',self.container,'caddy',verb,'--config',str(path),'--adapter','caddyfile'],check=True,capture_output=True,text=True,timeout=30)
    def recover(self):
        journal=self.state/'runtime-journal.json'
        if journal.exists():
            record=json.loads(journal.read_text())
            files=record.get('files',record)
            # Journal is local-controller-only; never accept paths from the public API.
            for filename,content in files.items():
                p=Path(filename)
                if content is None:
                    p.unlink(missing_ok=True);continue
                if filename==record.get('source') and p.read_bytes() not in (base64.b64decode(content),base64.b64decode(record['replacement'])):
                    continue # preserve an intervening manual YAML edit
                tmp=p.with_name(p.name+'.rollback');tmp.write_bytes(base64.b64decode(content));tmp.replace(p)
            self.run('reload','/etc/caddy/Caddyfile')
            for entry in (self.state/'history').glob('*.json'):
                data=json.loads(entry.read_text())
                if data.get('profileId')==record.get('profileId') and data.get('revision')==record.get('revision') and revision(data.get('profile'))==record.get('replacementRevision') and data.get('status') in ('applying','applied'):
                    data['status']='rolled-back';data['error']='Konfiguration nach unterbrochener Übernahme wiederhergestellt.'
                    tmp=entry.with_suffix('.next');tmp.write_text(canonical(data));tmp.replace(entry)
            journal.unlink()
    @contextlib.contextmanager
    def __call__(self,before,after,source):
        self.recover()
        staging=Path(tempfile.mkdtemp(prefix='admin-stage-',dir=self.live.parent))
        journal=self.state/'runtime-journal.json'
        try:
            shutil.copytree(source,staging/'source')
            compile_config(staging/'source',staging/'before')
            live_sites=self.live/'sites.caddy'
            if live_sites.read_bytes()!=(staging/'before/sites.caddy').read_bytes():
                raise ConfigError('Die aktive Server-Konfiguration weicht von den YAML-Dateien ab. Bitte zuerst abgleichen.',409)
            (staging/'source/profiles'/f"{after['id']}.yaml").write_text(yaml.safe_dump(after,allow_unicode=True,sort_keys=False))
            compile_config(staging/'source',staging/'after')
            # For profile edits, all other profiles and registry topology must be identical.
            for old in (staging/'before').rglob('*'):
                if not old.is_file():continue
                rel=old.relative_to(staging/'before')
                allowed=str(rel)=='sites.caddy' or str(rel).startswith(f"runtime/{after['id']}/")
                if not allowed and old.read_bytes()!=(staging/'after'/rel).read_bytes():raise ConfigError('Die Änderung würde weitere Profile betreffen.',409)
            check=staging/'Caddyfile.check'
            base=self.caddy_config.read_text()
            check.write_text(base.replace('/config/consolidated/sites.caddy',f'/config/{staging.name}/after/sites.caddy'))
            self.run('validate',f'/config/{staging.name}/Caddyfile.check')
            replacements=[('sites.caddy',live_sites)]
            replacements += [(f"runtime/{after['id']}/{name}",self.live/'runtime'/after['id']/name) for name in ('config.js','env.js','catalog-vocabulary.ttl')]
            # Include source in the journal so recovery after a process interruption is consistent.
            backup={str(target):(base64.b64encode(target.read_bytes()).decode() if target.exists() else None) for _,target in replacements}
            source_file=source/'profiles'/f"{after['id']}.yaml"
            backup[str(source_file)]=base64.b64encode(source_file.read_bytes()).decode()
            record={'files':backup,'source':str(source_file),'profileId':after['id'],'revision':revision(before),'replacementRevision':revision(after),'replacement':base64.b64encode(yaml.safe_dump(after,allow_unicode=True,sort_keys=False).encode()).decode()}
            temporary=journal.with_suffix('.next');temporary.write_text(canonical(record));os.chmod(temporary,0o600);temporary.replace(journal)
            try:
                for rel,target in replacements:
                    tmp=target.with_name(target.name+'.next');shutil.copy2(staging/'after'/rel,tmp);tmp.replace(target)
                self.run('reload','/etc/caddy/Caddyfile')
                yield
            except Exception:
                self.recover();raise
            else:journal.unlink()
        finally:shutil.rmtree(staging,ignore_errors=True)

class Controller(http.server.BaseHTTPRequestHandler):
    server_version='DataspaceAdminController'
    def log_message(self,*args):pass
    def do_POST(self):
        try:
            length=int(self.headers.get('Content-Length','0'))
            if not 0<length<=262144:raise ConfigError('Ungültige Anfragegröße.',413)
            body=json.loads(self.rfile.read(length));actor=body['actor'];profile_id=body['profileId']
            if self.path=='/jobs':
                result=self.server.jobs.read(actor,body.get('jobId'))
            elif self.path=='/create-preview':result=self.server.store.preview_create(actor,body)
            elif self.path=='/platform-preview':result=self.server.store.preview_platform(actor,profile_id,body)
            elif self.path=='/discard':result=self.server.store.discard(actor,profile_id,body.get('entryId'))
            elif self.path=='/read':
                p,registries=self.server.store.load(profile_id,actor,False)
                can_edit=self.server.store.is_operator(actor) or actor in p.get('administration',{}).get('adminWebIds',[])
                result={'profile':p if can_edit else {'id':p['id'],'environment':p['environment'],'public':{'statistics':p['public']['statistics'],'branding':p['public']['branding']}},'revision':revision(p),'canEdit':can_edit,'canReadStatistics':actor in p['public']['statistics']['adminWebIds'],'registries':registries if can_edit else [],'isOperator':self.server.store.is_operator(actor)}
                if result['isOperator']:
                    policy=self.server.store.policy();result['platform']={'runtime':policy.get('runtime',{}),'revision':revision(policy)}
            elif self.path=='/preview':result=self.server.store.preview(actor,profile_id,body)
            elif self.path=='/apply':result=self.server.jobs.submit(actor,profile_id,body.get('previewId'))
            elif self.path=='/history':result=self.server.store.history(actor,profile_id,body.get('entryId'))
            else:raise ConfigError('Unbekannter Aufruf.',404)
            self.respond(200,result)
        except ConfigError as e:self.respond(e.status,{'error':str(e)})
        except (ValueError,KeyError,TypeError) as e:self.respond(400,{'error':'Ungültige Konfiguration oder Anfrage.'})
        except Exception as e:
            print('Controller error:',type(e).__name__,flush=True)
            self.respond(500,{'error':'Die Konfiguration konnte nicht verarbeitet werden.'})
    def respond(self,status,value):
        data=canonical(value).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)

class Server(socketserver.ThreadingMixIn,socketserver.UnixStreamServer):
    daemon_threads=True
    allow_reuse_address=True

class Jobs:
    def __init__(self,store):
        self.store=store;self.directory=store.state/'jobs';self.directory.mkdir(exist_ok=True,mode=0o700);self.lock=threading.Lock()
        for file in self.directory.glob('*.json'):
            value=json.loads(file.read_text())
            if value['status']=='running':value.update(status='failed',error='Interrupted deployment was restored.');store.write(file,value)
    def submit(self,actor,profile_id,preview_id):
        if not isinstance(preview_id,str) or not __import__('re').fullmatch('[0-9a-f]{32}',preview_id):raise ConfigError('Ungültige Änderungsvorschau.')
        file=self.store.state/'previews'/f'{preview_id}.json'
        if not file.exists():raise ConfigError('Änderungsvorschau abgelaufen oder bereits übernommen.',409)
        preview=json.loads(file.read_text())
        if preview['actor']!=actor or preview['profileId']!=profile_id:raise ConfigError('Keine Berechtigung für diese Änderungsvorschau.',403)
        if preview.get('kind')=='create':
            if not self.store.is_operator(actor):raise ConfigError('Diese Änderung erfordert Betreiberrechte.',403)
        else:self.store.load(profile_id,actor)
        if not self.lock.acquire(blocking=False):raise ConfigError('Eine Aktualisierung läuft bereits. Bitte kurz warten.',409)
        job={'id':uuid.uuid4().hex,'profileId':profile_id,'actor':actor,'status':'running','startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
        self.store.write(self.directory/f"{job['id']}.json",job)
        def work():
            try:job.update(status='completed',result=self.store.apply(actor,profile_id,preview_id))
            except Exception as error:job.update(status='failed',error=str(error) if isinstance(error,ConfigError) else 'The update failed. Check the change history.')
            finally:
                job['completedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();self.store.write(self.directory/f"{job['id']}.json",job);self.lock.release()
        threading.Thread(target=work,daemon=True).start()
        return {'status':'running','jobId':job['id']}
    def read(self,actor,identifier):
        if not isinstance(identifier,str) or not __import__('re').fullmatch('[0-9a-f]{32}',identifier):raise ConfigError('Ungültiger Auftrag.')
        file=self.directory/f'{identifier}.json'
        if not file.exists():raise ConfigError('Auftrag nicht gefunden.',404)
        value=json.loads(file.read_text())
        if actor!=value['actor'] and not self.store.is_operator(actor):raise ConfigError('Keine Berechtigung.',403)
        if not self.store.is_operator(actor):self.store.load(value['profileId'],actor)
        return value

if __name__=='__main__':
    from deployment import Deployment
    state=Path(os.environ['ADMIN_STATE']);state.mkdir(mode=0o700,parents=True,exist_ok=True)
    runtime=Deployment(os.environ['ADMIN_SOURCE'],os.environ['ADMIN_RUNTIME'],state,os.environ['ADMIN_STACK'],os.environ['ADMIN_ENVIRONMENT'],os.environ.get('ADMIN_API_CONTAINER','solid-dataspace-live-test-admin-api-1'))
    # A normal restart has nothing to recover. Do not wait for the release
    # lock while the release itself waits for this controller to be ready.
    if runtime.journal.exists():
        with (Path(os.environ['ADMIN_SOURCE'])/'.configuration.lock').open('a') as lock:
            fcntl.flock(lock,fcntl.LOCK_EX)
            runtime.recover()
    store=ConfigStore(os.environ['ADMIN_SOURCE'],state,[],os.environ['ADMIN_IDENTITY_HOSTS'].split(','),runtime,environment=os.environ['ADMIN_ENVIRONMENT'],preflight=runtime.preflight)
    sock=Path(os.environ['ADMIN_SOCKET']);sock.parent.mkdir(parents=True,exist_ok=True,mode=0o700);sock.unlink(missing_ok=True)
    with Server(str(sock),Controller) as server:
        os.chmod(sock,0o600);server.store=store;server.jobs=Jobs(store)
        print('Admin controller ready; environment:',store.environment,flush=True);server.serve_forever()
