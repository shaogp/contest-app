#!/bin/sh
set -eu

# 平台注入 PORT；runtime.port 必须与这里最终监听的端口一致
export PORT="${PORT:-8000}"

# 数据目录放在可写的临时目录，后端会自动创建
export DATA_DIR="${DATA_DIR:-/tmp/contest-data}"

exec node server.js
