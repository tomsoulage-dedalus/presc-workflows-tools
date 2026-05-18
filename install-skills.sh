#!/bin/bash
# Install Copilot skills into the current project's .copilot/skills/ folder
# Usage: run this script from the root of your project (e.g., orme-prescription)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="$(pwd)/.copilot/skills"

mkdir -p "$TARGET_DIR"
cp -r "$SCRIPT_DIR/skills/"* "$TARGET_DIR/"

echo "✅ Skills installed in $TARGET_DIR"
ls "$TARGET_DIR"
