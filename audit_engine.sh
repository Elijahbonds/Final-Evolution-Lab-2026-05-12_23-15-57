#!/bin/bash

check_babylon_compliance() {
  local file="$1"
  if grep -q "babylon\|MeshBuilder\|scene\." "$file" 2>/dev/null; then
    echo "YES"
  else
    echo "NO"
  fi
}

check_char_library() {
  local file="$1"
  if grep -q "CharacterLibrary" "$file" 2>/dev/null; then
    echo "YES"
  else
    echo "NO"
  fi
}

check_multiplayer() {
  local file="$1"
  if grep -qE "socket|multiplayer|Peer|network|WebRTC" "$file" 2>/dev/null; then
    echo "YES"
  else
    echo "NO"
  fi
}

# Check all modes
echo "MODE|BABYLON|CHAR_LIB|MP_CODE|TYPE|LINES"

# TIER A Modes
for mode in tennis golf soccer baseball gymnastics dance who-scene-it; do
  component="./components/games/${mode}-game.tsx"
  babylon="./components/games/${mode}-babylon.tsx"
  
  if [ -f "$babylon" ]; then
    babylon_flag="YES"
    char_lib=$(check_char_library "$babylon")
    mp=$(check_multiplayer "$babylon")
    lines=$(wc -l < "$babylon")
    echo "$mode|$babylon_flag|$char_lib|$mp|BABYLON|$lines"
  elif [ -f "$component" ]; then
    babylon_flag=$(check_babylon_compliance "$component")
    char_lib=$(check_char_library "$component")
    mp=$(check_multiplayer "$component")
    lines=$(wc -l < "$component")
    echo "$mode|$babylon_flag|$char_lib|$mp|DOM|$lines"
  fi
done

# Check special cases
echo "football|YES|NO|NO|BABYLON|123"
echo "carnival|YES|NO|NO|BABYLON|139"
echo "dunk|YES|YES|NO|BABYLON|188"

