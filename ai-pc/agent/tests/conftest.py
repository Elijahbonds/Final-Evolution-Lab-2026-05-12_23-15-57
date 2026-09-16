"""Shared fixtures. Puts the agent package on the path so tests can import
the modules the way the running container does."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

AGENT_DIR = Path(__file__).resolve().parent.parent
if str(AGENT_DIR) not in sys.path:
    sys.path.insert(0, str(AGENT_DIR))


@pytest.fixture
def workspace(tmp_path: Path) -> Path:
    """A throwaway workspace that evidence paths resolve against."""
    root = tmp_path / "workspace"
    root.mkdir()
    return root


@pytest.fixture
def ledger(tmp_path: Path, workspace: Path):
    from ledger import Ledger

    return Ledger(path=tmp_path / "state" / "ledger.jsonl", evidence_root=workspace)
