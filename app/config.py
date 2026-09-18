"""Loads .env (gitignored) into the process environment at import time.

No python-dotenv dependency — this is a two-line parser, not worth a
package. .env is never committed (see .gitignore); ANTHROPIC_API_KEY set
in the real environment always takes precedence over .env.
"""

from __future__ import annotations

import os
from pathlib import Path

ENV_PATH = Path(__file__).parent.parent / ".env"


def _load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key, value = key.strip(), value.strip()
        if key and key not in os.environ:
            os.environ[key] = value


_load_dotenv(ENV_PATH)

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
JUDGMENT_MODEL = os.environ.get("JUDGMENT_MODEL", "claude-sonnet-5")
LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")

DATA_DIR = Path(__file__).parent / "data"
STATE_PATH = DATA_DIR / "state.json"
