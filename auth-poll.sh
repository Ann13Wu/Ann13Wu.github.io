#!/bin/bash
# auth-poll.sh —— 用 curl 走完设备授权（Node 的 fetch 对 github.com 经常超时），
# 拿到令牌后写入 .token 并自动执行 setup-github.js 完成建仓 + 推送 + 开 Pages
cd "$(dirname "$0")"
CID="Iv1.b507a08c87ecfe98"

R=""
UC=""
for i in $(seq 1 40); do
  R=$(curl -s -m 20 --noproxy '*' -X POST https://github.com/login/device/code \
      -H "Accept: application/json" -H "Content-Type: application/json" \
      -d "{\"client_id\":\"$CID\",\"scope\":\"repo workflow\"}")
  UC=$(echo "$R" | grep -o '"user_code":"[^"]*"' | cut -d'"' -f4)
  [ -n "$UC" ] && break
  echo "申请授权码失败，第 $i 次重试…"
  sleep 3
done

if [ -z "$UC" ]; then echo "拿不到授权码：$R"; exit 1; fi
DC=$(echo "$R" | grep -o '"device_code":"[^"]*"' | cut -d'"' -f4)
IV=$(echo "$R" | grep -o '"interval":[0-9]*' | cut -d: -f2)
[ -z "$IV" ] && IV=5

echo "========================================="
echo "  网址：   https://github.com/login/device"
echo "  授权码： $UC"
echo "========================================="
printf "%s" "$DC" > .devicecode
echo "等待确认…"

for i in $(seq 1 110); do
  sleep $((IV + 2))
  R2=$(curl -s -m 20 --noproxy '*' -X POST https://github.com/login/oauth/access_token \
       -H "Accept: application/json" -H "Content-Type: application/json" \
       -d "{\"client_id\":\"$CID\",\"device_code\":\"$DC\",\"grant_type\":\"urn:ietf:params:oauth:grant-type:device_code\"}")
  AT=$(echo "$R2" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
  if [ -n "$AT" ]; then
    printf '%s\n' "$AT" > .token
    echo "✓ 授权成功，令牌已保存，开始部署…"
    "C:/Users/wojack/.workbuddy/binaries/node/versions/22.22.2-6/node.exe" setup-github.js
    exit 0
  fi
  ERR=$(echo "$R2" | grep -o '"error":"[^"]*"' | cut -d'"' -f4)
  if [ -n "$ERR" ] && [ "$ERR" != "authorization_pending" ]; then
    echo "授权失败：$ERR"
    exit 1
  fi
done
echo "等待超时"
exit 1
