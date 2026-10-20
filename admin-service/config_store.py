"""Profile transactions. The HTTP container has no Docker socket or write access to YAML.
The local controller rechecks scope, identity, revision, and schema for every request.
"""
import copy, datetime, fcntl, hashlib, json, os, re, shutil, tempfile, uuid
from contextlib import nullcontext
from pathlib import Path
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo
import yaml
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts' / 'deployment'))
from compile_config import compile_config, read_config, APP_PATHS
from statistics_plan import statistics_plan

class ConfigError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message); self.status=status

def canonical(data):
    return json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(',', ':'))

def revision(data):
    return hashlib.sha256(canonical(data).encode()).hexdigest()

def differences(before, after, path=''):
    if isinstance(before,dict) and isinstance(after,dict):
        return [d for key in sorted(set(before)|set(after)) for d in differences(before.get(key),after.get(key), f'{path}.{key}' if path else key)]
    if isinstance(before,list) and isinstance(after,list) and before and after and all(isinstance(v,dict) and 'id' in v for v in before+after):
        left={v['id']:v for v in before};right={v['id']:v for v in after}
        return [d for key in sorted(set(left)|set(right)) for d in differences(left.get(key),right.get(key),f'{path}.{key}')]
    if before == after: return []
    return [{'path':path, 'before':before, 'after':after}]

def valid_url(value, local=False):
    if not isinstance(value,str) or len(value)>2048 or any(c in value for c in ['\n','\r','\\','\x00']): return False
    if local and value.startswith('/') and not value.startswith('//'):
        return not any(p in ('.','..') for p in value.split('/'))
    try:
        u=urlsplit(value)
        return u.scheme=='https' and bool(u.hostname) and not u.username and not u.password and u.port in (None,443)
    except ValueError: return False

def validate_profile(candidate, before, registries, identity_hosts):
    if not isinstance(candidate,dict): raise ConfigError('Ungültige Profil-Konfiguration.')
    for key in ('schemaVersion','id','environment'):
        if candidate.get(key)!=before.get(key): raise ConfigError(f'{key} kann hier nicht geändert werden.')
    def text(v,label,limit=500,empty=True):
        if not isinstance(v,str) or len(v)>limit or (not empty and not v.strip()) or any(ord(c)<32 for c in v):
            raise ConfigError(f'Ungültiger Wert: {label}.')
    def url(v,label,local=False,empty=False):
        if not (empty and v=='') and not valid_url(v,local): raise ConfigError(f'{label}: vollständige HTTPS-Adresse oder zulässiger lokaler Pfad erforderlich.')
    def boolean(v,label):
        if type(v) is not bool: raise ConfigError(f'{label} muss an oder aus sein.')
    def keys(obj, allowed,label):
        if not isinstance(obj,dict) or set(obj)-set(allowed): raise ConfigError(f'Unbekannte Felder: {label}.')
    def webids(values,label,minimum=0):
        if not isinstance(values,list) or len(values)<minimum or len(values)>50 or len(set(values))!=len(values): raise ConfigError(f'{label}: eindeutige WebIDs erforderlich (mindestens {minimum}).')
        for v in values:
            url(v,label)
            if urlsplit(v).hostname not in identity_hosts: raise ConfigError(f'{label}: dieser Identitätsanbieter ist für die Administration nicht freigegeben.')
    keys(candidate,['schemaVersion','id','environment','domains','redirectDomains','public','administration'],'Profil')
    admin=candidate.get('administration',{})
    keys(admin,['enabled','adminWebIds'],'Administration')
    if admin.get('enabled') is not True: raise ConfigError('Die aktive Admin Area darf sich nicht selbst deaktivieren.')
    webids(admin.get('adminWebIds'), 'Administratoren',1)
    domains=candidate.get('domains')
    if not isinstance(domains,list) or not domains or len(domains)>20 or len(set(domains))!=len(domains) or any(not isinstance(d,str) or not re.fullmatch(r'[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?',d) for d in domains): raise ConfigError('Ungültige Domains.')
    redirects=candidate.get('redirectDomains',[])
    if not isinstance(redirects,list) or len(set(redirects))!=len(redirects) or not set(redirects)<=set(domains[1:]): raise ConfigError('Weiterleitungen müssen zusätzliche Domains dieses Profils sein.')
    p=candidate.get('public',{}); old=before['public']
    if p.get('accessGateway') != old.get('accessGateway'): raise ConfigError('Der Solid-Zugangsschutz wird nur durch das Server-Deployment geändert.')
    keys(p,old.keys(),'öffentliche Einstellungen')
    if set(p)!=set(old): raise ConfigError('Bestehende Einstellungsbereiche müssen erhalten bleiben.')
    if p['dataspaceId']!=before['id']: raise ConfigError('Die Profilkennung ist unveränderlich.')
    apps=p.get('apps')
    if not isinstance(apps,list) or len(apps)!=len(APP_PATHS) or {a.get('id') for a in apps if isinstance(a,dict)}!=set(APP_PATHS): raise ConfigError('Alle bekannten Apps müssen genau einmal vorhanden sein.')
    for a in apps:
        keys(a,['id','title','href','section','iconKey','visible','enabled','order','linkType'],'Anwendung')
        text(a.get('title'),'App-Name',120,False);text(a.get('iconKey'),'App-Symbol',60,False)
        url(a.get('href'),'App-Link',True)
        if a.get('section') not in ['general','consume','applications'] or a.get('linkType') not in ['internal','external']: raise ConfigError('Ungültige Menügruppe oder Linkart.')
        if a.get('linkType')=='internal' and not a['href'].startswith('/'): raise ConfigError('Interne App-Links müssen mit / beginnen.')
        if type(a.get('order')) is not int or not 0<=a['order']<=10000: raise ConfigError('Reihenfolge muss zwischen 0 und 10000 liegen.')
        boolean(a.get('visible'),'Sichtbarkeit');boolean(a.get('enabled'),'Aktivierung')
    def dimensions(obj):
        for key in ('logoWidth','logoHeight','logoMaxHeight'):
            if key in obj and not re.fullmatch(r'(?:auto|[0-9]{1,4}(?:\.[0-9]{1,2})?(?:px|rem|em|%))',str(obj[key])): raise ConfigError(f'{key}: z. B. 95px oder auto verwenden.')
    b=p['branding'];keys(b,['projectName','logoUrl','logoAlt','logoWidth','logoHeight','logoMaxHeight'],'Branding')
    text(b.get('projectName'),'Projektname',120,False);text(b.get('logoAlt'),'Logo-Beschreibung',250);url(b.get('logoUrl'),'Projektlogo',True);dimensions(b)
    logos=p.get('fundingLogos')
    if not isinstance(logos,list) or len(logos)>20: raise ConfigError('Zu viele Förderlogos.')
    ids=set()
    for l in logos:
        keys(l,['id','src','alt','order','visible','logoWidth','logoHeight','logoMaxHeight'],'Förderlogo')
        text(l.get('id'),'Logo-ID',80,False)
        if l['id'] in ids: raise ConfigError('Doppelte Logo-ID.')
        ids.add(l['id']);url(l.get('src'),'Förderlogo',True);text(l.get('alt'),'Logo-Beschreibung',250);dimensions(l)
        if type(l.get('order')) is not int or not 0<=l['order']<=10000: raise ConfigError('Ungültige Reihenfolge der Förderlogos.')
        if 'visible' in l: boolean(l['visible'],'Förderlogo-Sichtbarkeit')
    text(p['fundingGrantNumber'],'Förderkennzeichen',150)
    providers=p['providers']
    if not isinstance(providers,list) or not 1<=len(providers)<=15: raise ConfigError('Mindestens ein Login-Anbieter ist erforderlich.')
    ids=set();enabled=0;recommended=0
    for v in providers:
        keys(v,['id','label','issuer','note','enabled','recommended'],'Login-Anbieter')
        text(v.get('id'),'Anbieter-ID',80,False);text(v.get('label'),'Anbietername',120,False);text(v.get('note',''),'Anbieterhinweis',250);url(v.get('issuer'),'Login-Anbieter')
        if v['id'] in ids: raise ConfigError('Doppelte Anbieter-ID.')
        ids.add(v['id']);boolean(v.get('enabled'),'Anbieter-Aktivierung');boolean(v.get('recommended'),'Empfehlung')
        enabled+=v['enabled'];recommended+=v['enabled'] and v['recommended']
    if not enabled or recommended>1: raise ConfigError('Mindestens einen Anbieter aktivieren und höchstens einen empfehlen.')
    # Keep a working login path for current admins; a new issuer needs a coordinated deployment.
    if not any(v['issuer'] in {x['issuer'] for x in old['providers'] if x['enabled']} and v['enabled'] for v in providers): raise ConfigError('Mindestens ein bestehender Login-Anbieter muss aktiv bleiben.')
    cat=p['catalog'];keys(cat,['defaultRegistry'],'Katalog');url(cat.get('defaultRegistry'),'Registry')
    if cat['defaultRegistry'].rstrip('/') not in {r['url'].rstrip('/') for r in registries}: raise ConfigError('Unbekannte Registry.')
    sw=p['syncWorker'];keys(sw,['enabled','apiUrl','serviceWebId','intervalMinutes'],'Sync-Worker')
    boolean(sw.get('enabled'),'Worker-Verwaltung');url(sw.get('apiUrl'),'Worker-API',True);url(sw.get('serviceWebId'),'Worker-WebID')
    if type(sw.get('intervalMinutes')) is not int or not 1<=sw['intervalMinutes']<=1440: raise ConfigError('Sync-Intervall muss zwischen 1 und 1440 Minuten liegen.')
    st=p['statistics'];keys(st,['enabled','adminWebIds','workerWebId','podBaseUrl','eventsUrl','timezone','activityResourcePath'],'Statistik')
    boolean(st.get('enabled'),'Statistik');webids(st.get('adminWebIds'),'Statistik-Berechtigungen')
    for key in ('workerWebId','podBaseUrl','eventsUrl'): url(st.get(key),key)
    try: ZoneInfo(st.get('timezone',''))
    except (ValueError,KeyError,TypeError): raise ConfigError('Ungültige Zeitzone.')
    path=st.get('activityResourcePath','')
    if not isinstance(path,str) or not re.fullmatch(r'[a-zA-Z0-9_/.-]{1,250}',path) or path.startswith('/') or '..' in path.split('/'): raise ConfigError('Ungültiger Statistik-Ressourcenpfad.')
    url(p['plasmaUrl'],'PLASMA-Adresse',True)
    if 'cityToursLegacyContinuousWebIds' in p: webids(p['cityToursLegacyContinuousWebIds'],'City Tours WebIDs')
    # Statistics stay off in Test; Data Connection uses a dedicated test Pod subtree.
    if before['environment']=='test' and st['enabled']: raise ConfigError('Live-Test bleibt ohne produktive Statistikerfassung.')

def diff_label(path, before, after):
    names={'enabled':'Aktivierung','visible':'Im Menü','title':'Anzeigename','href':'Link','order':'Reihenfolge','section':'Menügruppe','iconKey':'Symbol','linkType':'Linkart','projectName':'Projektname','logoUrl':'Projektlogo','logoAlt':'Alternativtext','logoWidth':'Logobreite','logoHeight':'Logohöhe','logoMaxHeight':'Maximale Logohöhe','fundingGrantNumber':'Förderkennzeichen','adminWebIds':'Berechtigte WebIDs','defaultRegistry':'Registry-Zuordnung','domains':'Domains','timezone':'Zeitzone','podBaseUrl':'Statistik-Pod','eventsUrl':'Download-Ereignisse','activityResourcePath':'Aktivitäts-Ressourcenpfad','workerWebId':'Worker-WebID','apiUrl':'API-Adresse','serviceWebId':'Service-WebID','intervalMinutes':'Intervall-Vorgabe','plasmaUrl':'PLASMA-Adresse','issuer':'Login-Anbieter','recommended':'Empfohlen','note':'Hinweis','src':'Logo-Adresse','alt':'Logo-Beschreibung'}
    parts=path.split('.')
    if len(parts)>=4 and parts[1] in ('apps','providers','fundingLogos'):
        collection=after['public'][parts[1]]+before['public'][parts[1]]
        entry=next((x for x in collection if x.get('id')==parts[2]),{})
        return f"{entry.get('title') or entry.get('label') or entry.get('alt') or parts[2]} · {names.get(parts[-1],parts[-1])}"
    if path=='administration.adminWebIds':return 'Profil-Administratoren'
    if path=='public.statistics.adminWebIds':return 'Statistik-Leserechte'
    return names.get(parts[-1],parts[-1])

class ProfileStore:
    def __init__(self,source,state,scopes,identity_hosts,apply_runtime=None):
        self.source=Path(source);self.state=Path(state);self.scopes=set(scopes);self.identity_hosts=set(identity_hosts);self.apply_runtime=apply_runtime
        self.state.mkdir(parents=True,exist_ok=True,mode=0o700)
        (self.state/'history').mkdir(exist_ok=True,mode=0o700)
        (self.state/'previews').mkdir(exist_ok=True,mode=0o700)
    def is_operator(self,actor): return False
    def check_plan(self,*args): return None
    def load(self,profile_id,actor,write=True):
        if profile_id not in self.scopes: raise ConfigError('Dieses Profil ist auf dieser Instanz nicht zur Verwaltung freigegeben.',403)
        profiles,registries=read_config(self.source)
        current=next((p for p in profiles if p['id']==profile_id),None)
        if not current: raise ConfigError('Profil nicht gefunden.',404)
        admins=current.get('administration',{}).get('adminWebIds',[])
        readers=current['public']['statistics']['adminWebIds']
        if actor not in admins and (write or actor not in readers): raise ConfigError('Keine Berechtigung für dieses Profil.',403)
        return current,registries
    def preview(self,actor,profile_id,body):
        before,registries=self.load(profile_id,actor)
        if body.get('revision')!=revision(before): raise ConfigError('Das Profil wurde zwischenzeitlich geändert. Bitte neu laden.',409)
        candidate=copy.deepcopy(body.get('profile'))
        validate_profile(candidate,before,registries,self.identity_hosts)
        all_profiles,_=read_config(self.source)
        if any(set(candidate['domains']) & set(p['domains']) for p in all_profiles if p['id']!=profile_id): raise ConfigError('Eine Domain ist bereits einem anderen Profil zugeordnet.')
        if actor not in candidate['administration']['adminWebIds'] and not self.is_operator(actor): raise ConfigError('Die eigene Admin-Berechtigung kann in dieser Sitzung nicht entfernt werden.')
        diff=differences(before,candidate)
        for d in diff: d['label']=diff_label(d['path'],before,candidate)
        if not diff: raise ConfigError('Keine Änderungen vorhanden.')
        deployment=any(d['path']=='domains' or d['path'].startswith(('public.syncWorker.','public.statistics.','public.plasmaUrl','public.catalog.defaultRegistry','public.providers')) for d in diff)
        identifier=uuid.uuid4().hex
        record={'id':identifier,'profileId':profile_id,'actor':actor,'revision':revision(before),'profile':candidate,'diff':diff,'requiresDeployment':deployment,'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
        self.write(self.state/'previews'/f'{identifier}.json',record)
        return {k:v for k,v in record.items() if k!='profile'}
    def write(self,path,value):
        tmp=path.with_suffix('.next');tmp.write_text(canonical(value)+'\n');os.chmod(tmp,0o600);tmp.replace(path)
    def apply(self,actor,profile_id,preview_id):
        if not re.fullmatch(r'[0-9a-f]{32}',str(preview_id)): raise ConfigError('Ungültige Änderungsvorschau.')
        with (self.source/'.configuration.lock').open('a') as lock:
            fcntl.flock(lock,fcntl.LOCK_EX)
            path=self.state/'previews'/f'{preview_id}.json'
            if not path.exists(): raise ConfigError('Änderungsvorschau abgelaufen oder bereits übernommen.',409)
            rec=json.loads(path.read_text())
            if rec['actor']!=actor or rec['profileId']!=profile_id: raise ConfigError('Keine Berechtigung für diese Änderungsvorschau.',403)
            before,registries=self.load(profile_id,actor)
            if revision(before)!=rec['revision']: raise ConfigError('Das Profil wurde zwischenzeitlich geändert. Bitte neu laden.',409)
            created=datetime.datetime.fromisoformat(rec['createdAt'])
            if (datetime.datetime.now(datetime.timezone.utc)-created).total_seconds()>900: raise ConfigError('Änderungsvorschau abgelaufen. Bitte erneut prüfen.',409)
            validate_profile(rec['profile'],before,registries,self.identity_hosts)
            self.check_plan(actor,before,rec['profile'],registries)
            entry={**rec,'before':before,'completedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':'applying'}
            target=self.state/'history'/f'{preview_id}.json'
            self.write(target,entry) # durable backup and audit entry precede every mutation
            source_path=self.source/'profiles'/f'{profile_id}.yaml'
            original=source_path.read_bytes()
            replacement=yaml.safe_dump(rec['profile'],allow_unicode=True,sort_keys=False).encode()
            try:
                with self.apply_runtime(before,rec['profile'],self.source) if self.apply_runtime else nullcontext():
                    if source_path.read_bytes()!=original: raise ConfigError('Die YAML-Datei wurde während der Prüfung geändert. Bitte neu laden.',409)
                    temp=source_path.with_suffix('.yaml.next')
                    temp.write_bytes(replacement);temp.replace(source_path)
                    entry['status']='applied';self.write(target,entry)
            except Exception as error:
                # Runtime callback rolls back its own changes before raising.
                if source_path.read_bytes()==replacement:
                    rollback=source_path.with_suffix('.yaml.rollback');rollback.write_bytes(original);rollback.replace(source_path)
                entry['status']='failed';entry['error']=str(error);self.write(target,entry)
                if isinstance(error,ConfigError): raise error
                raise ConfigError('Die Änderung konnte nicht übernommen werden; der vorherige Stand bleibt erhalten.',500) from error
            path.unlink()
            return {'status':'applied','id':preview_id,'revision':revision(rec['profile']),'message':'Konfiguration gesichert und übernommen.'}
    def history(self,actor,profile_id,entry_id=None):
        self.load(profile_id,actor)
        if entry_id:
            if not re.fullmatch(r'[0-9a-f]{32}',entry_id): raise ConfigError('Ungültige Revision.')
            p=self.state/'history'/f'{entry_id}.json'
            if not p.exists(): raise ConfigError('Revision nicht gefunden.',404)
            rec=json.loads(p.read_text())
            if rec['profileId']!=profile_id or (rec.get('kind')=='platform' and not self.is_operator(actor)): raise ConfigError('Kein Zugriff.',403)
            return rec
        result=[]
        for p in sorted((self.state/'history').glob('*.json'),key=lambda p:p.stat().st_mtime,reverse=True):
            r=json.loads(p.read_text())
            if r['profileId']==profile_id and (r.get('kind')!='platform' or self.is_operator(actor)): result.append({k:v for k,v in r.items() if k not in ('profile','before')})
            if len(result)>=100:break
        return result

class ConfigStore(ProfileStore):
    """Environment-scoped profile administration, including creation by operators."""
    def __init__(self,*args,environment=None,preflight=None,**kwargs):
        super().__init__(*args,**kwargs)
        self.environment=environment
        self.preflight=preflight or (lambda *args: None)
    def policy(self):
        file=self.source/'administration.yaml'
        return yaml.safe_load(file.read_text()).get('environments',{}).get(self.environment,{}) if file.exists() else {}
    def is_operator(self,actor):return actor in self.policy().get('operatorWebIds',[])
    def load(self,profile_id,actor,write=True):
        if self.environment is None:return super().load(profile_id,actor,write)
        profiles,registries=read_config(self.source)
        current=next((p for p in profiles if p['id']==profile_id),None)
        if not current or current['environment']!=self.environment:raise ConfigError('Dieses Profil ist auf dieser Instanz nicht zur Verwaltung freigegeben.',403)
        if not current.get('administration',{}).get('enabled'):raise ConfigError('Keine Berechtigung für dieses Profil.',403)
        if not self.is_operator(actor) and actor not in current['administration']['adminWebIds'] and (write or actor not in current['public']['statistics']['adminWebIds']):raise ConfigError('Keine Berechtigung für dieses Profil.',403)
        return current,[r for r in registries if r.get('environment',self.environment)==self.environment]
    def check_plan(self,actor,before,after,registries):
        changes=differences(before or {},after)
        operational=before is None or any(d['path'].startswith(('domains','redirectDomains','public.catalog.','public.syncWorker.','public.statistics.','public.plasmaUrl')) for d in changes)
        old_providers={p['issuer'] for p in before['public']['providers'] if p['enabled']} if before else set()
        new_providers={p['issuer'] for p in after['public']['providers'] if p['enabled']}
        operational=operational or old_providers!=new_providers
        if before:
            old_workspaces={a['id'] for a in before['public']['apps'] if a['id'] in ('node-red','plasma') and a['enabled']}
            new_workspaces={a['id'] for a in after['public']['apps'] if a['id'] in ('node-red','plasma') and a['enabled']}
            operational=operational or old_workspaces!=new_workspaces
        if self.environment and operational and not self.is_operator(actor):raise ConfigError('Diese Änderung erfordert Betreiberrechte.',403)
        all_profiles,_=read_config(self.source)
        if any(set(after['domains']) & set(p['domains']) for p in all_profiles if p['id']!=after['id']):raise ConfigError('Eine Domain ist bereits einem anderen Profil zugeordnet.')
        planned_profiles=[p for p in all_profiles if p['id']!=after['id']]+[after]
        try: statistics_plan(planned_profiles,registries,self.environment)
        except ValueError as error: raise ConfigError(str(error)) from error
        self.preflight(before,after,registries,self.policy())
        return operational
    def preview(self,actor,profile_id,body):
        current,_=self.load(profile_id,actor)
        host=body.get('requestHost');candidate=body.get('profile',{})
        if host in current['domains'] and (host not in candidate.get('domains',[]) or host in candidate.get('redirectDomains',[])):raise ConfigError('Die gerade verwendete Adresse muss als Alias erhalten bleiben. Öffne zuerst die neue Adresse, um die alte zu entfernen oder weiterzuleiten.')
        result=super().preview(actor,profile_id,body)
        path=self.state/'previews'/f"{result['id']}.json"
        rec=json.loads(path.read_text())
        try:
            before,registries=self.load(profile_id,actor)
            rec['requiresDeployment']=self.check_plan(actor,before,rec['profile'],registries)
            self.write(path,rec)
        except Exception:
            path.unlink(missing_ok=True);raise
        return {k:v for k,v in rec.items() if k!='profile'}
    def preview_create(self,actor,body):
        if not self.is_operator(actor):raise ConfigError('Diese Änderung erfordert Betreiberrechte.',403)
        template,registries=self.load(body.get('templateId','test'),actor)
        identifier=body.get('id','')
        if not isinstance(identifier,str) or not re.fullmatch(r'[a-z][a-z0-9-]{1,39}',identifier):raise ConfigError('Die Profilkennung benötigt 2 bis 40 Kleinbuchstaben, Ziffern oder Bindestriche.')
        profiles,_=read_config(self.source)
        if any(p['id']==identifier for p in profiles):raise ConfigError('Diese Profilkennung ist bereits vergeben.',409)
        if len([p for p in profiles if p['environment']==self.environment])>=20:raise ConfigError('Die maximale Anzahl von Profilen ist erreicht.')
        candidate=copy.deepcopy(template);candidate['id']=identifier;candidate['public']['dataspaceId']=identifier
        candidate['domains']=body.get('domains',[]);candidate['redirectDomains']=[]
        candidate['public']['branding']['projectName']=body.get('name','')
        candidate['administration']={'enabled':True,'adminWebIds':body.get('adminWebIds',[actor])}
        candidate['public']['catalog']['defaultRegistry']=body.get('registryUrl','')
        for app in candidate['public']['apps']:
            if app['id'] in ('node-red','plasma'):app['enabled']=body.get('workspaces',{}).get(app['id']) is True;app['visible']=app['enabled']
        candidate['public']['plasmaUrl']='/plasma/modelings'
        # Never copy statistics collection or personal legacy grants to a new tenant.
        candidate['public']['statistics']['enabled']=False
        candidate['public']['statistics']['adminWebIds']=[]
        candidate['public']['syncWorker']['enabled']=False
        if 'cityToursLegacyContinuousWebIds' in candidate['public']:candidate['public']['cityToursLegacyContinuousWebIds']=[]
        new_registry=None
        if candidate['public']['catalog']['defaultRegistry'].rstrip('/') not in {r['url'].rstrip('/') for r in registries}:
            if not valid_url(candidate['public']['catalog']['defaultRegistry']) or urlsplit(candidate['public']['catalog']['defaultRegistry']).query or urlsplit(candidate['public']['catalog']['defaultRegistry']).fragment:raise ConfigError('Ungültige Registry-Adresse.')
            all_registries=read_config(self.source)[1]
            if any(r['id']==identifier for r in all_registries):raise ConfigError('Die Registry-Kennung ist bereits vergeben.')
            new_registry={'id':identifier,'label':body.get('name',''),'url':candidate['public']['catalog']['defaultRegistry'],'environment':self.environment,'logo':candidate['public']['branding']['logoUrl']}
            registries=[*registries,new_registry]
        validate_profile(candidate,candidate,registries,self.identity_hosts)
        self.check_plan(actor,None,candidate,registries)
        rec={'id':uuid.uuid4().hex,'kind':'create','profileId':identifier,'actor':actor,'revision':revision(None),'profile':candidate,'newRegistry':new_registry,'diff':differences({},candidate),'requiresDeployment':True,'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
        for d in rec['diff']:d['label']=diff_label(d['path'],candidate,candidate)
        self.write(self.state/'previews'/f"{rec['id']}.json",rec)
        return {k:v for k,v in rec.items() if k not in ('profile','newRegistry')}
    def apply(self,actor,profile_id,preview_id):
        if not re.fullmatch(r'[0-9a-f]{32}',str(preview_id)):raise ConfigError('Ungültige Änderungsvorschau.')
        preview=self.state/'previews'/f'{preview_id}.json'
        if not preview.exists():raise ConfigError('Änderungsvorschau abgelaufen oder bereits übernommen.',409)
        rec=json.loads(preview.read_text())
        if rec.get('kind')=='platform':return self.apply_platform(actor,profile_id,rec)
        if rec.get('kind')!='create':return super().apply(actor,profile_id,preview_id)
        with (self.source/'.configuration.lock').open('a') as lock:
            fcntl.flock(lock,fcntl.LOCK_EX)
            if not self.is_operator(actor) or actor!=rec['actor'] or profile_id!=rec['profileId']:raise ConfigError('Keine Berechtigung für diese Änderungsvorschau.',403)
            if (datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(rec['createdAt'])).total_seconds()>900:raise ConfigError('Änderungsvorschau abgelaufen. Bitte erneut prüfen.',409)
            file=self.source/'profiles'/f'{profile_id}.yaml'
            if file.exists():raise ConfigError('Diese Profilkennung ist bereits vergeben.',409)
            registry_file=self.source/'registries.yaml';original_registry=registry_file.read_bytes();registry_doc=yaml.safe_load(original_registry)
            if rec.get('newRegistry'):
                if any(r['id']==rec['newRegistry']['id'] or r['url'].rstrip('/')==rec['newRegistry']['url'].rstrip('/') for r in registry_doc['registries']):raise ConfigError('Die Registry wurde zwischenzeitlich geändert. Bitte erneut prüfen.',409)
                registry_doc['registries'].append(rec['newRegistry'])
            validate_profile(rec['profile'],rec['profile'],registry_doc['registries'],self.identity_hosts)
            self.check_plan(actor,None,rec['profile'],registry_doc['registries'])
            entry={**rec,'before':None,'status':'applying','completedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
            target=self.state/'history'/f'{preview_id}.json';self.write(target,entry)
            try:
                with self.apply_runtime(None,rec['profile'],self.source,new_registry=rec.get('newRegistry')) if self.apply_runtime else nullcontext():
                    if file.exists() or registry_file.read_bytes()!=original_registry:raise ConfigError('Die Konfiguration wurde zwischenzeitlich geändert. Bitte erneut prüfen.',409)
                    if rec.get('newRegistry'):
                        temp=registry_file.with_suffix('.next');temp.write_text(yaml.safe_dump(registry_doc,allow_unicode=True,sort_keys=False));temp.replace(registry_file)
                    temp=file.with_suffix('.next');temp.write_text(yaml.safe_dump(rec['profile'],allow_unicode=True,sort_keys=False));temp.replace(file)
                    entry['status']='applied';self.write(target,entry)
            except Exception as error:
                entry['status']='failed';entry['error']=str(error);self.write(target,entry)
                if isinstance(error,ConfigError):raise
                raise ConfigError('Das Profil konnte nicht aktiviert werden. Der vorherige Stand wurde wiederhergestellt.',500) from error
            preview.unlink(missing_ok=True)
            return {'status':'applied','id':preview_id,'profileId':profile_id,'message':'Profil angelegt und aktiviert.'}
    def discard(self,actor,profile_id,entry_id):
        self.load(profile_id,actor)
        if not re.fullmatch(r'[0-9a-f]{32}',str(entry_id)):raise ConfigError('Ungültige Revision.')
        file=self.state/'history'/f'{entry_id}.json'
        if not file.exists():raise ConfigError('Revision nicht gefunden.',404)
        rec=json.loads(file.read_text())
        if rec['profileId']!=profile_id or rec['status']!='pending-deployment':raise ConfigError('Diese Änderung kann nicht verworfen werden.',409)
        rec['status']='discarded';rec['discardedBy']=actor;self.write(file,rec)
        return {'status':'discarded','message':'Vorgemerkte Änderung verworfen.'}
    def preview_platform(self,actor,profile_id,body):
        self.load(profile_id,actor)
        if not self.is_operator(actor):raise ConfigError('Diese Änderung erfordert Betreiberrechte.',403)
        policy_file=self.source/'administration.yaml';doc=yaml.safe_load(policy_file.read_text());before=doc['environments'][self.environment]
        if body.get('revision')!=revision(before):raise ConfigError('Die Servereinstellungen wurden zwischenzeitlich geändert.',409)
        candidate=copy.deepcopy(before);runtime=body.get('runtime')
        ranges={'syncTickSeconds':(10,86400),'catalogCacheSeconds':(30,3600),'monitoringCacheSeconds':(60,86400),'indexIntervalSeconds':(30,86400)}
        if not isinstance(runtime,dict) or set(runtime)!=set(ranges):raise ConfigError('Ungültige Servereinstellungen.')
        for key,(minimum,maximum) in ranges.items():
            if type(runtime[key]) is not int or not minimum<=runtime[key]<=maximum:raise ConfigError('Ein Intervall liegt außerhalb des zulässigen Bereichs.')
        candidate['runtime']=runtime
        diff=differences(before,candidate)
        if not diff:raise ConfigError('Keine Änderungen vorhanden.')
        labels={'syncTickSeconds':'Worker scheduler interval (seconds)','catalogCacheSeconds':'Catalog cache refresh (seconds)','monitoringCacheSeconds':'Monitoring cache refresh (seconds)','indexIntervalSeconds':'Search index refresh (seconds)'}
        for d in diff:d['label']=labels.get(d['path'].split('.')[-1],d['path'])
        rec={'id':uuid.uuid4().hex,'kind':'platform','profileId':profile_id,'actor':actor,'revision':revision(before),'policy':candidate,'diff':diff,'requiresDeployment':True,'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
        self.write(self.state/'previews'/f"{rec['id']}.json",rec)
        return {k:v for k,v in rec.items() if k!='policy'}
    def apply_platform(self,actor,profile_id,rec):
        if not self.is_operator(actor) or rec['actor']!=actor or rec['profileId']!=profile_id:raise ConfigError('Diese Änderung erfordert Betreiberrechte.',403)
        with (self.source/'.configuration.lock').open('a') as lock:
            fcntl.flock(lock,fcntl.LOCK_EX)
            profile,_=self.load(profile_id,actor);file=self.source/'administration.yaml';original=file.read_bytes();doc=yaml.safe_load(original)
            before=doc['environments'][self.environment]
            if revision(before)!=rec['revision']:raise ConfigError('Die Servereinstellungen wurden zwischenzeitlich geändert.',409)
            if (datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(rec['createdAt'])).total_seconds()>900:raise ConfigError('Änderungsvorschau abgelaufen. Bitte erneut prüfen.',409)
            doc['environments'][self.environment]=rec['policy']
            entry={**rec,'before':before,'status':'applying','completedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()};target=self.state/'history'/f"{rec['id']}.json";self.write(target,entry)
            try:
                with self.apply_runtime(profile,profile,self.source,policy_candidate=doc):
                    if file.read_bytes()!=original:raise ConfigError('Die Servereinstellungen wurden zwischenzeitlich geändert.',409)
                    temp=file.with_suffix('.next');temp.write_text(yaml.safe_dump(doc,sort_keys=False));temp.replace(file)
                    entry['status']='applied';self.write(target,entry)
            except Exception as error:
                entry['status']='failed';entry['error']=str(error);self.write(target,entry)
                if isinstance(error,ConfigError):raise
                raise ConfigError('Die Servereinstellungen konnten nicht aktiviert werden.',500) from error
            (self.state/'previews'/f"{rec['id']}.json").unlink(missing_ok=True)
            return {'status':'applied','id':rec['id'],'message':'Servereinstellungen übernommen und Dienste geprüft.'}
