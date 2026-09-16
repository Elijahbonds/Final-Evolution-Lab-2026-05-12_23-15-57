"""Mission orchestration.

The three constraints in this module are code, not prompt text, so these are
the tests that prove a misbehaving PM cannot get around them.
"""

from __future__ import annotations

import json
from typing import Any

from agent import Agent, AgentConfig
from ledger import Ledger, Status
from orchestrator import Orchestrator
from registry import Registry


class ScriptedProvider:
    """Replays a queue of turns, keyed by which role is asking."""

    def __init__(self, name: str, script: dict[str, list[dict[str, Any]]]):
        self.name = name
        self.script = {k: list(v) for k, v in script.items()}
        self.calls: list[str] = []

    def chat(self, messages, tools, model):
        role = _role_of(messages[0]["content"])
        self.calls.append(role)
        queue = self.script.get(role) or []
        if queue:
            return queue.pop(0)
        return call("finish", status="PARKED", subject=f"{role}/auto", summary="no script")

    def close(self):
        pass


def _role_of(system: str) -> str:
    for line in system.splitlines():
        if line.startswith("YOUR ROLE: "):
            return line[len("YOUR ROLE: "):].split(" —")[0].strip()
    return "?"


class OnePool:
    """Same scripted provider for both tiers — the tiering is tested elsewhere."""

    def __init__(self, provider):
        self.provider = provider

    def for_tier(self, _tier):
        return self.provider, "test-model"

    def close(self):
        pass


def call(name: str, **args) -> dict[str, Any]:
    return {"content": "", "tool_calls": [{
        "id": "c1", "type": "function",
        "function": {"name": name, "arguments": json.dumps(args)},
    }]}


def build(ledger: Ledger, script: dict[str, list[dict[str, Any]]]) -> Orchestrator:
    provider = ScriptedProvider("scripted", script)
    agent = Agent(
        AgentConfig(workspace=str(ledger.evidence_root), max_steps=10),
        ledger=ledger, registry=Registry.load(), providers=OnePool(provider),
    )
    orchestrator = Orchestrator(agent=agent)
    orchestrator._provider = provider  # for assertions
    return orchestrator


def final(events) -> Any:
    return [e for e in events if e.kind == "mission" and e.data.get("phase") == "end"][0].data


# --------------------------------------------------------------- happy path

def test_mission_runs_a_round_then_finishes(ledger: Ledger):
    orchestrator = build(ledger, {
        "pm": [call("dispatch", role="ops", task="report disk"),
               call("finish", status="PASS", subject="mission", summary="objective met")],
        "ops": [call("finish", status="LIVE", subject="ops-disk", note="94GB free",
                     summary="checked")],
    })

    events = list(orchestrator.run_mission("check the stack", max_rounds=5))
    end = final(events)

    assert end["outcome"] == "done"
    assert end["rounds"] == 1
    assert ledger.state()["ops-disk"].status is Status.LIVE
    orchestrator.close()


def test_roles_run_one_at_a_time_in_dispatch_order(ledger: Ledger):
    orchestrator = build(ledger, {
        "pm": [call("dispatch", role="ops", task="a"),
               call("dispatch", role="build", task="b"),
               call("finish", status="PASS", subject="mission", summary="done")],
        "ops": [call("finish", status="LIVE", subject="s1", summary="x")],
        "build": [call("finish", status="SOFT_CLEAR", subject="s2", summary="x")],
    })

    list(orchestrator.run_mission("two things", max_rounds=5))

    assert orchestrator._provider.calls == ["pm", "ops", "pm", "build", "pm"]
    orchestrator.close()


def test_the_role_reads_the_ledger_rather_than_being_told(ledger: Ledger):
    """The PM relays nothing. What the next role knows, it knows from the
    brief in its own system prompt."""
    orchestrator = build(ledger, {
        "pm": [call("dispatch", role="build", task="fix gate-0"),
               call("finish", status="PASS", subject="m", summary="done")],
        "build": [call("finish", status="SOFT_CLEAR", subject="gate-0", summary="x")],
    })
    from ledger import LedgerEntry
    ledger.append(LedgerEntry(role="adversarial-qa", subject="gate-0",
                              status=Status.REFUSED, note="crash on resize"))

    captured: list[str] = []
    original = orchestrator.agent._system_prompt
    orchestrator.agent._system_prompt = lambda spec, schemas: (
        captured.append(original(spec, schemas)) or captured[-1])

    list(orchestrator.run_mission("fix it", max_rounds=3))

    build_prompt = [c for c in captured if "YOUR ROLE: build" in c][0]
    assert "crash on resize" in build_prompt
    orchestrator.close()


# ------------------------------------------------- constraint: no self-dispatch

def test_pm_cannot_dispatch_itself(ledger: Ledger):
    orchestrator = build(ledger, {
        "pm": [call("dispatch", role="pm", task="think harder"),
               call("finish", status="PASS", subject="m", summary="fine")],
    })

    events = list(orchestrator.run_mission("o", max_rounds=4))
    rejections = [e for e in events if e.kind == "mission"
                  and e.data.get("phase") == "rejected"]

    assert len(rejections) == 1
    assert "cannot dispatch itself" in rejections[0].data["reason"]
    # The PM never ran twice in one round; the rejection just costs a round.
    assert orchestrator._provider.calls == ["pm", "pm"]
    orchestrator.close()


def test_a_rejected_dispatch_is_recorded_so_the_pm_sees_it(ledger: Ledger):
    orchestrator = build(ledger, {
        "pm": [call("dispatch", role="pm", task="x"),
               call("finish", status="PASS", subject="m", summary="fine")],
    })
    list(orchestrator.run_mission("o", max_rounds=4))

    entry = ledger.state()["mission/dispatch"]
    assert entry.status is Status.BLOCKED
    assert "cannot dispatch itself" in entry.note
    orchestrator.close()


def test_unknown_role_dispatch_is_rejected(ledger: Ledger):
    orchestrator = build(ledger, {
        "pm": [call("dispatch", role="growth-hacker", task="x"),
               call("finish", status="PASS", subject="m", summary="fine")],
    })

    events = list(orchestrator.run_mission("o", max_rounds=4))
    rejection = [e for e in events if e.data.get("phase") == "rejected"][0]
    assert "unknown role" in rejection.data["reason"]
    orchestrator.close()


def test_dispatch_without_a_task_is_rejected(ledger: Ledger):
    orchestrator = build(ledger, {
        "pm": [call("dispatch", role="ops", task="  "),
               call("finish", status="PASS", subject="m", summary="fine")],
    })

    events = list(orchestrator.run_mission("o", max_rounds=4))
    rejection = [e for e in events if e.data.get("phase") == "rejected"][0]
    assert "no task" in rejection.data["reason"]
    orchestrator.close()


# ------------------------------------------- constraint: the same wall twice

def test_the_same_blocker_twice_halts_the_mission(ledger: Ledger):
    orchestrator = build(ledger, {
        "pm": [call("dispatch", role="build", task="try again")] * 6,
        "build": [call("finish", status="BLOCKED", subject="gate-0",
                       note="missing SDK", summary="cannot proceed")] * 6,
    })

    events = list(orchestrator.run_mission("get gate-0 passing", max_rounds=8))
    end = final(events)

    assert end["outcome"] == "halted"
    assert "twice in one mission" in end["detail"]
    assert end["rounds"] == 2  # not 8
    orchestrator.close()


def test_a_refusal_twice_also_halts(ledger: Ledger):
    orchestrator = build(ledger, {
        "pm": [call("dispatch", role="adversarial-qa", task="audit")] * 6,
        "adversarial-qa": [call("finish", status="REFUSED", subject="gate-1",
                                note="still crashes", summary="no")] * 6,
    })

    end = final(list(orchestrator.run_mission("o", max_rounds=8)))
    assert end["outcome"] == "halted"
    orchestrator.close()


def test_blockers_on_different_subjects_do_not_halt(ledger: Ledger):
    """Two different walls are progress; the same wall twice is not."""
    orchestrator = build(ledger, {
        "pm": [call("dispatch", role="build", task="a"),
               call("dispatch", role="build", task="b"),
               call("finish", status="PARKED", subject="m", summary="enough")],
        "build": [call("finish", status="BLOCKED", subject="gate-0", summary="x"),
                  call("finish", status="BLOCKED", subject="gate-1", summary="x")],
    })

    end = final(list(orchestrator.run_mission("o", max_rounds=8)))
    assert end["outcome"] == "done"
    assert end["rounds"] == 2
    orchestrator.close()


def test_the_same_subject_blocked_by_different_roles_does_not_halt(ledger: Ledger):
    orchestrator = build(ledger, {
        "pm": [call("dispatch", role="build", task="a"),
               call("dispatch", role="playtest", task="b"),
               call("finish", status="PARKED", subject="m", summary="enough")],
        "build": [call("finish", status="BLOCKED", subject="gate-0", summary="x")],
        "playtest": [call("finish", status="BLOCKED", subject="gate-0", summary="x")],
    })

    end = final(list(orchestrator.run_mission("o", max_rounds=8)))
    assert end["outcome"] == "done"
    orchestrator.close()


# --------------------------------------------------------------- round cap

def test_round_cap_stops_and_reports_open_blockers(ledger: Ledger):
    orchestrator = build(ledger, {
        "pm": [call("dispatch", role="build", task=f"try {i}") for i in range(10)],
        "build": [call("finish", status="BLOCKED", subject=f"gate-{i}",
                       note="stuck", summary="x") for i in range(10)],
    })

    end = final(list(orchestrator.run_mission("o", max_rounds=3)))

    assert end["outcome"] == "round_cap"
    assert end["rounds"] == 3
    assert len(end["open_blockers"]) == 3
    orchestrator.close()


def test_result_summary_is_readable(ledger: Ledger):
    orchestrator = build(ledger, {
        "pm": [call("dispatch", role="ops", task="a"),
               call("finish", status="PASS", subject="m", summary="done")],
        "ops": [call("finish", status="LIVE", subject="ops-disk", summary="x")],
    })

    end = final(list(orchestrator.run_mission("check", max_rounds=3)))
    text = end["result"].summary()

    assert "done" in text
    assert "ops" in text and "LIVE" in text
    orchestrator.close()


# ------------------------------------------------------------ pm misbehaving

def test_a_pm_that_never_dispatches_ends_the_mission(ledger: Ledger):
    orchestrator = build(ledger, {"pm": [{"content": "hmm", "tool_calls": []}] * 40})

    end = final(list(orchestrator.run_mission("o", max_rounds=3)))
    assert end["outcome"] == "pm_failed"
    orchestrator.close()


def test_a_budget_overrun_in_a_role_is_treated_as_blocked(ledger: Ledger):
    orchestrator = build(ledger, {
        "pm": [call("dispatch", role="ops", task="a"),
               call("finish", status="PARKED", subject="m", summary="giving up")],
        "ops": [{"content": "thinking", "tool_calls": []}] * 40,
    })

    end = final(list(orchestrator.run_mission("o", max_rounds=3)))
    assert end["result"].rounds[0].status == "BLOCKED"
    assert ledger.state()["ops/budget"].status is Status.BLOCKED
    orchestrator.close()
