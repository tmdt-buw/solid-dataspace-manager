import json, subprocess, sys, tempfile, unittest, fcntl
from pathlib import Path
from types import SimpleNamespace
import yaml
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts/deployment'))
from update_stack import update
from statistics_plan import statistics_plan
SOURCE=Path(__file__).resolve().parents[3]/'solid-dataspace/config'

class UpdateRollback(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.source=self.root/'config';self.source.mkdir()
  self.stack=self.root/'solid-dataspace-live-test';self.stack.mkdir();self.file=self.stack/'docker-compose.yml'
  self.original=b'services:\n  worker:\n    image: old-image\n  other:\n    image: old-other\n'
  self.file.write_bytes(self.original);(self.stack/'docker-compose.override.yml').write_text('services: {}')
  self.manifest=self.root/'release.json';self.manifest.write_text(json.dumps({'services':{'worker':'example/worker@sha256:'+'a'*64}}));self.calls=[];self.fail=None
 def tearDown(self):self.tmp.cleanup()
 def runner(self,args,**kwargs):
  self.calls.append(args)
  if self.fail and self.fail(args):raise subprocess.CalledProcessError(1,args)
  return SimpleNamespace(stdout='worker\n' if 'ps' in args else '')
 def apply(self,**kwargs):return update('test',self.manifest,srv=self.root,source=self.source,run=self.runner,**kwargs)
 def test_success_preserves_override_and_records_backup(self):
  result=self.apply(health=lambda *args:None)
  self.assertEqual((result/'docker-compose.yml').read_bytes(),self.original)
  self.assertEqual(json.loads((result/'result.json').read_text())['status'],'applied')
  up=next(c for c in self.calls if 'up' in c);self.assertIn(str(self.stack/'docker-compose.override.yml'),up)
 def test_failed_health_restores_image_and_recreates_running_service(self):
  count=0
  def health(*args):
   nonlocal count;count+=1
   if count==1:raise RuntimeError('unhealthy')
  with self.assertRaisesRegex(RuntimeError,'restored'):self.apply(health=health)
  self.assertEqual(self.file.read_bytes(),self.original)
  self.assertTrue(any('--force-recreate' in c for c in self.calls));self.assertEqual(count,2)
 def test_rollback_does_not_hold_startup_lock_while_waiting_for_old_controller(self):
  original_runner=self.runner;restoring=False
  def runner(args,**kwargs):
   nonlocal restoring
   if '--force-recreate' in args:restoring=True
   if restoring and '--wait' in args:
    with (self.source/'.configuration.lock').open('a') as lock:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
   return original_runner(args,**kwargs)
  self.runner=runner;count=0
  def health(*args):
   nonlocal count;count+=1
   if count==1:raise RuntimeError('failed')
  with self.assertRaisesRegex(RuntimeError,'restored'):self.apply(health=health)
  self.assertTrue(restoring)
 def test_invalid_candidate_never_changes_compose_or_starts_services(self):
  self.fail=lambda c:'config' in c
  with self.assertRaises(subprocess.CalledProcessError):self.apply(health=lambda *a:None)
  self.assertEqual(self.file.read_bytes(),self.original);self.assertFalse(any('up' in c for c in self.calls))
 def test_previously_stopped_services_are_stopped_after_failure(self):
  self.manifest.write_text(json.dumps({'services':{'other':'example/other@sha256:'+'b'*64}}))
  with self.assertRaisesRegex(RuntimeError,'restored'):self.apply(health=lambda *a:(_ for _ in ()).throw(RuntimeError('fail')))
  self.assertTrue(any(c[-2:]==['stop','other'] for c in self.calls));self.assertFalse(any('--force-recreate' in c for c in self.calls))

class StatisticsPolicy(unittest.TestCase):
 def setUp(self):
  self.profiles=[yaml.safe_load(p.read_text()) for p in (SOURCE/'profiles').glob('*.yaml')]
  self.registries=yaml.safe_load((SOURCE/'registries.yaml').read_text())['registries']
 def test_shared_profiles_have_one_worker_with_all_scoped_sources(self):
  plans=statistics_plan(self.profiles,self.registries,'prod')
  self.assertEqual(len(plans),1);self.assertEqual({p['id'] for p in plans[0]['eventSources']},{'dace','stadt-wuppertal','timberconnect'})
 def test_conflicting_readers_never_expand_access_by_union(self):
  next(p for p in self.profiles if p['id']=='dace')['public']['statistics']['adminWebIds'].append('https://pod.example/other#me')
  with self.assertRaisesRegex(ValueError,'identische Leserechte'):statistics_plan(self.profiles,self.registries,'prod')
 def test_separate_destinations_support_separate_readers(self):
  s=next(p for p in self.profiles if p['id']=='dace')['public']['statistics'];s['podBaseUrl']='https://pod.example/statistics/';s['eventsUrl']=s['podBaseUrl']+'events/catalog-instances/dace/downloads/';s['adminWebIds']=['https://pod.example/admin#me']
  self.assertEqual(len(statistics_plan(self.profiles,self.registries,'prod')),2)
