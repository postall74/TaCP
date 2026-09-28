"""Deterministic HTTP fixture for SEC-003 browser race checks."""

import json
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class Handler(BaseHTTPRequestHandler):
    def _reply(self, status: int, body: dict[str, object]) -> None:
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()

    def do_GET(self) -> None:
        if self.path == "/api/health":
            self._reply(200, {"status": "ok"})
        else:
            self._reply(404, {"errors": ["SEC-003 fixture: unknown endpoint"]})

    def do_POST(self) -> None:
        length = int(self.headers.get("Content-Length", "0"))
        body = json.loads(self.rfile.read(length) or b"{}")
        if self.path != "/api/auth/login":
            self._reply(404, {"errors": ["SEC-003 fixture: unknown endpoint"]})
            return
        email = str(body.get("email", ""))
        if email.startswith("late-"):
            time.sleep(1.5)
            self._reply(503, {"errors": ["LATE_OLD_REMOTE_ERROR"]})
        else:
            self._reply(401, {"errors": ["FRESH_CURRENT_REMOTE_ERROR"]})

    def log_message(self, fmt: str, *args: object) -> None:
        print(fmt % args, flush=True)


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 5199), Handler).serve_forever()
