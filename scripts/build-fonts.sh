#!/usr/bin/env bash
# =============================================================================
# 存钱罐 · 前端字体本地化构建脚本
# -----------------------------------------------------------------------------
# 背景：index.html 原先通过 Google Fonts CDN 引入 'ZCOOL KuaiLe'（中文标题）与
#       'Quicksand'（数字/拉丁正文）。国内网络、飞牛 NAS 局域网、以及 Capacitor
#       打包的 APK（WebView 内）都访问不到 fonts.googleapis.com，导致字体静默
#       加载失败，回退到系统中文字体 —— 标题因此失去圆润手写感，且全局
#       `h1-h6 { font-weight: 400 }` 叠加上回退字体的粗体表现会让标题显得比正文弱。
#       本脚本把两个字体重制为本地 woff2，放进 web/public/fonts/ 随站点与 APK 分发。
#
# 策略（为什么不按用字子集化）：
#   * ZCOOL KuaiLe 原字体本身只有 7053 个字符（6766 汉字，≈ GB2312 全量），
#     经扫描本项目全部源码实际用到 794 个汉字，缺失 0 个 —— 字体自带的就是常用字集，
#     再做子集收益极小，而新增文案若落到子集外会静默掉字（回退系统字体），
#     属于"省 500KB 换来长期维护负担和肉眼可见的字体割裂"。故整份保留。
#   * Quicksand 本身只有 694 个字符（纯拉丁/符号，无汉字），全量 woff2 仅约 50KB，
#     同样没有子集价值。它是可变字体（wght 300–700 单轴），一份文件覆盖全部字重。
#
# 依赖：python3 + fonttools[woff2]（brotli）
#   pip install fonttools brotli
#
# 用法：bash scripts/build-fonts.sh
# 产物：web/public/fonts/{zcool-kuaile.woff2,quicksand.woff2} + 两份 OFL 许可证
#
# 许可证：两个字体现均为 SIL Open Font License 1.1，可自由商用/嵌入/再分发，
#         条件之一是随字体保留 OFL 许可证文本（见 web/public/fonts/OFL-*.txt）。
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/web/public/fonts"
TMP="$ROOT/.workbuddy/fonts/tmp"

# 找一个装了 fontTools 的解释器。优先用显式传入的 $PY，其次探测常见的
# 隔离 venv（本机 CI/沙盒环境的 PATH 常被 shim 改写，$PY 可能传不进来）。
if [ -z "${PY:-}" ] || ! "$PY" -c 'import fontTools' >/dev/null 2>&1; then
  for cand in \
    "$HOME/.workbuddy/binaries/python/envs/default/Scripts/python.exe" \
    "$HOME/.workbuddy/binaries/python/envs/default/bin/python" \
    python3 python
  do
    if command -v "$cand" >/dev/null 2>&1 && "$cand" -c 'import fontTools' >/dev/null 2>&1; then
      PY="$cand"; break
    fi
  done
fi
if ! "$PY" -c 'import fontTools' >/dev/null 2>&1; then
  echo "错误：找不到带 fontTools 的 Python。请先执行 pip install fonttools brotli，或用 PY=<解释器> 覆盖。" >&2
  exit 1
fi
echo "==> 使用解释器: $PY"

ZCOOL_URL="https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/zcoolkuaile/ZCOOLKuaiLe-Regular.ttf"
QUICKSAND_URL="https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/quicksand/Quicksand%5Bwght%5D.ttf"
ZCOOL_OFL_URL="https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/zcoolkuaile/OFL.txt"
QUICKSAND_OFL_URL="https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/quicksand/OFL.txt"

echo "==> 工作目录 $ROOT"
mkdir -p "$OUT" "$TMP"

echo "==> 下载源字体"
[ -f "$TMP/zcool.ttf" ]     || curl -fsSL --max-time 120 -o "$TMP/zcool.ttf"     "$ZCOOL_URL"
[ -f "$TMP/quicksand.ttf" ] || curl -fsSL --max-time 120 -o "$TMP/quicksand.ttf" "$QUICKSAND_URL"
curl -fsSL --max-time 60 -o "$OUT/OFL-ZCOOL-KuaiLe.txt" "$ZCOOL_OFL_URL"
curl -fsSL --max-time 60 -o "$OUT/OFL-Quicksand.txt"    "$QUICKSAND_OFL_URL"

echo "==> TTF -> WOFF2（全量字符，去 hinting，不子集化）"
# --unicodes='*'      保留全部字符（不子集）
# --no-hinting        剔除 glyf 的 TrueType 指令，纯体积优化，现代渲染器不依赖
# --desubroutinize    对 CFF 有意义，对 glyf 无害，统一加上
# --drop-tables       DSIG 签名对本地自托管无意义；hdmx/VDMX/LTSH 是旧式设备度量表
"$PY" -m fontTools.subset "$TMP/zcool.ttf" \
  --unicodes='*' --flavor=woff2 --output-file="$OUT/zcool-kuaile.woff2" \
  --no-hinting --desubroutinize --drop-tables+=DSIG,hdmx,VDMX,LTSH \
  --layout-features='*' --name-IDs='*' --notdef-outline

"$PY" -m fontTools.subset "$TMP/quicksand.ttf" \
  --unicodes='*' --flavor=woff2 --output-file="$OUT/quicksand.woff2" \
  --no-hinting --desubroutinize --drop-tables+=DSIG,hdmx,VDMX,LTSH \
  --layout-features='*' --name-IDs='*' --notdef-outline

echo "==> 自检"
"$PY" - "$OUT" <<'PYEOF'
import os, sys
from fontTools.ttLib import TTFont
out = sys.argv[1]
ok = True
for fn, expect_han in (('zcool-kuaile.woff2', True), ('quicksand.woff2', False)):
    p = os.path.join(out, fn)
    f = TTFont(p)
    cmap = f.getBestCmap()
    han = sum(1 for c in cmap if 0x4E00 <= c <= 0x9FFF)
    axes = [(a.axisTag, a.minValue, a.maxValue) for a in f['fvar'].axes] if 'fvar' in f else []
    size = os.path.getsize(p)
    print(f'  {fn:22s} {size:>8,} B ({size/1024:>6.1f} KB)  glyphs={f["maxp"].numGlyphs:<6} cmap={len(cmap):<6} han={han:<5} axes={axes}')
    if expect_han and han < 6000:
        print('    !! 汉字覆盖异常，疑似被意外子集化'); ok = False
    if not expect_han and han:
        print('    !! 拉丁字体不应含汉字'); ok = False
    if not size:
        ok = False
print('  self-check:', 'PASS' if ok else 'FAIL')
sys.exit(0 if ok else 1)
PYEOF

echo "==> 完成，产物在 web/public/fonts/"
ls -la "$OUT"
