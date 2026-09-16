"""The loop.

One loop runs every role. A role swaps four things — the system prompt, the
tool list, the workspace, and which provider answers — and nothing else about
the loop changes. There is no per-role process, no queue, and no way for one
role to reach another except by appending to the ledger.

Budgets are two-sided on purpose. Step count stops a model that is making
progress too slowly; wall clock stops one that is stuck on a single slow tool.
Either alone leaves a way to hang.
"""

from __future__ import annotations

import json
import logging
import os
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterator

from ledger import Ledger, LedgerEntry, Status
from providers import ProviderError, ProviderPool
from qwen_protocol import BASE_SYSTEM_PROMPT, SAMPLING, render_tool_catalogue
from registry import Registry, RoleSpec, default_registry
from tools import SandboxClient, ToolError

log = logging.getLogger("ai-pc.agent")


@dataclass
class AgentConfig:
    ollama_url: str = os.environ.get("OLLAMA_URL", "http://ollama:11434")
    sandbox_url: str = os.environ.get("SANDBOX_URL", "http://sandbox:8080")
    workspace: str = os.environ.get("WORKSPACE_ROOT", "/workspace")
    state_dir: str = os.environ.get("STATE_DIR", "/state")

    # Tiering. Mechanical high-volume roles run local; judgment-heavy roles
    # run frontier. An unset frontier key is a warning, never a crash.
    local_model: str = os.environ.get("OLLAMA_MODEL", "qwen2.5:14b-instruct-q4_K_M")
    frontier_model: str = os.environ.get("FRONTIER_MODEL", "claude-sonnet-4-6")
    frontier_api_key: str | None = os.environ.get("ANTHROPIC_API_KEY") or None

    max_steps: int = int(os.environ.get("MAX_STEPS", "24"))
    wall_clock_seconds: float = float(os.environ.get("WALL_CLOCK_SECONDS", "900"))
    request_timeout: float = float(os.environ.get("REQUEST_TIMEOUT", "300"))

    # Trim the transcript when it gets long. Keep the system message and the
    # first user turn (the task) always — a model that forgets the task will
    # confidently finish the wrong one.
    max_context_messages: int = 40
    max_tool_result_chars: int = 12000

    sampling: dict[str, Any] = field(default_factory=lambda: dict(SAMPLING))

    @property
    def model(self) -> str:
        """Back-compat for callers that just want the default local model."""
        return self.local_model


@dataclass
class AgentEvent:
    """One thing that happened, streamed to whoever is watching."""

    kind: str  # step | model | tool_call | tool_result | ledger | finish | error | warning
    data: dict[str, Any]
    ts: float = field(default_factory=time.time)

    def to_json(self) -> str:
        return json.dumps({"kind": self.kind, "ts": self.ts, **self.data}, default=str)


class Agent:
    def __init__(
        self,
        config: AgentConfig | None = None,
        ledger: Ledger | None = None,
        registry: Registry | None = None,
        providers: ProviderPool | None = None,
    ):
        self.config = config or AgentConfig()
        self.registry = registry or default_registry()
        self.ledger = ledger or Ledger(
            path=Path(self.config.state_dir) / "ledger.jsonl",
            evidence_root=Path(self.config.workspace),
        )
        self.providers = providers or ProviderPool(
            ollama_url=self.config.ollama_url,
            local_model=self.config.local_model,
            frontier_model=self.config.frontier_model,
            frontier_api_key=self.config.frontier_api_key,
            timeout=self.config.request_timeout,
        )

    def close(self) -> None:
        self.providers.close()

    # ------------------------------------------------------------------ run

    def run(
        self,
        task: str,
        role: str = "build",
        run_id: str | None = None,
    ) -> Iterator[AgentEvent]:
        """Run one role against one task. Yields events as they happen."""
        run_id = run_id or uuid.uuid4().hex[:12]
        spec = self.registry.get(role)

        schemas = spec.schemas()
        provider, model = self.providers.for_tier(spec.tier)
        system = self._system_prompt(spec, schemas)
        max_steps = min(spec.max_steps, self.config.max_steps) \
            if self.config.max_steps else spec.max_steps

        messages: list[dict[str, Any]] = [
            {"role": "system", "content": system},
            {"role": "user", "content": task},
        ]

        sandbox = SandboxClient(self.config.sandbox_url, spec.workspace)
        started = time.monotonic()
        step = 0
        finished = False

        yield AgentEvent("step", {
            "run_id": run_id,
            "phase": "start",
            "role": spec.name,
            "tier": spec.tier,
            "model": model,
            "provider": provider.name,
            "workspace": spec.workspace,
            "tools": [s["function"]["name"] for s in schemas],
            "max_steps": max_steps,
            "task": task,
        })

        try:
            while True:
                step += 1
                elapsed = time.monotonic() - started

                if step > max_steps:
                    yield self._budget_stop(spec, run_id, "step_budget_exhausted",
                                            f"hit {max_steps} steps without finishing")
                    return
                if elapsed > self.config.wall_clock_seconds:
                    yield self._budget_stop(
                        spec, run_id, "wall_clock_exhausted",
                        f"hit {self.config.wall_clock_seconds:.0f}s without finishing")
                    return

                messages = self._trim(messages)
                yield AgentEvent("step", {
                    "run_id": run_id, "role": spec.name,
                    "step": step, "elapsed_s": round(elapsed, 1),
                })

                try:
                    reply = provider.chat(messages, schemas, model)
                except ProviderError as exc:
                    yield AgentEvent("error", {
                        "run_id": run_id, "role": spec.name,
                        "reason": "model_unreachable", "message": str(exc),
                    })
                    return

                content = reply.get("content", "") or ""
                calls = reply.get("tool_calls") or []

                if content:
                    yield AgentEvent("model", {
                        "run_id": run_id, "role": spec.name, "step": step, "content": content
                    })

                if not calls:
                    # No call and no finish. Nudge once rather than spinning.
                    messages.append({"role": "assistant", "content": content})
                    messages.append({
                        "role": "user",
                        "content": (
                            "You did not call a tool. Either take the next concrete action "
                            "with a tool call, or call `finish` with your status and evidence."
                        ),
                    })
                    continue

                messages.append({
                    "role": "assistant", "content": content, "tool_calls": calls,
                })

                for call in calls:
                    name = call["function"]["name"]
                    raw_args = call["function"].get("arguments") or "{}"
                    args = raw_args if isinstance(raw_args, dict) else _safe_json(raw_args)

                    yield AgentEvent("tool_call", {
                        "run_id": run_id, "role": spec.name,
                        "step": step, "tool": name, "args": args,
                    })

                    if name == "dispatch":
                        yield AgentEvent("dispatch", {
                            "run_id": run_id, "role": spec.name, "step": step,
                            "target_role": str(args.get("role", "")).strip(),
                            "task": str(args.get("task", "")).strip(),
                            "rationale": str(args.get("rationale", "")).strip(),
                        })
                        finished = True
                        return

                    if name == "finish":
                        entry = self._record_finish(spec, run_id, args)
                        yield AgentEvent("ledger", {
                            "run_id": run_id,
                            **entry.model_dump(mode="json"),
                            "downgraded": entry.status.value != str(args.get("status", "")),
                        })
                        yield AgentEvent("finish", {
                            "run_id": run_id,
                            "role": spec.name,
                            "step": step,
                            "elapsed_s": round(time.monotonic() - started, 1),
                            "summary": str(args.get("summary", "")),
                            "status": entry.status.value,
                            "claimed_status": str(args.get("status", "")),
                            "subject": entry.subject,
                            "evidence": entry.evidence,
                            "note": entry.note,
                        })
                        finished = True
                        return

                    if name in ("read_ledger", "write_ledger"):
                        result, ledger_event = self._ledger_tool(
                            name, args, role=spec.name, run_id=run_id)
                        if ledger_event is not None:
                            yield ledger_event
                    else:
                        try:
                            result = sandbox.call(name, args)
                        except ToolError as exc:
                            result = f"TOOL ERROR: {exc}"
                            yield AgentEvent("warning", {
                                "run_id": run_id, "role": spec.name,
                                "step": step, "tool": name, "message": str(exc),
                            })

                    result = _clip(result, self.config.max_tool_result_chars)
                    yield AgentEvent("tool_result", {
                        "run_id": run_id, "role": spec.name,
                        "step": step, "tool": name, "result": result,
                    })
                    messages.append({
                        "role": "tool",
                        "tool_call_id": call.get("id", name),
                        "name": name,
                        "content": result,
                    })
        finally:
            sandbox.close()
            if not finished:
                log.info("run %s (%s) ended without finish", run_id, spec.name)

    # -------------------------------------------------------------- dispatch

    def _system_prompt(self, spec: RoleSpec, schemas: list[dict[str, Any]]) -> str:
        """base + role prompt + the ledger brief.

        The brief is the whole reason there is no messaging layer: the role
        arrives already knowing the current state of what it cares about and
        every open blocker, so nobody has to relay it.
        """
        return "\n\n".join([
            BASE_SYSTEM_PROMPT,
            f"YOUR ROLE: {spec.name} — {spec.description}\n\n{spec.prompt.strip()}",
            f"YOUR WORKSPACE: {spec.workspace} (relative paths resolve here)",
            render_tool_catalogue(schemas),
            self.ledger.brief(spec.name, subjects=spec.subjects or None),
        ])

    def _record_finish(
        self,
        spec: RoleSpec,
        run_id: str,
        args: dict[str, Any],
    ) -> LedgerEntry:
        """Write the run's result to the ledger.

        The status comes from the model; the evidence does not get taken on
        trust. ledger.append() checks the artifact exists and downgrades a
        PASS that cannot be backed. A malformed status is recorded as BLOCKED
        rather than dropped — a run that ended in a way we could not parse is
        exactly the thing the next round needs to see.
        """
        subject = str(args.get("subject") or "").strip() or f"{spec.name}/unspecified"
        note = str(args.get("note") or args.get("summary") or "").strip()

        try:
            status = Status(str(args.get("status", "")).strip().upper())
        except ValueError:
            status = Status.BLOCKED
            note = _prefix_note(
                f"[unparseable status {args.get('status')!r} from model]", note)

        entry = LedgerEntry(
            run_id=run_id,
            role=spec.name,
            subject=subject,
            status=status,
            evidence=(str(args.get("evidence")).strip() if args.get("evidence") else None),
            note=note,
            blocks=args.get("blocks") or [],
        )
        return self.ledger.append(entry)

    def _budget_stop(
        self, spec: RoleSpec, run_id: str, reason: str, message: str
    ) -> AgentEvent:
        """Record a budget overrun as a blocker before giving up.

        A run that silently vanishes leaves the PM dispatching into the same
        wall forever. BLOCKED in the record is what stops that.
        """
        self.ledger.append(LedgerEntry(
            run_id=run_id,
            role=spec.name,
            subject=f"{spec.name}/budget",
            status=Status.BLOCKED,
            note=message,
        ))
        return AgentEvent("error", {
            "run_id": run_id, "role": spec.name, "reason": reason, "message": message
        })

    # --------------------------------------------------------------- ledger

    def _ledger_tool(
        self,
        name: str,
        args: dict[str, Any],
        role: str,
        run_id: str,
    ) -> tuple[str, AgentEvent | None]:
        """Handle read_ledger / write_ledger in-process.

        Returns the string the model sees and, for a write, an event so the
        console can render the entry as it lands.
        """
        if name == "read_ledger":
            subject = args.get("subject")
            if subject:
                rows = self.ledger.history(str(subject))
                if not rows:
                    return f"No ledger entries for {subject!r}.", None
                body = "\n".join(
                    f"{time.strftime('%m-%d %H:%M', time.gmtime(r.ts))}  {r.line()}"
                    for r in rows
                )
                return f"History for {subject} ({len(rows)} entries, oldest first):\n{body}", None
            return self.ledger.brief(role, subjects=None), None

        # write_ledger
        try:
            entry = LedgerEntry(
                run_id=run_id,
                role=role,
                subject=str(args.get("subject", "")).strip(),
                status=Status(str(args.get("status", ""))),
                evidence=args.get("evidence") or None,
                note=str(args.get("note", "")),
                blocks=args.get("blocks") or [],
            )
        except Exception as exc:
            return f"LEDGER REJECTED YOUR ENTRY: {exc}", None

        written = self.ledger.append(entry)
        event = AgentEvent("ledger", {
            "run_id": run_id,
            **written.model_dump(mode="json"),
            "downgraded": written.status is not entry.status,
        })
        if written.status is not entry.status:
            return (
                f"Recorded, but DOWNGRADED: you claimed {entry.status.value}, "
                f"the ledger wrote {written.status.value}. {written.note}"
            ), event
        return f"Recorded: {written.line()}", event

    # ----------------------------------------------------------------- trim

    def _trim(self, messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Drop the middle of a long transcript, never the head.

        Cut at a message that is not a tool result, so an assistant turn is
        never separated from the tool output it is answering.
        """
        limit = self.config.max_context_messages
        if len(messages) <= limit:
            return messages

        head = messages[:2]  # system + the task
        tail_budget = limit - len(head) - 1
        tail = messages[-tail_budget:]
        while tail and tail[0].get("role") == "tool":
            tail = tail[1:]

        dropped = len(messages) - len(head) - len(tail)
        marker = {
            "role": "user",
            "content": f"[{dropped} earlier messages trimmed. The task above still stands.]",
        }
        return [*head, marker, *tail]


def _safe_json(raw: str) -> dict[str, Any]:
    try:
        value = json.loads(raw)
        return value if isinstance(value, dict) else {}
    except json.JSONDecodeError:
        return {}


def _clip(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    return f"{text[:limit]}\n\n...[{len(text) - limit} chars elided]..."


def _prefix_note(prefix: str, note: str) -> str:
    return f"{prefix} {note}".strip()
