import http.client
import importlib.util
import json
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('gateway', Path(__file__).resolve().parents[1] / 'server.py')
gateway = importlib.util.module_from_spec(spec)
# Never load developer credentials into a test fixture.
with patch('os.path.isfile', return_value=False), patch.dict('os.environ', {}, clear=True):
    spec.loader.exec_module(gateway)


class GatewayTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        root = Path(cls.temp.name)
        (root / 'src').mkdir()
        (root / '.git').mkdir()
        (root / '.git/config').write_text('private repository data')
        (root / '.env').write_text('TYPESAFE_API_KEY=synthetic-secret')
        (root / 'index.html').write_text('<html>public game</html>')
        (root / 'styles.css').write_text('body {}')
        (root / 'src/soundEngine.js').mkdir()
        (root / 'src/main.js').write_text('export const publicAsset = true;')
        (root / 'src/renderer.js').symlink_to(root / '.env')
        (root / 'src/gameEngine.js').symlink_to(Path(cls.temp.name).parent / 'outside.js')
        gateway.DIRECTORY = cls.temp.name
        gateway.TYPESAFE_API_KEY = 'synthetic-secret'
        gateway.OPENROUTER_API_KEY = ''
        cls.logs = patch.object(gateway.NeonHopGatewayHandler, 'log_message')
        cls.logs.start()
        cls.server = gateway.create_server(0)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.host = f'127.0.0.1:{cls.server.server_port}'

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()
        cls.temp.cleanup()
        cls.logs.stop()

    def request(self, path, method='GET', headers=None, body=None):
        conn = http.client.HTTPConnection('127.0.0.1', self.server.server_port)
        conn.request(method, path, body=body, headers=headers or {})
        response = conn.getresponse()
        result = response.status, dict(response.getheaders()), response.read()
        conn.close()
        return result

    def test_bind_failure_does_not_fall_back(self):
        with patch.object(gateway, 'LocalServer', side_effect=OSError('port in use')) as server:
            with self.assertRaises(OSError):
                gateway.create_server(8000)
            server.assert_called_once_with(('127.0.0.1', 8000), gateway.NeonHopGatewayHandler)

    def test_public_assets_and_loopback(self):
        self.assertEqual(self.server.server_address[0], '127.0.0.1')
        for path in ['/', '/index.html', '/styles.css', '/src/main.js?v=1']:
            for method in ['GET', 'HEAD']:
                with self.subTest(path=path, method=method):
                    status, headers, _ = self.request(path, method)
                    self.assertEqual(status, 200)
                    self.assertEqual(headers['Cache-Control'], 'no-cache')

    def test_private_files_encoded_paths_and_symlinks(self):
        paths = ['/.env', '/%2eenv', '/.git/config', '/%2egit/config', '/src/../.env',
                 '/src/%2e%2e/.env', '/%252eenv', '/src/', '/server.py',
                 '/outputs/remediation-plan-2026-09-20.md', '/src/renderer.js', '/src/gameEngine.js', '/src/soundEngine.js']
        for path in paths:
            for method in ['GET', 'HEAD']:
                with self.subTest(path=path, method=method):
                    status, _, body = self.request(path, method)
                    self.assertEqual(status, 404)
                    self.assertNotIn(b'synthetic-secret', body)

    def test_untrusted_requests_never_forward(self):
        with patch.object(gateway.urllib.request, 'urlopen') as upstream:
            for origin in [None, 'null', 'https://untrusted.example', 'http://localhost:1234']:
                headers = {'Content-Type': 'application/json'}
                if origin is not None:
                    headers['Origin'] = origin
                for method in ['POST', 'OPTIONS']:
                    self.assertEqual(self.request('/api/jev/decision', method, headers, '{}')[0], 403)
            headers = {'Host': 'untrusted.example', 'Origin': 'http://untrusted.example'}
            for method in ['GET', 'HEAD', 'POST', 'OPTIONS']:
                self.assertEqual(self.request('/', method, headers)[0], 403)
            self.assertEqual(self.request('/api/jev/decision', 'POST',
                {'Origin': f'http://{self.host}', 'Content-Type': 'text/plain'}, '{}')[0], 415)
            upstream.assert_not_called()

    def test_allowed_request_and_no_key_fallback(self):
        headers = {'Origin': f'http://{self.host}', 'Content-Type': 'application/json'}
        with patch.object(gateway.urllib.request, 'urlopen') as upstream:
            upstream.return_value.__enter__.return_value.status = 200
            upstream.return_value.__enter__.return_value.read.return_value = b'{"action":"WAIT"}'
            status, response_headers, body = self.request('/api/jev/decision', 'POST', headers, '{}')
            self.assertEqual(status, 200)
            self.assertEqual(json.loads(body)['action'], 'WAIT')
            self.assertNotIn('Access-Control-Allow-Origin', response_headers)
            self.assertEqual(upstream.call_args.args[0].get_header('Authorization'), 'Bearer synthetic-secret')
        with patch.object(gateway, 'TYPESAFE_API_KEY', ''), patch.object(gateway.urllib.request, 'urlopen') as upstream:
            self.assertEqual(self.request('/api/jev/decision', 'POST', headers, '{}')[0], 401)
            upstream.assert_not_called()

    def test_malformed_payloads_do_not_forward(self):
        headers = {'Origin': f'http://{self.host}', 'Content-Type': 'application/json'}
        with patch.object(gateway.urllib.request, 'urlopen') as upstream:
            for body in ['[1]', 'null', '{', '{"model":42}']:
                self.assertEqual(self.request('/api/jev/decision', 'POST', headers, body)[0], 400)
            upstream.assert_not_called()

    def test_explicit_openrouter_route_and_no_cross_provider_fallback(self):
        headers = {'Origin': f'http://{self.host}', 'Content-Type': 'application/json'}
        with patch.object(gateway, 'OPENROUTER_API_KEY', 'synthetic-openrouter'), patch.object(gateway.urllib.request, 'urlopen') as upstream:
            upstream.return_value.__enter__.return_value.status = 200
            upstream.return_value.__enter__.return_value.read.return_value = b'{}'
            status, _, _ = self.request('/api/jev/decision', 'POST', headers, '{"provider":"openrouter"}')
            self.assertEqual(status, 200)
            self.assertEqual(upstream.call_args.args[0].full_url, 'https://openrouter.ai/api/alpha/decisions')
        with patch.object(gateway, 'OPENROUTER_API_KEY', ''), patch.object(gateway.urllib.request, 'urlopen') as upstream:
            self.assertEqual(self.request('/api/jev/decision', 'POST', headers, '{"provider":"openrouter"}')[0], 401)
            upstream.assert_not_called()

    def test_baseline_records_are_private_and_session_paths_are_validated(self):
        headers = {'Origin': f'http://{self.host}', 'Content-Type': 'application/json'}
        event = {'sessionId': 'synthetic-session', 'mode': 'jev-only-frozen-time', 'type': 'request'}
        self.assertEqual(self.request('/api/jev/baseline/event', 'POST', headers, json.dumps(event))[0], 204)
        stored = Path(gateway.DIRECTORY) / 'outputs/jev-only-live/synthetic-session.jsonl'
        self.assertEqual(json.loads(stored.read_text()), event)
        self.assertEqual(self.request('/outputs/jev-only-live/synthetic-session.jsonl')[0], 404)
        event['sessionId'] = '../../private'
        self.assertEqual(self.request('/api/jev/baseline/event', 'POST', headers, json.dumps(event))[0], 400)
