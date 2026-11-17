import copy,json,sys,tempfile,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts/deployment'))
from compile_config import APP_PATHS,read_config,site,compile_config
SOURCE=Path(__file__).resolve().parents[3]/'solid-dataspace/config'

class UrbanRoutes(unittest.TestCase):
 def test_canonical_and_legacy_paths_use_same_service(self):
  profiles,_=read_config(SOURCE)
  for profile in profiles:
   text=site(profile)
   self.assertIn('reverse_proxy /urban-data-explorer/*',text)
   self.assertIn('reverse_proxy /environmental-monitoring/*',text)
   self.assertIn('redir @legacyUrbanEmbed /web/urban-data-explorer{?query} 308',text)
 def test_disabled_profile_blocks_new_and_old_routes(self):
  profiles,_=read_config(SOURCE);profile=copy.deepcopy(profiles[0])
  next(app for app in profile['public']['apps'] if app['id']=='environmental-monitoring')['enabled']=False
  line=next(line for line in site(profile).splitlines() if '@disabled path' in line)
  for path in APP_PATHS['environmental-monitoring']:self.assertIn(path,line)
 def test_runtime_links_are_upgraded_without_mutating_source_profiles(self):
  before={p:p.read_bytes() for p in (SOURCE/'profiles').glob('*.yaml')}
  with tempfile.TemporaryDirectory() as directory:
   target=Path(directory);profiles=compile_config(SOURCE,target)
   for profile in profiles:
    text=(target/'runtime'/profile['id']/'config.js').read_text()
    value=json.loads(text.removeprefix('window.__APP_CONFIG__ = ').rstrip(';\n'))
    app=next(app for app in value['apps'] if app['id']=='environmental-monitoring')
    self.assertEqual(app['href'],'/web/urban-data-explorer')
  self.assertEqual(before,{p:p.read_bytes() for p in before})
