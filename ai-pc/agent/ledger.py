"""The ledger: append-only shared state, and the only thing roles say to
each other.

Roles do not message each other. A role reads the ledger to learn where things
stand and appends one entry to record what it did. That is the whole protocol.
The two problems this replaces — relay chatter that re-reads context on every
hop, and a status vocabulary that drifts because it lives in prose — both come
from state living in conversation. Here it lives in a file with a schema.

Append-only is load-bearing. There is no update path and no delete path in
this module, so no role can rewrite another role's verdict. What QA refused
stays refused in the record even after it is fixed; the fix is a later entry,
not an edit.

The evidence rule is the other load-bearing part. PASS requires an evidence
file that actually exists on disk. If it does not, the entry is written as
SOFT_CLEAR with the reason in its note. A model claiming success it cannot
show is the failure mode that costs the most time, and no prompt reliably
prevents it — so it is enforced here, at the write, where it cannot be talked
out of.
"""

from __future__ import annotations

import fnmatch
import json
import logging
import os
import time
from enum import Enum
from pathlib import Path
from typing import Any, Iterable, Iterator, Sequence

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

log = logging.getLogger("ai-pc.ledger")

NOTE_LIMIT = 280
DEFAULT_LEDGER_PATH = Path(os.environ.get("STATE_DIR", "/state")) / "ledger.jsonl"
DEFAULT_EVIDENCE_ROOT = Path(os.environ.get("WORKSPACE_ROOT", "/workspace"))


class Status(str, Enum):
    PASS = "PASS"              # verified, evidence attached
    SOFT_CLEAR = "SOFT_CLEAR"  # looks right, not independently verified
    BLOCKED = "BLOCKED"        # cannot proceed, reason in note
    REFUSED = "REFUSED"        # QA rejected it
    LIVE = "LIVE"              # running / deployed right now
    PARKED = "PARKED"          # deliberately deferred


#: Statuses that stop downstream work. open_blockers() reports these.
BLOCKING_STATUSES: frozenset[Status] = frozenset({Status.BLOCKED, Status.REFUSED})


class LedgerEntry(BaseModel):
    """One thing a role did. Validated on the way in; never edited after."""

    model_config = ConfigDict(extra="forbid", use_enum_values=False)

    ts: float = Field(default=0.0)      # stamped by append(), not by the model
    run_id: str = Field(default="", max_length=64)
    role: str = Field(min_length=1, max_length=64)
    subject: str = Field(min_length=1, max_length=200)
    status: Status
    evidence: str | None = None
    note: str = ""
    blocks: list[str] = Field(default_factory=list)

    @field_validator("note", mode="before")
    @classmethod
    def _cap_note(cls, value: Any) -> str:
        """Truncate rather than reject.

        A chatty note should not cost us the verdict attached to it — the
        status is the part that matters, and rejecting the whole entry over
        prose would just lose it.
        """
        text = " ".join(str(value or "").split())
        if len(text) <= NOTE_LIMIT:
            return text
        return text[: NOTE_LIMIT - 1].rstrip() + "…"

    @field_validator("blocks", mode="before")
    @classmethod
    def _clean_blocks(cls, value: Any) -> list[str]:
        if value is None:
            return []
        if isinstance(value, str):
            value = [value]
        return [str(v).strip() for v in value if str(v).strip()][:20]

    def line(self) -> str:
        """Render for a brief or a CLI table."""
        head = f"[{self.status.value}] {self.subject} ({self.role})"
        if self.note:
            head += f" — {self.note}"
        if self.evidence:
            head += f" [{self.evidence}]"
        return head


class Ledger:
    """Append-only JSONL.

    `path` and `evidence_root` are injectable so tests do not need /state or
    /workspace to exist.
    """

    def __init__(
        self,
        path: str | Path | None = None,
        evidence_root: str | Path | None = None,
    ):
        self.path = Path(path) if path else DEFAULT_LEDGER_PATH
        self.evidence_root = Path(evidence_root) if evidence_root else DEFAULT_EVIDENCE_ROOT
        self.path.parent.mkdir(parents=True, exist_ok=True)

    # ----------------------------------------------------------------- write

    def append(self, entry: LedgerEntry) -> LedgerEntry:
        """Validate, stamp, enforce the evidence rule, and write one line.

        Returns the entry as it was actually written, which may differ from
        what was passed in — a PASS without a real artifact comes back as
        SOFT_CLEAR. Callers should report the returned entry, not the one they
        handed over.
        """
        stamped = entry.model_copy(update={"ts": time.time()})
        checked = self._enforce_evidence(stamped)

        payload = checked.model_dump(mode="json")
        with self.path.open("a", encoding="utf-8") as fh:
            _lock(fh)
            try:
                fh.write(json.dumps(payload, separators=(",", ":")) + "\n")
                fh.flush()
                os.fsync(fh.fileno())
            finally:
                _unlock(fh)

        if checked.status is not stamped.status:
            log.warning(
                "ledger: downgraded %s to %s for %s (evidence %r)",
                stamped.status.value, checked.status.value, checked.subject, stamped.evidence,
            )
        return checked

    def _enforce_evidence(self, entry: LedgerEntry) -> LedgerEntry:
        """PASS requires an evidence file that exists inside the workspace.

        Checked at the write boundary rather than in a validator, because a
        caller can build a LedgerEntry directly and the guarantee has to hold
        for every path into the file, not just the convenient one.
        """
        if entry.status is not Status.PASS:
            return entry

        reason = self._evidence_problem(entry.evidence)
        if reason is None:
            return entry

        return entry.model_copy(update={
            "status": Status.SOFT_CLEAR,
            "note": _prefixed(f"[downgraded from PASS: {reason}]", entry.note),
        })

    def _evidence_problem(self, evidence: str | None) -> str | None:
        """None if the evidence path is usable, else a short reason why not."""
        if not evidence or not evidence.strip():
            return "no evidence path given"

        raw = evidence.strip()
        candidate = Path(raw)
        if not candidate.is_absolute():
            candidate = self.evidence_root / candidate

        try:
            resolved = candidate.resolve(strict=False)
            root = self.evidence_root.resolve(strict=False)
        except OSError:
            return f"evidence path unreadable: {_short(raw)}"

        if resolved != root and root not in resolved.parents:
            return f"evidence outside workspace: {_short(raw)}"
        if not resolved.exists():
            return f"evidence not found: {_short(raw)}"
        return None

    # ------------------------------------------------------------------ read

    def entries(self) -> Iterator[LedgerEntry]:
        """Every valid entry, in file order.

        A malformed or schema-violating line is skipped with a warning rather
        than raising. One bad line — a half-written record from a killed
        container, a field from a future version — should not take down every
        read of the ledger.
        """
        if not self.path.exists():
            return
        with self.path.open("r", encoding="utf-8") as fh:
            for lineno, raw in enumerate(fh, start=1):
                raw = raw.strip()
                if not raw:
                    continue
                try:
                    yield LedgerEntry.model_validate_json(raw)
                except (ValidationError, ValueError) as exc:
                    log.warning("ledger: skipping bad line %d: %s", lineno, exc)

    def state(self) -> dict[str, LedgerEntry]:
        """Latest entry per subject, by timestamp then file order."""
        latest: dict[str, LedgerEntry] = {}
        for entry in self.entries():
            current = latest.get(entry.subject)
            if current is None or entry.ts >= current.ts:
                latest[entry.subject] = entry
        return latest

    def open_blockers(self) -> list[LedgerEntry]:
        """Subjects currently BLOCKED or REFUSED.

        Read off state(), not history, so a subject that was refused and later
        passed stops being a blocker.
        """
        blockers = [e for e in self.state().values() if e.status in BLOCKING_STATUSES]
        return sorted(blockers, key=lambda e: e.ts, reverse=True)

    def history(self, subject: str, limit: int = 20) -> list[LedgerEntry]:
        """Up to `limit` most recent entries for one subject, oldest first."""
        matches = [e for e in self.entries() if e.subject == subject]
        return matches[-limit:] if limit > 0 else matches

    # ----------------------------------------------------------------- brief

    def brief(
        self,
        role: str,
        max_chars: int = 3000,
        subjects: Sequence[str] | None = None,
    ) -> str:
        """The context a role gets at dispatch, in place of relayed messages.

        Budget order matters. Open blockers go in first and are never dropped,
        because a role that does not know what is blocked will cheerfully redo
        blocked work. The role's own subjects fill whatever is left, newest
        first, and the tail is cut with a count of what was dropped.

        `subjects` is a list of globs (the registry supplies the role's). None
        means every subject, which is what the PM wants.
        """
        blockers = self.open_blockers()
        state = self.state()

        mine = [
            entry for subject, entry in state.items()
            if _matches(subject, subjects) and entry not in blockers
        ]
        mine.sort(key=lambda e: e.ts, reverse=True)

        header = f"LEDGER BRIEF for {role} — {time.strftime('%Y-%m-%d %H:%M UTC', time.gmtime())}"
        parts: list[str] = [header]
        used = len(header) + 1

        if blockers:
            section = ["", f"OPEN BLOCKERS ({len(blockers)}) — do not redo work these gate:"]
            for entry in blockers:
                section.append(f"  {entry.line()}")
                if entry.blocks:
                    section.append(f"    blocks: {', '.join(entry.blocks)}")
            block_text = "\n".join(section)
            parts.append(block_text)
            used += len(block_text) + 1

        if not mine:
            if not blockers:
                parts.append("\nNothing recorded yet for your subjects. You are first.")
            return "\n".join(parts)

        parts.append("\nCURRENT STATE:")
        used += len("\nCURRENT STATE:") + 1

        shown = 0
        for entry in mine:
            line = f"  {entry.line()}"
            # Reserve room for the "N more" marker so it always fits.
            if used + len(line) + 40 > max_chars:
                break
            parts.append(line)
            used += len(line) + 1
            shown += 1

        remaining = len(mine) - shown
        if remaining > 0:
            parts.append(f"  … {remaining} more subject(s) not shown (read_ledger for the rest)")

        return "\n".join(parts)


# --------------------------------------------------------------------- utils

def _matches(subject: str, patterns: Sequence[str] | None) -> bool:
    """Glob match. None or an empty list means everything."""
    if not patterns:
        return True
    return any(fnmatch.fnmatch(subject, p) for p in patterns)


def _short(text: str, limit: int = 60) -> str:
    return text if len(text) <= limit else "…" + text[-(limit - 1):]


def _prefixed(prefix: str, note: str) -> str:
    """Attach a reason to a note, keeping the reason whole under the cap.

    The downgrade reason is the part a reader needs, so the model's prose is
    what gets cut, not the explanation of why its PASS did not stick.
    """
    if not note:
        return prefix[:NOTE_LIMIT]
    room = NOTE_LIMIT - len(prefix) - 1
    if room <= 0:
        return prefix[:NOTE_LIMIT]
    tail = note if len(note) <= room else note[: room - 1].rstrip() + "…"
    return f"{prefix} {tail}"


def _lock(fh: Any) -> None:
    """Exclusive lock so two concurrent appends cannot interleave a line."""
    try:
        import fcntl

        fcntl.flock(fh.fileno(), fcntl.LOCK_EX)
    except (ImportError, OSError):  # not POSIX, or a filesystem without locks
        pass


def _unlock(fh: Any) -> None:
    try:
        import fcntl

        fcntl.flock(fh.fileno(), fcntl.LOCK_UN)
    except (ImportError, OSError):
        pass


# ------------------------------------------------------------ module default

_default: Ledger | None = None


def default_ledger() -> Ledger:
    """Process-wide ledger at the configured paths."""
    global _default
    if _default is None:
        _default = Ledger()
    return _default


def record(
    role: str,
    subject: str,
    status: Status | str,
    note: str = "",
    evidence: str | None = None,
    blocks: Iterable[str] | None = None,
    run_id: str = "",
    ledger: Ledger | None = None,
) -> LedgerEntry:
    """Build, validate and append in one call. Raises on an unknown status."""
    entry = LedgerEntry(
        run_id=run_id,
        role=role,
        subject=subject,
        status=Status(status),
        evidence=evidence,
        note=note,
        blocks=list(blocks or []),
    )
    return (ledger or default_ledger()).append(entry)
