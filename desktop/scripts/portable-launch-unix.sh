#!/usr/bin/env bash
set -euo pipefail
ROOT="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
if [ "$(uname -s)" != "@SYSTEM@" ] || [ "$(uname -m)" != "@ARCH@" ]; then
  echo '此压缩包不适用于当前系统或芯片，请下载对应版本。' >&2
  exit 1
fi
export INSIGHT_PRODUCT_ROOT="$ROOT/product"
export PATH="$ROOT/product/node/bin:$PATH"
unset ELECTRON_RUN_AS_NODE
EXECUTABLE="$ROOT/@EXECUTABLE@"
if [ ! -x "$EXECUTABLE" ] || [ ! -x "$ROOT/product/node/bin/node" ]; then
  echo '运行组件缺失或没有执行权限，请使用系统解压工具完整解压原始 ZIP。' >&2
  exit 1
fi
exec "$EXECUTABLE" "$ROOT/product/app" "$@"
