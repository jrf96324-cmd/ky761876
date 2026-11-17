#!/usr/bin/env bash
# 下載 three.js r128（含 examples/js 的非模組版 OrbitControls），放到指定資料夾。
# 用法：bash fetch_three.sh <vendor_dir>
set -euo pipefail
DEST="${1:?用法: fetch_three.sh <vendor_dir>}"
mkdir -p "$DEST"
cd "$DEST"
if [ ! -f package/build/three.min.js ]; then
  npm pack three@0.128.0 >/dev/null 2>&1
  tar xzf three-0.128.0.tgz
fi
ls -la package/build/three.min.js package/examples/js/controls/OrbitControls.js
