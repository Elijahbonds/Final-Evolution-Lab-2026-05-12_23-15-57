"""CLI surface. The read commands must work without the stack running, and
the run commands must fail with a useful message rather than a traceback."""

from __future__ import annotations

from pathlib import Path

import pytest

import cli
from ledger import Ledger, LedgerEntry, Status


@pytest.fixture
def seeded(ledger: Ledger, workspace: Path, monkeypatch) -> Ledger:
    proof = workspace / "gate-0.log"
    proof.write_text("42 passed", encoding="utf-8")

    ledger.append(LedgerEntry(role="ops", subject="ops-disk", status=Status.LIVE,
                              note="94GB free"))
    ledger.append(LedgerEntry(role="build", subject="gate-0", status=Status.PASS,
                              evidence="gate-0.log", note="42 passed"))
    ledger.append(LedgerEntry(role="adversarial-qa", subject="gate-1",
                              status=Status.REFUSED, note="crash on resize",
                              blocks=["gate-2"]))
    monkeypatch.setattr(cli, "make_ledger", lambda _args: ledger)
    return ledger


def run(argv: list[str]) -> int:
    return cli.main(argv)


# ------------------------------------------------------------------- roles

def test_roles_lists_every_role_with_tiers(capsys):
    assert run(["roles"]) == 0
    out = capsys.readouterr().out

    assert "12 roles (4 frontier, 8 local)" in out
    for name in ("pm", "adversarial-qa", "build", "ops", "content",
                 "nexus-engine", "cell-engine"):
        assert name in out
    assert "/workspace/content" in out


def test_roles_verbose_prints_tools(capsys):
    assert run(["roles", "-v"]) == 0
    out = capsys.readouterr().out
    assert "write_ledger" in out


# ------------------------------------------------------------------ ledger

def test_ledger_prints_current_state(seeded, capsys):
    assert run(["ledger"]) == 0
    out = capsys.readouterr().out

    assert "3 subjects" in out
    assert "REFUSED" in out and "gate-1" in out
    assert "PASS" in out and "gate-0" in out


def test_ledger_subject_prints_history(seeded, capsys):
    assert run(["ledger", "--subject", "gate-0"]) == 0
    out = capsys.readouterr().out

    assert "gate-0 — 1 entry, oldest first" in out
    assert "gate-0.log" in out  # the evidence path


def test_ledger_unknown_subject_is_non_zero(seeded, capsys):
    assert run(["ledger", "--subject", "gate-99"]) == 1
    assert "No entries" in capsys.readouterr().out


def test_ledger_status_filter(seeded, capsys):
    assert run(["ledger", "--status", "refused"]) == 0
    out = capsys.readouterr().out
    assert "gate-1" in out
    assert "ops-disk" not in out


def test_ledger_on_an_empty_state(ledger, monkeypatch, capsys):
    monkeypatch.setattr(cli, "make_ledger", lambda _args: ledger)
    assert run(["ledger"]) == 0
    assert "Ledger is empty" in capsys.readouterr().out


# ---------------------------------------------------------------- blockers

def test_blockers_exits_non_zero_so_a_script_can_gate_on_it(seeded, capsys):
    assert run(["blockers"]) == 1
    out = capsys.readouterr().out

    assert "1 open blocker" in out
    assert "gate-1" in out
    assert "blocks: gate-2" in out


def test_no_blockers_exits_zero(ledger, monkeypatch, capsys):
    monkeypatch.setattr(cli, "make_ledger", lambda _args: ledger)
    assert run(["blockers"]) == 0
    assert "No open blockers" in capsys.readouterr().out


# --------------------------------------------------------------- preflight

def test_run_fails_with_instructions_when_the_stack_is_unreachable(capsys, monkeypatch):
    """From the host these do not resolve; the message has to say what to do
    instead of printing a connection error.

    The URLs are pinned rather than left to the ambient environment — a shell
    that happens to export SANDBOX_URL would otherwise make this pass or fail
    for reasons that have nothing to do with the code.
    """
    monkeypatch.setenv("SANDBOX_URL", "http://127.0.0.1:9")   # discard port
    monkeypatch.setenv("OLLAMA_URL", "http://127.0.0.1:9")

    with pytest.raises(SystemExit) as exc:
        run(["run", "ops", "report disk usage"])
    assert exc.value.code == 2

    err = capsys.readouterr().err
    assert "docker compose exec agent python cli.py" in err
    assert "'report disk usage'" in err  # quoting survives the suggestion
    assert "SANDBOX_URL" in err


def test_unknown_role_is_reported_cleanly(monkeypatch, capsys):
    monkeypatch.setattr(cli, "preflight", lambda *_a, **_k: None)
    assert run(["run", "nobody", "task"]) == 2
    assert "unknown role" in capsys.readouterr().err


# ------------------------------------------------------------- formatting

def test_status_colour_map_covers_every_status():
    for status in Status:
        assert status in cli.STATUS_COLOUR


def test_age_is_human_readable():
    import time
    now = time.time()
    assert cli._age(now) == "0s"
    assert cli._age(now - 120) == "2m"
    assert cli._age(now - 7200) == "2h"
    assert cli._age(now - 200000) == "2d"


# ---------------------------------------------------------------------- seed

SEED_DIR = Path(__file__).resolve().parent.parent.parent / "seed"


def test_shipped_seed_is_valid_and_every_line_parses():
    import json
    from ledger import LedgerEntry

    lines = [l for l in (SEED_DIR / "ledger.seed.jsonl").read_text().splitlines() if l.strip()]
    assert lines, "the shipped seed is empty"
    for lineno, raw in enumerate(lines, 1):
        LedgerEntry(**json.loads(raw))  # raises on an unknown status or field


def test_every_shipped_seed_artifact_exists_and_is_not_empty():
    """An empty evidence file passes the exists() check but proves nothing."""
    import json

    for raw in (SEED_DIR / "ledger.seed.jsonl").read_text().splitlines():
        if not raw.strip():
            continue
        evidence = json.loads(raw).get("evidence")
        if not evidence:
            continue
        artifact = SEED_DIR / Path(evidence).name if "/" not in evidence else \
            SEED_DIR / "reports" / Path(evidence).name
        assert artifact.exists(), f"{evidence} is cited but not shipped"
        assert artifact.stat().st_size > 0, f"{evidence} is empty"


def test_seed_loads_and_keeps_a_backed_pass(ledger, workspace, monkeypatch, capsys):
    monkeypatch.setattr(cli, "make_ledger", lambda _args: ledger)
    assert run(["--workspace", str(workspace), "seed"]) == 0

    out = capsys.readouterr().out
    assert "PASS" in out
    assert ledger.state()["fel-typecheck"].status is Status.PASS


def test_seed_is_not_trusted_when_its_artifacts_are_missing(
    ledger, workspace, monkeypatch, capsys
):
    """The seed goes through append() like any model entry, so a PASS it
    cannot back is recorded as SOFT_CLEAR rather than taken on faith."""
    monkeypatch.setattr(cli, "make_ledger", lambda _args: ledger)
    assert run(["--workspace", str(workspace), "seed", "--no-artifacts"]) == 0

    assert ledger.state()["fel-typecheck"].status is Status.SOFT_CLEAR
    assert "downgraded" in capsys.readouterr().out


def test_seed_skips_subjects_already_recorded(ledger, workspace, monkeypatch, capsys):
    monkeypatch.setattr(cli, "make_ledger", lambda _args: ledger)
    run(["--workspace", str(workspace), "seed"])
    capsys.readouterr()

    assert run(["--workspace", str(workspace), "seed"]) == 0
    out = capsys.readouterr().out
    assert "already in the ledger" in out
    assert "0 entry(s) written" in out


def test_seed_force_appends_again(ledger, workspace, monkeypatch, capsys):
    monkeypatch.setattr(cli, "make_ledger", lambda _args: ledger)
    run(["--workspace", str(workspace), "seed"])
    capsys.readouterr()

    assert run(["--workspace", str(workspace), "seed", "--force"]) == 0
    assert len(ledger.history("fel-typecheck")) == 2


def test_seed_reports_a_missing_file_cleanly(ledger, monkeypatch, capsys):
    monkeypatch.setattr(cli, "make_ledger", lambda _args: ledger)
    assert run(["seed", "--file", "/nonexistent/seed.jsonl"]) == 2
    assert "No seed file" in capsys.readouterr().err


def test_seed_rejects_a_bad_status_rather_than_recording_it(
    ledger, workspace, tmp_path, monkeypatch, capsys
):
    bad = tmp_path / "bad.jsonl"
    bad.write_text('{"role":"ops","subject":"x","status":"LOOKS_FINE","note":"n"}\n')
    monkeypatch.setattr(cli, "make_ledger", lambda _args: ledger)

    assert run(["--workspace", str(workspace), "seed", "--file", str(bad)]) == 2
    assert ledger.state() == {}
