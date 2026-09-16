"""The loop.

One generic agent: system prompt, tools, a workspace, and a budget. It calls
the model, runs whatever tool the model picked, feeds the result back, and
repeats until the model calls `finish` or a budget runs out.

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

import httpx

from qwen_protocol import (
    BASE_SYSTEM_PROMPT,
    SAMPLING,
    parse_tool_calls,
    render_tool_catalogue,
)
from ledger import Ledger, LedgerEntry, Status
from tools import TOOL_SCHEMAS, SandboxClient, ToolError

log = logging.getLogger("ai-pc.agent")


@dataclass
class AgentConfig:
    ollama_url: str = os.environ.get("OLLAMA_URL", "http://ollama:11434")
    model: str = os.environ.get("OLLAMA_MODEL", "qwen2.5:14b-instruct-q4_K_M")
    sandbox_url: str = os.environ.get("SANDBOX_URL", "http://sandbox:8080")
    workspace: str = os.environ.get("WORKSPACE_ROOT", "/workspace")
    state_dir: str = os.environ.get("STATE_DIR", "/state")

    max_steps: int = int(os.environ.get("MAX_STEPS", "24"))
    wall_clock_seconds: float = float(os.environ.get("WALL_CLOCK_SECONDS", "900"))
    request_timeout: float = float(os.environ.get("REQUEST_TIMEOUT", "300"))

    max_retries: int = 3
    retry_backoff: float = 2.0

    # Trim the transcript when it gets long. Keep the system message and the
    # first user turn (the task) always — a model that forgets the task will
    # confidently finish the wrong one.
    max_context_messages: int = 40
    max_tool_result_chars: int = 12000

    sampling: dict[str, Any] = field(default_factory=lambda: dict(SAMPLING))


@dataclass
class AgentEvent:
    """One thing that happened, streamed to whoever is watching."""

    kind: str  # step | model | tool_call | tool_result | finish | error | warning
    data: dict[str, Any]
    ts: float = field(default_factory=time.time)

    def to_json(self) -> str:
        return json.dumps({"kind": self.kind, "ts": self.ts, **self.data}, default=str)


class Agent:
    def __init__(self, config: AgentConfig | None = None, ledger: Ledger | None = None):
        self.config = config or AgentConfig()
        self._http = httpx.Client(timeout=self.config.request_timeout)
        self.ledger = ledger or Ledger(
            path=Path(self.config.state_dir) / "ledger.jsonl",
            evidence_root=Path(self.config.workspace),
        )

    def close(self) -> None:
        self._http.close()

    # ------------------------------------------------------------------ run

    def run(self, task: str, run_id: str | None = None) -> Iterator[AgentEvent]:
        run_id = run_id or uuid.uuid4().hex[:12]
        schemas = list(TOOL_SCHEMAS)
        system = f"{BASE_SYSTEM_PROMPT}\n\n{render_tool_catalogue(schemas)}"

        messages: list[dict[str, Any]] = [
            {"role": "system", "content": system},
            {"role": "user", "content": task},
        ]

        sandbox = SandboxClient(self.config.sandbox_url, self.config.workspace)
        started = time.monotonic()
        step = 0

        yield AgentEvent("step", {"run_id": run_id, "phase": "start", "task": task})

        try:
            while True:
                step += 1
                elapsed = time.monotonic() - started

                if step > self.config.max_steps:
                    yield AgentEvent("error", {
                        "run_id": run_id,
                        "reason": "step_budget_exhausted",
                        "message": f"hit {self.config.max_steps} steps without finishing",
                    })
                    return
                if elapsed > self.config.wall_clock_seconds:
                    yield AgentEvent("error", {
                        "run_id": run_id,
                        "reason": "wall_clock_exhausted",
                        "message": f"hit {self.config.wall_clock_seconds}s without finishing",
                    })
                    return

                messages = self._trim(messages)
                yield AgentEvent("step", {
                    "run_id": run_id, "step": step, "elapsed_s": round(elapsed, 1)
                })

                try:
                    reply = self._chat(messages, schemas)
                except Exception as exc:  # already retried inside _chat
                    yield AgentEvent("error", {
                        "run_id": run_id, "reason": "model_unreachable", "message": str(exc)
                    })
                    return

                content = reply.get("content", "") or ""
                calls = reply.get("tool_calls") or []

                if content:
                    yield AgentEvent("model", {"run_id": run_id, "step": step, "content": content})

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
                    "role": "assistant",
                    "content": content,
                    "tool_calls": calls,
                })

                for call in calls:
                    name = call["function"]["name"]
                    raw_args = call["function"].get("arguments") or "{}"
                    args = raw_args if isinstance(raw_args, dict) else _safe_json(raw_args)

                    yield AgentEvent("tool_call", {
                        "run_id": run_id, "step": step, "tool": name, "args": args
                    })

                    if name == "finish":
                        yield AgentEvent("finish", {
                            "run_id": run_id,
                            "step": step,
                            "elapsed_s": round(time.monotonic() - started, 1),
                            **args,
                        })
                        return

                    if name in ("read_ledger", "write_ledger"):
                        result, ledger_event = self._ledger_tool(name, args, role="agent",
                                                                 run_id=run_id)
                        if ledger_event is not None:
                            yield ledger_event
                        yield AgentEvent("tool_result", {
                            "run_id": run_id, "step": step, "tool": name, "result": result
                        })
                        messages.append({
                            "role": "tool",
                            "tool_call_id": call.get("id", name),
                            "name": name,
                            "content": result,
                        })
                        continue

                    try:
                        result = sandbox.call(name, args)
                    except ToolError as exc:
                        result = f"TOOL ERROR: {exc}"
                        yield AgentEvent("warning", {
                            "run_id": run_id, "step": step, "tool": name, "message": str(exc)
                        })

                    result = _clip(result, self.config.max_tool_result_chars)
                    yield AgentEvent("tool_result", {
                        "run_id": run_id, "step": step, "tool": name, "result": result
                    })
                    messages.append({
                        "role": "tool",
                        "tool_call_id": call.get("id", name),
                        "name": name,
                        "content": result,
                    })
        finally:
            sandbox.close()

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
                    f"{time.strftime('%m-%d %H:%M', time.gmtime(r.ts))}  {r.line()}" for r in rows
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

    # ---------------------------------------------------------------- model

    def _chat(self, messages: list[dict[str, Any]], schemas: list[dict[str, Any]]) -> dict[str, Any]:
        """One model turn against Ollama, with retries and the Hermes fallback."""
        payload = {
            "model": self.config.model,
            "messages": messages,
            "tools": schemas,
            "stream": False,
            "options": self.config.sampling,
        }

        last_exc: Exception | None = None
        for attempt in range(self.config.max_retries):
            try:
                resp = self._http.post(f"{self.config.ollama_url}/api/chat", json=payload)
                resp.raise_for_status()
                body = resp.json()
                break
            except Exception as exc:
                last_exc = exc
                if attempt == self.config.max_retries - 1:
                    raise
                sleep_for = self.config.retry_backoff ** attempt
                log.warning("ollama call failed (%s), retrying in %.1fs", exc, sleep_for)
                time.sleep(sleep_for)
        else:  # pragma: no cover - the loop either breaks or raises
            raise last_exc or RuntimeError("ollama call failed")

        message = body.get("message", {}) or {}
        content = message.get("content", "") or ""
        calls = message.get("tool_calls") or []

        normalized = [_normalize_ollama_call(c) for c in calls]

        # Fallback: the model wrote the call into the text instead.
        if not normalized:
            content, normalized = parse_tool_calls(content)

        return {"content": content, "tool_calls": normalized}

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


def _normalize_ollama_call(call: dict[str, Any]) -> dict[str, Any]:
    """Ollama returns arguments as an object; OpenAI shape wants a string."""
    fn = call.get("function", call)
    args = fn.get("arguments", {})
    if isinstance(args, dict):
        args = json.dumps(args)
    return {
        "id": call.get("id") or f"call_{uuid.uuid4().hex[:8]}",
        "type": "function",
        "function": {"name": fn.get("name", ""), "arguments": args},
    }


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
