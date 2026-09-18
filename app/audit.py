"""Append-only per-case audit trail.

Every check run, every auto-fix, every fallback-to-human, and every human
approve/reject is written here. This is the backbone of the "not a black
box" requirement: at any point you can pull a case's full history and see
exactly what happened, when, by whom (AI vs a named/roled human), and why.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass, asdict, field
from datetime import datetime, timezone
from typing import Optional


@dataclass
class AuditEvent:
    case_id: str
    event_type: str  # "check_run" | "autofix_applied" | "autofix_skipped" | "human_approved" | "human_rejected" | "generated"
    actor: str  # "AI" | "Registrator" | "System"
    summary: str
    detail: Optional[dict] = None
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def to_dict(self) -> dict:
        return asdict(self)


class AuditLog:
    def __init__(self):
        self._lock = threading.Lock()
        self._events: dict = {}
        self._acknowledged: dict = {}

    def log(self, case_id: str, event_type: str, actor: str, summary: str, detail: dict = None) -> AuditEvent:
        event = AuditEvent(case_id=case_id, event_type=event_type, actor=actor, summary=summary, detail=detail)
        with self._lock:
            self._events.setdefault(case_id, []).append(event)
        return event

    def for_case(self, case_id: str) -> list:
        with self._lock:
            return list(self._events.get(case_id, []))

    def acknowledge(self, case_id: str, rule_id: str) -> None:
        with self._lock:
            self._acknowledged.setdefault(case_id, set()).add(rule_id)

    def is_acknowledged(self, case_id: str, rule_id: str) -> bool:
        with self._lock:
            return rule_id in self._acknowledged.get(case_id, set())

    def to_dict(self) -> dict:
        """Serializes the full log for persistence (see store.py)."""
        with self._lock:
            return {
                "events": {cid: [e.to_dict() for e in events] for cid, events in self._events.items()},
                "acknowledged": {cid: sorted(rule_ids) for cid, rule_ids in self._acknowledged.items()},
            }

    def load_dict(self, data: dict) -> None:
        """Replaces the current log with a previously persisted snapshot."""
        with self._lock:
            self._events = {
                cid: [AuditEvent(**e) for e in events]
                for cid, events in data.get("events", {}).items()
            }
            self._acknowledged = {
                cid: set(rule_ids) for cid, rule_ids in data.get("acknowledged", {}).items()
            }


audit_log = AuditLog()
