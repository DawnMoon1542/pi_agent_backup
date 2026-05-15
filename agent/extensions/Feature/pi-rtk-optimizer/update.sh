#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

REMOTE_URL="https://github.com/MasuRii/pi-rtk-optimizer.git"
BRANCH="main"

PATCH_FILE="$SCRIPT_DIR/local.patch"
BACKUP_DIR="$SCRIPT_DIR/.update-backup"

cleanup() {
  rm -f "$PATCH_FILE"
  rm -rf "$BACKUP_DIR"
}
trap cleanup EXIT

# config.json 无条件备份，不参与 patch 流程
if [ -f config.json ]; then
  cp config.json config.json.bak
  echo "==> Backed up config.json"
fi

# 备份本地修改的源文件（兜底）
rm -rf "$BACKUP_DIR"
mkdir -p "$BACKUP_DIR"

files_to_backup=(
  "src/constants.ts"
)

for f in "${files_to_backup[@]}"; do
  if [ -f "$f" ]; then
    mkdir -p "$BACKUP_DIR/$(dirname "$f")"
    cp "$f" "$BACKUP_DIR/$f"
    echo "==> Backed up $f"
  fi
done

echo "==> Initializing temporary git repo..."
git init
git add -A
git commit -m "local" --quiet

git remote add origin "$REMOTE_URL"
echo "==> Fetching $BRANCH from origin..."
git fetch origin "$BRANCH" --quiet

echo "==> Extracting local patch (excluding config.json)..."
# config.json 单独处理，不参与 diff
git diff "origin/$BRANCH"..HEAD -- "src/" ":!config.json" > "$PATCH_FILE"
LOCAL_DIFF_SIZE=$(wc -c < "$PATCH_FILE" | tr -d ' ')

echo "==> Resetting to origin/$BRANCH..."
git reset --hard "origin/$BRANCH" --quiet

echo "==> Removing .git directory..."
rm -rf .git

# 恢复 config.json
if [ -f config.json.bak ]; then
  mv config.json.bak config.json
  echo "==> Restored config.json"
fi

# 尝试应用本地 src/ 修改（import 路径补丁和 config 路径适配）
if [ "$LOCAL_DIFF_SIZE" -gt 0 ]; then
  echo "==> Re-applying local src/ modifications..."
  if git apply "$PATCH_FILE" 2>/dev/null; then
    echo "==> Local modifications applied cleanly."
    rm -rf "$BACKUP_DIR"
  else
    echo ""
    echo "⚠️  CONFLICT: local src/ modifications could not be applied cleanly."
    echo "   Upstream changes conflict with local patches."
    echo "   Upstream version + restored config.json has been applied."
    echo "   Your previous local modifications are backed up at:"
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
  echo "==> No local src/ modifications to apply."
  rm -rf "$BACKUP_DIR"
fi

echo "==> Done."
