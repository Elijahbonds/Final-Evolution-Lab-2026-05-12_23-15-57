"""HTTP surface: auth, role listing, ledger reads, and role validation."""

from __future__ import annotations

import importlib
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

TOKEN = "test-token"


@pytest.fixture
def client(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("AGENT_TOKEN", TOKEN)
    monkeypatch.setenv("STATE_DIR", str(tmp_path / "state"))
    monkeypatch.setenv("WORKSPACE_ROOT", str(tmp_path / "workspace"))
    (tmp_path / "workspace").mkdir()

    import server
    importlib.reload(server)
    return TestClient(server.app), server


def headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {TOKEN}"}


def test_health_is_open_and_reports_the_tiers(client):
    http, _ = client
    body = http.get("/health").json()

    assert body["ok"] is True
    assert body["roles"] == 10
    assert "local_model" in body and "frontier_model" in body


def test_api_requires_a_token(client):
    http, _ = client
    assert http.get("/api/roles").status_code == 401
    assert http.get("/api/ledger").status_code == 401


def test_a_wrong_token_is_rejected(client):
    http, _ = client
    assert http.get("/api/roles", headers={"Authorization": "Bearer nope"}).status_code == 401


def test_roles_endpoint_lists_every_role(client):
    http, _ = client
    roles = http.get("/api/roles", headers=headers()).json()["roles"]

    assert len(roles) == 10
    qa = [r for r in roles if r["name"] == "adversarial-qa"][0]
    assert qa["tier"] == "frontier"
    assert "write_file" not in qa["tools"]


def test_ledger_endpoint_returns_state_and_blockers(client):
    http, server = client
    from ledger import LedgerEntry, Status
    server.ledger.append(LedgerEntry(role="ops", subject="ops-disk", status=Status.LIVE))
    server.ledger.append(LedgerEntry(role="build", subject="gate-0", status=Status.BLOCKED,
                                     note="missing SDK"))

    body = http.get("/api/ledger", headers=headers()).json()
    assert {e["subject"] for e in body["entries"]} == {"ops-disk", "gate-0"}
    assert [e["subject"] for e in body["blockers"]] == ["gate-0"]


def test_ledger_endpoint_returns_history_for_a_subject(client):
    http, server = client
    from ledger import LedgerEntry, Status
    for note in ("first", "second"):
        server.ledger.append(LedgerEntry(role="build", subject="gate-0",
                                         status=Status.SOFT_CLEAR, note=note))

    body = http.get("/api/ledger?subject=gate-0", headers=headers()).json()
    assert [e["note"] for e in body["entries"]] == ["first", "second"]


def test_run_rejects_an_unknown_role_before_starting(client):
    http, _ = client
    resp = http.post("/api/run", json={"task": "t", "role": "growth-hacker"},
                     headers=headers())

    assert resp.status_code == 400
    assert "unknown role" in resp.json()["detail"]


def test_console_is_served(client):
    http, _ = client
    body = http.get("/").text
    assert "AI Personal Computer" in body
    assert 'id="role"' in body  # the role selector
