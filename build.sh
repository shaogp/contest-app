#!/bin/sh
set -eu

# 统一使用官方 registry，避免锁文件与依赖来源不一致
export NPM_CONFIG_REGISTRY='https://registry.npmjs.org/'

npm ci --registry='https://registry.npmjs.org/'
npm prune --omit=dev

# 组装运行时产物：public 静态资源 + 服务端代码 + 生产依赖
mkdir -p dist
cp -R public dist/public
cp server.js package.json package-lock.json run.sh dist/
cp -R node_modules dist/node_modules
chmod 755 dist/run.sh

# 保证运行时工作目录里没有旧的空数据目录依赖
test -f dist/server.js
test -f dist/run.sh
test -d dist/node_modules/express
