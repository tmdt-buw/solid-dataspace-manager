"""Use CADDY_COMMAND='["docker","exec","-i","solid-caddy-1","caddy"]' for integration validation."""
import json, os, shutil, subprocess, sys, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts' / 'deployment'))
from compile_config import login_routes
COMMAND = json.loads(os.environ['CADDY_COMMAND']) if os.environ.get('CADDY_COMMAND') else ([shutil.which('caddy')] if shutil.which('caddy') else None)

@unittest.skipUnless(COMMAND, 'Caddy parser required for integration validation')
class LoginRouting(unittest.TestCase):
    def test_each_origin_is_an_alternative_for_the_same_header(self):
        for count in (1, 4, 6, 9):
            with self.subTest(domains=count):
                origins = [f'https://profile-{i}.example.org' for i in range(count)]
                fragment = login_routes('prod', 'solid-dataspace-prod', origins)
                source = ':8080 {\n' + fragment + '}\n'
                result = subprocess.run(COMMAND + ['adapt', '--config', '-', '--adapter', 'caddyfile'], input=source, text=True, capture_output=True, check=True)
                routes = json.loads(result.stdout)['apps']['http']['servers']['srv0']['routes']
                self.assertEqual(routes[0]['match'], [{'header': {'Origin': origins}}])
                self.assertEqual(routes[0]['handle'][0]['upstreams'], [{'dial': 'solid-dataspace-prod-account-handoff:8080'}])

    def test_no_origins_produces_no_catch_all_proxy(self):
        source = ':8080 {\n' + login_routes('test', 'solid-dataspace-live-test', []) + 'respond 403\n}\n'
        result = subprocess.run(COMMAND + ['adapt', '--config', '-', '--adapter', 'caddyfile'], input=source, text=True, capture_output=True, check=True)
        self.assertNotIn('reverse_proxy', result.stdout)
