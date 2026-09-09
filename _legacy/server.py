#!/usr/bin/env python3
"""Custom HTTP server with session save/load API and file CRUD for Gemma 4 chat."""

import json
import os
import shutil
import datetime
import urllib.request
import urllib.parse
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SESSIONS_DIR = os.path.join(BASE_DIR, "sessions")
PORT = 8080
# Never hardcode secrets — SerpApi flagged the old committed key.
# Set SERPAPI_KEY in the environment (.env.local locally, Render dashboard in prod).
SERPAPI_KEY = os.environ.get("SERPAPI_KEY", "")


class SessionHandler(SimpleHTTPRequestHandler):
    def _send_json(self, data, status=200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_body(self):
        content_length = int(self.headers.get("Content-Length", 0))
        if content_length == 0:
            return None
        return json.loads(self.rfile.read(content_length))

    def _safe_path(self, rel_path):
        """Resolve a relative path safely within BASE_DIR."""
        target = os.path.normpath(os.path.join(BASE_DIR, rel_path))
        if not target.startswith(BASE_DIR):
            return None
        return target

    def _ensure_sessions_dir(self):
        os.makedirs(SESSIONS_DIR, exist_ok=True)

    # ── GET ──────────────────────────────────────────────────────────────
    def do_GET(self):
        parsed = urlparse(self.path)
        qs = parse_qs(parsed.query)

        # Session endpoints
        if parsed.path == "/api/sessions":
            self._ensure_sessions_dir()
            files = [f for f in os.listdir(SESSIONS_DIR) if f.endswith(".json")]
            sessions = []
            for f in files:
                filepath = os.path.join(SESSIONS_DIR, f)
                try:
                    with open(filepath, "r", encoding="utf-8") as fp:
                        data = json.load(fp)
                    title = data.get("title") or "Untitled"
                    timestamp = data.get("timestamp") or os.path.getmtime(filepath)
                    sessions.append({"filename": f, "title": title, "timestamp": timestamp})
                except Exception:
                    sessions.append({"filename": f, "title": f, "timestamp": 0})
            sessions.sort(key=lambda x: x["timestamp"], reverse=True)
            self._send_json({"sessions": sessions})
            return

        if parsed.path.startswith("/api/session/"):
            filename = parsed.path[len("/api/session/"):]
            filepath = os.path.join(SESSIONS_DIR, filename)
            if os.path.isfile(filepath):
                with open(filepath, "r", encoding="utf-8") as f:
                    data = json.load(f)
                self._send_json(data)
            else:
                self._send_json({"error": "Not found"}, status=404)
            return

        # File tree: list directory
        if parsed.path == "/api/files":
            rel = qs.get("path", [""])[0]
            target = self._safe_path(rel)
            if target is None:
                self._send_json({"error": "Invalid path"}, status=400)
                return
            if not os.path.isdir(target):
                self._send_json({"error": "Not a directory"}, status=400)
                return
            entries = []
            for name in sorted(os.listdir(target)):
                full = os.path.join(target, name)
                kind = "directory" if os.path.isdir(full) else "file"
                entries.append({"name": name, "kind": kind})
            self._send_json({"path": rel, "entries": entries})
            return

        # Read file content
        if parsed.path == "/api/file":
            rel = qs.get("path", [""])[0]
            target = self._safe_path(rel)
            if target is None:
                self._send_json({"error": "Invalid path"}, status=400)
                return
            if not os.path.isfile(target):
                self._send_json({"error": "Not a file"}, status=400)
                return
            try:
                with open(target, "r", encoding="utf-8") as f:
                    content = f.read()
                self._send_json({"path": rel, "content": content})
            except UnicodeDecodeError:
                self._send_json({"error": "Binary file not supported"}, status=400)
            return

        # Web search proxy — avoids browser CORS issues and keeps key server-side
        if parsed.path == "/api/search":
            query = qs.get("q", [""])[0].strip()
            if not query:
                self._send_json({"error": "Empty query", "results": []}, status=400)
                return
            try:
                params = urllib.parse.urlencode({
                    "q": query, "api_key": SERPAPI_KEY,
                    "engine": "google", "num": 5, "hl": "en",
                })
                req = urllib.request.Request(
                    f"https://serpapi.com/search.json?{params}",
                    headers={"User-Agent": "Mozilla/5.0"},
                )
                print(f"[search] query: {query}")
                with urllib.request.urlopen(req, timeout=15) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                if "error" in data:
                    print(f"[search] SerpAPI error: {data['error']}")
                    self._send_json({"error": data["error"], "results": []}, status=502)
                    return
                results = []
                # Answer box / knowledge graph first (best for weather, etc.)
                for key in ("answer_box", "knowledge_graph"):
                    box = data.get(key)
                    if isinstance(box, dict) and (box.get("answer") or box.get("description")):
                        results.append({
                            "source": f"Google {key}",
                            "title": box.get("title") or box.get("name") or "Answer",
                            "snippet": box.get("answer") or box.get("description") or "",
                            "url": box.get("link") or "",
                        })
                for item in (data.get("organic_results") or [])[:5]:
                    results.append({
                        "source": "Google",
                        "title": item.get("title") or "Search Result",
                        "snippet": item.get("snippet") or "",
                        "url": item.get("link") or "",
                    })
                print(f"[search] returning {len(results)} results")
                self._send_json({"query": query, "results": results})
            except Exception as e:
                print(f"[search] failed: {e}")
                self._send_json({"error": str(e), "results": []}, status=502)
            return

        # SerpAPI quota — so the UI can show searches left
        if parsed.path == "/api/quota":
            try:
                req = urllib.request.Request(
                    f"https://serpapi.com/account.json?api_key={SERPAPI_KEY}",
                    headers={"User-Agent": "Mozilla/5.0"},
                )
                with urllib.request.urlopen(req, timeout=15) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                # Don't leak the key to the browser
                data.pop("api_key", None)
                self._send_json({
                    "plan_name": data.get("plan_name"),
                    "searches_per_month": data.get("searches_per_month"),
                    "plan_searches_left": data.get("plan_searches_left"),
                    "total_searches_left": data.get("total_searches_left"),
                    "this_month_usage": data.get("this_month_usage"),
                    "plan_renewal_date": data.get("plan_renewal_date"),
                    "account_email": data.get("account_email"),
                    "account_status": data.get("account_status"),
                })
            except Exception as e:
                print(f"[quota] failed: {e}")
                self._send_json({"error": str(e)}, status=502)
            return

        super().do_GET()

    # ── POST ─────────────────────────────────────────────────────────────
    def do_POST(self):
        parsed = urlparse(self.path)

        # Save session
        if parsed.path == "/api/save":
            self._ensure_sessions_dir()
            data = self._read_body()
            if data is None:
                self._send_json({"error": "Empty body"}, status=400)
                return

            timestamp = datetime.datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
            filename = f"session_{timestamp}.json"
            filepath = os.path.join(SESSIONS_DIR, filename)

            if isinstance(data, list):
                payload = {
                    "title": data[0].get("content", "New conversation")[:50] if data else "New conversation",
                    "messages": data,
                    "timestamp": int(datetime.datetime.now().timestamp())
                }
            else:
                payload = {
                    "title": data.get("title", "New conversation"),
                    "messages": data.get("messages", []),
                    "timestamp": data.get("timestamp", int(datetime.datetime.now().timestamp()))
                }

            with open(filepath, "w", encoding="utf-8") as f:
                json.dump(payload, f, indent=2, ensure_ascii=False)

            self._send_json({"success": True, "filename": filename})
            return

        # Create or update file
        if parsed.path == "/api/file":
            data = self._read_body()
            if data is None:
                self._send_json({"error": "Empty body"}, status=400)
                return
            rel = data.get("path", "")
            content = data.get("content", "")
            target = self._safe_path(rel)
            if target is None:
                self._send_json({"error": "Invalid path"}, status=400)
                return
            try:
                os.makedirs(os.path.dirname(target), exist_ok=True)
                with open(target, "w", encoding="utf-8") as f:
                    f.write(content)
                self._send_json({"success": True, "path": rel})
            except Exception as e:
                self._send_json({"error": str(e)}, status=500)
            return

        # Create directory
        if parsed.path == "/api/mkdir":
            data = self._read_body()
            if data is None:
                self._send_json({"error": "Empty body"}, status=400)
                return
            rel = data.get("path", "")
            target = self._safe_path(rel)
            if target is None:
                self._send_json({"error": "Invalid path"}, status=400)
                return
            try:
                os.makedirs(target, exist_ok=True)
                self._send_json({"success": True, "path": rel})
            except Exception as e:
                self._send_json({"error": str(e)}, status=500)
            return

        super().do_POST()

    # ── DELETE ───────────────────────────────────────────────────────────
    def do_DELETE(self):
        parsed = urlparse(self.path)
        qs = parse_qs(parsed.query)

        if parsed.path == "/api/file":
            rel = qs.get("path", [""])[0]
            # Refuse to delete the project root itself
            if not rel or rel.strip() in ("", ".", "/", "\\"):
                self._send_json({"error": "Refusing to delete project root"}, status=400)
                return
            target = self._safe_path(rel)
            if target is None:
                self._send_json({"error": "Invalid path"}, status=400)
                return
            if os.path.normpath(target) == BASE_DIR:
                self._send_json({"error": "Refusing to delete project root"}, status=400)
                return
            if not os.path.exists(target):
                self._send_json({"error": "Not found"}, status=404)
                return
            try:
                if os.path.isdir(target):
                    shutil.rmtree(target)
                else:
                    os.remove(target)
                self._send_json({"success": True, "path": rel})
            except Exception as e:
                self._send_json({"error": str(e)}, status=500)
            return

        self.send_error(404)


def main():
    os.makedirs(SESSIONS_DIR, exist_ok=True)
    server = HTTPServer(("0.0.0.0", PORT), SessionHandler)
    print(f"Server running on http://localhost:{PORT}")
    print(f"Sessions directory: {SESSIONS_DIR}")
    print("Sessions will be auto-saved to the 'sessions' folder.")
    server.serve_forever()


if __name__ == "__main__":
    main()