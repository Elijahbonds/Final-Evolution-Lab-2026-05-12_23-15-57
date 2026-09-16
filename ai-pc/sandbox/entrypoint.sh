#!/usr/bin/env bash
set -euo pipefail

: "${WORKSPACE_ROOT:=/workspace}"

# The workspace is a named volume, so it arrives root-owned on first boot.
# We run as a non-root user; make sure we can actually write to it.
mkdir -p "$WORKSPACE_ROOT"
if [ ! -w "$WORKSPACE_ROOT" ]; then
  echo "sandbox: FATAL $WORKSPACE_ROOT is not writable by $(id -un)" >&2
  exit 1
fi

echo "sandbox: serving on :8080, workspace=$WORKSPACE_ROOT, user=$(id -un)"
exec uvicorn executor:app --host 0.0.0.0 --port 8080 --no-access-log
