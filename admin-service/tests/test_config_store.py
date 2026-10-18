import contextlib, copy, json, shutil, sys, tempfile, unittest
from pathlib import Path
import yaml
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from config_store import ConfigStore, ConfigError, revision
SOURCE=Path(__file__).resolve().parents[3]/'solid-dataspace/config'
ADMIN='https://solid-community-server.tmdt.info/solidtestpod/profile/card#me'
OTHER='https://solid-community-server.tmdt.info/other/profile/card#me'
class Transactions(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
        shutil.copytree(SOURCE,self.root/'source')
        p=self.root/'source/profiles/test.yaml';d=yaml.safe_load(p.read_text());d['administration']={'enabled':True,'adminWebIds':[ADMIN]};p.write_text(yaml.safe_dump(d))
        self.store=ConfigStore(self.root/'source',self.root/'state',['test'],['solid-community-server.tmdt.info','solidcommunity.net'])
        self.original=d
    def tearDown(self):self.tmp.cleanup()
    def preview(self,**kwargs):
        candidate=copy.deepcopy(self.original);candidate['public']['branding']['projectName']='Admin Test'
        if 'candidate' in kwargs:candidate=kwargs['candidate']
        return self.store.preview(ADMIN,'test',{'revision':kwargs.get('revision',revision(self.original)),'profile':candidate})
    def test_edit_preserves_all_other_yaml_settings_and_production(self):
        prod=(self.root/'source/profiles/dace.yaml').read_bytes()
        p=self.preview();self.assertFalse(p['requiresDeployment'])
        self.store.apply(ADMIN,'test',p['id'])
        result,_=self.store.load('test',ADMIN)
        expected=copy.deepcopy(self.original);expected['public']['branding']['projectName']='Admin Test'
        self.assertEqual(result,expected);self.assertEqual((self.root/'source/profiles/dace.yaml').read_bytes(),prod)
        self.assertEqual(self.store.history(ADMIN,'test')[0]['status'],'applied')
        self.assertEqual(self.store.history(ADMIN,'test',p['id'])['before'],self.original)
    def test_rechecks_identity_on_every_call(self):
        with self.assertRaises(ConfigError):self.store.load('test',OTHER)
        with self.assertRaises(ConfigError):self.store.preview(OTHER,'test',{'revision':revision(self.original),'profile':self.original})
        p=self.preview()
        with self.assertRaises(ConfigError):self.store.apply(OTHER,'test',p['id'])
        with self.assertRaises(ConfigError):self.store.history(OTHER,'test')
    def test_scope_forbids_production_even_for_existing_statistics_admin(self):
        with self.assertRaises(ConfigError):self.store.load('dace',ADMIN)
    def test_revision_conflict_does_not_overwrite_manual_edit(self):
        p=self.preview();f=self.root/'source/profiles/test.yaml';d=yaml.safe_load(f.read_text());d['public']['fundingGrantNumber']='manual';f.write_text(yaml.safe_dump(d))
        with self.assertRaises(ConfigError) as ctx:self.store.apply(ADMIN,'test',p['id'])
        self.assertEqual(ctx.exception.status,409);self.assertEqual(yaml.safe_load(f.read_text())['public']['fundingGrantNumber'],'manual')
    def test_app_review_identifies_only_the_changed_field(self):
        candidate=copy.deepcopy(self.original)
        app=next(a for a in candidate['public']['apps'] if a['id']=='catalog')
        app['visible']=not app['visible']
        preview=self.preview(candidate=candidate)
        self.assertEqual(len(preview['diff']),1)
        self.assertEqual(preview['diff'][0]['path'],'public.apps.catalog.visible')
        self.assertIn('Im Menü',preview['diff'][0]['label'])
    def test_manual_edit_during_runtime_validation_is_preserved(self):
        file=self.root/'source/profiles/test.yaml'
        @contextlib.contextmanager
        def intervene(*args):
            data=yaml.safe_load(file.read_text());data['public']['fundingGrantNumber']='intervening-edit'
            file.write_text(yaml.safe_dump(data))
            yield
        self.store.apply_runtime=intervene
        preview=self.preview()
        with self.assertRaises(ConfigError) as ctx:self.store.apply(ADMIN,'test',preview['id'])
        self.assertEqual(ctx.exception.status,409)
        self.assertEqual(yaml.safe_load(file.read_text())['public']['fundingGrantNumber'],'intervening-edit')
    def test_domain_owned_by_another_profile_cannot_be_claimed(self):
        candidate=copy.deepcopy(self.original)
        other=yaml.safe_load((self.root/'source/profiles/dace.yaml').read_text())
        candidate['domains'].append(other['domains'][0])
        with self.assertRaises(ConfigError):self.preview(candidate=candidate)
    def test_replay_rejected(self):
        p=self.preview();self.store.apply(ADMIN,'test',p['id'])
        with self.assertRaises(ConfigError):self.store.apply(ADMIN,'test',p['id'])
    def test_last_admin_and_self_removal_rejected(self):
        for ids in [[],[OTHER]]:
            d=copy.deepcopy(self.original);d['administration']['adminWebIds']=ids
            with self.assertRaises(ConfigError):self.preview(candidate=d)
    def test_topology_runs_the_same_backed_up_activation_path(self):
        d=copy.deepcopy(self.original);d['domains'].append('new.example.org')
        p=self.preview(candidate=d);self.assertTrue(p['requiresDeployment'])
        result=self.store.apply(ADMIN,'test',p['id']);self.assertEqual(result['status'],'applied')
        self.assertEqual(self.store.load('test',ADMIN)[0],d)
        self.assertEqual(self.store.history(ADMIN,'test',p['id'])['before'],self.original)
    def test_invalid_links_and_dimension_injection_rejected(self):
        for key,value in [('logoUrl','javascript:alert(1)'),('logoUrl','//evil.example/x'),('logoWidth','10px;display:none')]:
            d=copy.deepcopy(self.original);d['public']['branding'][key]=value
            with self.assertRaises(ConfigError):self.preview(candidate=d)
    def test_test_collection_remains_disabled(self):
        for section in ['statistics','syncWorker']:
            d=copy.deepcopy(self.original);d['public'][section]['enabled']=True
            with self.assertRaises(ConfigError):self.preview(candidate=d)
    def test_failed_runtime_apply_preserves_yaml_and_backup(self):
        @contextlib.contextmanager
        def fail(*args):raise RuntimeError('apply failed');yield
        self.store.apply_runtime=fail;p=self.preview()
        with self.assertRaises(ConfigError):self.store.apply(ADMIN,'test',p['id'])
        self.assertEqual(self.store.load('test',ADMIN)[0],self.original)
        self.assertEqual(self.store.history(ADMIN,'test')[0]['status'],'failed')
    def test_restoration_is_a_normal_reviewed_transaction(self):
        p=self.preview();self.store.apply(ADMIN,'test',p['id']);current,_=self.store.load('test',ADMIN)
        restore=self.store.preview(ADMIN,'test',{'revision':revision(current),'profile':self.store.history(ADMIN,'test',p['id'])['before']})
        self.store.apply(ADMIN,'test',restore['id']);self.assertEqual(self.store.load('test',ADMIN)[0],self.original)

class RuntimeRecovery(unittest.TestCase):
    def test_recovery_preserves_a_new_manual_edit_and_marks_audit_rollback(self):
        import base64
        from controller import RuntimeTransaction
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);state=root/'state';state.mkdir();(state/'history').mkdir()
            runtime_file=root/'config.js';runtime_file.write_text('new-runtime')
            source=root/'test.yaml';source.write_text('new-manual-edit')
            before={'id':'test','value':'old'};after={'id':'test','value':'new'}
            record={'files':{str(runtime_file):base64.b64encode(b'old-runtime').decode(),str(source):base64.b64encode(b'original-yaml').decode()},'source':str(source),'replacement':base64.b64encode(b'new-yaml').decode(),'profileId':'test','revision':revision(before),'replacementRevision':revision(after)}
            (state/'runtime-journal.json').write_text(json.dumps(record))
            entry={'id':'entry','profileId':'test','revision':revision(before),'profile':after,'status':'applied'}
            (state/'history/entry.json').write_text(json.dumps(entry))
            recovery=RuntimeTransaction(root,state,root/'Caddyfile','caddy');calls=[];recovery.run=lambda *args:calls.append(args)
            recovery.recover()
            self.assertEqual(source.read_text(),'new-manual-edit');self.assertEqual(runtime_file.read_text(),'old-runtime')
            self.assertEqual(json.loads((state/'history/entry.json').read_text())['status'],'rolled-back')
            self.assertFalse((state/'runtime-journal.json').exists());self.assertEqual(calls,[('reload','/etc/caddy/Caddyfile')])

if __name__=='__main__':unittest.main()
