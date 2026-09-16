"""Tool schemas and the HTTP client that runs them against the sandbox.

Schemas are OpenAI function-calling format because both providers we target
accept it (Anthropic's shape is translated in providers.py). The agent loop
never executes anything itself — every tool here is a call into the sandbox.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Iterable

import httpx

log = logging.getLogger("ai-pc.tools")

# --------------------------------------------------------------------------
# Tool schemas. TOOL_SCHEMAS is the full catalogue; a role gets a filtered
# view of it (see registry.py). `finish` is always available — a role with no
# way to stop just burns its step budget.
# --------------------------------------------------------------------------

TOOL_SCHEMAS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "execute_bash",
            "description": (
                "Run a shell command inside the sandbox, rooted at your workspace. "
                "Use it to build, test, inspect and measure. Output is truncated if huge."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {"type": "string", "description": "Shell command to run."},
                    "cwd": {
                        "type": "string",
                        "description": "Working directory, must be inside your workspace. Defaults to the workspace root.",
                    },
                },
                "required": ["command"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "browse_page",
            "description": (
                "Load a URL in a headless Chromium and return its visible text. "
                "Pass screenshot_path to also save a PNG into the workspace — that file "
                "is what you cite as evidence."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {"type": "string"},
                    "wait_for": {"type": "string", "description": "CSS selector to wait for before reading."},
                    "screenshot_path": {"type": "string", "description": "Where to save a PNG, inside the workspace."},
                    "full_page": {"type": "boolean", "description": "Capture the full scrollable page."},
                },
                "required": ["url"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Read a UTF-8 text file from the workspace.",
            "parameters": {
                "type": "object",
                "properties": {"path": {"type": "string"}},
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": "Write or append a UTF-8 text file in the workspace. Parent dirs are created.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "content": {"type": "string"},
                    "mode": {"type": "string", "enum": ["write", "append"]},
                },
                "required": ["path", "content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_files",
            "description": "List files under a workspace directory.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "depth": {"type": "integer", "description": "How deep to recurse, 1-6."},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_ledger",
            "description": (
                "Read the shared record. With no subject you get current state plus open "
                "blockers; with a subject you get that subject's history. This is how you "
                "find out what other roles did — there is no inbox and nobody will message you."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "subject": {
                        "type": "string",
                        "description": "Omit for current state. Give one to read its history.",
                    }
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "write_ledger",
            "description": (
                "Append one entry to the shared record. Use it to record a finding mid-run "
                "that other roles need even if your own run later fails. Entries are "
                "permanent — nothing you write can be edited or removed, by you or anyone."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "subject": {"type": "string", "description": "What this is about: a gate id, a mode name, a file path."},
                    "status": {
                        "type": "string",
                        "enum": ["PASS", "SOFT_CLEAR", "BLOCKED", "REFUSED", "LIVE", "PARKED"],
                        "description": "PASS is checked against the evidence file and downgraded to SOFT_CLEAR if it is missing.",
                    },
                    "note": {"type": "string", "description": "One line, <= 280 chars."},
                    "evidence": {"type": "string", "description": "Workspace path to the artifact proving the claim."},
                    "blocks": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Subjects this entry blocks, if any.",
                    },
                },
                "required": ["subject", "status", "note"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "dispatch",
            "description": (
                "Hand the next piece of work to exactly one role, then stop. Only the PM "
                "has this. You are not sending a message — the role you name will read the "
                "ledger itself, so state the task, not the backstory."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "role": {"type": "string", "description": "The role to run next. It cannot be yourself."},
                    "task": {
                        "type": "string",
                        "description": "One concrete objective, scoped to finish in that role's step budget.",
                    },
                    "rationale": {
                        "type": "string",
                        "description": "Why this, now — one line, read off the ledger state.",
                    },
                },
                "required": ["role", "task"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "finish",
            "description": (
                "End your run and report the result. Call this exactly once, when the task "
                "is done or you are blocked. Cite evidence: a file you actually produced."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "summary": {"type": "string", "description": "What you did, in a few sentences."},
                    "status": {
                        "type": "string",
                        "enum": ["PASS", "SOFT_CLEAR", "BLOCKED", "REFUSED", "LIVE", "PARKED"],
                        "description": (
                            "PASS only with an evidence file that exists — it is checked. "
                            "SOFT_CLEAR if it looks right but you did not verify it independently."
                        ),
                    },
                    "subject": {"type": "string", "description": "What this was about: a gate id, a mode name, a file path."},
                    "evidence": {"type": "string", "description": "Workspace path to the artifact proving the claim."},
                    "note": {"type": "string", "description": "One line for the ledger, <= 280 chars."},
                    "blocks": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Subjects this result blocks, if any.",
                    },
                },
                "required": ["summary", "status"],
            },
        },
    },
]

TOOL_NAMES: set[str] = {s["function"]["name"] for s in TOOL_SCHEMAS}

# Tools that mutate the workspace. Used by the registry to sanity-check roles.
MUTATING_TOOLS: set[str] = {"write_file", "execute_bash"}

# Tools the agent handles in-process rather than forwarding to the sandbox.
# The ledger lives beside the loop, not behind the containment boundary — it is
# append-only and schema-checked, so it does not need the sandbox's protection,
# and routing it through would let a role reach the ledger with raw file writes.
LOCAL_TOOLS: set[str] = {"read_ledger", "write_ledger", "dispatch", "finish"}

# Every role gets these. A role that cannot read the ledger is blind, one that
# cannot write to it is invisible, and one that cannot finish burns its budget.
ALWAYS_AVAILABLE: set[str] = {"read_ledger", "write_ledger", "finish"}

# Calling either of these ends the run. `dispatch` is the PM's way out:
# it hands work to one role instead of reporting a result.
TERMINAL_TOOLS: set[str] = {"finish", "dispatch"}


def schemas_for(names: Iterable[str]) -> list[dict[str, Any]]:
    """Filter the catalogue down to `names`, preserving catalogue order.

    ALWAYS_AVAILABLE is forced in — read_ledger, write_ledger and finish are
    how a role participates at all, so no role config can drop them.
    """
    wanted = set(names) | ALWAYS_AVAILABLE
    return [s for s in TOOL_SCHEMAS if s["function"]["name"] in wanted]


class ToolError(RuntimeError):
    """A tool call failed in a way the model should see and react to."""


class SandboxClient:
    """Thin HTTP client for the sandbox, scoped to one workspace directory.

    `workspace` is the role's slice of the shared volume. Relative paths from
    the model resolve under it, so a role pointed at /workspace/content cannot
    reach the repo by asking for "src/main.py". The sandbox enforces the outer
    boundary regardless; this is the inner, per-role one.
    """

    def __init__(self, base_url: str, workspace: str = "/workspace", timeout: float = 180.0):
        self.base_url = base_url.rstrip("/")
        self.workspace = workspace.rstrip("/") or "/workspace"
        self._client = httpx.Client(base_url=self.base_url, timeout=timeout)

    # -- plumbing ---------------------------------------------------------

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "SandboxClient":
        return self

    def __exit__(self, *_exc: object) -> None:
        self.close()

    def _post(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        try:
            resp = self._client.post(path, json=payload)
        except httpx.HTTPError as exc:
            raise ToolError(f"sandbox unreachable: {exc}") from exc
        if resp.status_code >= 400:
            detail = resp.text
            try:
                detail = resp.json().get("detail", detail)
            except Exception:
                pass
            raise ToolError(f"sandbox {resp.status_code}: {detail}")
        return resp.json()

    def _scoped(self, path: str | None, default: str | None = None) -> str:
        """Resolve a model-supplied path against this role's workspace."""
        raw = path if path is not None else default
        if raw is None:
            return self.workspace
        if raw.startswith("/"):
            return raw
        return f"{self.workspace}/{raw}"

    def health(self) -> dict[str, Any]:
        resp = self._client.get("/health")
        resp.raise_for_status()
        return resp.json()

    # -- tools ------------------------------------------------------------

    def execute_bash(self, command: str, cwd: str | None = None) -> dict[str, Any]:
        return self._post("/bash", {"command": command, "cwd": self._scoped(cwd, self.workspace)})

    def browse_page(
        self,
        url: str,
        wait_for: str | None = None,
        screenshot_path: str | None = None,
        full_page: bool = False,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {"url": url, "full_page": bool(full_page)}
        if wait_for:
            payload["wait_for"] = wait_for
        if screenshot_path:
            payload["screenshot_path"] = self._scoped(screenshot_path)
        return self._post("/browse", payload)

    def read_file(self, path: str) -> dict[str, Any]:
        return self._post("/file/read", {"path": self._scoped(path)})

    def write_file(self, path: str, content: str, mode: str = "write") -> dict[str, Any]:
        return self._post(
            "/file/write",
            {"path": self._scoped(path), "content": content, "mode": mode},
        )

    def list_files(self, path: str | None = None, depth: int = 2) -> dict[str, Any]:
        return self._post("/file/list", {"path": self._scoped(path, self.workspace), "depth": depth})

    # -- dispatch ---------------------------------------------------------

    def call(self, name: str, args: dict[str, Any]) -> str:
        """Run one tool by name and return a string for the model to read."""
        handlers = {
            "execute_bash": self.execute_bash,
            "browse_page": self.browse_page,
            "read_file": self.read_file,
            "write_file": self.write_file,
            "list_files": self.list_files,
        }
        handler = handlers.get(name)
        if handler is None:
            raise ToolError(f"unknown tool: {name}")
        try:
            result = handler(**args)
        except TypeError as exc:
            raise ToolError(f"bad arguments for {name}: {exc}") from exc
        return _render(name, result)


def _render(name: str, result: dict[str, Any]) -> str:
    """Turn a sandbox response into something compact for the model."""
    if name == "execute_bash":
        parts = [f"exit_code={result.get('exit_code')} ({result.get('duration_s')}s)"]
        if result.get("timed_out"):
            parts.append("TIMED OUT")
        if result.get("stdout"):
            parts.append(f"stdout:\n{result['stdout']}")
        if result.get("stderr"):
            parts.append(f"stderr:\n{result['stderr']}")
        return "\n".join(parts)
    if name == "browse_page":
        head = f"{result.get('status')} {result.get('url')} — {result.get('title')}"
        if result.get("screenshot"):
            head += f"\nscreenshot saved: {result['screenshot']}"
        return f"{head}\n\n{result.get('text', '')}"
    if name == "read_file":
        return result.get("content", "")
    if name == "write_file":
        return f"wrote {result.get('path')} ({result.get('bytes')} bytes)"
    if name == "list_files":
        entries = result.get("entries", [])
        lines = [f"{e['type']:4} {e['path']}" for e in entries]
        return f"{result.get('root')} — {len(entries)} entries\n" + "\n".join(lines)
    return json.dumps(result, indent=2)[:8000]
