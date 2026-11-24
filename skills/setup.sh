#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOLS_ROOT="$(dirname "$SCRIPT_DIR")"
PARENT_DIR="$(dirname "$TOOLS_ROOT")"
TARGET_REPO="$PARENT_DIR/orme-prescription"
COPILOT_SKILLS_DIR="$HOME/.copilot/skills"

if ! git -C "$TARGET_REPO" rev-parse --git-dir >/dev/null 2>&1; then
  echo "orme-prescription introuvable ou non versionne dans $PARENT_DIR" >&2
  exit 1
fi

check_link() {
  local source="$1" target="$2" current
  if [ -L "$target" ]; then
    current="$(readlink "$target")"
    if [ "${current%/}" = "${source%/}" ]; then
      return
    fi
  elif [ ! -e "$target" ]; then
    return
  fi
  echo "Chemin deja occupe, conserve sans modification : $target" >&2
  return 1
}

create_link() {
  local source="$1" target="$2"
  if [ ! -L "$target" ]; then
    ln -s "$source" "$target"
    echo "Lien cree : $target -> $source"
  fi
}

check_link "$SCRIPT_DIR" "$TARGET_REPO/skills"
check_link "$SCRIPT_DIR/WORKFLOW.md" "$COPILOT_SKILLS_DIR/WORKFLOW.md"
for skill_dir in "$SCRIPT_DIR"/*/; do
  [ -f "$skill_dir/SKILL.md" ] || continue
  check_link "$skill_dir" "$COPILOT_SKILLS_DIR/$(basename "$skill_dir")"
done

mkdir -p "$COPILOT_SKILLS_DIR"
create_link "$SCRIPT_DIR" "$TARGET_REPO/skills"
create_link "$SCRIPT_DIR/WORKFLOW.md" "$COPILOT_SKILLS_DIR/WORKFLOW.md"
for skill_dir in "$SCRIPT_DIR"/*/; do
  [ -f "$skill_dir/SKILL.md" ] || continue
  create_link "$skill_dir" "$COPILOT_SKILLS_DIR/$(basename "$skill_dir")"
done

EXCLUDE_FILE="$(git -C "$TARGET_REPO" rev-parse --path-format=absolute --git-path info/exclude)"
if ! grep -qxF "skills" "$EXCLUDE_FILE" 2>/dev/null; then
  printf '%s\n' "skills" >> "$EXCLUDE_FILE"
fi

for retired in task-start test-check test-implement code-lint; do
  target="$COPILOT_SKILLS_DIR/$retired"
  if [ -L "$target" ]; then
    current="$(readlink "$target")"
    if [ "${current%/}" = "$SCRIPT_DIR/$retired" ]; then
      unlink "$target"
      echo "Ancien lien retire : $target"
      continue
    fi
  fi
  if [ -e "$target" ] || [ -L "$target" ]; then
    echo "Ancien skill conserve, inspection manuelle necessaire : $target" >&2
  fi
done

echo "Setup termine. Recharger les skills dans Copilot CLI si necessaire."
