#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

REMOTE_URL="https://github.com/tintinweb/pi-subagents.git"
BRANCH="main"

PATCH_FILE="$SCRIPT_DIR/local.patch"
BACKUP_DIR="$SCRIPT_DIR/.update-backup"

cleanup() {
  rm -f "$PATCH_FILE"
  rm -rf "$BACKUP_DIR"
}
trap cleanup EXIT

# 备份本地修改的文件（兜底，patch 失败时手动恢复用）
rm -rf "$BACKUP_DIR"
mkdir -p "$BACKUP_DIR"

files_to_backup=(
  "src/index.ts"
  "src/ui/agent-widget.ts"
)

for f in "${files_to_backup[@]}"; do
  if [ -f "$f" ]; then
    mkdir -p "$BACKUP_DIR/$(dirname "$f")"
    cp "$f" "$BACKUP_DIR/$f"
    echo "==> Backed up $f"
  fi
done

# 用 git 提取本地修改与上游的差异
echo "==> Initializing temporary git repo..."
git init
git add -A
git commit -m "local" --quiet

git remote add origin "$REMOTE_URL"
echo "==> Fetching $BRANCH from origin..."
git fetch origin "$BRANCH" --quiet

echo "==> Extracting local patch..."
# 注意: git diff A..B 是 B 相对于 A 的差异,我们想要本地相对于上游的差异
git diff "origin/$BRANCH"..HEAD -- "src/" > "$PATCH_FILE"
LOCAL_DIFF_SIZE=$(wc -c < "$PATCH_FILE" | tr -d ' ')

echo "==> Resetting to origin/$BRANCH..."
git reset --hard "origin/$BRANCH" --quiet

echo "==> Removing .git directory..."
rm -rf .git

echo "==> Applying import path patches..."
find src -name "*.ts" -exec sed -i '' 's|@mariozechner/pi-coding-agent|@earendil-works/pi-coding-agent|g' {} \;
find src -name "*.ts" -exec sed -i '' 's|@mariozechner/pi-tui|@earendil-works/pi-tui|g' {} \;
find src -name "*.ts" -exec sed -i '' 's|@mariozechner/pi-ai|@earendil-works/pi-ai|g' {} \;
find src -name "*.ts" -exec sed -i '' 's|@mariozechner/pi-agent-core|@earendil-works/pi-agent-core|g' {} \;

# 尝试应用本地修改
if [ "$LOCAL_DIFF_SIZE" -gt 0 ]; then
  echo "==> Re-applying local modifications..."
  if git apply "$PATCH_FILE" 2>/dev/null; then
    echo "==> Local modifications applied cleanly."
  else
    echo ""
    echo "⚠️  CONFLICT: local modifications could not be applied cleanly."
    echo "   Upstream changes in src/ conflict with local patches."
    echo "   Upstream version with import path fixes has been applied."
    echo "   Your local modifications are backed up at:"
    for f in "${files_to_backup[@]}"; do
      if [ -f "$BACKUP_DIR/$f" ]; then
        echo "     $BACKUP_DIR/$f"
      fi
    done
    echo "   The failed patch is at: $PATCH_FILE"
    echo "   Resolve conflicts manually, then remove the backup directory."
    echo ""
  fi
else
  echo "==> No local modifications to apply."
  rm -rf "$BACKUP_DIR"
fi

echo "==> Done."
