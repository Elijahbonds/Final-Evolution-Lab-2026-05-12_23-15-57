"""PM orchestration.

A mission is rounds of: the PM reads the ledger and names one role and one
task; that role runs; its result lands in the ledger; repeat. The PM never
receives a report — it reads the same record everyone else writes to. That is
why there is no message bus here, and why adding one would undo the thing this
design is for.

Three constraints are enforced in code rather than asked for in a prompt,
because a prompt is a request and these are guarantees:

1. One role runs at a time. The loop is sequential; there is nowhere to put a
   second one.
2. The PM cannot dispatch itself. A PM that can becomes an agent that talks to
   itself until the round cap.
3. A role that returns BLOCKED on the same subject twice in one mission halts
   the mission. The second identical blocker is the signal that nothing in the
   loop is going to clear it, and the rounds after it are spent proving that
   slowly.
"""

from __future__ import annotations

import logging
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Iterator

from agent import Agent, AgentConfig, AgentEvent
from ledger import BLOCKING_STATUSES, Ledger, LedgerEntry, Status
from registry import RoleError

log = logging.getLogger("ai-pc.orchestrator")

PM_ROLE = "pm"


@dataclass
class Round:
    number: int
    role: str
    task: str
    rationale: str = ""
    status: str | None = None
    subject: str | None = None


@dataclass
class MissionResult:
    mission_id: str
    objective: str
    outcome: str  # done | round_cap | halted | pm_failed
    rounds: list[Round] = field(default_factory=list)
    open_blockers: list[LedgerEntry] = field(default_factory=list)
    detail: str = ""

    def summary(self) -> str:
        lines = [f"mission {self.mission_id}: {self.outcome}"]
        if self.detail:
            lines.append(f"  {self.detail}")
        for rnd in self.rounds:
            status = rnd.status or "—"
            lines.append(f"  {rnd.number}. {rnd.role} → {status} ({rnd.subject or 'no subject'})")
        if self.open_blockers:
            lines.append(f"  {len(self.open_blockers)} open blocker(s):")
            for entry in self.open_blockers:
                lines.append(f"    {entry.line()}")
        return "\n".join(lines)


class Orchestrator:
    def __init__(self, agent: Agent | None = None, config: AgentConfig | None = None):
        self.agent = agent or Agent(config)
        self.ledger: Ledger = self.agent.ledger
        self.registry = self.agent.registry

    def close(self) -> None:
        self.agent.close()

    # ------------------------------------------------------------- mission

    def run_mission(
        self,
        objective: str,
        max_rounds: int = 8,
    ) -> Iterator[AgentEvent]:
        """Run a mission, yielding every event from every role as it happens.

        The last event is always kind="mission" and carries a MissionResult in
        its `result` field.
        """
        mission_id = uuid.uuid4().hex[:8]
        result = MissionResult(mission_id=mission_id, objective=objective, outcome="round_cap")
        blocked_twice: dict[tuple[str, str], int] = {}

        yield AgentEvent("mission", {
            "mission_id": mission_id, "phase": "start",
            "objective": objective, "max_rounds": max_rounds,
        })

        for round_no in range(1, max_rounds + 1):
            # --- the PM picks one thing -----------------------------------
            decision: dict[str, Any] | None = None
            pm_finished = False

            try:
                for event in self.agent.run(
                    self._pm_task(objective, round_no, max_rounds),
                    role=PM_ROLE,
                    run_id=f"{mission_id}-r{round_no}-pm",
                ):
                    yield event
                    if event.kind == "dispatch":
                        decision = event.data
                    elif event.kind == "finish":
                        pm_finished = True
            except RoleError as exc:
                result.outcome = "pm_failed"
                result.detail = str(exc)
                break

            if pm_finished:
                result.outcome = "done"
                result.detail = "PM declared the objective met"
                break

            if decision is None:
                result.outcome = "pm_failed"
                result.detail = f"PM produced no dispatch in round {round_no}"
                break

            target = (decision.get("target_role") or "").strip()
            task = (decision.get("task") or "").strip()

            # --- constraints, checked here and not asked for in the prompt --
            problem = self._reject(target, task)
            if problem:
                yield AgentEvent("mission", {
                    "mission_id": mission_id, "phase": "rejected",
                    "round": round_no, "target_role": target, "reason": problem,
                })
                # Record it so the PM sees its own bad dispatch next round
                # instead of repeating it.
                self.ledger.append(LedgerEntry(
                    run_id=f"{mission_id}-r{round_no}",
                    role=PM_ROLE,
                    subject="mission/dispatch",
                    status=Status.BLOCKED,
                    note=f"rejected dispatch to {target!r}: {problem}",
                ))
                continue

            rnd = Round(number=round_no, role=target, task=task,
                        rationale=(decision.get("rationale") or "").strip())
            result.rounds.append(rnd)

            yield AgentEvent("mission", {
                "mission_id": mission_id, "phase": "dispatch", "round": round_no,
                "role": target, "task": task, "rationale": rnd.rationale,
            })

            # --- one role runs, alone -------------------------------------
            for event in self.agent.run(
                task, role=target, run_id=f"{mission_id}-r{round_no}-{target}"
            ):
                yield event
                if event.kind == "finish":
                    rnd.status = event.data.get("status")
                    rnd.subject = event.data.get("subject")
                elif event.kind == "error" and rnd.status is None:
                    rnd.status = "BLOCKED"
                    rnd.subject = f"{target}/budget"

            # --- the same wall twice ends the mission ---------------------
            if rnd.status in {s.value for s in BLOCKING_STATUSES} and rnd.subject:
                key = (target, rnd.subject)
                blocked_twice[key] = blocked_twice.get(key, 0) + 1
                if blocked_twice[key] >= 2:
                    result.outcome = "halted"
                    result.detail = (
                        f"{target} returned {rnd.status} on {rnd.subject!r} twice in "
                        "one mission — this needs a person, not another round"
                    )
                    break

        result.open_blockers = self.ledger.open_blockers()
        yield AgentEvent("mission", {
            "mission_id": mission_id,
            "phase": "end",
            "outcome": result.outcome,
            "detail": result.detail,
            "rounds": len(result.rounds),
            "open_blockers": [e.model_dump(mode="json") for e in result.open_blockers],
            "result": result,
        })

    # ------------------------------------------------------------- helpers

    def _reject(self, target: str, task: str) -> str | None:
        """None if the dispatch is allowed, else why it is not."""
        if not target:
            return "no role named"
        if target == PM_ROLE:
            return "the PM cannot dispatch itself"
        if target not in self.registry:
            return f"unknown role; available: {', '.join(self.registry.names())}"
        if not task:
            return "no task given"
        return None

    def _pm_task(self, objective: str, round_no: int, max_rounds: int) -> str:
        return (
            f"MISSION OBJECTIVE: {objective}\n\n"
            f"This is round {round_no} of at most {max_rounds}.\n\n"
            "The ledger brief in your system prompt is the current state. Decide the "
            "single most useful next action and call `dispatch` once, or call `finish` "
            "if the objective is met or nothing useful remains.\n\n"
            f"Roles you can dispatch: {', '.join(n for n in self.registry.names() if n != PM_ROLE)}"
        )


def run_mission(
    objective: str,
    max_rounds: int = 8,
    agent: Agent | None = None,
) -> Iterator[AgentEvent]:
    """Module-level convenience wrapper."""
    orchestrator = Orchestrator(agent=agent)
    try:
        yield from orchestrator.run_mission(objective, max_rounds=max_rounds)
    finally:
        if agent is None:
            orchestrator.close()
