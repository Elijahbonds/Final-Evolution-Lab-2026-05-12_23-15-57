# Probes

One-off diagnostic scripts from the ship passes (2026-09-03): scene readouts,
console dumps, page-text probes, retired-route checks. They are kept because
each one answered a question the gauntlet could not, and the plan docs cite
them by their old `scripts/_*.mts` paths. None is part of a sweep; the sweep
scripts stay in `scripts/` (`gauntlet.sh`, `gauntlet-play.sh`,
`capture-*.mts`, `prod-serve.sh`). Avatar, map and mocap probes live beside
their pipelines under `scripts/avatar`, `scripts/maps`, `scripts/mocap`.
