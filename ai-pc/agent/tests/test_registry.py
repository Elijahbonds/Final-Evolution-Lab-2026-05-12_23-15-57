"""Registry loading and validation. The point of this module is that a bad
role file stops the stack at boot instead of halfway through a mission."""

from __future__ import annotations

import textwrap
from pathlib import Path

import pytest

from registry import Registry, RoleError, RoleSpec
from tools import ALWAYS_AVAILABLE, TOOL_NAMES

GOOD = """
name: tester
tier: local
description: A role for tests.
tools: [execute_bash, read_file]
workspace: /workspace/test
subjects: ["gate-*"]
max_steps: 5
prompt: |
  Do the thing.
"""


def write_role(directory: Path, filename: str, body: str) -> Path:
    path = directory / filename
    path.write_text(textwrap.dedent(body), encoding="utf-8")
    return path


@pytest.fixture
def roles_dir(tmp_path: Path) -> Path:
    directory = tmp_path / "roles"
    directory.mkdir()
    return directory


# --------------------------------------------------------- loud failure cases

def test_unknown_tool_name_fails_loudly(roles_dir: Path):
    write_role(roles_dir, "tester.yaml", GOOD.replace("read_file", "read_filez"))

    with pytest.raises(RoleError) as exc:
        Registry.load(roles_dir)

    message = str(exc.value)
    assert "read_filez" in message
    assert "tester.yaml" in message
    # The error should say what the caller could have written instead.
    assert "execute_bash" in message


def test_undefined_tier_fails_loudly(roles_dir: Path):
    write_role(roles_dir, "tester.yaml", GOOD.replace("tier: local", "tier: premium"))

    with pytest.raises(RoleError) as exc:
        Registry.load(roles_dir)
    assert "tier" in str(exc.value)


def test_unknown_field_fails_loudly(roles_dir: Path):
    write_role(roles_dir, "tester.yaml", GOOD + "\ntemperature: 0.9\n")

    with pytest.raises(RoleError) as exc:
        Registry.load(roles_dir)
    assert "temperature" in str(exc.value)


def test_name_must_match_filename(roles_dir: Path):
    write_role(roles_dir, "other.yaml", GOOD)

    with pytest.raises(RoleError) as exc:
        Registry.load(roles_dir)
    assert "tester" in str(exc.value) and "other" in str(exc.value)


def test_relative_workspace_fails(roles_dir: Path):
    write_role(roles_dir, "tester.yaml", GOOD.replace("/workspace/test", "workspace/test"))

    with pytest.raises(RoleError) as exc:
        Registry.load(roles_dir)
    assert "absolute" in str(exc.value)


def test_missing_prompt_fails(roles_dir: Path):
    body = GOOD.split("prompt:")[0]
    write_role(roles_dir, "tester.yaml", body)

    with pytest.raises(RoleError):
        Registry.load(roles_dir)


def test_broken_yaml_fails_loudly(roles_dir: Path):
    write_role(roles_dir, "tester.yaml", "name: tester\n  tier: [unclosed\n")

    with pytest.raises(RoleError) as exc:
        Registry.load(roles_dir)
    assert "tester.yaml" in str(exc.value)


def test_every_problem_is_reported_not_just_the_first(roles_dir: Path):
    write_role(roles_dir, "one.yaml", GOOD.replace("name: tester", "name: one")
               .replace("read_file", "nope_tool"))
    write_role(roles_dir, "two.yaml", GOOD.replace("name: tester", "name: two")
               .replace("tier: local", "tier: nonsense"))

    with pytest.raises(RoleError) as exc:
        Registry.load(roles_dir)
    assert "one.yaml" in str(exc.value)
    assert "two.yaml" in str(exc.value)


def test_empty_directory_fails(roles_dir: Path):
    with pytest.raises(RoleError):
        Registry.load(roles_dir)


def test_missing_directory_fails(tmp_path: Path):
    with pytest.raises(RoleError):
        Registry.load(tmp_path / "nope")


def test_unknown_role_lookup_lists_what_exists(roles_dir: Path):
    write_role(roles_dir, "tester.yaml", GOOD)
    registry = Registry.load(roles_dir)

    with pytest.raises(RoleError) as exc:
        registry.get("nobody")
    assert "tester" in str(exc.value)


# ------------------------------------------------------------- happy path

def test_loads_a_valid_role(roles_dir: Path):
    write_role(roles_dir, "tester.yaml", GOOD)
    registry = Registry.load(roles_dir)

    spec = registry.get("tester")
    assert spec.tier == "local"
    assert spec.max_steps == 5
    assert spec.subjects == ["gate-*"]
    assert "tester" in registry


def test_always_available_tools_are_added(roles_dir: Path):
    write_role(roles_dir, "tester.yaml", GOOD)
    spec = Registry.load(roles_dir).get("tester")

    assert ALWAYS_AVAILABLE <= set(spec.effective_tools)
    # …but not tools it never asked for.
    assert "write_file" not in spec.effective_tools


# ------------------------------------------------- the ten shipped roles

def test_shipped_registry_has_ten_roles():
    registry = Registry.load()
    assert len(registry) == 10


def test_shipped_tiers_are_as_designed():
    registry = Registry.load()
    assert {r.name for r in registry.by_tier("frontier")} == {
        "pm", "adversarial-qa", "vision-guardian", "cyber-security"
    }
    assert {r.name for r in registry.by_tier("local")} == {
        "build", "playtest", "benchmark", "asset-pipeline", "content", "ops"
    }


def test_build_is_the_only_writer_in_the_repo_workspace():
    registry = Registry.load()
    repo_writers = [
        r.name for r in registry.all()
        if "write_file" in r.tools and r.workspace == "/workspace/fel"
    ]
    assert repo_writers == ["build"]


def test_qa_cannot_edit_what_it_audits():
    """QA with write access to the code it is auditing is not QA."""
    spec = Registry.load().get("adversarial-qa")
    assert "write_file" not in spec.effective_tools


def test_content_is_isolated_from_the_repo():
    spec = Registry.load().get("content")
    assert spec.workspace == "/workspace/content"
    assert "execute_bash" not in spec.effective_tools


def test_pm_cannot_write_code():
    spec = Registry.load().get("pm")
    assert "write_file" not in spec.effective_tools
    assert "execute_bash" not in spec.effective_tools


def test_only_the_pm_can_dispatch():
    registry = Registry.load()
    assert [r.name for r in registry.all() if "dispatch" in r.effective_tools] == ["pm"]


def test_every_shipped_role_declares_known_tools():
    for spec in Registry.load().all():
        assert set(spec.tools) <= TOOL_NAMES


def test_every_shipped_role_has_a_behavioural_prompt():
    """Each prompt should say what the role refuses to do, not just its job."""
    for spec in Registry.load().all():
        assert "Refuse to:" in spec.prompt, f"{spec.name} has no refusal clause"


def test_role_spec_rejects_a_duplicate_tool():
    with pytest.raises(ValueError):
        RoleSpec(name="x", tier="local", description="d",
                 tools=["read_file", "read_file"], prompt="p")
