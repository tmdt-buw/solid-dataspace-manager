import io, sys, unittest
from pathlib import Path
from urllib.error import HTTPError, URLError
sys.path.insert(0, str(Path(__file__).resolve().parents[2]/'scripts/deployment'))
from update_stack import verify_route

class StartupReadiness(unittest.TestCase):
    def response(self, body):
        response = io.BytesIO(body)
        response.status = 200
        return response

    def check(self, outcomes, route='/sync-worker/health'):
        self.elapsed = 0
        self.calls = 0
        def opener(url, timeout):
            self.calls += 1
            value = outcomes[min(self.calls-1, len(outcomes)-1)]
            if isinstance(value, Exception): raise value
            return self.response(value)
        def pause(seconds): self.elapsed += seconds
        verify_route('https://test.example'+route, route, 'test', opener=opener,
                     clock=lambda:self.elapsed, pause=pause, startup_timeout=4)

    def test_ready_service_does_not_wait(self):
        self.check([b'{"ok":true}'])
        self.assertEqual(self.elapsed, 0)
        self.assertEqual(self.calls, 1)

    def test_proxy_startup_errors_are_retried(self):
        for code in [502,503,504]:
            with self.subTest(code=code):
                self.check([HTTPError('url',code,'startup',{},None), b'{"ok":true}'])
                self.assertEqual(self.calls, 2)

    def test_connection_startup_errors_are_retried(self):
        for error in [URLError('refused'), TimeoutError(), ConnectionResetError()]:
            with self.subTest(error=type(error).__name__):
                self.check([error,b'{"ok":true}'])
                self.assertEqual(self.calls, 2)

    def test_health_initializing_then_ready(self):
        self.check([b'{"ok":false}',b'{"status":"ok"}'])
        self.assertEqual(self.calls, 2)

    def test_permanent_failure_has_bounded_wait(self):
        with self.assertRaisesRegex(RuntimeError, 'did not become ready'):
            self.check([HTTPError('url',502,'failed',{},None)])
        self.assertEqual(self.elapsed, 4)
        self.assertEqual(self.calls, 3)

    def test_permissions_and_missing_routes_fail_immediately(self):
        for code in [401,403,404,500]:
            with self.subTest(code=code):
                with self.assertRaises(HTTPError):
                    self.check([HTTPError('url',code,'error',{},None)])
                self.assertEqual(self.calls,1)
                self.assertEqual(self.elapsed,0)

    def test_wrong_profile_fails_immediately(self):
        with self.assertRaisesRegex(RuntimeError, 'Unexpected runtime profile'):
            self.check([b'{"dataspaceId": "other"}'], '/config.js')
        self.assertEqual(self.elapsed,0)

    def test_correct_profile_can_start_after_proxy(self):
        self.check([HTTPError('url',502,'startup',{},None),b'{"dataspaceId": "test"}'], '/config.js')
        self.assertEqual(self.calls,2)

    def test_malformed_health_and_oversized_responses_fail(self):
        for data in [b'not JSON',b'x'*65537]:
            with self.subTest(size=len(data)):
                with self.assertRaises((ValueError,RuntimeError)): self.check([data])
                self.assertEqual(self.elapsed,0)
