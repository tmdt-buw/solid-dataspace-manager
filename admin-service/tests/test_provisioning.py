import contextlib, copy, shutil, sys, tempfile, unittest
from pathlib import Path
import yaml
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from config_store import ConfigStore,ConfigError,revision
from deployment import Deployment,clone_workspaces
from compile_config import compile_config
SOURCE=Path(__file__).resolve().parents[3]/'solid-dataspace/config'
ADMIN='https://solid-community-server.tmdt.info/solidtestpod/profile/card#me'
EDITOR='https://solid-community-server.tmdt.info/editor/profile/card#me'

class Provisioning(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.source=self.root/'config';shutil.copytree(SOURCE,self.source)
  p=self.source/'profiles/test.yaml';data=yaml.safe_load(p.read_text());data['administration']['adminWebIds']=[ADMIN,EDITOR];p.write_text(yaml.safe_dump(data));self.original=data
  policy={'schemaVersion':1,'environments':{'test':{'operatorWebIds':[ADMIN],'serverAddresses':['132.195.160.191'],'runtime':{'syncTickSeconds':600,'catalogCacheSeconds':300,'monitoringCacheSeconds':3600,'indexIntervalSeconds':300}}}}
  (self.source/'administration.yaml').write_text(yaml.safe_dump(policy));self.policy=policy['environments']['test'];self.checks=[]
  self.store=ConfigStore(self.source,self.root/'state',[],['solid-community-server.tmdt.info'],environment='test',preflight=lambda *args:self.checks.append(args))
 def tearDown(self):self.tmp.cleanup()
 def new(self,**kwargs):return self.store.preview_create(ADMIN,{'id':'project-new','name':'New Project','templateId':'test','domains':['new.example.org'],'registryUrl':self.original['public']['catalog']['defaultRegistry'],**kwargs})
 def test_create_is_operator_only_and_environment_scoped(self):
  with self.assertRaises(ConfigError):self.store.preview_create(EDITOR,{})
  with self.assertRaises(ConfigError):self.new(templateId='dace')
  with self.assertRaises(ConfigError):self.store.load('dace',ADMIN)
 def test_create_retains_template_and_never_copies_workspace_or_personal_data(self):
  p=self.new();result=self.store.apply(ADMIN,p['profileId'],p['id']);created,_=self.store.load('project-new',ADMIN)
  self.assertEqual(result['status'],'applied');self.assertEqual(created['environment'],'test');self.assertFalse(created['public']['statistics']['enabled'])
  self.assertEqual(created['public']['statistics']['adminWebIds'],[])
  self.assertTrue(all(not a['enabled'] for a in created['public']['apps'] if a['id'] in ['plasma','node-red']))
  self.assertEqual(self.store.load('test',ADMIN)[0],self.original)
  self.assertGreaterEqual(len(self.checks),2)
 def test_new_registry_is_scoped_and_existing_production_documents_do_not_change(self):
  compile_config(self.source,self.root/'before')
  p=self.new(registryUrl='https://solid-community-server.tmdt.info/test/new-registry')
  self.store.apply(ADMIN,p['profileId'],p['id']);compile_config(self.source,self.root/'after')
  registries=yaml.safe_load((self.source/'registries.yaml').read_text())['registries'];self.assertEqual(registries[-1]['environment'],'test')
  for profile in ['dace','stadt-wuppertal','timberconnect']:
   for file in ['config.js','env.js']:self.assertEqual((self.root/'before/runtime'/profile/file).read_bytes(),(self.root/'after/runtime'/profile/file).read_bytes())
 def test_duplicate_domain_or_identifier_cannot_overwrite_existing_profile(self):
  with self.assertRaises(ConfigError):self.new(id='test')
  with self.assertRaises(ConfigError):self.new(domains=self.original['domains'])
  p=self.new();self.store.apply(ADMIN,p['profileId'],p['id'])
  with self.assertRaises(ConfigError):self.store.apply(ADMIN,p['profileId'],p['id'])
 def test_editor_can_brand_but_cannot_change_domains(self):
  draft=copy.deepcopy(self.original);draft['public']['branding']['projectName']='Allowed'
  self.store.preview(EDITOR,'test',{'profile':draft,'revision':revision(self.original)})
  draft['domains'].append('added.example.org')
  with self.assertRaises(ConfigError):self.store.preview(EDITOR,'test',{'profile':draft,'revision':revision(self.original)})
 def test_current_address_cannot_be_removed_or_redirected_during_its_session(self):
  draft=copy.deepcopy(self.original);host=draft['domains'][0];draft['domains']=draft['domains'][1:]+[host];draft['redirectDomains']=[host]
  with self.assertRaises(ConfigError):self.store.preview(ADMIN,'test',{'profile':draft,'revision':revision(self.original),'requestHost':host})
 def test_platform_changes_revalidate_revision_and_role(self):
  settings={**self.policy['runtime'],'catalogCacheSeconds':60}
  with self.assertRaises(ConfigError):self.store.preview_platform(EDITOR,'test',{'runtime':settings,'revision':revision(self.policy)})
  p=self.store.preview_platform(ADMIN,'test',{'runtime':settings,'revision':revision(self.policy)})
  @contextlib.contextmanager
  def runtime(*args,**kwargs):yield
  self.store.apply_runtime=runtime;self.store.apply(ADMIN,'test',p['id'])
  self.assertEqual(self.store.policy()['runtime']['catalogCacheSeconds'],60)
  with self.assertRaises(ConfigError):self.store.preview_platform(ADMIN,'test',{'runtime':settings,'revision':revision(self.policy)})
 def test_redirect_caddy_retains_internal_profile_identity(self):
  draft=copy.deepcopy(self.original);draft['redirectDomains']=[draft['domains'][1]]
  p=self.store.preview(ADMIN,'test',{'profile':draft,'revision':revision(self.original)});self.store.apply(ADMIN,'test',p['id'])
  compile_config(self.source,self.root/'compiled');caddy=(self.root/'compiled/sites.caddy').read_text()
  self.assertIn('redir https://'+draft['domains'][0]+'{uri} 308',caddy)
  self.assertEqual(self.store.load('test',ADMIN)[0]['id'],'test')
 def test_foreign_actor_cannot_activate_creation(self):
  p=self.new()
  with self.assertRaises(ConfigError):self.store.apply(EDITOR,p['profileId'],p['id'])
  self.assertFalse((self.source/'profiles/project-new.yaml').exists())

 def test_profile_admin_cannot_provision_workspaces_through_app_flags(self):
  draft=copy.deepcopy(self.original)
  app=next(a for a in draft['public']['apps'] if a['id']=='node-red');app['enabled']=not app['enabled']
  with self.assertRaises(ConfigError):self.store.preview(EDITOR,'test',{'profile':draft,'revision':revision(self.original)})
 def test_registry_with_fragment_or_query_is_rejected_before_preview(self):
  for value in ['https://pod.example/registry#fragment','https://pod.example/registry?query=1']:
   with self.assertRaises(ConfigError):self.new(registryUrl=value)
 def test_platform_policy_is_not_exposed_to_profile_only_admins(self):
  settings={**self.policy['runtime'],'catalogCacheSeconds':60}
  p=self.store.preview_platform(ADMIN,'test',{'runtime':settings,'revision':revision(self.policy)})
  @contextlib.contextmanager
  def runtime(*args,**kwargs):yield
  self.store.apply_runtime=runtime;self.store.apply(ADMIN,'test',p['id'])
  self.assertFalse(self.store.history(EDITOR,'test'))
  with self.assertRaises(ConfigError):self.store.history(EDITOR,'test',p['id'])

class WorkspacePlan(unittest.TestCase):
 def test_fresh_volumes_and_networks_without_copying_existing_user_data(self):
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory);settings=root/'settings.js';settings.write_text('module.exports = {};')
   compose={'name':'test-stack','services':{'node-red':{'image':'fixed-image','networks':{'workspace-test':{},'edge':{}},'env_file':['secrets/node-red.env'],'volumes':[{'type':'volume','source':'existing-data','target':'/data'},{'type':'bind','source':str(settings),'target':'/data/settings.js'}]}},'volumes':{'existing-data':{'external':True}}}
   profile={'id':'new-project','environment':'test','public':{'apps':[{'id':'node-red','enabled':True}]}}
   original=copy.deepcopy(compose['services']['node-red']);files,services=clone_workspaces(compose,profile,root)
   self.assertEqual(services,['new-project-node-red']);new=compose['services'][services[0]]
   self.assertNotEqual(new['volumes'][0]['source'],'existing-data');self.assertIn('workspace-new-project',new['networks']);self.assertEqual(compose['services']['node-red'],original)
   self.assertEqual(list(files.values()),[b'module.exports = {};'])
   again,services=clone_workspaces(compose,profile,root);self.assertFalse(again);self.assertFalse(services)


class RuntimeTransactionTests(unittest.TestCase):
 def test_late_failure_restores_source_runtime_and_journal(self):
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory);source=root/'source';shutil.copytree(SOURCE,source)
   live=root/'consolidated';compile_config(source,live);(root/'Caddyfile').write_text('import /config/consolidated/sites.caddy\n')
   state=root/'state';state.mkdir();(state/'history').mkdir();stack=root/'stack';stack.mkdir();(stack/'docker-compose.yml').write_text('name: test-stack\nservices: {}\n')
   deployment=Deployment(source,live,state,stack,'test');calls=[];deployment.run=lambda args,**kwargs:calls.append(args)
   file=source/'profiles/test.yaml';original=file.read_bytes();before=yaml.safe_load(original);after=copy.deepcopy(before);after['public']['branding']['projectName']='Transaction test'
   runtime_before=(live/'runtime/test/config.js').read_bytes()
   with self.assertRaises(RuntimeError):
    with deployment(before,after,source):
     file.write_text(yaml.safe_dump(after,allow_unicode=True,sort_keys=False));raise RuntimeError('simulate failed health check')
   self.assertEqual(file.read_bytes(),original);self.assertEqual((live/'runtime/test/config.js').read_bytes(),runtime_before);self.assertFalse(deployment.journal.exists())
   self.assertTrue(any('reload' in call for call in calls))
 def test_runtime_rejects_cross_environment_even_for_local_callers(self):
  with tempfile.TemporaryDirectory() as root:
   root=Path(root);deployment=Deployment(root,root,root,root,'test')
   with self.assertRaises(ConfigError):
    with deployment(None,{'environment':'prod'},root):pass

if __name__=='__main__':unittest.main()
