import copy, json, sys, tempfile, unittest, shutil
from pathlib import Path
import yaml
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from config_store import ConfigStore, ConfigError, revision, differences
from catalog_metadata import validate_catalog_metadata, vocabulary_turtle
from compile_config import compile_config
from deployment import Deployment

ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT.parent/'solid-dataspace/config'
ADMIN='https://solid-community-server.tmdt.info/solidtestpod/profile/card#me'

def copy_source(target):
    shutil.copytree(SOURCE,target)
    # Integration fixtures start without custom profiles, independently of the
    # operator's selected profiles in the sibling deployment repository.
    for file in (target/'profiles').glob('*.yaml'):
        value=yaml.safe_load(file.read_text())
        cfg=value['public']['catalog']
        cfg.pop('metadataProfile',None);cfg.pop('metadataProfiles',None)
        file.write_text(yaml.safe_dump(value,allow_unicode=True,sort_keys=False))

def catalog():
    profile=json.loads((ROOT/'src/catalogMetadata/dace.json').read_text())
    for f in profile['fields']:
        f['scheme']='https://test.example/catalog-vocabulary/ce/'+f['id']
        for v in f['values']:v['iri']=f['scheme']+'/'+v['id']
    return {'defaultRegistry':'https://registry.example/test','metadataProfile':profile['id'],'metadataProfiles':[profile]}

class CatalogMetadataTests(unittest.TestCase):
    def test_preset_and_rdf_labels(self):
        c=catalog();validate_catalog_metadata(c)
        rdf=vocabulary_turtle(c)
        self.assertIn('skos:ConceptScheme',rdf);self.assertIn('skos:inScheme',rdf);self.assertIn('"Recycling und Rückgewinnung"@de',rdf)
        self.assertEqual(len(c['metadataProfiles'][0]['fields']),8)
    def test_removal_and_identity_changes_rejected(self):
        original=catalog()
        for mutation in ['profile','field','value','scheme','iri']:
            c=copy.deepcopy(original);p=c['metadataProfiles'][0];f=p['fields'][0]
            if mutation=='profile': c['metadataProfiles']=[];c['metadataProfile']=''
            elif mutation=='field':p['fields'].pop(0)
            elif mutation=='value':f['values'].pop(0)
            elif mutation=='scheme':f['scheme']+='-changed'
            else:f['values'][0]['iri']+='-changed'
            with self.assertRaises(ValueError,msg=mutation):validate_catalog_metadata(c,original)
    def test_rename_disable_and_reorder_keep_identifiers(self):
        old=catalog();new=copy.deepcopy(old);p=new['metadataProfiles'][0];p['fields'].reverse();p['fields'][0]['label']['de']='Andere Bezeichnung';p['fields'][0]['enabled']=False;p['fields'][1]['values'][0]['enabled']=False
        validate_catalog_metadata(new,old)
        self.assertTrue(differences(old,new))
    def test_required_hidden_or_empty_fields_rejected(self):
        for change in [{'form':False},{'enabled':False},{'values':[]}]:
            c=catalog();c['metadataProfiles'][0]['fields'][0].update(required=True,**change)
            with self.assertRaises(ValueError):validate_catalog_metadata(c)
    def test_invalid_configs_do_not_execute_or_publish(self):
        for value in ['javascript:alert(1)','https://x.example/catalog-vocabulary/a> . <b','https://x.example/catalog-vocabulary/a?secret=1']:
            c=catalog();c['metadataProfiles'][0]['fields'][0]['scheme']=value
            with self.assertRaises(ValueError):validate_catalog_metadata(c)
        c=catalog();c['metadataProfiles'][0]['html']='arbitrary markup'
        with self.assertRaises(ValueError):validate_catalog_metadata(c)
    def test_config_transport_and_admin_transaction_are_scoped_to_test(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);copy_source(root/'source')
            store=ConfigStore(root/'source',root/'state',['test'],['solid-community-server.tmdt.info'])
            before,_=store.load('test',ADMIN);after=copy.deepcopy(before)
            after['public']['catalog'].update({k:v for k,v in catalog().items() if k!='defaultRegistry'})
            prod=(root/'source/profiles/dace.yaml').read_bytes()
            preview=store.preview(ADMIN,'test',{'revision':revision(before),'profile':after})
            self.assertFalse(preview['requiresDeployment'])
            store.apply(ADMIN,'test',preview['id'])
            self.assertEqual(store.history(ADMIN,'test',preview['id'])['before'],before)
            self.assertEqual((root/'source/profiles/dace.yaml').read_bytes(),prod)
            compile_config(root/'source',root/'output')
            for filename in ['config.js','env.js']:
                self.assertIn('dace-ce-v1',(root/'output/runtime/test'/filename).read_text())
                self.assertNotIn('dace-ce-v1',(root/'output/runtime/dace'/filename).read_text())
            self.assertIn('skos:Concept',(root/'output/runtime/test/catalog-vocabulary.ttl').read_text())
    def test_category_only_reorder_creates_a_reviewable_diff(self):
        old=catalog();new=copy.deepcopy(old);new['metadataProfiles'][0]['fields'].reverse()
        self.assertTrue(differences(old,new))
    def test_actual_runtime_installs_vocabulary_and_rolls_back_on_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);source=root/'source';copy_source(source)
            live=root/'consolidated';compile_config(source,live)
            # Exercise upgrades from installations that do not yet have the file.
            vocab=live/'runtime/test/catalog-vocabulary.ttl';vocab.unlink()
            state=root/'state';state.mkdir();(state/'history').mkdir()
            stack=root/'stack';stack.mkdir();(stack/'docker-compose.yml').write_text('name: catalog-profile-test\nservices: {}\n')
            (root/'Caddyfile').write_text('import /config/consolidated/sites.caddy\n')
            deployment=Deployment(source,live,state,stack,'test');calls=[];deployment.run=lambda args,**kwargs:calls.append(args)
            file=source/'profiles/test.yaml';original=file.read_bytes();before=yaml.safe_load(original);after=copy.deepcopy(before)
            after['public']['catalog'].update({k:v for k,v in catalog().items() if k!='defaultRegistry'})
            prod=(live/'runtime/dace/config.js').read_bytes()
            with self.assertRaises(RuntimeError):
                with deployment(before,after,source):
                    self.assertIn('skos:Concept',vocab.read_text())
                    self.assertEqual(prod,(live/'runtime/dace/config.js').read_bytes())
                    file.write_text(yaml.safe_dump(after,allow_unicode=True,sort_keys=False));raise RuntimeError('interrupted apply')
            self.assertEqual(file.read_bytes(),original);self.assertFalse(vocab.exists())
            self.assertFalse(deployment.journal.exists())
            self.assertFalse(any('up' in call for call in calls))
    def test_instance_admin_can_edit_categories_but_not_change_registry(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);copy_source(root/'source')
            store=ConfigStore(root/'source',root/'state',['test'],['solid-community-server.tmdt.info'],environment='test')
            store.is_operator=lambda actor:False
            before,_=store.load('test',ADMIN);after=copy.deepcopy(before)
            after['public']['catalog'].update({k:v for k,v in catalog().items() if k!='defaultRegistry'})
            self.assertFalse(store.preview(ADMIN,'test',{'revision':revision(before),'profile':after})['requiresDeployment'])
            after['public']['catalog']['defaultRegistry']='https://registry.example/other'
            with self.assertRaises(ConfigError):store.preview(ADMIN,'test',{'revision':revision(before),'profile':after})

if __name__=='__main__':unittest.main()
