"""The read_ledger / write_ledger tools as the model experiences them."""

from __future__ import annotations

from pathlib import Path

from agent import Agent, AgentConfig
from ledger import Ledger, Status
from tools import ALWAYS_AVAILABLE, TOOL_NAMES, schemas_for


def make_agent(ledger: Ledger) -> Agent:
    return Agent(AgentConfig(workspace=str(ledger.evidence_root)), ledger=ledger)


def test_ledger_tools_are_in_the_catalogue():
    assert {"read_ledger", "write_ledger"} <= TOOL_NAMES


def test_ledger_tools_cannot_be_dropped_by_a_role():
    names = [s["function"]["name"] for s in schemas_for(["read_file"])]
    assert ALWAYS_AVAILABLE <= set(names)


def test_write_ledger_appends(ledger: Ledger):
    agent = make_agent(ledger)
    text, event = agent._ledger_tool(
        "write_ledger",
        {"subject": "gate-0", "status": "LIVE", "note": "server up"},
        role="ops", run_id="r1",
    )

    assert "Recorded" in text
    assert event is not None and event.kind == "ledger"
    assert ledger.state()["gate-0"].status is Status.LIVE
    agent.close()


def test_write_ledger_tells_the_model_it_was_downgraded(ledger: Ledger):
    agent = make_agent(ledger)
    text, event = agent._ledger_tool(
        "write_ledger",
        {"subject": "gate-0", "status": "PASS", "note": "done", "evidence": "nope.log"},
        role="build", run_id="r1",
    )

    # The model has to learn that its claim did not stick, or it will report
    # success upstream that the record does not support.
    assert "DOWNGRADED" in text
    assert event is not None and event.data["downgraded"] is True
    assert ledger.state()["gate-0"].status is Status.SOFT_CLEAR
    agent.close()


def test_write_ledger_rejects_a_bad_status_without_crashing(ledger: Ledger):
    agent = make_agent(ledger)
    text, event = agent._ledger_tool(
        "write_ledger",
        {"subject": "gate-0", "status": "LOOKS_GOOD", "note": "n"},
        role="build", run_id="r1",
    )

    assert "REJECTED" in text
    assert event is None
    assert ledger.state() == {}
    agent.close()


def test_read_ledger_with_no_subject_returns_the_brief(ledger: Ledger):
    agent = make_agent(ledger)
    agent._ledger_tool("write_ledger",
                       {"subject": "gate-0", "status": "BLOCKED", "note": "no assets"},
                       role="build", run_id="r1")

    text, _ = agent._ledger_tool("read_ledger", {}, role="pm", run_id="r2")
    assert "LEDGER BRIEF for pm" in text
    assert "OPEN BLOCKERS" in text
    assert "gate-0" in text
    agent.close()


def test_read_ledger_with_a_subject_returns_history(ledger: Ledger):
    agent = make_agent(ledger)
    for note in ("first", "second"):
        agent._ledger_tool("write_ledger",
                           {"subject": "gate-0", "status": "SOFT_CLEAR", "note": note},
                           role="build", run_id="r1")

    text, _ = agent._ledger_tool("read_ledger", {"subject": "gate-0"}, role="pm", run_id="r2")
    assert "History for gate-0 (2 entries" in text
    assert text.index("first") < text.index("second")
    agent.close()


def test_read_ledger_on_an_unknown_subject_is_graceful(ledger: Ledger):
    agent = make_agent(ledger)
    text, _ = agent._ledger_tool("read_ledger", {"subject": "gate-99"}, role="pm", run_id="r")
    assert "No ledger entries" in text
    agent.close()
