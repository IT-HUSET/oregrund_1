"""In-memory case store, seeded from data/testcases.json at startup —
unless a persisted snapshot exists (see save_snapshot/_load_snapshot),
in which case that takes precedence so a server restart doesn't lose
autofixes, generated cases, or review decisions from a prior session.

This stands in for the real Janus/P360 case database. A production
integration would replace load_seed_cases() with calls to the P360 API and
add() would write back through it too — nothing else in the pipeline would
need to change, since everything downstream only depends on the Case shape
in models.py.
"""

from __future__ import annotations

import json
import logging
import threading
from pathlib import Path
from typing import Optional

from app.audit import audit_log
from app.config import STATE_PATH
from app.models import Case

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent / "data"
TESTCASES_PATH = DATA_DIR / "testcases.json"


def load_seed_cases() -> list:
    raw = json.loads(TESTCASES_PATH.read_text(encoding="utf-8"))
    return [Case.from_dict(c) for c in raw.get("cases", [])]


class CaseStore:
    """Thread-safe in-memory store keyed by case_id."""

    def __init__(self):
        self._lock = threading.Lock()
        self._cases: dict = {}

    def seed(self, cases: list) -> None:
        with self._lock:
            for c in cases:
                self._cases[c.case_id] = c

    def all(self) -> list:
        with self._lock:
            return list(self._cases.values())

    def get(self, case_id: str) -> Optional[Case]:
        with self._lock:
            return self._cases.get(case_id)

    def add(self, case: Case) -> None:
        with self._lock:
            self._cases[case.case_id] = case

    def next_id(self, prefix: str = "GEN") -> str:
        with self._lock:
            n = sum(1 for cid in self._cases if cid.startswith(prefix))
            return f"{prefix}-{n + 1:03d}"


store = CaseStore()


def save_snapshot() -> None:
    """Writes the current cases + audit log to STATE_PATH. Called by
    server.py after every mutating request (autofix, review, generate) —
    not from inside the pipeline functions themselves, so running the
    accuracy harness (tests/test_engine.py) never writes a snapshot."""
    snapshot = {
        "cases": {c.case_id: c.to_dict() for c in store.all()},
        "audit": audit_log.to_dict(),
    }
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2), encoding="utf-8")


def _load_snapshot() -> bool:
    if not STATE_PATH.exists():
        return False
    try:
        snapshot = json.loads(STATE_PATH.read_text(encoding="utf-8"))
        store.seed([Case.from_dict(c) for c in snapshot.get("cases", {}).values()])
        audit_log.load_dict(snapshot.get("audit", {}))
        return True
    except (json.JSONDecodeError, KeyError, TypeError) as e:
        logger.warning("Could not load state snapshot from %s, falling back to seed data: %s", STATE_PATH, e)
        return False


if not _load_snapshot():
    store.seed(load_seed_cases())


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    for case in store.all():
        logger.info("%s - %s", case.case_id, case.beskrivning)
    logger.info("Loaded %d cases.", len(store.all()))
