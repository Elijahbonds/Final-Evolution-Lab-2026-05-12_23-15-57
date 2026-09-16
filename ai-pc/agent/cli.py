#!/usr/bin/env python3
"""Command line for the AI Personal Computer.

    python cli.py roles
    python cli.py run build "mount VelocityKart"
    python cli.py mission "get Gate 0 to PASS with evidence"
    python cli.py ledger
    python cli.py ledger --subject gate-0
    python cli.py blockers

`roles`, `ledger` and `blockers` are local reads and work anywhere the role
files and the state directory are readable. `run` and `mission` need the
sandbox and a model, which live on the compose network — from the host, run
them through the agent container:

    docker compose exec agent python cli.py run ops "report disk usage"

The CLI checks reachability before spending a model call and says exactly that
if it cannot get there.
"""

from __future__ import annotations

import argparse
import json
import os
import shlex
import sys
import time
from pathlib import Path
from typing import Any, Iterable

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent))

from agent import Agent, AgentConfig, AgentEvent  # noqa: E402
from ledger import Ledger, LedgerEntry, Status  # noqa: E402
from orchestrator import Orchestrator  # noqa: E402
from registry import Registry, RoleError  # noqa: E402

# ------------------------------------------------------------------ colours

COLOUR = sys.stdout.isatty() and os.environ.get("NO_COLOR") is None

C = {
    "reset": "\033[0m", "dim": "\033[2m", "bold": "\033[1m",
    "grey": "\033[90m", "red": "\033[31m", "green": "\033[32m",
    "yellow": "\033[33m", "blue": "\033[34m", "magenta": "\033[35m",
    "cyan": "\033[36m",
}

STATUS_COLOUR = {
    Status.PASS: "green",
    Status.SOFT_CLEAR: "cyan",
    Status.BLOCKED: "yellow",
    Status.REFUSED: "red",
    Status.LIVE: "blue",
    Status.PARKED: "grey",
}

EVENT_COLOUR = {
    "step": "grey", "model": "blue", "tool_call": "magenta",
    "tool_result": "grey", "ledger": "cyan", "dispatch": "bold",
    "finish": "green", "warning": "yellow", "error": "red", "mission": "bold",
}


def paint(text: str, colour: str) -> str:
    if not COLOUR or colour not in C:
        return text
    return f"{C[colour]}{text}{C['reset']}"


def status_text(status: Status | str) -> str:
    value = status.value if isinstance(status, Status) else str(status)
    try:
        colour = STATUS_COLOUR[Status(value)]
    except ValueError:
        colour = "grey"
    return paint(f"{value:<11}", colour)


# ------------------------------------------------------------------ helpers

def make_config(args: argparse.Namespace) -> AgentConfig:
    config = AgentConfig()
    if getattr(args, "state_dir", None):
        config.state_dir = args.state_dir
    if getattr(args, "workspace", None):
        config.workspace = args.workspace
    return config


def make_ledger(args: argparse.Namespace) -> Ledger:
    config = make_config(args)
    return Ledger(path=Path(config.state_dir) / "ledger.jsonl",
                  evidence_root=Path(config.workspace))


def preflight(config: AgentConfig, argv: list[str] | None = None) -> None:
    """Fail before spending a model call, with the fix in the message."""
    problems = []
    for label, url, probe in (
        ("sandbox", config.sandbox_url, "/health"),
        ("ollama", config.ollama_url, "/api/tags"),
    ):
        try:
            httpx.get(f"{url.rstrip('/')}{probe}", timeout=5.0).raise_for_status()
        except Exception as exc:
            problems.append(f"  {label:8} {url}  ({type(exc).__name__})")

    if not problems:
        return

    print(paint("Cannot reach the stack:", "red"), file=sys.stderr)
    print("\n".join(problems), file=sys.stderr)
    print(
        "\nThese live on the compose network. From the host, run the command "
        "inside the agent container:\n"
        f"  docker compose exec agent python cli.py "
        f"{shlex.join(argv if argv is not None else sys.argv[1:])}\n"
        "\nOr point the CLI somewhere else with SANDBOX_URL and OLLAMA_URL.",
        file=sys.stderr,
    )
    raise SystemExit(2)


def render_event(event: AgentEvent) -> None:
    """One line per event, or a short block for the ones worth reading."""
    data = event.data
    colour = EVENT_COLOUR.get(event.kind, "reset")
    stamp = paint(time.strftime("%H:%M:%S"), "grey")

    if event.kind == "step":
        if data.get("phase") == "start":
            tier = paint(f"[{data['tier']}]", "grey")
            head = paint("▶ " + data["role"], "bold")
            model = paint(data["model"], "grey")
            where = paint(data["workspace"], "grey")
            print(f"\n{stamp} {head} {tier} {model} · {len(data['tools'])} tools · {where}")
            print(f"{stamp} {paint('task', 'grey')} {_indent(data['task'], limit=400)}")
        elif COLOUR:
            # A transient counter only makes sense on a terminal. Piped or
            # redirected, \r just runs this line into the next one.
            print(f"{stamp} {paint('step ' + str(data['step']), 'grey')}",
                  end="\r", flush=True)
        return

    if event.kind == "model":
        print(f"{stamp} {paint('think', colour)} {_indent(data.get('content', ''))}")
    elif event.kind == "tool_call":
        print(f"{stamp} {paint('call ', colour)} {paint(data['tool'], 'bold')} "
              f"{paint(_compact(data.get('args', {})), 'grey')}")
    elif event.kind == "tool_result":
        print(f"{stamp} {paint('  ->  ', colour)}{_indent(data.get('result', ''), limit=600)}")
    elif event.kind == "ledger":
        flag = paint(" DOWNGRADED", "yellow") if data.get("downgraded") else ""
        print(f"{stamp} {paint('ledger', colour)} {status_text(data['status'])} "
              f"{data['subject']}{flag}")
        if data.get("note"):
            print(f"{'':8} {paint(data['note'], 'grey')}")
    elif event.kind == "dispatch":
        print(f"{stamp} {paint('dispatch', colour)} → {paint(data['target_role'], 'bold')}: "
              f"{data['task']}")
        if data.get("rationale"):
            print(f"{'':8} {paint(data['rationale'], 'grey')}")
    elif event.kind == "finish":
        claimed = data.get("claimed_status")
        suffix = ""
        if claimed and claimed != data.get("status"):
            suffix = paint(f"  (claimed {claimed})", "yellow")
        print(f"{stamp} {paint('finish', colour)} {status_text(data.get('status', ''))}"
              f"{data.get('subject', '')}{suffix}")
        if data.get("summary"):
            print(f"{'':8} {_indent(data['summary'])}")
    elif event.kind == "warning":
        print(f"{stamp} {paint('warn ', colour)} {data.get('message', '')}")
    elif event.kind == "error":
        print(f"{stamp} {paint('ERROR', colour)} {data.get('reason', '')}: "
              f"{data.get('message', '')}")
    elif event.kind == "mission":
        _render_mission(event, stamp)


def _render_mission(event: AgentEvent, stamp: str) -> None:
    data = event.data
    phase = data.get("phase")
    if phase == "start":
        print(paint(f"\n══ mission {data['mission_id']} ══", "bold"))
        print(f"   {data['objective']}  (max {data['max_rounds']} rounds)")
    elif phase == "dispatch":
        print(paint(f"\n── round {data['round']}: {data['role']} ──", "bold"))
    elif phase == "rejected":
        print(f"{stamp} {paint('rejected', 'yellow')} dispatch to "
              f"{data.get('target_role')!r}: {data['reason']}")
    elif phase == "end":
        outcome = data["outcome"]
        colour = {"done": "green", "halted": "red",
                  "round_cap": "yellow", "pm_failed": "red"}.get(outcome, "reset")
        print(paint(f"\n══ {outcome} after {data['rounds']} round(s) ══", colour))
        if data.get("detail"):
            print(f"   {data['detail']}")
        blockers = data.get("open_blockers") or []
        if blockers:
            print(paint(f"\n   {len(blockers)} open blocker(s):", "yellow"))
            for raw in blockers:
                print(f"     {status_text(raw['status'])}{raw['subject']} "
                      f"{paint('(' + raw['role'] + ')', 'grey')}")
                if raw.get("note"):
                    print(f"       {paint(raw['note'], 'grey')}")


def _indent(text: str, limit: int = 2000, width: int = 8) -> str:
    text = (text or "").strip()
    if len(text) > limit:
        text = text[:limit] + f"… (+{len(text) - limit} chars)"
    lines = text.splitlines() or [""]
    pad = " " * width
    return lines[0] + "".join(f"\n{pad}{line}" for line in lines[1:])


def _compact(args: dict[str, Any], limit: int = 140) -> str:
    text = json.dumps(args, default=str)
    return text if len(text) <= limit else text[:limit] + "…"


def _age(ts: float) -> str:
    seconds = max(0, time.time() - ts)
    for unit, size in (("d", 86400), ("h", 3600), ("m", 60)):
        if seconds >= size:
            return f"{int(seconds // size)}{unit}"
    return f"{int(seconds)}s"


# ----------------------------------------------------------------- commands

def cmd_roles(args: argparse.Namespace) -> int:
    registry = Registry.load()
    frontier = registry.by_tier("frontier")
    local = registry.by_tier("local")

    print(paint(f"\n{len(registry)} roles "
                f"({len(frontier)} frontier, {len(local)} local)\n", "bold"))
    header = f"  {'ROLE':<17}{'TIER':<10}{'TOOLS':<7}{'STEPS':<7}{'WORKSPACE':<22}SUBJECTS"
    print(paint(header, "grey"))

    for group, colour in ((frontier, "magenta"), (local, "cyan")):
        for spec in group:
            subjects = ", ".join(spec.subjects) if spec.subjects else "—"
            print(f"  {spec.name:<17}{paint(f'{spec.tier:<10}', colour)}"
                  f"{len(spec.effective_tools):<7}{spec.max_steps:<7}"
                  f"{spec.workspace:<22}{paint(subjects, 'grey')}")

    if args.verbose:
        for spec in registry.all():
            print(paint(f"\n{spec.name}", "bold"))
            print(f"  {spec.description}")
            print(f"  tools: {', '.join(spec.effective_tools)}")
    print()
    return 0


def cmd_run(args: argparse.Namespace) -> int:
    config = make_config(args)
    preflight(config, getattr(args, 'argv', None))

    agent = Agent(config)
    try:
        for event in agent.run(args.task, role=args.role):
            render_event(event)
    except RoleError as exc:
        print(paint(f"\n{exc}", "red"), file=sys.stderr)
        return 2
    finally:
        agent.close()
    print()
    return 0


def cmd_mission(args: argparse.Namespace) -> int:
    config = make_config(args)
    preflight(config, getattr(args, 'argv', None))

    orchestrator = Orchestrator(config=config)
    outcome = "round_cap"
    try:
        for event in orchestrator.run_mission(args.objective, max_rounds=args.rounds):
            render_event(event)
            if event.kind == "mission" and event.data.get("phase") == "end":
                outcome = event.data["outcome"]
    finally:
        orchestrator.close()
    print()
    return 0 if outcome == "done" else 1


def cmd_ledger(args: argparse.Namespace) -> int:
    ledger = make_ledger(args)

    if args.subject:
        rows = ledger.history(args.subject, limit=args.limit)
        if not rows:
            print(f"\nNo entries for {args.subject!r}.\n")
            return 1
        plural = "entry" if len(rows) == 1 else "entries"
        print(paint(f"\n{args.subject} — {len(rows)} {plural}, oldest first\n", "bold"))
        print(paint(f"  {'WHEN':<18}{'STATUS':<11}{'ROLE':<17}NOTE", "grey"))
        for entry in rows:
            when = time.strftime("%m-%d %H:%M", time.localtime(entry.ts))
            print(f"  {when:<18}{status_text(entry.status)}{entry.role:<17}{entry.note}")
            if entry.evidence:
                print(f"  {'':<46}{paint(entry.evidence, 'grey')}")
        print()
        return 0

    state = ledger.state()
    if not state:
        print("\nLedger is empty.\n")
        return 0

    rows = sorted(state.values(), key=lambda e: e.ts, reverse=True)
    if args.status:
        wanted = {s.upper() for s in args.status}
        rows = [r for r in rows if r.status.value in wanted]

    plural = "subject" if len(rows) == 1 else "subjects"
    print(paint(f"\n{len(rows)} {plural}\n", "bold"))
    print(paint(f"  {'STATUS':<11}{'SUBJECT':<30}{'ROLE':<17}{'AGE':<7}NOTE", "grey"))
    for entry in rows:
        note = entry.note if len(entry.note) <= 60 else entry.note[:59] + "…"
        print(f"  {status_text(entry.status)}{entry.subject:<30}{entry.role:<17}"
              f"{_age(entry.ts):<7}{paint(note, 'grey')}")
    print()
    return 0


def cmd_blockers(args: argparse.Namespace) -> int:
    ledger = make_ledger(args)
    blockers = ledger.open_blockers()

    if not blockers:
        print(paint("\nNo open blockers.\n", "green"))
        return 0

    print(paint(f"\n{len(blockers)} open blocker(s)\n", "yellow"))
    for entry in blockers:
        print(f"  {status_text(entry.status)}{paint(entry.subject, 'bold')} "
              f"{paint(f'({entry.role}, {_age(entry.ts)} ago)', 'grey')}")
        if entry.note:
            print(f"    {entry.note}")
        if entry.blocks:
            print(f"    {paint('blocks: ' + ', '.join(entry.blocks), 'grey')}")
    print()
    return 1  # non-zero so a script can gate on it


# -------------------------------------------------------------------- parser

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="cli.py",
        description="Drive the AI Personal Computer: roles, runs, missions, ledger.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--state-dir", help="Where ledger.jsonl lives. Default: $STATE_DIR")
    parser.add_argument("--workspace", help="Evidence root. Default: $WORKSPACE_ROOT")

    sub = parser.add_subparsers(dest="command", required=True)

    p_roles = sub.add_parser("roles", help="List roles, tier and tool count.")
    p_roles.add_argument("-v", "--verbose", action="store_true",
                         help="Also print each role's description and tools.")
    p_roles.set_defaults(func=cmd_roles)

    p_run = sub.add_parser("run", help="Run one role against one task.")
    p_run.add_argument("role")
    p_run.add_argument("task")
    p_run.set_defaults(func=cmd_run)

    p_mission = sub.add_parser("mission", help="Let the PM drive until done.")
    p_mission.add_argument("objective")
    p_mission.add_argument("-n", "--rounds", type=int, default=8,
                           help="Maximum rounds. Default: 8")
    p_mission.set_defaults(func=cmd_mission)

    p_ledger = sub.add_parser("ledger", help="Current state, or one subject's history.")
    p_ledger.add_argument("--subject", help="Show this subject's history instead.")
    p_ledger.add_argument("--limit", type=int, default=20, help="History rows. Default: 20")
    p_ledger.add_argument("--status", nargs="+", help="Filter current state by status.")
    p_ledger.set_defaults(func=cmd_ledger)

    p_blockers = sub.add_parser("blockers", help="Everything BLOCKED or REFUSED.")
    p_blockers.set_defaults(func=cmd_blockers)

    return parser


def main(argv: Iterable[str] | None = None) -> int:
    raw = list(argv) if argv is not None else sys.argv[1:]
    args = build_parser().parse_args(raw)
    args.argv = raw  # so preflight can echo the exact command back
    try:
        return args.func(args)
    except RoleError as exc:
        print(paint(f"\n{exc}\n", "red"), file=sys.stderr)
        return 2
    except BrokenPipeError:
        # `cli.py roles | head` closes the pipe early. Point stdout at
        # /dev/null so the interpreter's own flush at exit does not print a
        # second traceback on the way out.
        devnull = os.open(os.devnull, os.O_WRONLY)
        os.dup2(devnull, sys.stdout.fileno())
        return 0
    except KeyboardInterrupt:
        print(paint("\ninterrupted\n", "grey"), file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
