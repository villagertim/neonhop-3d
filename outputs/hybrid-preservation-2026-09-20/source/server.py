#!/usr/bin/env python3
"""
Lightweight Gateway & Static Server for NeonHop 3D Cyber-Arcade & TypeSafe Jev AI Agent.
Serves static assets and provides a dual-provider proxy endpoint for TypeSafe AI Direct
and OpenRouter.ai alpha decisions API, referencing the workspace's local .env file.
"""

import http.server
import json
import os
import sys
import urllib.request
import urllib.error
from pathlib import Path
from urllib.parse import unquote, urlsplit

DIRECTORY = os.path.dirname(os.path.abspath(__file__))

def load_workspace_env(workspace_dir):
    """
    Loads environment variables from the .env file located in the workspace directory.
    Populates os.environ so settings take effect without external third-party dependencies.
    """
    env_path = os.path.join(workspace_dir, ".env")
    if not os.path.isfile(env_path):
        return False, {}
    
    loaded = {}
    try:
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" in line:
                    key, val = line.split("=", 1)
                    key = key.strip()
                    val = val.strip()
                    if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
                        val = val[1:-1]
                    if key:
                        os.environ[key] = val
                        loaded[key] = val
        return True, loaded
    except Exception as e:
        print(f"⚠️ Warning: Failed to read .env file at {env_path}: {e}")
        return False, {}

# Load local workspace .env on boot
ENV_LOADED, LOADED_VARS = load_workspace_env(DIRECTORY)

PORT = int(os.environ.get("PORT", 8000))
TYPESAFE_API_KEY = os.environ.get("TYPESAFE_API_KEY", "").strip()
OPENROUTER_API_KEY = (os.environ.get("OPENROUTER_API_KEY") or os.environ.get("OpenRouter_Jev") or "").strip()

# Determine active decision provider priority:
# 1. Primary: TypeSafe AI Direct API
# 2. Secondary / Fallback: OpenRouter.ai API
if TYPESAFE_API_KEY:
    ACTIVE_PROVIDER = "typesafe"
    PROVIDER_NAME = "TypeSafe AI Direct (Primary)"
    DEFAULT_MODEL = "jev-latest"
elif OPENROUTER_API_KEY:
    ACTIVE_PROVIDER = "openrouter"
    PROVIDER_NAME = "OpenRouter.ai Gateway (Secondary)"
    DEFAULT_MODEL = "typesafe/jev-1.13"
else:
    ACTIVE_PROVIDER = "none"
    PROVIDER_NAME = "In-Memory Local Fallback (No Key Configured)"
    DEFAULT_MODEL = "typesafe/jev-1.13"


class NeonHopGatewayHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    PUBLIC_FILES = frozenset({
        "/index.html", "/styles.css",
        *(f"/src/{name}.js" for name in (
            "main", "gameEngine", "renderer", "soundEngine", "inputManager",
            "leaderboard", "jevAgent", "physicsOracle", "learningBrain", "jevEvaluator"
        ))
    })

    def _trusted_host(self):
        port = self.server.server_port
        hosts = {f"localhost:{port}", f"127.0.0.1:{port}"}
        if port == 80:
            hosts.update({"localhost", "127.0.0.1"})
        values = self.headers.get_all("Host", [])
        return len(values) == 1 and values[0] in hosts

    def _check_host(self):
        if not self._trusted_host():
            self.send_error(403, "Untrusted Host")
            return False
        return True

    def _check_origin(self):
        if not self._check_host():
            return False
        if self.headers.get_all("Origin", []) != [f"http://{self.headers['Host']}"]:
            self.send_error(403, "Same-origin browser requests required")
            return False
        return True

    def _set_cors_headers(self):
        # The application is same-origin; no cross-origin access is granted.
        self.send_header("Vary", "Origin")

    def end_headers(self):
        # This is a development gateway: source edits must be revalidated on reload.
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def do_OPTIONS(self):
        if not self._check_origin():
            return
        self.send_response(204)
        self.end_headers()

    def send_head(self):
        # Both GET and inherited HEAD pass through the same asset policy.
        if not self._check_host():
            return None
        path = unquote(urlsplit(self.path).path)
        if path == "/":
            path = "/index.html"
        if path not in self.PUBLIC_FILES:
            self.send_error(404, "Asset not found")
            return None
        root = Path(DIRECTORY).resolve()
        target = (root / path.lstrip("/")).resolve()
        # Reject directories and links, including links to private files in the root.
        if (not target.is_relative_to(root) or target != root / path.lstrip("/")
                or not target.is_file()):
            self.send_error(404, "Asset not found")
            return None
        return super().send_head()

    def do_GET(self):
        if not self._check_host():
            return
        if self.path == "/api/jev/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self._set_cors_headers()
            self.end_headers()
            status = {
                "status": "online",
                "env_file_loaded": ENV_LOADED,
                "active_provider": ACTIVE_PROVIDER,
                "provider_name": PROVIDER_NAME,
                "typesafe_key_configured": bool(TYPESAFE_API_KEY),
                "openrouter_key_configured": bool(OPENROUTER_API_KEY),
                "model": DEFAULT_MODEL,
                "service": "NeonHop 3D Jev Gateway"
            }
            self.wfile.write(json.dumps(status).encode("utf-8"))
            return

        # Serve static assets normally
        super().do_GET()

    def do_POST(self):
        if not self._check_origin():
            return
        if self.path == "/api/jev/decision":
            if self.headers.get_content_type() != "application/json":
                self.send_error(415, "JSON required")
                return
            try:
                content_length = int(self.headers.get("Content-Length", 0))
                if not 0 < content_length <= 65536:
                    self.send_error(413, "Invalid payload size")
                    return
                data = json.loads(self.rfile.read(content_length).decode("utf-8"))
                if not isinstance(data, dict) or not isinstance(data.get("model", ""), str):
                    raise ValueError("Expected an object with a string model")
            except (ValueError, UnicodeError):
                self.send_error(400, "Invalid JSON payload")
                return

            # Client Authorization header override
            custom_auth = self.headers.get("Authorization", "").replace("Bearer ", "").strip()

            # Determine routing target based on key priority
            if TYPESAFE_API_KEY or (custom_auth and ACTIVE_PROVIDER == "typesafe"):
                api_key = custom_auth or TYPESAFE_API_KEY
                target_url = "https://api.typesafe.ai/v1/systemone"
                headers = {
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                    "X-Client": "NeonHop-3D"
                }
                model_name = data.get("model", "jev-latest")
                if "typesafe/" in model_name:
                    model_name = "jev-latest"
                forward_payload = {
                    "model": model_name,
                    "state": data.get("state", ""),
                    "questions": data.get("questions", {})
                }
            elif OPENROUTER_API_KEY or custom_auth:
                api_key = custom_auth or OPENROUTER_API_KEY
                target_url = "https://openrouter.ai/api/alpha/decisions"
                headers = {
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://antigravity.google",
                    "X-Title": "NeonHop 3D Jev Client"
                }
                forward_payload = {
                    "model": data.get("model", "typesafe/jev-1.13"),
                    "state": data.get("state", ""),
                    "questions": data.get("questions", {})
                }
            else:
                self.send_response(401)
                self.send_header("Content-Type", "application/json")
                self._set_cors_headers()
                self.end_headers()
                msg = {
                    "error": "No API key configured in workspace .env or request header.",
                    "instructions": "Copy .env-example to .env and configure TYPESAFE_API_KEY (primary) or OPENROUTER_API_KEY (secondary).",
                    "fallback_mode": "local_evaluator"
                }
                self.wfile.write(json.dumps(msg).encode("utf-8"))
                return

            req = urllib.request.Request(
                target_url,
                data=json.dumps(forward_payload).encode("utf-8"),
                headers=headers
            )

            try:
                with urllib.request.urlopen(req, timeout=8.0) as resp:
                    resp_data = resp.read()
                    self.send_response(resp.status)
                    self.send_header("Content-Type", "application/json")
                    self._set_cors_headers()
                    self.end_headers()
                    self.wfile.write(resp_data)
            except urllib.error.HTTPError as e:
                err_data = e.read()
                self.send_response(e.code)
                self.send_header("Content-Type", "application/json")
                self._set_cors_headers()
                self.end_headers()
                self.wfile.write(err_data)
            except Exception as e:
                self.send_response(502)
                self.send_header("Content-Type", "application/json")
                self._set_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({
                    "error": f"Upstream connection to {target_url} failed: {str(e)}",
                    "fallback_mode": "local_evaluator"
                }).encode("utf-8"))
            return

        self.send_response(404)
        self.end_headers()


class LocalServer(http.server.ThreadingHTTPServer):
    allow_reuse_address = True
    daemon_threads = True


def create_server(port=PORT):
    # No wildcard fallback: failure to bind locally must fail closed.
    return LocalServer(("127.0.0.1", port), NeonHopGatewayHandler)


def run():
    httpd = create_server()

    banner_line = "=" * 35
    print(banner_line)
    print(f"🚀 NeonHop 3D Jev Gateway running on:")
    print(f"   - http://localhost:{PORT}")
    print(f"   - http://127.0.0.1:{PORT}")
    print(f"📄 Workspace .env: {'Loaded (' + os.path.join(DIRECTORY, '.env') + ')' if ENV_LOADED else 'Not found (fallback to system environment)'}")
    print("🔑 Key Provider Status:")
    print(f"   - TypeSafe AI Direct (Primary):   {'[CONFIGURED]' if TYPESAFE_API_KEY else '[NOT CONFIGURED]'}")
    print(f"   - OpenRouter.ai (Fallback):      {'[CONFIGURED]' if OPENROUTER_API_KEY else '[NOT CONFIGURED]'}")
    print(f"⚡ Active Decision Mode: {PROVIDER_NAME}")
    print(banner_line)
    sys.stdout.flush()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server.")
    finally:
        if httpd:
            httpd.server_close()


if __name__ == "__main__":
    run()
