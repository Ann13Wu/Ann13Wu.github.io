#!/usr/bin/env node
/*
 * setup-github.js —— 一键完成 GitHub 建仓 + 推送 + 开启 Pages
 *
 * 用法：
 *   1. 把 GitHub Token 粘到项目根目录的 .token 文件里
 *   2. node setup-github.js
 *
 * 说明：
 *   - 仓库名固定为 <用户名>.github.io，这样 Pages 才能用根域名访问
 *   - 推送时会清空 git 代理（本机的沙箱代理会拦掉 github.com）
 *   - Token 用完可以删掉 .token 文件；它已在 .gitignore 里，不会入库
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = __dirname;
const API = 'https://api.github.com';

/* ---------- 读 Token ---------- */
function readToken() {
  const p = path.join(ROOT, '.token');
  if (!fs.existsSync(p)) {
    console.error('✗ 找不到 .token 文件。请在项目根目录新建 .token，把 Token 粘进去。');
    process.exit(1);
  }
  const raw = fs.readFileSync(p, 'utf8');
  const line = raw
    .split(/\r?\n/)
    .map(s => s.trim())
    .find(s => /^(ghp_|github_pat_|gho_|ghu_|ghs_)/.test(s));

  if (!line) {
    console.error('✗ .token 里没找到 Token（应以 ghp_ 或 github_pat_ 开头）。');
    console.error('  当前内容：' + JSON.stringify(raw.slice(0, 80)));
    process.exit(1);
  }
  return line;
}

const TOKEN = readToken();
const HDRS = {
  Authorization: 'Bearer ' + TOKEN,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'nebula-journal-setup',
  'X-GitHub-Api-Version': '2022-11-28'
};

/* ---------- API 请求 ---------- */
async function api(method, url, body) {
  const res = await fetch(API + url, {
    method,
    headers: HDRS,
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null;
  try { data = await res.json(); } catch (e) { /* noop */ }
  return { status: res.status, ok: res.ok, data };
}

/* ---------- git ---------- */
function git(args) {
  return execFileSync('git', ['-c', 'http.proxy=', '-c', 'https.proxy='].concat(args), {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

function gitSafe(args) {
  try {
    return { ok: true, out: git(args) };
  } catch (e) {
    return { ok: false, out: (e.stdout || '') + (e.stderr || '') };
  }
}

(async function main() {
  console.log('① 校验 Token …');
  const me = await api('GET', '/user');
  if (!me.ok) {
    console.error('✗ Token 无效或已过期（HTTP ' + me.status + '）');
    process.exit(1);
  }
  const login = me.data.login;
  console.log('   ✓ 身份：' + login);

  const repoName = login + '.github.io';
  const REPO = login + '/' + repoName;
  console.log('② 准备仓库 ' + REPO + ' …');

  const exist = await api('GET', '/repos/' + REPO);
  if (exist.ok) {
    console.log('   ✓ 仓库已存在，跳过创建');
  } else if (exist.status === 404) {
    const created = await api('POST', '/user/repos', {
      name: repoName,
      description: '🌌 星轨纪 Nebula Journal —— 个人博客',
      homepage: 'https://' + login + '.github.io',
      private: false,
      auto_init: false,
      has_issues: false,
      has_projects: false,
      has_wiki: false
    });
    if (!created.ok) {
      console.error('✗ 建仓失败（HTTP ' + created.status + '）');
      console.error('  ' + JSON.stringify(created.data));
      console.error('  提示：细粒度令牌不能建仓库，需要用 classic 令牌（勾 repo 权限）。');
      process.exit(1);
    }
    console.log('   ✓ 仓库已创建');
  } else {
    console.error('✗ 查询仓库失败（HTTP ' + exist.status + '）');
    process.exit(1);
  }

  console.log('③ 开启 Actions …');
  await api('PUT', '/repos/' + REPO + '/actions/permissions', { enabled: true, allowed_actions: 'all' });
  console.log('   ✓ 已开启（若返回失败可忽略，新仓库默认开启）');

  console.log('④ 推送代码 …');
  const safeUrl = 'https://github.com/' + REPO + '.git';
  const authUrl = 'https://' + login + ':' + TOKEN + '@github.com/' + REPO + '.git';

  const hasOrigin = gitSafe(['remote', 'get-url', 'origin']).ok;
  gitSafe(['remote', 'set-url', 'origin', authUrl]);
  if (!hasOrigin) gitSafe(['remote', 'add', 'origin', authUrl]);

  const branch = gitSafe(['rev-parse', '--abbrev-ref', 'HEAD']);
  const br = (branch.out || 'main').trim();
  gitSafe(['branch', '-M', 'main']);

  let pushed = null;
  for (let i = 1; i <= 12; i++) {
    pushed = gitSafe(['push', '-u', 'origin', 'main']);
    if (pushed.ok) break;
    console.log('   第 ' + i + '/12 次推送失败，30 秒后重试…');
    if (i < 12) await new Promise(r => setTimeout(r, 30000));
  }
  if (!pushed.ok) {
    console.error('✗ 推送失败：');
    console.error(pushed.out);
    process.exit(1);
  }
  console.log('   ✓ 推送完成（分支 ' + br + ' → main）');

  /* 清掉 remote 里明文的 Token */
  gitSafe(['remote', 'set-url', 'origin', safeUrl]);
  console.log('   ✓ 已从 remote 地址中移除 Token');

  console.log('⑤ 开启 GitHub Pages（Actions 部署）…');
  let pages = await api('POST', '/repos/' + REPO + '/pages', {
    build_type: 'workflow',
    source: { branch: 'main', path: '/' }
  });
  if (!pages.ok) {
    pages = await api('POST', '/repos/' + REPO + '/pages', { source: { branch: 'main', path: '/' } });
  }
  if (pages.ok || pages.status === 409) {
    console.log('   ✓ Pages 已配置');
  } else {
    console.log('   ⚠ 自动开启失败（HTTP ' + pages.status + '），请手动到');
    console.log('     https://github.com/' + REPO + '/settings/pages');
    console.log('     把 Source 设为 GitHub Actions');
  }

  const st = await api('GET', '/repos/' + REPO + '/pages');
  if (st.ok && st.data && st.data.html_url) {
    console.log('   Pages 地址：' + st.data.html_url);
  }

  console.log('\n完成 🎉');
  console.log('  仓库     https://github.com/' + REPO);
  console.log('  站点     https://' + login + '.github.io');
  console.log('  部署进度 https://github.com/' + REPO + '/actions');
  console.log('\n首次部署约 1 分钟。完成后记得把 .token 文件删掉。');
})();
