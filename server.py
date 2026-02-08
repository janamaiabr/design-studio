#!/usr/bin/env python3
"""Design Studio server with iframe proxy to bypass X-Frame-Options."""
import http.server
import json
import os
import urllib.request
import urllib.parse
import ssl
import base64
import time

PORT = 3847
GATEWAY = "http://localhost:18789"

# SSL context that doesn't verify (for proxying external sites)
ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE


class Handler(http.server.SimpleHTTPRequestHandler):

    def do_GET(self):
        # Proxy endpoint: /proxy?url=https://example.com
        if self.path.startswith("/proxy?"):
            self._handle_proxy()
            return
        # Serve static files normally
        super().do_GET()

    def _handle_proxy(self):
        """Fetch external URL and serve it stripped of frame-blocking headers."""
        qs = urllib.parse.urlparse(self.path).query
        params = urllib.parse.parse_qs(qs)
        target_url = params.get("url", [None])[0]

        if not target_url:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b"Missing ?url= parameter")
            return

        try:
            req = urllib.request.Request(target_url, headers={
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
            })
            with urllib.request.urlopen(req, timeout=15, context=ssl_ctx) as resp:
                body = resp.read()
                content_type = resp.headers.get("Content-Type", "text/html")

                # For HTML responses, inject <base> so relative URLs resolve to origin
                if "text/html" in content_type:
                    import re
                    parsed = urllib.parse.urlparse(target_url)
                    base_url = f"{parsed.scheme}://{parsed.netloc}"

                    body_str = body.decode("utf-8", errors="replace")
                    
                    # Remove any existing <base> tags
                    body_str = re.sub(r'<base[^>]*>', '', body_str, flags=re.IGNORECASE)
                    
                    # Inject single <base> tag after <head>
                    base_tag = f'<base href="{base_url}/">'
                    body_str = re.sub(
                        r'(<head[^>]*>)',
                        rf'\1{base_tag}',
                        body_str,
                        count=1,
                        flags=re.IGNORECASE
                    )

                    body = body_str.encode("utf-8")

                self.send_response(200)
                self.send_header("Content-Type", content_type)
                self.send_header("Access-Control-Allow-Origin", "*")
                # Explicitly REMOVE frame-blocking headers
                self.send_header("X-Frame-Options", "ALLOWALL")
                self.send_header("Content-Security-Policy", "")
                self.end_headers()
                self.wfile.write(body)

        except Exception as e:
            self.send_response(502)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(f"Proxy error: {e}".encode())

    def do_POST(self):
        if self.path == "/api/chat":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            token = self.headers.get("X-GW-Token", "")

            req = urllib.request.Request(
                f"{GATEWAY}/v1/chat/completions",
                data=body,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {token}",
                },
                method="POST",
            )
            try:
                with urllib.request.urlopen(req, timeout=300) as resp:
                    data = resp.read()
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.end_headers()
                    self.wfile.write(data)
            except Exception as e:
                self.send_response(502)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode())

        elif self.path == "/api/screenshot":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            data = json.loads(body)

            img_data = data.get("image", "")
            if img_data.startswith("data:"):
                img_data = img_data.split(",", 1)[1]

            ts = time.strftime("%Y-%m-%d_%H-%M-%S")
            uploads_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads")
            os.makedirs(uploads_dir, exist_ok=True)
            filepath = os.path.join(uploads_dir, f"screenshot-{ts}.png")

            with open(filepath, "wb") as f:
                f.write(base64.b64decode(img_data))

            ann_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "submissions", f"annotations-{ts}.json")
            os.makedirs(os.path.dirname(ann_path), exist_ok=True)
            with open(ann_path, "w") as f:
                json.dump(data.get("annotations", {}), f, indent=2)

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": True, "screenshot": filepath, "annotations": ann_path}).encode())

        else:
            self.send_response(404)
            self.end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-GW-Token")
        self.send_header("Access-Control-Max-Age", "86400")
        self.end_headers()

    def log_message(self, format, *args):
        pass  # silent


os.chdir(os.path.dirname(os.path.abspath(__file__)))
print(f"Design Studio running at http://localhost:{PORT}")
http.server.HTTPServer(("", PORT), Handler).serve_forever()
