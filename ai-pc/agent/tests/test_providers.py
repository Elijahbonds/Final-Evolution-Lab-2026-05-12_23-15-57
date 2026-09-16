"""Provider normalization.

The loop must not be able to tell which backend answered. These tests give
both providers the same logical model turn and assert the shape that comes
back is identical.
"""

from __future__ import annotations

import json
from typing import Any

import httpx
import pytest

from providers import (
    AnthropicProvider,
    OllamaProvider,
    ProviderError,
    ProviderPool,
    from_anthropic_response,
    to_anthropic_messages,
    to_anthropic_tools,
)

TOOLS = [{
    "type": "function",
    "function": {
        "name": "execute_bash",
        "description": "Run a command.",
        "parameters": {
            "type": "object",
            "properties": {"command": {"type": "string"}},
            "required": ["command"],
        },
    },
}]

MESSAGES = [
    {"role": "system", "content": "You are a worker."},
    {"role": "user", "content": "Check the disk."},
]

# The same model turn, as each backend would report it.
OLLAMA_BODY = {
    "message": {
        "content": "Checking the disk now.",
        "tool_calls": [{"function": {"name": "execute_bash",
                                     "arguments": {"command": "df -h"}}}],
    }
}
ANTHROPIC_BODY = {
    "content": [
        {"type": "text", "text": "Checking the disk now."},
        {"type": "tool_use", "id": "toolu_1", "name": "execute_bash",
         "input": {"command": "df -h"}},
    ],
    "stop_reason": "tool_use",
}


def stub(provider: Any, body: dict[str, Any], captured: list[httpx.Request] | None = None):
    """Replace a provider's http client with one that always returns `body`."""
    def handler(request: httpx.Request) -> httpx.Response:
        if captured is not None:
            captured.append(request)
        return httpx.Response(200, json=body)

    provider._http = httpx.Client(transport=httpx.MockTransport(handler))
    return provider


def shape(reply: dict[str, Any]) -> dict[str, Any]:
    """Everything about a reply except the ids, which are backend-specific."""
    return {
        "content": reply["content"],
        "tool_calls": [
            {"type": c["type"], "name": c["function"]["name"],
             "arguments": json.loads(c["function"]["arguments"])}
            for c in reply["tool_calls"]
        ],
    }


# -------------------------------------------------------- the required test

def test_both_providers_produce_identical_shapes_for_the_same_call():
    ollama = stub(OllamaProvider("http://ollama:11434"), OLLAMA_BODY)
    anthropic = stub(AnthropicProvider("key-123"), ANTHROPIC_BODY)

    local = ollama.chat(MESSAGES, TOOLS, "qwen2.5:14b")
    frontier = anthropic.chat(MESSAGES, TOOLS, "claude-sonnet-4-6")

    assert shape(local) == shape(frontier)
    assert shape(local) == {
        "content": "Checking the disk now.",
        "tool_calls": [{"type": "function", "name": "execute_bash",
                        "arguments": {"command": "df -h"}}],
    }


def test_both_providers_agree_on_a_text_only_turn():
    ollama = stub(OllamaProvider("http://o"), {"message": {"content": "Just thinking."}})
    anthropic = stub(AnthropicProvider("k"), {"content": [{"type": "text", "text": "Just thinking."}]})

    assert shape(ollama.chat(MESSAGES, TOOLS, "m")) == shape(anthropic.chat(MESSAGES, TOOLS, "m"))


def test_both_providers_agree_on_an_empty_turn():
    ollama = stub(OllamaProvider("http://o"), {"message": {"content": ""}})
    anthropic = stub(AnthropicProvider("k"), {"content": []})

    assert shape(ollama.chat(MESSAGES, TOOLS, "m")) == {"content": "", "tool_calls": []}
    assert shape(anthropic.chat(MESSAGES, TOOLS, "m")) == {"content": "", "tool_calls": []}


def test_both_providers_agree_on_two_calls_in_one_turn():
    ollama = stub(OllamaProvider("http://o"), {"message": {"content": "", "tool_calls": [
        {"function": {"name": "read_file", "arguments": {"path": "a"}}},
        {"function": {"name": "read_file", "arguments": {"path": "b"}}},
    ]}})
    anthropic = stub(AnthropicProvider("k"), {"content": [
        {"type": "tool_use", "id": "t1", "name": "read_file", "input": {"path": "a"}},
        {"type": "tool_use", "id": "t2", "name": "read_file", "input": {"path": "b"}},
    ]})

    assert shape(ollama.chat(MESSAGES, TOOLS, "m")) == shape(anthropic.chat(MESSAGES, TOOLS, "m"))


# ------------------------------------------------------ the Hermes fallback

def test_hermes_fallback_applies_on_the_ollama_path():
    """Quantised checkpoints write the call into the text instead."""
    body = {"message": {"content":
        'Let me look.\n<tool_call>{"name":"execute_bash","arguments":{"command":"df -h"}}</tool_call>'}}
    reply = stub(OllamaProvider("http://o"), body).chat(MESSAGES, TOOLS, "m")

    assert shape(reply) == {
        "content": "Let me look.",
        "tool_calls": [{"type": "function", "name": "execute_bash",
                        "arguments": {"command": "df -h"}}],
    }


def test_hermes_fallback_is_not_applied_on_the_anthropic_path():
    """Anthropic returns structured blocks; scraping its prose would only
    invent calls the model did not make."""
    body = {"content": [{"type": "text", "text":
        '<tool_call>{"name":"execute_bash","arguments":{"command":"rm -rf /"}}</tool_call>'}]}
    reply = stub(AnthropicProvider("k"), body).chat(MESSAGES, TOOLS, "m")

    assert reply["tool_calls"] == []
    assert "tool_call" in reply["content"]


# ---------------------------------------------------------- the translation

def test_system_message_is_lifted_out_of_the_message_list():
    system, messages = to_anthropic_messages(MESSAGES)
    assert system == "You are a worker."
    assert all(m["role"] != "system" for m in messages)


def test_tool_results_become_user_content_blocks():
    _system, messages = to_anthropic_messages([
        {"role": "user", "content": "go"},
        {"role": "assistant", "content": "", "tool_calls": [
            {"id": "c1", "type": "function",
             "function": {"name": "execute_bash", "arguments": '{"command":"ls"}'}}]},
        {"role": "tool", "tool_call_id": "c1", "name": "execute_bash", "content": "a.txt"},
    ])

    assert [m["role"] for m in messages] == ["user", "assistant", "user"]
    assert messages[1]["content"][0]["type"] == "tool_use"
    assert messages[1]["content"][0]["input"] == {"command": "ls"}
    result = messages[2]["content"][0]
    assert result["type"] == "tool_result" and result["tool_use_id"] == "c1"


def test_consecutive_same_role_turns_are_merged():
    """The API rejects two user turns in a row; parallel tool results would
    otherwise produce exactly that."""
    _system, messages = to_anthropic_messages([
        {"role": "tool", "tool_call_id": "c1", "content": "one"},
        {"role": "tool", "tool_call_id": "c2", "content": "two"},
    ])

    assert len(messages) == 1
    assert len(messages[0]["content"]) == 2


def test_assistant_turn_with_unparseable_arguments_survives():
    _system, messages = to_anthropic_messages([
        {"role": "assistant", "content": "", "tool_calls": [
            {"id": "c1", "type": "function",
             "function": {"name": "execute_bash", "arguments": "{not json"}}]},
    ])
    assert messages[0]["content"][0]["input"] == {}


def test_tool_schemas_are_translated():
    translated = to_anthropic_tools(TOOLS)
    assert translated == [{
        "name": "execute_bash",
        "description": "Run a command.",
        "input_schema": {"type": "object",
                         "properties": {"command": {"type": "string"}},
                         "required": ["command"]},
    }]


def test_anthropic_response_without_content_is_handled():
    assert from_anthropic_response({}) == {"content": "", "tool_calls": []}


def test_anthropic_request_carries_auth_and_version_headers():
    captured: list[httpx.Request] = []
    provider = stub(AnthropicProvider("key-123"), ANTHROPIC_BODY, captured)
    provider.chat(MESSAGES, TOOLS, "claude-sonnet-4-6")

    request = captured[0]
    assert request.headers["x-api-key"] == "key-123"
    assert request.headers["anthropic-version"]
    body = json.loads(request.content)
    assert body["system"] == "You are a worker."
    assert body["model"] == "claude-sonnet-4-6"


# ------------------------------------------------------------------ retries

def test_a_4xx_is_not_retried():
    """A 400 will fail again identically — spending three attempts on it just
    delays the error."""
    attempts = {"n": 0}

    def handler(_request: httpx.Request) -> httpx.Response:
        attempts["n"] += 1
        return httpx.Response(400, json={"error": "bad request"})

    provider = OllamaProvider("http://o")
    provider._http = httpx.Client(transport=httpx.MockTransport(handler))

    with pytest.raises(ProviderError):
        provider.chat(MESSAGES, TOOLS, "m")
    assert attempts["n"] == 1


def test_a_5xx_is_retried_then_raises():
    attempts = {"n": 0}

    def handler(_request: httpx.Request) -> httpx.Response:
        attempts["n"] += 1
        return httpx.Response(503)

    provider = OllamaProvider("http://o", attempts=3, backoff=1.0)
    provider._http = httpx.Client(transport=httpx.MockTransport(handler))

    with pytest.raises(ProviderError):
        provider.chat(MESSAGES, TOOLS, "m")
    assert attempts["n"] == 3


def test_anthropic_provider_needs_a_key():
    with pytest.raises(ProviderError):
        AnthropicProvider("")


# --------------------------------------------------------------------- pool

def test_pool_routes_by_tier_when_a_key_is_present():
    pool = ProviderPool("http://o", "qwen", "claude-sonnet-4-6", frontier_api_key="k")
    assert pool.frontier_available

    provider, model = pool.for_tier("frontier")
    assert provider.name == "anthropic" and model == "claude-sonnet-4-6"

    provider, model = pool.for_tier("local")
    assert provider.name == "ollama" and model == "qwen"
    pool.close()


def test_pool_falls_back_to_local_without_a_key(caplog):
    """A missing optional key degrades the org; it never stops it booting."""
    with caplog.at_level("WARNING"):
        pool = ProviderPool("http://o", "qwen", "claude-sonnet-4-6", frontier_api_key=None)

    assert not pool.frontier_available
    provider, model = pool.for_tier("frontier")
    assert provider.name == "ollama" and model == "qwen"
    assert "no frontier API key" in caplog.text
    pool.close()


def test_pool_warns_once_at_startup_not_per_dispatch(caplog):
    pool = ProviderPool("http://o", "qwen", "claude-sonnet-4-6", frontier_api_key=None)
    caplog.clear()  # drop the one startup warning we expect

    with caplog.at_level("WARNING"):
        for _ in range(5):
            pool.for_tier("frontier")

    assert "no frontier API key" not in caplog.text
    pool.close()
