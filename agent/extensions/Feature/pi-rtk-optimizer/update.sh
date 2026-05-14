#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

REMOTE_URL="https://github.com/MasuRii/pi-rtk-optimizer.git"
BRANCH="main"

# 备份 config.json
if [ -f config.json ]; then
  cp config.json config.json.bak
  echo "==> Backed up config.json"
fi

echo "==> Initializing temporary git repo..."
git init
git remote add origin "$REMOTE_URL"

echo "==> Fetching $BRANCH from origin..."
git fetch origin "$BRANCH"

echo "==> Resetting to origin/$BRANCH..."
git reset --hard "origin/$BRANCH"

echo "==> Removing .git directory..."
rm -rf .git

# 恢复 config.json
if [ -f config.json.bak ]; then
  mv config.json.bak config.json
  echo "==> Restored config.json"
fi

echo "==> Applying local patches..."

# 包名替换
find src -name "*.ts" -exec sed -i '' 's|@mariozechner/pi-coding-agent|@earendil-works/pi-coding-agent|g' {} \;
find src -name "*.ts" -exec sed -i '' 's|@mariozechner/pi-tui|@earendil-works/pi-tui|g' {} \;

# config 路径适配
sed -i '' 's|"extensions", EXTENSION_NAME|"extensions", "Feature", EXTENSION_NAME|' src/constants.ts

echo "==> Done. Review changes with: git diff"
