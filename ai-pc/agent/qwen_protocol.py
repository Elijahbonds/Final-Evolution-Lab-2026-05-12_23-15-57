"""Qwen/Hermes specifics: the base system prompt, sampling, and the fallback
parser for models that emit tool calls as text instead of structured JSON.

Only the Ollama path needs the parser. Anthropic returns structured tool_use
blocks, so providers.py never calls parse_tool_calls() on that path.
"""

from __future__ import annotations

import json
import re
from typing import Any

# --------------------------------------------------------------------------
# Sampling. Low temperature on purpose: this loop is doing engineering work,
# not brainstorming, and a creative tool-call argument is just a bug.
# --------------------------------------------------------------------------

SAMPLING: dict[str, Any] = {
    "temperature": 0.2,
    "top_p": 0.9,
    "top_k": 40,
    "repeat_penalty": 1.05,
    "num_ctx": 32768,
}

# --------------------------------------------------------------------------
# Base system prompt. Every role appends to this; nothing replaces it.
# --------------------------------------------------------------------------

BASE_SYSTEM_PROMPT = """\
You are a worker inside an AI Personal Computer: a small, self-hosted org where
each worker has one role, one workspace, and one shared record of truth.

How this works:
- You act by calling tools. You do not have a shell or a browser of your own —
  every action goes through the sandbox, and only the tools listed for your
  role exist for you.
- You cannot message another worker. There is no inbox, no relay, no handoff
  chat. If you need to know what someone else did, read the ledger. If you
  need someone else to know what you did, write to the ledger.
- You call `finish` exactly once, at the end, with a status and evidence.

About evidence, because this is the part workers get wrong:
A claim without an artifact is not a result. If you say something passes, name
the file that proves it — a test log you produced, a screenshot you captured, a
build output you can point at. The ledger checks that the file exists. If it
does not, your PASS is recorded as SOFT_CLEAR and everyone downstream will see
that you claimed more than you showed. Reporting SOFT_CLEAR honestly costs you
nothing. Reporting PASS you cannot back costs the whole org a cycle.

Work in small steps. Run the thing, read the output, then decide. Do not
predict what a command would print — run it. Do not describe a fix you have
not applied. If you are blocked, stop early and say exactly what blocked you;
a fast BLOCKED is worth more than a slow guess.
"""

# --------------------------------------------------------------------------
# Hermes-style tool call parsing.
#
# Qwen2.5-Instruct emits calls as <tool_call>{"name":...,"arguments":{...}}
# </tool_call>. Ollama's /api/chat returns them structured when the model
# cooperates, and inline in `content` when it does not. This is the fallback.
# --------------------------------------------------------------------------

_TOOL_CALL_RE = re.compile(r"<tool_call>\s*(.*?)\s*</tool_call>", re.DOTALL)
# Some quantised checkpoints drop the closing tag on the final call.
_UNCLOSED_RE = re.compile(r"<tool_call>\s*(\{.*)\Z", re.DOTALL)
# Others wrap it in a fenced block and skip the tags entirely.
_FENCED_RE = re.compile(r"```(?:json|tool_call)\s*(\{.*?\})\s*```", re.DOTALL)


def parse_tool_calls(content: str) -> tuple[str, list[dict[str, Any]]]:
    """Split raw model text into (prose, tool_calls).

    Returns calls in OpenAI shape so the loop handles both providers the same
    way. Anything that does not parse as a call is left in the prose — losing
    the model's reasoning because one brace was wrong helps nobody.
    """
    if not content:
        return "", []

    calls: list[dict[str, Any]] = []
    spans: list[tuple[int, int]] = []

    for match in _TOOL_CALL_RE.finditer(content):
        parsed = _coerce(match.group(1))
        if parsed:
            calls.append(parsed)
            spans.append(match.span())

    if not calls:
        for match in _FENCED_RE.finditer(content):
            parsed = _coerce(match.group(1))
            if parsed and "name" in parsed.get("function", {}):
                calls.append(parsed)
                spans.append(match.span())

    if not calls:
        match = _UNCLOSED_RE.search(content)
        if match:
            parsed = _coerce(match.group(1))
            if parsed:
                calls.append(parsed)
                spans.append(match.span())

    prose = content
    for start, end in reversed(spans):
        prose = prose[:start] + prose[end:]

    return prose.strip(), calls


def _coerce(blob: str) -> dict[str, Any] | None:
    """Parse one call body into OpenAI tool_call shape, or None."""
    blob = blob.strip()
    if not blob:
        return None

    data = _loads_forgiving(blob)
    if not isinstance(data, dict):
        return None

    name = data.get("name") or data.get("function")
    if isinstance(name, dict):  # already OpenAI-shaped
        name = name.get("name")
    if not isinstance(name, str) or not name:
        return None

    args = data.get("arguments", data.get("parameters", data.get("args", {})))
    if isinstance(args, str):
        args = _loads_forgiving(args) or {}
    if not isinstance(args, dict):
        args = {}

    return {
        "id": f"call_{abs(hash(blob)) % 10**10}",
        "type": "function",
        "function": {"name": name, "arguments": json.dumps(args)},
    }


def _loads_forgiving(blob: str) -> Any:
    """json.loads, then one attempt at the trailing-garbage case."""
    try:
        return json.loads(blob)
    except json.JSONDecodeError:
        pass
    # A common failure is a valid object followed by the model's next sentence.
    decoder = json.JSONDecoder()
    try:
        value, _end = decoder.raw_decode(blob)
        return value
    except json.JSONDecodeError:
        return None


def render_tool_catalogue(schemas: list[dict[str, Any]]) -> str:
    """Describe the available tools in the system prompt.

    Ollama passes tools natively, but small quantised models follow an
    in-prompt listing far more reliably than the API-level one alone.
    """
    lines = ["Tools available to you:"]
    for schema in schemas:
        fn = schema["function"]
        params = fn.get("parameters", {}).get("properties", {})
        required = set(fn.get("parameters", {}).get("required", []))
        sig = ", ".join(
            f"{k}{'' if k in required else '?'}" for k in params
        )
        lines.append(f"- {fn['name']}({sig}): {fn['description']}")
    lines.append(
        "\nEmit a call as: <tool_call>{\"name\": \"tool_name\", "
        "\"arguments\": {...}}</tool_call>"
    )
    return "\n".join(lines)
