"""The role registry.

A role is a config file, not a process. There is one loop; a role swaps the
system prompt, the tool list, the workspace and the budget it runs under.
Nothing here spawns anything.

Everything is validated at startup and failures are loud. A typo in a tool
name should stop the stack at boot, not surface three steps into a mission as
a model confusedly calling a tool that does not exist.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from tools import ALWAYS_AVAILABLE, MUTATING_TOOLS, TOOL_NAMES, schemas_for

log = logging.getLogger("ai-pc.registry")

ROLES_DIR = Path(__file__).parent / "roles"
Tier = Literal["frontier", "local"]


class RoleError(RuntimeError):
    """A role config is wrong. Raised at load time, never at dispatch time."""


class RoleSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=48)
    tier: Tier
    description: str = Field(min_length=1, max_length=400)
    tools: list[str]
    workspace: str = "/workspace"
    subjects: list[str] = Field(default_factory=list)
    max_steps: int = Field(default=16, ge=1, le=100)
    prompt: str = Field(min_length=1)

    @field_validator("name")
    @classmethod
    def _slug(cls, value: str) -> str:
        if not all(c.isalnum() or c == "-" for c in value):
            raise ValueError(f"role name must be a slug (a-z0-9-), got {value!r}")
        return value

    @field_validator("tools")
    @classmethod
    def _known_tools(cls, value: list[str]) -> list[str]:
        """Fail loudly on an unknown tool name.

        This is the check the brief asks for by name. A role listing
        `write_files` instead of `write_file` would otherwise boot fine and
        silently run without the ability to write anything.
        """
        unknown = [t for t in value if t not in TOOL_NAMES]
        if unknown:
            raise ValueError(
                f"unknown tool(s) {unknown}; available: {sorted(TOOL_NAMES)}"
            )
        duplicates = {t for t in value if value.count(t) > 1}
        if duplicates:
            raise ValueError(f"duplicate tool(s) {sorted(duplicates)}")
        return value

    @field_validator("workspace")
    @classmethod
    def _absolute_workspace(cls, value: str) -> str:
        if not value.startswith("/"):
            raise ValueError(f"workspace must be an absolute path, got {value!r}")
        return value.rstrip("/") or "/"

    # -- derived ----------------------------------------------------------

    @property
    def effective_tools(self) -> list[str]:
        """Declared tools plus the ones every role always gets."""
        return [s["function"]["name"] for s in schemas_for(self.tools)]

    @property
    def can_mutate(self) -> bool:
        return bool(set(self.tools) & MUTATING_TOOLS)

    def schemas(self) -> list[dict[str, Any]]:
        return schemas_for(self.tools)


class Registry:
    """Every role, loaded and validated once."""

    def __init__(self, roles: dict[str, RoleSpec]):
        self._roles = roles

    # -- loading ----------------------------------------------------------

    @classmethod
    def load(cls, directory: str | Path | None = None) -> "Registry":
        path = Path(directory) if directory else ROLES_DIR
        if not path.is_dir():
            raise RoleError(f"no roles directory at {path}")

        files = sorted([*path.glob("*.yaml"), *path.glob("*.yml")])
        if not files:
            raise RoleError(f"no role files in {path}")

        roles: dict[str, RoleSpec] = {}
        problems: list[str] = []

        for file in files:
            try:
                raw = yaml.safe_load(file.read_text(encoding="utf-8"))
            except yaml.YAMLError as exc:
                problems.append(f"{file.name}: not valid YAML: {exc}")
                continue
            if not isinstance(raw, dict):
                problems.append(f"{file.name}: expected a mapping at the top level")
                continue

            try:
                spec = RoleSpec(**raw)
            except ValidationError as exc:
                problems.append(f"{file.name}: {_compact(exc)}")
                continue

            if spec.name != file.stem:
                problems.append(
                    f"{file.name}: name is {spec.name!r} but the file is {file.stem!r}; "
                    "keep them the same so `run <role>` is predictable"
                )
                continue
            if spec.name in roles:
                problems.append(f"{file.name}: duplicate role {spec.name!r}")
                continue

            roles[spec.name] = spec

        if problems:
            raise RoleError(
                "role registry failed to load:\n  - " + "\n  - ".join(problems)
            )

        log.info(
            "registry: %d roles (%d frontier, %d local)",
            len(roles),
            sum(1 for r in roles.values() if r.tier == "frontier"),
            sum(1 for r in roles.values() if r.tier == "local"),
        )
        return cls(roles)

    # -- access -----------------------------------------------------------

    def get(self, name: str) -> RoleSpec:
        try:
            return self._roles[name]
        except KeyError:
            raise RoleError(
                f"unknown role {name!r}; available: {', '.join(self.names())}"
            ) from None

    def names(self) -> list[str]:
        return sorted(self._roles)

    def all(self) -> list[RoleSpec]:
        return [self._roles[n] for n in self.names()]

    def by_tier(self, tier: Tier) -> list[RoleSpec]:
        return [r for r in self.all() if r.tier == tier]

    def __len__(self) -> int:
        return len(self._roles)

    def __contains__(self, name: object) -> bool:
        return name in self._roles


_default: Registry | None = None


def default_registry() -> Registry:
    global _default
    if _default is None:
        _default = Registry.load()
    return _default


def _compact(exc: ValidationError) -> str:
    """One readable line per validation error instead of Pydantic's block."""
    bits = []
    for err in exc.errors():
        loc = ".".join(str(p) for p in err["loc"]) or "<root>"
        bits.append(f"{loc}: {err['msg']}")
    return "; ".join(bits)
