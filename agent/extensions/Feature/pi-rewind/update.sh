#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

REMOTE_URL="https://github.com/arpagon/pi-rewind.git"
BRANCH="main"

echo "==> Initializing temporary git repo..."
git init
git remote add origin "$REMOTE_URL"

echo "==> Fetching $BRANCH from origin..."
git fetch origin "$BRANCH"

echo "==> Resetting to origin/$BRANCH..."
git reset --hard "origin/$BRANCH"

echo "==> Removing .git directory..."
rm -rf .git

echo "==> Applying local patches (import path + bug fix)..."
sed -i '' 's|@mariozechner/pi-coding-agent|@earendil-works/pi-coding-agent|g' \
  src/index.ts src/commands.ts src/ui.ts

sed -i '' 's|state\.root)|state.repoRoot!)|g' src/commands.ts

echo "==> Done. Review changes with: git diff"
