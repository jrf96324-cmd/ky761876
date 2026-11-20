#!/bin/sh
# Drawing-to-Quote 離線啟動（macOS / Linux）
cd "$(dirname "$0")"
if command -v node >/dev/null 2>&1; then exec node tools/serve.js
elif command -v python3 >/dev/null 2>&1; then
  ( sleep 1; (open http://localhost:8765/index.html || xdg-open http://localhost:8765/index.html) >/dev/null 2>&1 ) &
  exec python3 -m http.server 8765 --bind 127.0.0.1
else echo "需要 Node.js 或 Python 3"; exit 1; fi
