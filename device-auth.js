#!/usr/bin/env node
/*
 * device-auth.js —— 用 GitHub 设备授权（Device Flow）拿到可建仓库的权限
 *
 * 用法：node device-auth.js
 *   1. 屏幕会打印一个网址和一个 8 位授权码
 *   2. 在任意设备（手机也行）的浏览器打开网址、输入授权码、点确认
 *   3. 脚本自动拿到令牌 → 写入 .token → 立刻执行 setup-github.js 完成建仓 + 推送 + 开 Pages
 *
 * 说明：用的是 GitHub CLI 公开的 client_id，只申请 repo / workflow 两个权限，
 *       令牌只落到本地 .token（已在 .gitignore 里）。
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const CLIENT_ID = 'Iv1.b507a08c87ecfe98';
const ROOT = __dirname;

async function post(url, body, tries, delay) {
  /* github.com 本机直连时好时坏，失败重试 */
  const n = tries || 8;
  const gap = delay || 4000;
  for (let i = 1; i <= n; i++) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'nebula-setup'
        },
        body: JSON.stringify(body)
      });
      return await r.json();
    } catch (e) {
      if (i === n) throw e;
      console.log('   网络超时，第 ' + i + '/' + n + ' 次重试…');
      await new Promise(r => setTimeout(r, gap));
    }
  }
}

(async function () {
  const d = await post('https://github.com/login/device/code', {
    client_id: CLIENT_ID,
    scope: 'repo workflow'
  }, 90, 20000);

  if (!d.user_code) {
    console.error('申请授权码失败：' + JSON.stringify(d));
    process.exit(1);
  }

  console.log('=========================================');
  console.log('  打开浏览器访问： ' + d.verification_uri);
  console.log('  输入授权码：     ' + d.user_code);
  console.log('  有效期：         ' + Math.round(d.expires_in / 60) + ' 分钟');
  console.log('=========================================');
  console.log('等待你在网页上确认…（每 6 秒检查一次）');
  console.log('');

  const interval = ((d.interval || 5) + 1) * 1000;
  const deadline = Date.now() + (d.expires_in || 900) * 1000;

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, interval));

    let j;
    try {
      j = await post('https://github.com/login/oauth/access_token', {
        client_id: CLIENT_ID,
        device_code: d.device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
      }, 4);
    } catch (e) {
      continue;
    }

    if (j.access_token) {
      fs.writeFileSync(path.join(ROOT, '.token'), j.access_token + '\n');
      console.log('✓ 授权成功，令牌已保存到 .token，开始部署…');
      console.log('');
      const res = spawnSync(process.execPath, [path.join(ROOT, 'setup-github.js')], {
        cwd: ROOT,
        encoding: 'utf8'
      });
      process.stdout.write(res.stdout || '');
      if (res.stderr) process.stderr.write(res.stderr);
      return;
    }

    if (j.error && j.error !== 'authorization_pending') {
      console.error('授权失败：' + j.error + ' —— ' + (j.error_description || ''));
      return;
    }
  }

  console.error('等待超时（15 分钟未确认）。重新运行 node device-auth.js 可换一个新码。');
})();
