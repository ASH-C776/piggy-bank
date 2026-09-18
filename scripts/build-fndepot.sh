#!/usr/bin/env bash
# 组装 FnDepot 第三方商店的「源仓库」目录（可重复执行）
#
# FnDepot V2 规范（EWEDLCM/FnDepot README「外部应用源 V2 编写说明」）要点：
#   - GitHub + Public，仓库名必须严格为 FnDepot，默认分支 main，根目录必须有 fnpack.json
#   - fnpack.json 必须是 V2：schema_version 精确为字符串 "2" + source_info + apps
#   - apps 的键名必须与 FPK manifest 里的 appname 完全一致（V2 允许点号，如 com.piggybank.app）
#   - categories 只能用固定分类（影音娱乐/系统工具/编程开发/AI赋能/生活服务/智能智控/教育学习/游戏地带/硬件驱动）
#   - 每个 packages 分支都应带 download_url + sha256 + size（size 单位是字节，整数）
#
# 版本号 / 应用名 / 更新说明等一律从 deploy/fpk 的 manifest 读取，
# 注入 deploy/fndepot/fnpack.template.json 生成最终 fnpack.json（单一事实来源）。
#
# 用法：  bash scripts/build-fndepot.sh [输出目录]
#         默认输出：<仓库根>/.workbuddy/fndepot-repo

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/.workbuddy/fndepot-repo}"

SRC_STORE="$ROOT/deploy/fndepot"            # 源文件：fnpack.template.json、应用 README
SRC_FPK_DIR="$ROOT/deploy/fpk/com.piggybank.app"
SRC_SHOTS="$ROOT/docs/screenshots"

fail() { echo "[FAIL] $*" >&2; exit 1; }

# --- 前置检查 ---------------------------------------------------------------
[ -f "$SRC_STORE/fnpack.template.json" ] || fail "缺少 $SRC_STORE/fnpack.template.json"
[ -f "$SRC_STORE/piggy-bank/README.md" ] || fail "缺少应用 README.md"
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

# --- 清理旧产物（保留 .git，否则会丢掉远端配置）------------------------------
mkdir -p "$OUT"
rm -rf "$OUT/piggy-bank" "$OUT/fnpack.json"

# --- 从 manifest 读取构建值，生成 fnpack.json --------------------------------
PYTHONUTF8=1 PYTHONIOENCODING=utf-8 python - "$SRC_FPK_DIR" "$SRC_STORE/fnpack.template.json" "$OUT" <<'PYEOF'
import hashlib, json, os, re, sys
from datetime import datetime, timedelta, timezone

fpk_dir, tpl_path, out_dir = sys.argv[1], sys.argv[2], sys.argv[3]

# 读 manifest
man = {}
with open(os.path.join(fpk_dir, 'manifest'), encoding='utf-8') as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        k, v = line.split('=', 1)
        man[k.strip()] = v.strip()

required = ['appname', 'version', 'maintainer', 'service_port', 'os_min_version', 'changelog']
missing = [k for k in required if not man.get(k)]
if missing:
    print(f"✗ manifest 缺少字段: {missing}"); sys.exit(1)

# fpk 校验值
fpk_path = os.path.join(fpk_dir, 'com.piggybank.app.fpk')
sha256 = hashlib.sha256(open(fpk_path, 'rb').read()).hexdigest()
size = os.path.getsize(fpk_path)

# 平台：manifest platform 只允许 x86/arm/all
plat = man.get('platform', 'x86')
if plat not in ('x86', 'arm', 'all'):
    print(f"✗ manifest platform 非法: {plat}"); sys.exit(1)

# 时区 +08:00 的 ISO 8601
tz = timezone(timedelta(hours=8))
updated_at = datetime.now(tz).strftime('%Y-%m-%dT%H:%M:%S+08:00')

tpl = open(tpl_path, encoding='utf-8').read()
j = json.loads(tpl)  # 先验证模板本身是合法 JSON
if str(j.get('schema_version')) != '2':
    print("✗ 模板 schema_version 必须是字符串 \"2\""); sys.exit(1)

apps = j.get('apps', {})
if len(apps) != 1:
    print("✗ 模板 apps 应只包含一个应用"); sys.exit(1)

# V2 硬性要求：注入后的键名必须与 manifest 的 appname 一致
tpl_key, app = next(iter(apps.items()))
if tpl_key != '__APPNAME__':
    print(f"[FAIL] 模板 apps 键名应为 __APPNAME__ 占位符，当前是 {tpl_key!r}"); sys.exit(1)

rel = app['releases']
if list(rel.keys()) != ['__VERSION__']:
    print("✗ releases 应只含 __VERSION__ 占位符"); sys.exit(1)

pkg = rel['__VERSION__']['packages']
if set(pkg.keys()) != {plat}:
    print(f"✗ packages 架构 {list(pkg.keys())} 与 manifest platform={plat} 不一致"); sys.exit(1)

# 注入（json.dumps 去掉外层引号 → 得到转义安全的字符串值）
def esc(s): return json.dumps(s, ensure_ascii=False)[1:-1]
tpl = tpl.replace('"__APPNAME__"', json.dumps(man['appname'], ensure_ascii=False))
tpl = tpl.replace('"__VERSION__"', json.dumps(man['version'], ensure_ascii=False))
tpl = tpl.replace('__CHANGELOG__', esc(man['changelog']))
tpl = tpl.replace('__UPDATED_AT__', updated_at)
tpl = tpl.replace('__OS_MIN_VERSION__', esc(man['os_min_version']))
tpl = tpl.replace('__FPK_SHA256__', sha256)
tpl = tpl.replace('"__FPK_SIZE__"', str(size))
tpl = tpl.replace('__MAINTAINER__', esc(man['maintainer']))
tpl = tpl.replace('__MAINTAINER_URL__', esc(man.get('maintainer_url', '')))
tpl = tpl.replace('"__PLATFORM__"', json.dumps(plat, ensure_ascii=False))

final = json.loads(tpl)  # 再验证产物是合法 JSON
if list(final['apps'].keys()) != [man['appname']]:
    print(f"[FAIL] 注入后 appname 仍是占位符：{list(final['apps'].keys())}"); sys.exit(1)
app = final['apps'][man['appname']]
app['maintainer'] = man['maintainer']
if man.get('maintainer_url'):
    app['maintainer_url'] = man['maintainer_url']

os.makedirs(out_dir, exist_ok=True)
with open(os.path.join(out_dir, 'fnpack.json'), 'w', encoding='utf-8', newline='\n') as f:
    json.dump(final, f, ensure_ascii=False, indent=2)
    f.write('\n')

print(f"  manifest appname={man['appname']} version={man['version']} platform={plat}")
print(f"  fpk sha256={sha256[:16]}… size={size} bytes")
PYEOF
[ -f "$OUT/fnpack.json" ] || fail "fnpack.json 生成失败"

# --- 组装其余文件 -----------------------------------------------------------
APP_NAME="piggy-bank"   # 仓库内目录名（目录结构 V2 不强制，保持历史布局）
mkdir -p "$OUT/$APP_NAME/Preview"
cp "$SRC_STORE/$APP_NAME/README.md"     "$OUT/$APP_NAME/README.md"
cp "$SRC_FPK_DIR/com.piggybank.app.fpk" "$OUT/$APP_NAME/$APP_NAME.fpk"
cp "$SRC_FPK_DIR/ICON_256.PNG"          "$OUT/$APP_NAME/ICON.PNG"
cp "$SRC_SHOTS/"*.jpg                   "$OUT/$APP_NAME/Preview/"

echo "✓ 已生成 FnDepot 源仓库目录（V2）：$OUT"
echo "  镜像      : $(echo "$IMAGE_LINE" | sed 's/^ *//')"
echo "  文件清单  :"
( cd "$OUT" && find . -type f | sort | sed 's/^/    /' )
echo
echo "下一步：在该目录 git add -A && git commit && git push（远端必须是 Public 的 FnDepot 仓库）"
