#!/usr/bin/env python3
"""
Lightweight Gateway & Static Server for NeonHop 3D Cyber-Arcade & TypeSafe Jev AI Agent.
Serves static assets and provides a proxy endpoint for OpenRouter alpha decisions API.
"""

import http.server
import json
import os
import sys
import urllib.request
import urllib.error
import socket

PORT = int(os.environ.get("PORT", 8000))
DIRECTORY = os.path.dirname(os.path.abspath(__file__))
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY") or os.environ.get("OpenRouter_Jev") or ""

class NeonHopGatewayHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def _set_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")

    def do_OPTIONS(self):
        self.send_response(204)
        self._set_cors_headers()
        self.end_headers()

    def do_GET(self):
        if self.path == "/api/jev/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self._set_cors_headers()
            self.end_headers()
            status = {
                "status": "online",
                "openrouter_key_configured": bool(OPENROUTER_API_KEY),
                "model": "typesafe/jev-1.13",
                "service": "NeonHop 3D Jev Gateway"
            }
            self.wfile.write(json.dumps(status).encode("utf-8"))
            return

        # Serve static assets normally
        super().do_GET()

    def do_POST(self):
        if self.path == "/api/jev/decision":
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length).decode("utf-8")

            try:
                data = json.loads(body)
            except Exception as e:
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self._set_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"error": f"Invalid JSON payload: {str(e)}"}).encode("utf-8"))
                return

            api_key = OPENROUTER_API_KEY or self.headers.get("Authorization", "").replace("Bearer ", "").strip()
            if not api_key:
                self.send_response(401)
                self.send_header("Content-Type", "application/json")
                self._set_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"error": "OPENROUTER_API_KEY not configured on server or request"}).encode("utf-8"))
                return

            # Forward to OpenRouter alpha decisions
            forward_payload = {
                "model": data.get("model", "typesafe/jev-1.13"),
                "state": data.get("state", ""),
                "questions": data.get("questions", {})
            }

            req = urllib.request.Request(
                "https://openrouter.ai/api/alpha/decisions",
                data=json.dumps(forward_payload).encode("utf-8"),
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://antigravity.google",
                    "X-Title": "NeonHop 3D Jev Client"
                }
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
                self.wfile.write(json.dumps({"error": f"Upstream connection failed: {str(e)}"}).encode("utf-8"))
            return

        self.send_response(404)
        self.end_headers()

class DualStackServer(http.server.ThreadingHTTPServer):
    address_family = socket.AF_INET6
    daemon_threads = True

    def server_bind(self):
        try:
            self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        except (AttributeError, OSError):
            pass
        self.allow_reuse_address = True
        super().server_bind()

def run():
    httpd = None
    try:
        httpd = DualStackServer(("", PORT), NeonHopGatewayHandler)
    except Exception as e:
        class FallbackServer(http.server.ThreadingHTTPServer):
            allow_reuse_address = True
            daemon_threads = True
        httpd = FallbackServer(("", PORT), NeonHopGatewayHandler)

    print(f"🚀 NeonHop 3D Jev Gateway running on:")
    print(f"   - http://localhost:{PORT}")
    print(f"   - http://127.0.0.1:{PORT}")
    print(f"🔑 OpenRouter API Key configured: {'YES' if OPENROUTER_API_KEY else 'NO'}")
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
