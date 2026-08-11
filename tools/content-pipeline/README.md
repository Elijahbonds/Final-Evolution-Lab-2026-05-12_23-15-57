# Engineering the Move — Content Pipeline Tool

Single-user internal dashboard for logging builds/events and generating +
tracking "Engineering the Move" content concepts. **Zero coupling to the
FEL game client** — open `index.html` in a browser and it runs.

## Status / requirement flag

Per the build prompt: this is a standalone app **outside** a Claude
artifact, so LLM generation requires a **real Anthropic API key**. The key
is entered once in the UI and stored in this browser's localStorage only
(never committed, never sent anywhere except `api.anthropic.com`). If you'd
prefer zero key handling, port this file's UI into a Claude Artifact — the
same `fetch` works there without a key.

## What it does

1. **Log** — title, feature/event, footage/assets, funnel target, platform.
2. **Generate** — per entry, calls `claude-sonnet-4-6` with the embedded
   "Engineering the Move" prompt (verbatim from the spec) and tables the 3
   returned concepts (name/hook/format/length/CTA/caution).
3. **Track** — each concept is a card: Idea → Filmed → Posted → Archived,
   with funnel + status filters so a neglected funnel is visible.
4. **Guardrails** — the three rules are pinned at the top; concepts with a
   caution flag render amber-bordered until acknowledged.

## Deliberately not built (per spec)

No smart contracts, no revenue-share, no marketplace, no auto-posting, no
multi-user, no game-client integration.
