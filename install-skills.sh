#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="$(pwd)/.github/skills"
sources=("$SCRIPT_DIR/skills/WORKFLOW.md")

for skill_dir in "$SCRIPT_DIR/skills/"*/; do
  [ -f "$skill_dir/SKILL.md" ] || continue
  sources+=("${skill_dir%/}")
done

for source in "${sources[@]}"; do
  target="$TARGET_DIR/$(basename "$source")"
  if [ -e "$target" ] || [ -L "$target" ]; then
    echo "Chemin deja occupe, conserve sans modification : $target" >&2
    exit 1
  fi
done

mkdir -p "$TARGET_DIR"
for source in "${sources[@]}"; do
  cp -R "$source" "$TARGET_DIR/"
done

echo "Skills et contrat commun copies dans $TARGET_DIR"
