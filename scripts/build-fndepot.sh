#!/usr/bin/env bash
# 组装 FnDepot 第三方商店的「源仓库」目录（可重复执行）
#
# FnDepot 规范（LAW.md v1.0.0）硬性要求：
#   - GitHub + Public，仓库名必须严格为 FnDepot，默认分支 main
#   - 根目录 fnpack.json（键 = 应用目录名）
#   - {app_name}/ICON.PNG（必须全大写）、{app_name}.fpk（文件名须与目录名一致）、README.md、Preview/
#   - app_name 只允许小写字母/数字/连字符 → 本项目用 piggy-bank
#
# 用法：  bash scripts/build-fndepot.sh [输出目录]
#         默认输出：<仓库根>/.workbuddy/fndepot-repo

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="piggy-bank"
OUT="${1:-$ROOT/.workbuddy/fndepot-repo}"

SRC_STORE="$ROOT/deploy/fndepot"            # 源文件：fnpack.json、应用 README
SRC_FPK_DIR="$ROOT/deploy/fpk/com.piggybank.app"
SRC_SHOTS="$ROOT/docs/screenshots"

fail() { echo "✗ $*" >&2; exit 1; }

# --- 前置检查 ---------------------------------------------------------------
[ -f "$SRC_STORE/fnpack.json" ] || fail "缺少 $SRC_STORE/fnpack.json"
[ -f "$SRC_STORE/$APP_NAME/README.md" ] || fail "缺少应用 README.md"
[ -f "$SRC_FPK_DIR/com.piggybank.app.fpk" ] || fail "缺少 fpk 产物，请先在 deploy/fpk/com.piggybank.app 执行 fnpack build"
[ -f "$SRC_FPK_DIR/ICON_256.PNG" ] || fail "缺少 ICON_256.PNG"
[ -d "$SRC_SHOTS" ] || fail "缺少截图目录 docs/screenshots"

# fpk 里引用的镜像必须是公共仓库地址，否则用户装上会因找不到镜像启动失败
IMAGE_LINE="$(grep -E '^\s+image:' "$SRC_FPK_DIR/app/docker/docker-compose.yaml" | head -1 || true)"
case "$IMAGE_LINE" in
  *registry*.aliyuncs.com*|*docker.io*|*ghcr.io*) ;;
  *) fail "fpk 内镜像地址仍是本地标签：${IMAGE_LINE:-未找到 image 行}
  请先把镜像推到公共仓库，并在 app/docker/docker-compose.yaml 里替换 image 后重新 fnpack build" ;;
esac

# --- 组装 -------------------------------------------------------------------
# 只清理产物、保留 .git（输出目录通常已是一个 git 仓库，直接清空会丢掉远端配置）
mkdir -p "$OUT"
rm -rf "$OUT/$APP_NAME" "$OUT/fnpack.json"
mkdir -p "$OUT/$APP_NAME/Preview"

cp "$SRC_STORE/fnpack.json"                    "$OUT/fnpack.json"
cp "$SRC_STORE/$APP_NAME/README.md"            "$OUT/$APP_NAME/README.md"
cp "$SRC_FPK_DIR/com.piggybank.app.fpk"        "$OUT/$APP_NAME/$APP_NAME.fpk"
cp "$SRC_FPK_DIR/ICON_256.PNG"                 "$OUT/$APP_NAME/ICON.PNG"
cp "$SRC_SHOTS/"*.jpg                          "$OUT/$APP_NAME/Preview/"

# 版本号一致性自检：fnpack.json / manifest / fpk 文件名
VER_JSON="$(grep -oE '"version"\s*:\s*"[^"]+"' "$OUT/fnpack.json" | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+[^"]*')"
VER_MANIFEST="$(grep -E '^version=' "$SRC_FPK_DIR/manifest" | cut -d= -f2 | tr -d '[:space:]')"
[ "$VER_JSON" = "$VER_MANIFEST" ] || fail "版本号不一致：fnpack.json=$VER_JSON manifest=$VER_MANIFEST"

echo "✓ 已生成 FnDepot 源仓库目录：$OUT"
echo "  应用 ID   : $APP_NAME（版本 $VER_JSON）"
echo "  镜像      : $(echo "$IMAGE_LINE" | sed 's/^ *//')"
echo "  文件清单  :"
( cd "$OUT" && find . -type f | sort | sed 's/^/    /' )
echo
echo "下一步：在该目录 git init → 建 Public 仓库（名字必须为 FnDepot）→ 推送 main"
