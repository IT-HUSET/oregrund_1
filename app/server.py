"""Stdlib-only HTTP server: JSON API + static file serving.

No Flask/FastAPI dependency (none is installed, and this machine's Node is
too old for any modern frontend tooling anyway) — just http.server and a
small hand-rolled router. Frontend is plain HTML/CSS/vanilla JS calling
this API via fetch(), no build step.

Routes are registered with @route(method, pattern) below instead of a
growing if/re.match chain, and dispatched through one place
(Handler._dispatch) that centralizes error handling: a route handler can
just raise ValueError/KeyError/json.JSONDecodeError and get a clean 400
back, instead of every handler needing to remember to validate its input.
"""

from __future__ import annotations

import json
import logging
import re
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from app.audit import audit_log
from app.autofix import apply_autofixes, propose_fixes, record_human_decision
from app.generate import generate_case
from app.models import Arende
from app.rules.engine import run as run_engine
from app.store import save_snapshot, store

logger = logging.getLogger(__name__)

STATIC_DIR = Path(__file__).parent / "static"

STATIC_FILES = {
    "/": ("index.html", "text/html; charset=utf-8"),
    "/index.html": ("index.html", "text/html; charset=utf-8"),
    "/case.html": ("case.html", "text/html; charset=utf-8"),
    "/app.js": ("app.js", "application/javascript; charset=utf-8"),
    "/style.css": ("style.css", "text/css; charset=utf-8"),
}

ROUTES = []  # [(method, compiled_pattern, handler_fn), ...], filled by @route


def route(method: str, pattern: str):
    compiled = re.compile(pattern)

    def decorator(fn):
        ROUTES.append((method, compiled, fn))
        return fn

    return decorator


def _case_summary(case) -> dict:
    report = run_engine(case)
    return {
        "case_id": case.case_id,
        "beskrivning": case.beskrivning,
        "source": case.source,
        "arende_titel": case.arende.titel,
        "diarienummer": case.arende.diarienummer,
        "dokument_titel": case.arendedokument.titel,
        "status": report.status,
        "finding_count": len(report.findings),
    }


def _case_detail(case) -> dict:
    report = run_engine(case)
    results = []
    for r in report.results:
        d = r.to_dict()
        d["acknowledged"] = audit_log.is_acknowledged(case.case_id, r.rule_id)
        results.append(d)

    fixes = propose_fixes(case, report)

    return {
        "case": case.to_dict(),
        "report": {"case_id": report.case_id, "status": report.status, "results": results},
        "proposed_fixes": [f.to_dict() for f in fixes],
        "audit": [e.to_dict() for e in audit_log.for_case(case.case_id)],
    }


def _get_case_or_404(h: "Handler", case_id: str):
    case = store.get(case_id)
    if case is None:
        h._send_json(404, {"error": "case not found"})
        return None
    return case


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@route("GET", r"^/api/cases$")
def _list_cases(h: "Handler", m) -> None:
    cases = sorted(store.all(), key=lambda c: c.case_id)
    # Each summary may trigger a live LLM call (uncached judgment rules);
    # run them concurrently or a 20-case queue takes minutes to load
    # instead of seconds. Once cached (see judgment.evaluate_case), later
    # loads are fast either way.
    with ThreadPoolExecutor(max_workers=10) as pool:
        summaries = list(pool.map(_case_summary, cases))
    h._send_json(200, summaries)


@route("GET", r"^/api/cases/([^/]+)$")
def _get_case(h: "Handler", m) -> None:
    case = _get_case_or_404(h, m.group(1))
    if case is not None:
        h._send_json(200, _case_detail(case))


@route("POST", r"^/api/cases/generate$")
def _post_generate(h: "Handler", m) -> None:
    body = h._read_json_body()
    arende = Arende.from_dict(body.get("arende", {}))
    dokumenttext = body.get("dokumenttext", "")
    case_id = store.next_id("GEN")
    new_case, report, fixes = generate_case(case_id, arende, dokumenttext)
    store.add(new_case)
    save_snapshot()
    h._send_json(200, _case_detail(new_case))


@route("POST", r"^/api/cases/([^/]+)/autofix$")
def _post_autofix(h: "Handler", m) -> None:
    case = _get_case_or_404(h, m.group(1))
    if case is None:
        return
    report = run_engine(case)
    new_case, fixes = apply_autofixes(case, report)
    store.add(new_case)
    save_snapshot()
    h._send_json(200, _case_detail(new_case))


@route("POST", r"^/api/cases/([^/]+)/review$")
def _post_review(h: "Handler", m) -> None:
    case = _get_case_or_404(h, m.group(1))
    if case is None:
        return
    body = h._read_json_body()
    rule_id = body.get("rule_id")
    action = body.get("action", "approve")
    if not rule_id:
        raise ValueError("rule_id is required")
    record_human_decision(case.case_id, rule_id, action, detail=body)
    audit_log.acknowledge(case.case_id, rule_id)
    save_snapshot()
    h._send_json(200, _case_detail(case))


# ---------------------------------------------------------------------------
# HTTP plumbing
# ---------------------------------------------------------------------------

class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        pass  # keep console clean; errors still surface via 4xx/5xx bodies

    def _send_json(self, status: int, payload) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_static(self, filename: str, content_type: str) -> None:
        path = STATIC_DIR / filename
        if not path.exists():
            self._send_json(404, {"error": f"static file not found: {filename}"})
            return
        body = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json_body(self) -> dict:
        length = int(self.headers.get("Content-Length", 0))
        if not length:
            return {}
        raw = self.rfile.read(length)
        return json.loads(raw.decode("utf-8")) if raw else {}

    def _dispatch(self, method: str) -> None:
        path = urlparse(self.path).path

        if method == "GET" and path in STATIC_FILES:
            filename, content_type = STATIC_FILES[path]
            self._send_static(filename, content_type)
            return

        for route_method, pattern, handler_fn in ROUTES:
            if route_method != method:
                continue
            match = pattern.match(path)
            if not match:
                continue
            try:
                handler_fn(self, match)
            except json.JSONDecodeError as e:
                self._send_json(400, {"error": f"Invalid JSON body: {e}"})
            except (KeyError, ValueError) as e:
                self._send_json(400, {"error": str(e)})
            except Exception:
                logger.exception("Unhandled error in %s %s", method, path)
                self._send_json(500, {"error": "internal server error"})
            return

        self._send_json(404, {"error": "not found"})

    def do_GET(self):
        self._dispatch("GET")

    def do_POST(self):
        self._dispatch("POST")


def main(port: int = 8000):
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    logger.info("AI-kvalitetskontroll running at http://127.0.0.1:%d", port)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
