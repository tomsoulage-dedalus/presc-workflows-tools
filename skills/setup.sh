#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOLS_ROOT="$(dirname "$SCRIPT_DIR")"
PARENT_DIR="$(dirname "$TOOLS_ROOT")"
TARGET_REPO="$PARENT_DIR/orme-prescription"

if [ ! -d "$TARGET_REPO" ]; then
  echo "❌ orme-prescription introuvable dans $PARENT_DIR"
  echo "   Assure-toi que les deux repos sont dans le même dossier parent."
  exit 1
fi

SYMLINK="$TARGET_REPO/skills"

if [ -L "$SYMLINK" ]; then
  echo "✅ Symlink déjà en place : $SYMLINK"
else
  ln -s "$SCRIPT_DIR" "$SYMLINK"
  echo "✅ Symlink créé : $SYMLINK → $SCRIPT_DIR"
fi

EXCLUDE_FILE="$TARGET_REPO/.git/info/exclude"
if grep -qx "skills" "$EXCLUDE_FILE" 2>/dev/null; then
  echo "✅ 'skills' déjà dans .git/info/exclude"
else
  echo "skills" >> "$EXCLUDE_FILE"
  echo "✅ 'skills' ajouté à .git/info/exclude"
fi

# Sync skills vers ~/.copilot/skills/ via symlinks
COPILOT_SKILLS_DIR="$HOME/.copilot/skills"
mkdir -p "$COPILOT_SKILLS_DIR"

for skill_dir in "$SCRIPT_DIR"/*/; do
  skill_name=$(basename "$skill_dir")
  target="$COPILOT_SKILLS_DIR/$skill_name"

  if [ -L "$target" ]; then
    echo "✅ ~/.copilot/skills/$skill_name déjà lié"
  elif [ -d "$target" ]; then
    echo "⚠️  ~/.copilot/skills/$skill_name existe (copie manuelle) — remplacement par symlink"
    rm -rf "$target"
    ln -s "$skill_dir" "$target"
    echo "✅ ~/.copilot/skills/$skill_name → $skill_dir"
  else
    ln -s "$skill_dir" "$target"
    echo "✅ ~/.copilot/skills/$skill_name → $skill_dir"
  fi
done

echo ""
echo "🎉 Setup terminé — les skills sont disponibles depuis orme-prescription et ~/.copilot/skills/."
