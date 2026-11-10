#!/bin/bash
# dunk-flagship rig: build one page of the esbuild rig (the real ModeHarness, no Next) into $DUNK_RIG/site.
#   DUNK_RIG=<scratch dir> scripts/probes/dunk-flagship/build.sh <name> [app-dir]   →  site/<name>.js + site/<name>.html
# NODE_ENV=development, as /dev/mode. NEVER add --keep-names (docs/DUNK-FLAGSHIP.md §1: it kills Babylon's Draco worker and
# every clip freezes on its first frame). The site's assets are symlinks to this worktree's public/.
set -e
HERE=$(cd "$(dirname "$0")" && pwd); APP=$(cd "$HERE/../../.." && pwd)
R=${DUNK_RIG:?set DUNK_RIG to a scratch directory}; W=${2:-$APP}
mkdir -p "$R/site"
for f in "$APP"/public/*; do ln -sfn "$f" "$R/site/$(basename "$f")"; done
cp "$HERE/entry.ts" "$R/site/entry.ts"; cp "$HERE/index.html" "$R/site/index.html"
cd "$W"
node_modules/.bin/esbuild "$R/site/entry.ts" --bundle --minify --format=iife --platform=browser --target=es2020 --tsconfig=tsconfig.json "--define:process.env.NODE_ENV=\"development\"" "--banner:js=window.process=window.process||{env:{NODE_ENV:\"development\"}};" --loader:.glb=dataurl --loader:.png=dataurl --loader:.jpg=dataurl --loader:.wasm=dataurl --log-level=error --outfile="$R/site/$1.js"
sed "s|/bundle.js|/$1.js|" "$R/site/index.html" > "$R/site/$1.html"
echo "[rig] built $R/site/$1.js from $W"
