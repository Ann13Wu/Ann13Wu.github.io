#!/usr/bin/env node
/*
 * setup-gitee.js —— 一键把博客部署到 Gitee（码云）
 *
 * 用法：
 *   1. 到 https://gitee.com/profile/personal_access_tokens 生成私人令牌
 *      （勾选 projects 权限即可）
 *   2. 把令牌粘到项目根目录的 .token.gitee 文件里
 *   3. node setup-gitee.js
 *
 * 说明：
 *   - Gitee Pages 免费版地址形如 https://<用户名>.gitee.io/<仓库名>
 *     若仓库名与用户名完全相同，地址就是 https://<用户名>.gitee.io
 *   - Gitee Pages 首次开启需要实名认证（在网页上点一次即可）
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = __dirname;
const API = 'https://gitee.com/api/v5';
const REPO_NAME = 'nebula-blog';

function readToken() {
  const p = path.join(ROOT, '.token.gitee');
  if (!fs.existsSync(p)) {
    console.error('✗ 找不到 .token.gitee。');
    console.error('  请先到 https://gitee.com/profile/personal_access_tokens 生成私人令牌，');
    console.error('  粘到 ' + p + ' 里再运行。');
    process.exit(1);
  }
  const line = fs.readFileSync(p, 'utf8').split(/\r?\n/).map(s => s.trim()).find(Boolean);
  if (!line) {
    console.error('✗ .token.gitee 是空的。');
    process.exit(1);
  }
  return line;
}

const TOKEN = readToken();

async function api(method, url, body) {
  const sep = url.indexOf('?') >= 0 ? '&' : '?';
  const res = await fetch(API + url + sep + 'access_token=' + encodeURIComponent(TOKEN), {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json;charset=UTF-8',
      'User-Agent': 'nebula-setup'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null;
  try { data = await res.json(); } catch (e) { /* noop */ }
  return { status: res.status, ok: res.ok, data };
}

function gitSafe(args) {
  try {
    return {
      ok: true,
      out: execFileSync('git', ['-c', 'http.proxy=', '-c', 'https.proxy='].concat(args), {
        cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
      })
    };
  } catch (e) {
    return { ok: false, out: (e.stdout || '') + (e.stderr || '') };
  }
}

(async function main() {
  console.log('① 校验令牌 …');
  const me = await api('GET', '/user');
  if (!me.ok || !me.data || !me.data.login) {
    console.error('✗ 令牌无效（HTTP ' + me.status + '）：' + JSON.stringify(me.data).slice(0, 200));
    process.exit(1);
  }
  const login = me.data.login;
  console.log('   ✓ 身份：' + login);

  console.log('② 准备仓库 ' + login + '/' + REPO_NAME + ' …');
  const exist = await api('GET', '/repos/' + encodeURIComponent(login) + '/' + REPO_NAME);
  if (exist.ok) {
    console.log('   ✓ 仓库已存在');
  } else {
    const created = await api('POST', '/user/repos', {
      name: REPO_NAME,
      description: '🌌 星轨纪 Nebula Journal —— 个人博客',
      private: false,
      auto_init: false,
      has_issues: false,
      has_wiki: false,
      has_pull_requests: true
    });
    if (!created.ok) {
      console.error('✗ 建仓失败（HTTP ' + created.status + '）：' + JSON.stringify(created.data).slice(0, 300));
      console.error('  提示：私人令牌需要勾选 projects 权限。');
      process.exit(1);
    }
    console.log('   ✓ 仓库已创建');
  }

  console.log('③ 推送代码 …');
  const safeUrl = 'https://gitee.com/' + login + '/' + REPO_NAME + '.git';
  const authUrl = 'https://' + encodeURIComponent(login) + ':' + encodeURIComponent(TOKEN) + '@gitee.com/' + login + '/' + REPO_NAME + '.git';

  /* 用一个不叫 origin 的远端，避免弄乱 GitHub 的配置 */
  const remote = 'gitee';
  const has = gitSafe(['remote', 'get-url', remote]).ok;
  gitSafe(['remote', has ? 'set-url' : 'add', remote, authUrl]);
  gitSafe(['branch', '-M', 'main']);

  let pushed = null;
  for (let i = 1; i <= 5; i++) {
    pushed = gitSafe(['push', '-u', remote, 'main']);
    if (pushed.ok) break;
    console.log('   第 ' + i + '/5 次推送失败，15 秒后重试…');
    await new Promise(r => setTimeout(r, 15000));
  }
  if (!pushed.ok) {
    console.error('✗ 推送失败：');
    console.error(pushed.out);
    process.exit(1);
  }
  console.log('   ✓ 推送完成');
  gitSafe(['remote', 'set-url', remote, safeUrl]);
  console.log('   ✓ 已移除地址中的令牌');

  console.log('④ 尝试开启 Gitee Pages …');
  const pages = await api('POST', '/repos/' + encodeURIComponent(login) + '/' + REPO_NAME + '/pages', {
    branch: 'main',
    build_directory: '/',
    force_https: true
  });
  if (pages.ok) {
    console.log('   ✓ Pages 已开启');
  } else {
    console.log('   ⚠ 接口未直接开启（HTTP ' + pages.status + '），需要你在网页上点一次：');
    console.log('     https://gitee.com/' + login + '/' + REPO_NAME + '/pages');
    console.log('     → 部署分支选 main，部署目录填 /，勾选强制 HTTPS，点「启动」');
  }

  console.log('\n完成 🎉');
  console.log('  仓库     https://gitee.com/' + login + '/' + REPO_NAME);
  console.log('  Pages    https://' + login + '.gitee.io/' + REPO_NAME);
  console.log('\n注意：Gitee Pages 首次使用需实名认证；之后每次推送要手动点「更新」重新部署。');
  console.log('      用完记得删掉 .token.gitee。');
})();
