"""Model providers.

Two backends, one shape. Every provider takes OpenAI-format messages and tool
schemas and returns:

    {"content": str, "tool_calls": [openai-shaped call, ...]}

The loop in agent.py does not know which provider it is talking to. That is
the whole point of this module: routing a judgment-heavy role to a metered
frontier model and a mechanical one to the local Qwen should change a config
value, not a code path.

The Hermes fallback parser lives on the Ollama path only. Anthropic returns
structured tool_use blocks, so there is nothing to scrape out of prose, and
running the parser there would only create ways to misread a valid response.
"""

from __future__ import annotations

import json
import logging
import time
import uuid
from typing import Any, Protocol

import httpx

from qwen_protocol import SAMPLING, parse_tool_calls

log = logging.getLogger("ai-pc.providers")


class ProviderError(RuntimeError):
    """The model could not be reached or refused the request."""


class Provider(Protocol):
    """What the loop needs from a model backend."""

    name: str

    def chat(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
        model: str,
    ) -> dict[str, Any]:
        ...

    def close(self) -> None:
        ...


# --------------------------------------------------------------------------
# Shared retry. Both providers fail the same way — a transient network error
# or a 5xx — so they retry the same way.
# --------------------------------------------------------------------------

def _with_retries(
    call: Any,
    *,
    attempts: int,
    backoff: float,
    label: str,
) -> Any:
    last: Exception | None = None
    for attempt in range(attempts):
        try:
            return call()
        except Exception as exc:
            last = exc
            if not _retryable(exc) or attempt == attempts - 1:
                raise ProviderError(f"{label}: {exc}") from exc
            sleep_for = backoff ** attempt
            log.warning("%s failed (%s), retrying in %.1fs", label, exc, sleep_for)
            time.sleep(sleep_for)
    raise ProviderError(f"{label}: {last}")


def _retryable(exc: Exception) -> bool:
    """A 4xx that is not 429 will fail again identically; do not spend on it."""
    if isinstance(exc, httpx.HTTPStatusError):
        status = exc.response.status_code
        return status == 429 or status >= 500
    return isinstance(exc, (httpx.TransportError, httpx.TimeoutException))


# --------------------------------------------------------------------------
# Ollama
# --------------------------------------------------------------------------

class OllamaProvider:
    """Local models over Ollama's /api/chat."""

    name = "ollama"

    def __init__(
        self,
        base_url: str,
        timeout: float = 300.0,
        sampling: dict[str, Any] | None = None,
        attempts: int = 3,
        backoff: float = 2.0,
    ):
        self.base_url = base_url.rstrip("/")
        self.sampling = dict(sampling or SAMPLING)
        self.attempts = attempts
        self.backoff = backoff
        self._http = httpx.Client(timeout=timeout)

    def close(self) -> None:
        self._http.close()

    def chat(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
        model: str,
    ) -> dict[str, Any]:
        payload = {
            "model": model,
            "messages": messages,
            "tools": tools,
            "stream": False,
            "options": self.sampling,
        }

        def call() -> dict[str, Any]:
            resp = self._http.post(f"{self.base_url}/api/chat", json=payload)
            resp.raise_for_status()
            return resp.json()

        body = _with_retries(call, attempts=self.attempts, backoff=self.backoff,
                             label="ollama")

        message = body.get("message", {}) or {}
        content = message.get("content", "") or ""
        calls = [_normalize_ollama_call(c) for c in (message.get("tool_calls") or [])]

        # Fallback: quantised checkpoints often write the call into the text
        # instead of returning it structured. Ollama only.
        if not calls:
            content, calls = parse_tool_calls(content)

        return {"content": content, "tool_calls": calls}


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


# --------------------------------------------------------------------------
# Anthropic
# --------------------------------------------------------------------------

ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"


class AnthropicProvider:
    """Frontier models over the Anthropic Messages API.

    Translation happens in both directions so the loop never sees Anthropic's
    shapes: OpenAI messages and function schemas go in, OpenAI-shaped tool
    calls come out.
    """

    name = "anthropic"

    def __init__(
        self,
        api_key: str,
        timeout: float = 300.0,
        max_tokens: int = 4096,
        attempts: int = 3,
        backoff: float = 2.0,
    ):
        if not api_key:
            raise ProviderError("AnthropicProvider needs an API key")
        self.api_key = api_key
        self.max_tokens = max_tokens
        self.attempts = attempts
        self.backoff = backoff
        self._http = httpx.Client(timeout=timeout)

    def close(self) -> None:
        self._http.close()

    def chat(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
        model: str,
    ) -> dict[str, Any]:
        system, converted = to_anthropic_messages(messages)
        payload: dict[str, Any] = {
            "model": model,
            "max_tokens": self.max_tokens,
            "messages": converted,
            "temperature": SAMPLING.get("temperature", 0.2),
        }
        if system:
            payload["system"] = system
        if tools:
            payload["tools"] = to_anthropic_tools(tools)

        def call() -> dict[str, Any]:
            resp = self._http.post(
                ANTHROPIC_URL,
                json=payload,
                headers={
                    "x-api-key": self.api_key,
                    "anthropic-version": ANTHROPIC_VERSION,
                    "content-type": "application/json",
                },
            )
            resp.raise_for_status()
            return resp.json()

        body = _with_retries(call, attempts=self.attempts, backoff=self.backoff,
                             label="anthropic")
        return from_anthropic_response(body)


def to_anthropic_tools(tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """OpenAI function schemas -> Anthropic tool definitions."""
    out = []
    for schema in tools:
        fn = schema.get("function", schema)
        params = fn.get("parameters") or {"type": "object", "properties": {}}
        out.append({
            "name": fn["name"],
            "description": fn.get("description", ""),
            "input_schema": {
                "type": "object",
                "properties": params.get("properties", {}),
                "required": params.get("required", []),
            },
        })
    return out


def to_anthropic_messages(
    messages: list[dict[str, Any]],
) -> tuple[str, list[dict[str, Any]]]:
    """OpenAI messages -> (system, Anthropic messages).

    Three things differ and all three bite:
    - system is a top-level field, not a message
    - tool results are user-turn content blocks, not their own role
    - consecutive same-role turns must be merged, or the API rejects them
    """
    system_parts: list[str] = []
    converted: list[dict[str, Any]] = []

    for message in messages:
        role = message.get("role")

        if role == "system":
            system_parts.append(str(message.get("content", "")))
            continue

        if role == "tool":
            block = {
                "type": "tool_result",
                "tool_use_id": message.get("tool_call_id") or message.get("name", "tool"),
                "content": str(message.get("content", "")),
            }
            _append(converted, "user", [block])
            continue

        if role == "assistant":
            blocks: list[dict[str, Any]] = []
            text = (message.get("content") or "").strip()
            if text:
                blocks.append({"type": "text", "text": text})
            for call in message.get("tool_calls") or []:
                fn = call["function"]
                raw = fn.get("arguments") or "{}"
                try:
                    args = raw if isinstance(raw, dict) else json.loads(raw)
                except json.JSONDecodeError:
                    args = {}
                blocks.append({
                    "type": "tool_use",
                    "id": call.get("id") or f"call_{uuid.uuid4().hex[:8]}",
                    "name": fn["name"],
                    "input": args,
                })
            if blocks:
                _append(converted, "assistant", blocks)
            continue

        # user, or anything unexpected
        content = message.get("content", "")
        if content:
            _append(converted, "user", [{"type": "text", "text": str(content)}])

    return "\n\n".join(p for p in system_parts if p), converted


def _append(messages: list[dict[str, Any]], role: str, blocks: list[dict[str, Any]]) -> None:
    """Add blocks, merging into the previous turn if it has the same role."""
    if messages and messages[-1]["role"] == role:
        messages[-1]["content"].extend(blocks)
    else:
        messages.append({"role": role, "content": blocks})


def from_anthropic_response(body: dict[str, Any]) -> dict[str, Any]:
    """Anthropic content blocks -> the shape the loop expects."""
    text_parts: list[str] = []
    calls: list[dict[str, Any]] = []

    for block in body.get("content") or []:
        kind = block.get("type")
        if kind == "text":
            text_parts.append(block.get("text", ""))
        elif kind == "tool_use":
            calls.append({
                "id": block.get("id") or f"call_{uuid.uuid4().hex[:8]}",
                "type": "function",
                "function": {
                    "name": block.get("name", ""),
                    "arguments": json.dumps(block.get("input") or {}),
                },
            })

    return {"content": "\n".join(p for p in text_parts if p).strip(), "tool_calls": calls}


# --------------------------------------------------------------------------
# Selection
# --------------------------------------------------------------------------

class ProviderPool:
    """Holds one provider per tier and hands out the right one.

    If there is no frontier key, frontier roles run on the local model. That
    is a warning at startup, once, not a crash — a missing optional key should
    degrade the org, not stop it booting.
    """

    def __init__(
        self,
        ollama_url: str,
        local_model: str,
        frontier_model: str,
        frontier_api_key: str | None = None,
        timeout: float = 300.0,
    ):
        self.local_model = local_model
        self.frontier_model = frontier_model
        self._ollama = OllamaProvider(ollama_url, timeout=timeout)
        self._anthropic: AnthropicProvider | None = None
        self.frontier_available = bool(frontier_api_key)

        if frontier_api_key:
            self._anthropic = AnthropicProvider(frontier_api_key, timeout=timeout)
        else:
            log.warning(
                "no frontier API key: frontier roles (%s) will run on the local "
                "model %s. Judgment-heavy roles will be noticeably weaker.",
                "pm, adversarial-qa, vision-guardian, cyber-security", local_model,
            )

    def for_tier(self, tier: str) -> tuple[Provider, str]:
        """Return (provider, model) for a tier, falling back when needed."""
        if tier == "frontier" and self._anthropic is not None:
            return self._anthropic, self.frontier_model
        return self._ollama, self.local_model

    def close(self) -> None:
        self._ollama.close()
        if self._anthropic is not None:
            self._anthropic.close()
