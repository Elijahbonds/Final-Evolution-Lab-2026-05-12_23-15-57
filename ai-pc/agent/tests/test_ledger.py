"""Ledger behaviour. The evidence rule is the reason this module exists, so
it gets the most attention here."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from ledger import NOTE_LIMIT, Ledger, LedgerEntry, Status, record


def entry(**kwargs) -> LedgerEntry:
    base = dict(role="build", subject="gate-0", status=Status.SOFT_CLEAR, note="")
    base.update(kwargs)
    return LedgerEntry(**base)


# ------------------------------------------------------------- evidence rule

def test_pass_without_evidence_downgrades_to_soft_clear(ledger: Ledger):
    written = ledger.append(entry(status=Status.PASS, note="all green"))

    assert written.status is Status.SOFT_CLEAR
    assert "downgraded from PASS" in written.note
    assert "no evidence path given" in written.note
    # The claim is still recorded — we downgrade it, we do not drop it.
    assert "all green" in written.note


def test_pass_with_missing_evidence_path_downgrades(ledger: Ledger):
    written = ledger.append(
        entry(status=Status.PASS, evidence="reports/never-written.log", note="tests pass")
    )

    assert written.status is Status.SOFT_CLEAR
    assert "evidence not found" in written.note


def test_pass_with_real_evidence_stays_pass(ledger: Ledger, workspace: Path):
    proof = workspace / "reports" / "gate-0.log"
    proof.parent.mkdir(parents=True)
    proof.write_text("42 passed", encoding="utf-8")

    written = ledger.append(
        entry(status=Status.PASS, evidence="reports/gate-0.log", note="42 passed")
    )

    assert written.status is Status.PASS
    assert written.note == "42 passed"


def test_pass_with_absolute_evidence_inside_workspace_stays_pass(
    ledger: Ledger, workspace: Path
):
    proof = workspace / "shot.png"
    proof.write_bytes(b"\x89PNG")

    written = ledger.append(entry(status=Status.PASS, evidence=str(proof)))

    assert written.status is Status.PASS


def test_evidence_outside_workspace_downgrades(ledger: Ledger, tmp_path: Path):
    outside = tmp_path / "elsewhere.log"
    outside.write_text("real file, wrong place", encoding="utf-8")

    written = ledger.append(entry(status=Status.PASS, evidence=str(outside)))

    assert written.status is Status.SOFT_CLEAR
    assert "outside workspace" in written.note


def test_traversal_evidence_downgrades(ledger: Ledger, tmp_path: Path):
    (tmp_path / "secret.txt").write_text("nope", encoding="utf-8")

    written = ledger.append(entry(status=Status.PASS, evidence="../secret.txt"))

    assert written.status is Status.SOFT_CLEAR
    assert "outside workspace" in written.note


def test_non_pass_statuses_are_not_evidence_checked(ledger: Ledger):
    for status in (Status.SOFT_CLEAR, Status.BLOCKED, Status.REFUSED,
                   Status.LIVE, Status.PARKED):
        written = ledger.append(entry(status=status, evidence="does/not/exist.txt"))
        assert written.status is status


def test_downgrade_reason_survives_a_long_note(ledger: Ledger):
    written = ledger.append(entry(status=Status.PASS, note="x" * 400))

    assert written.status is Status.SOFT_CLEAR
    assert len(written.note) <= NOTE_LIMIT
    # The reason is what a reader needs; the model's prose is what gets cut.
    assert written.note.startswith("[downgraded from PASS:")


# ------------------------------------------------------------------ validation

def test_unknown_status_string_is_rejected():
    with pytest.raises(ValidationError):
        LedgerEntry(role="build", subject="gate-0", status="MOSTLY_FINE")


def test_lowercase_status_is_rejected():
    with pytest.raises(ValidationError):
        LedgerEntry(role="build", subject="gate-0", status="pass")


def test_unknown_field_is_rejected():
    with pytest.raises(ValidationError):
        LedgerEntry(role="build", subject="gate-0", status="PASS", confidence=0.9)


def test_empty_subject_is_rejected():
    with pytest.raises(ValidationError):
        LedgerEntry(role="build", subject="", status="PASS")


def test_note_is_capped(ledger: Ledger):
    written = ledger.append(entry(note="y" * 1000))
    assert len(written.note) <= NOTE_LIMIT


def test_timestamp_is_set_by_the_ledger_not_the_caller(ledger: Ledger):
    written = ledger.append(entry(ts=1.0))
    assert written.ts > 1_600_000_000


# --------------------------------------------------------------- append-only

def test_append_only_never_rewrites_a_line(ledger: Ledger):
    ledger.append(entry(subject="gate-0", status=Status.REFUSED, note="QA says no"))
    ledger.append(entry(subject="gate-0", status=Status.SOFT_CLEAR, note="fixed"))

    lines = ledger.path.read_text(encoding="utf-8").strip().split("\n")
    assert len(lines) == 2
    # The refusal is still in the record after the fix.
    assert json.loads(lines[0])["status"] == "REFUSED"
    assert json.loads(lines[1])["status"] == "SOFT_CLEAR"


def test_state_returns_latest_per_subject(ledger: Ledger):
    ledger.append(entry(subject="gate-0", status=Status.BLOCKED))
    ledger.append(entry(subject="gate-1", status=Status.LIVE))
    ledger.append(entry(subject="gate-0", status=Status.SOFT_CLEAR))

    state = ledger.state()
    assert set(state) == {"gate-0", "gate-1"}
    assert state["gate-0"].status is Status.SOFT_CLEAR


def test_resolved_subject_stops_being_a_blocker(ledger: Ledger):
    ledger.append(entry(subject="gate-0", status=Status.REFUSED))
    assert [e.subject for e in ledger.open_blockers()] == ["gate-0"]

    ledger.append(entry(subject="gate-0", status=Status.SOFT_CLEAR))
    assert ledger.open_blockers() == []


def test_history_is_oldest_first_and_limited(ledger: Ledger):
    for i in range(10):
        ledger.append(entry(subject="gate-0", note=f"step {i}"))
    ledger.append(entry(subject="other", note="unrelated"))

    rows = ledger.history("gate-0", limit=3)
    assert [r.note for r in rows] == ["step 7", "step 8", "step 9"]


def test_bad_line_is_skipped_not_fatal(ledger: Ledger):
    ledger.append(entry(subject="gate-0"))
    with ledger.path.open("a", encoding="utf-8") as fh:
        fh.write("{ not json at all\n")
        fh.write('{"role":"x","subject":"y","status":"NOPE"}\n')
    ledger.append(entry(subject="gate-1"))

    assert set(ledger.state()) == {"gate-0", "gate-1"}


def test_reads_on_a_missing_file_are_empty(tmp_path: Path):
    fresh = Ledger(path=tmp_path / "nothing" / "ledger.jsonl", evidence_root=tmp_path)
    assert fresh.state() == {}
    assert fresh.open_blockers() == []
    assert fresh.history("gate-0") == []


# ---------------------------------------------------------------------- brief

def test_brief_respects_its_char_cap(ledger: Ledger):
    for i in range(200):
        ledger.append(entry(subject=f"gate-{i}", note="n" * 200))

    text = ledger.brief("pm", max_chars=1500)
    assert len(text) <= 1500
    assert "more subject(s) not shown" in text


def test_brief_always_includes_open_blockers(ledger: Ledger):
    for i in range(200):
        ledger.append(entry(subject=f"mode-{i}", note="filler " * 20))
    ledger.append(entry(subject="gate-7", status=Status.REFUSED,
                        note="QA reproduced the crash", blocks=["gate-8"]))

    text = ledger.brief("pm", max_chars=800)
    assert "gate-7" in text
    assert "REFUSED" in text
    assert "blocks: gate-8" in text


def test_brief_includes_every_blocker_even_when_over_cap(ledger: Ledger):
    for i in range(30):
        ledger.append(entry(subject=f"gate-{i}", status=Status.BLOCKED,
                            note="waiting on the asset pipeline"))

    text = ledger.brief("pm", max_chars=500)
    for i in range(30):
        assert f"gate-{i}" in text


def test_brief_filters_by_subject_globs(ledger: Ledger):
    ledger.append(entry(subject="gate-0", status=Status.LIVE))
    ledger.append(entry(subject="mode-kart", status=Status.LIVE))
    ledger.append(entry(subject="copy/launch-post", status=Status.LIVE))

    text = ledger.brief("adversarial-qa", subjects=["gate-*", "mode-*"])
    assert "gate-0" in text
    assert "mode-kart" in text
    assert "copy/launch-post" not in text


def test_brief_on_an_empty_ledger_says_so(ledger: Ledger):
    assert "You are first" in ledger.brief("build")


# ----------------------------------------------------------------- record()

def test_record_helper_appends_and_validates(ledger: Ledger):
    written = record("ops", "disk", "LIVE", note="94GB free", ledger=ledger)
    assert written.status is Status.LIVE
    assert ledger.state()["disk"].note == "94GB free"


def test_record_helper_rejects_an_unknown_status(ledger: Ledger):
    with pytest.raises(ValueError):
        record("ops", "disk", "FINE_PROBABLY", ledger=ledger)
