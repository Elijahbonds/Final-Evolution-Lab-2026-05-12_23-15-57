"""Role dispatch through Agent.run().

The loop is the same for every role; what changes is the prompt, the tool
list, the workspace and the provider. These tests pin each of those.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from agent import Agent, AgentConfig
from ledger import Ledger, Status
from registry import Registry, RoleError


class FakeProvider:
    """Records what it was asked and replays scripted turns."""

    def __init__(self, name: str, turns: list[dict[str, Any]]):
        self.name = name
        self.turns = list(turns)
        self.seen_tools: list[list[str]] = []
        self.seen_systems: list[str] = []
        self.seen_models: list[str] = []

    def chat(self, messages, tools, model):
        self.seen_tools.append([t["function"]["name"] for t in tools])
        self.seen_systems.append(messages[0]["content"])
        self.seen_models.append(model)
        return self.turns.pop(0) if self.turns else {"content": "", "tool_calls": []}

    def close(self):
        pass


class FakePool:
    def __init__(self, local: FakeProvider, frontier: FakeProvider | None = None):
        self.local = local
        self.frontier = frontier or local

    def for_tier(self, tier: str):
        if tier == "frontier":
            return self.frontier, "claude-sonnet-4-6"
        return self.local, "qwen2.5:14b"

    def close(self):
        pass


def call(name: str, **args) -> dict[str, Any]:
    return {"content": "", "tool_calls": [{
        "id": "c1", "type": "function",
        "function": {"name": name, "arguments": json.dumps(args)},
    }]}


def build_agent(ledger: Ledger, turns: list[dict[str, Any]], frontier_turns=None):
    local = FakeProvider("ollama", turns)
    frontier = FakeProvider("anthropic", frontier_turns) if frontier_turns is not None else None
    pool = FakePool(local, frontier)
    agent = Agent(
        AgentConfig(workspace=str(ledger.evidence_root), max_steps=10),
        ledger=ledger,
        registry=Registry.load(),
        providers=pool,
    )
    return agent, local, frontier


# ---------------------------------------------- the required tool-scope test

def test_restricted_role_never_sees_the_excluded_schemas(ledger: Ledger):
    """adversarial-qa has no write_file. It must not appear in the schemas the
    model is handed — a tool the model can see is a tool it will try."""
    agent, _local, frontier = build_agent(
        ledger, [], frontier_turns=[call("finish", status="REFUSED", subject="gate-0",
                                         summary="broke it", note="crash on resize")])

    list(agent.run("audit gate 0", role="adversarial-qa"))

    offered = frontier.seen_tools[0]
    assert "write_file" not in offered
    assert "dispatch" not in offered
    # …and it does keep what it was given.
    assert {"execute_bash", "browse_page", "read_file", "list_files"} <= set(offered)
    # …plus the three every role gets.
    assert {"read_ledger", "write_ledger", "finish"} <= set(offered)
    agent.close()


def test_build_sees_write_file_but_not_dispatch(ledger: Ledger):
    agent, local, _ = build_agent(ledger, [call("finish", status="SOFT_CLEAR",
                                                subject="gate-0", summary="done")])
    list(agent.run("do a thing", role="build"))

    offered = local.seen_tools[0]
    assert "write_file" in offered
    assert "dispatch" not in offered
    agent.close()


def test_pm_sees_dispatch_but_no_file_tools(ledger: Ledger):
    agent, _local, frontier = build_agent(
        ledger, [], frontier_turns=[call("dispatch", role="build", task="mount the kart")])
    list(agent.run("get gate 0 moving", role="pm"))

    offered = frontier.seen_tools[0]
    assert "dispatch" in offered
    assert "write_file" not in offered and "execute_bash" not in offered
    agent.close()


# ------------------------------------------------------------------ tiering

def test_frontier_role_routes_to_the_frontier_provider(ledger: Ledger):
    agent, local, frontier = build_agent(
        ledger, [], frontier_turns=[call("finish", status="PARKED", subject="s", summary="x")])
    list(agent.run("t", role="vision-guardian"))

    assert frontier.seen_models == ["claude-sonnet-4-6"]
    assert local.seen_models == []
    agent.close()


def test_local_role_routes_to_the_local_provider(ledger: Ledger):
    agent, local, frontier = build_agent(
        ledger, [call("finish", status="LIVE", subject="s", summary="x")],
        frontier_turns=[])
    list(agent.run("t", role="ops"))

    assert local.seen_models == ["qwen2.5:14b"]
    assert frontier.seen_models == []
    agent.close()


# ------------------------------------------------------------ system prompt

def test_system_prompt_is_base_plus_role_plus_brief(ledger: Ledger):
    from ledger import LedgerEntry
    ledger.append(LedgerEntry(role="build", subject="gate-4", status=Status.REFUSED,
                              note="QA reproduced a crash"))

    agent, local, _ = build_agent(ledger, [call("finish", status="SOFT_CLEAR",
                                                subject="s", summary="x")])
    list(agent.run("t", role="build"))

    system = local.seen_systems[0]
    assert "You are a worker inside an AI Personal Computer" in system  # base
    assert "YOUR ROLE: build" in system                                  # role
    assert "Refuse to:" in system                                        # role prompt
    assert "/workspace/fel" in system                                    # workspace
    assert "LEDGER BRIEF for build" in system                            # brief
    assert "gate-4" in system                                            # open blocker
    agent.close()


def test_role_brief_is_filtered_to_its_subjects(ledger: Ledger):
    from ledger import LedgerEntry
    ledger.append(LedgerEntry(role="content", subject="copy-launch", status=Status.LIVE))
    ledger.append(LedgerEntry(role="ops", subject="ops-disk", status=Status.LIVE))

    agent, local, _ = build_agent(ledger, [call("finish", status="LIVE",
                                                subject="s", summary="x")])
    list(agent.run("t", role="ops"))

    system = local.seen_systems[0]
    assert "ops-disk" in system
    assert "copy-launch" not in system
    agent.close()


# --------------------------------------------------------- finish -> ledger

def test_finish_appends_a_ledger_entry(ledger: Ledger):
    agent, _local, _ = build_agent(ledger, [call(
        "finish", status="LIVE", subject="ops-disk",
        summary="checked", note="94GB free of 200GB")])

    events = list(agent.run("report disk", role="ops"))

    assert ledger.state()["ops-disk"].status is Status.LIVE
    assert [e.kind for e in events][-2:] == ["ledger", "finish"]
    agent.close()


def test_a_models_pass_is_never_trusted(ledger: Ledger):
    """The status comes from the model; the evidence does not."""
    agent, _local, _ = build_agent(ledger, [call(
        "finish", status="PASS", subject="gate-0", evidence="reports/ghost.log",
        summary="all green", note="tests pass")])

    events = list(agent.run("verify gate 0", role="build"))
    finish = [e for e in events if e.kind == "finish"][0]

    assert finish.data["claimed_status"] == "PASS"
    assert finish.data["status"] == "SOFT_CLEAR"
    assert ledger.state()["gate-0"].status is Status.SOFT_CLEAR
    agent.close()


def test_a_backed_pass_survives(ledger: Ledger, workspace: Path):
    proof = workspace / "fel" / "reports" / "gate-0.log"
    proof.parent.mkdir(parents=True)
    proof.write_text("42 passed", encoding="utf-8")

    agent, _local, _ = build_agent(ledger, [call(
        "finish", status="PASS", subject="gate-0",
        evidence=str(proof), summary="green", note="42 passed")])

    list(agent.run("verify gate 0", role="build"))
    assert ledger.state()["gate-0"].status is Status.PASS
    agent.close()


def test_an_unparseable_status_becomes_blocked_not_dropped(ledger: Ledger):
    agent, _local, _ = build_agent(ledger, [call(
        "finish", status="probably fine", subject="gate-0", summary="hmm")])

    list(agent.run("t", role="build"))
    entry = ledger.state()["gate-0"]
    assert entry.status is Status.BLOCKED
    assert "unparseable status" in entry.note
    agent.close()


def test_finish_without_a_subject_still_records(ledger: Ledger):
    agent, _local, _ = build_agent(ledger, [call("finish", status="PARKED",
                                                 summary="nothing to do")])
    list(agent.run("t", role="ops"))
    assert "ops/unspecified" in ledger.state()
    agent.close()


# ---------------------------------------------------------------- dispatch

def test_dispatch_emits_an_event_and_stops_the_run(ledger: Ledger):
    agent, _local, frontier = build_agent(
        ledger, [], frontier_turns=[
            call("dispatch", role="build", task="mount VelocityKart", rationale="gate-0 is blocked"),
            call("finish", status="PARKED", summary="should never run"),
        ])

    events = list(agent.run("get gate 0 to pass", role="pm"))
    dispatches = [e for e in events if e.kind == "dispatch"]

    assert len(dispatches) == 1
    assert dispatches[0].data["target_role"] == "build"
    assert dispatches[0].data["task"] == "mount VelocityKart"
    # The second scripted turn must not have been consumed.
    assert len(frontier.seen_models) == 1
    agent.close()


# ----------------------------------------------------------------- budgets

def test_step_budget_is_capped_by_the_role(ledger: Ledger):
    """pm declares max_steps: 8; a model that never finishes must stop there."""
    agent, _local, frontier = build_agent(
        ledger, [], frontier_turns=[{"content": "thinking", "tool_calls": []}] * 50)

    events = list(agent.run("t", role="pm"))
    error = [e for e in events if e.kind == "error"][-1]

    assert error.data["reason"] == "step_budget_exhausted"
    assert len(frontier.seen_models) == 8
    agent.close()


def test_a_budget_overrun_is_recorded_as_a_blocker(ledger: Ledger):
    """A run that silently vanishes leaves the PM dispatching into the same
    wall forever."""
    agent, local, _ = build_agent(
        ledger, [{"content": "hmm", "tool_calls": []}] * 50)

    list(agent.run("t", role="ops"))
    assert ledger.state()["ops/budget"].status is Status.BLOCKED
    agent.close()


# ------------------------------------------------------------------- errors

def test_an_unknown_role_fails_before_anything_runs(ledger: Ledger):
    agent, _local, _ = build_agent(ledger, [])
    with pytest.raises(RoleError):
        list(agent.run("t", role="chief-vibes-officer"))
    agent.close()
