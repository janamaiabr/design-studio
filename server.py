#!/usr/bin/env python3
"""Design Studio server with API proxy to bypass CORS."""
import http.server
import json
import os
import urllib.request

PORT = 3847
GATEWAY = "http://localhost:18789"

class Handler(http.server.SimpleHTTPRequestHandler):
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
            import base64, time
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            data = json.loads(body)
            
            # Save screenshot PNG
            img_data = data.get("image", "")
            if img_data.startswith("data:"):
                img_data = img_data.split(",", 1)[1]
            
            ts = time.strftime("%Y-%m-%d_%H-%M-%S")
            uploads_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads")
            os.makedirs(uploads_dir, exist_ok=True)
            filepath = os.path.join(uploads_dir, f"screenshot-{ts}.png")
            
            with open(filepath, "wb") as f:
                f.write(base64.b64decode(img_data))
            
            # Also save annotations JSON
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
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-GW-Token")
        self.send_header("Access-Control-Max-Age", "86400")
        self.end_headers()

    def log_message(self, format, *args):
        if '/api/' in (args[0] if args else ''):
            http.server.SimpleHTTPRequestHandler.log_message(self, format, *args)

    def log_message(self, format, *args):
        pass  # silent

os.chdir(os.path.dirname(os.path.abspath(__file__)))
print(f"Design Studio running at http://localhost:{PORT}")
http.server.HTTPServer(("", PORT), Handler).serve_forever()
