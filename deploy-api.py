#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
deploy-api.py —— 用 GitHub Git Data API 提交整站（绕过 git over HTTPS）

原因：设备授权拿到的是 GitHub App 用户令牌（ghu_），这类令牌**不能用于 git push**，
      但可以正常调用 REST API。所以这里直接构造 tree → commit → ref。

用法：python deploy-api.py
"""

import os
import json
import base64
import urllib.request
import urllib.error

ROOT = os.path.dirname(os.path.abspath(__file__))
API = 'https://api.github.com'
REPO = 'Ann13Wu/Ann13Wu.github.io'
BRANCH = 'main'

TOKEN = open(os.path.join(ROOT, '.token')).read().strip()
H = {
    'Authorization': 'Bearer ' + TOKEN,
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'nebula-deploy',
    'Content-Type': 'application/json',
}

SKIP_DIRS = {'.git', 'node_modules', '__pycache__', '.edge-auth-profile',
             '.edge-auth2', '_diag'}
SKIP_FILES = {'.token', '.token.pat', '.token.gitee', '.devicecode',
              'auto-github.py', 'auth-poll.sh', 'deploy-api.py',
              'setup-github.js', 'setup-gitee.js', 'device-auth.js'}


def req(method, path, body=None):
    data = json.dumps(body).encode('utf-8') if body is not None else None
    r = urllib.request.Request(API + path, data=data, headers=H, method=method)
    try:
        with urllib.request.urlopen(r, timeout=40) as resp:
            return resp.status, json.loads(resp.read() or b'{}')
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')
    except Exception as e:
        return 0, {'message': str(e)[:120]}


def collect():
    files = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in filenames:
            if fn in SKIP_FILES:
                continue
            full = os.path.join(dirpath, fn)
            rel = os.path.relpath(full, ROOT).replace('\\', '/')
            files.append((rel, full))
    return files


def main():
    files = collect()
    print('待提交文件：%d 个' % len(files))
    for rel, _ in files:
        print('   ', rel)

    st, d = req('POST', '/repos/%s/git/trees' % REPO, {'tree': []})
    base_tree = d.get('sha') if st == 201 else None
    print('基准 tree：%s（HTTP %s）' % (base_tree, st))

    tree = []
    for rel, full in files:
        with open(full, 'rb') as f:
            raw = f.read()
        try:
            content = raw.decode('utf-8')
            tree.append({'path': rel, 'mode': '100644', 'type': 'blob',
                         'content': content})
        except UnicodeDecodeError:
            st2, b = req('POST', '/repos/%s/git/blobs' % REPO,
                         {'content': base64.b64encode(raw).decode(),
                          'encoding': 'base64'})
            if st2 != 201:
                print('   ✗ 二进制文件 %s 上传失败：%s' % (rel, b))
                continue
            tree.append({'path': rel, 'mode': '100644', 'type': 'blob',
                         'sha': b['sha']})

    payload = {'tree': tree}
    if base_tree:
        payload['base_tree'] = base_tree
    st, d = req('POST', '/repos/%s/git/trees' % REPO, payload)
    if st != 201:
        print('✗ 创建 tree 失败（HTTP %s）：%s' % (st, d))
        return 1
    tree_sha = d['sha']
    print('✓ tree：%s' % tree_sha)

    st, d = req('POST', '/repos/%s/git/commits' % REPO,
                {'message': '🌌 星轨纪 初始化', 'tree': tree_sha})
    if st not in (200, 201):
        print('✗ 创建 commit 失败（HTTP %s）：%s' % (st, d))
        return 1
    commit_sha = d['sha']
    print('✓ commit：%s' % commit_sha)

    st, d = req('GET', '/repos/%s/git/ref/heads/%s' % (REPO, BRANCH))
    if st == 200:
        st, d = req('PATCH', '/repos/%s/git/refs/heads/%s' % (REPO, BRANCH),
                    {'sha': commit_sha})
        print('更新已有分支 → HTTP %s' % st)
    else:
        st, d = req('POST', '/repos/%s/git/refs' % REPO,
                    {'ref': 'refs/heads/%s' % BRANCH, 'sha': commit_sha})
        print('创建分支 → HTTP %s' % st)
    if st not in (200, 201):
        print('✗ 更新 ref 失败：%s' % d)
        return 1
    print('✓ 已推送到 %s' % BRANCH)

    st, d = req('PUT', '/repos/%s/pages' % REPO, {'build_type': 'workflow'})
    print('Pages(Actions) → HTTP %s %s' % (st, d.get('message', ''))[:120])
    if st not in (200, 201, 204):
        st2, d2 = req('POST', '/repos/%s/pages' % REPO,
                      {'source': {'branch': BRANCH, 'path': '/'}})
        print('Pages(分支) → HTTP %s %s' % (st2, d2.get('message', ''))[:120])

    st, d = req('GET', '/repos/%s/pages' % REPO)
    print('Pages 状态：HTTP %s  %s' % (st, json.dumps(d, ensure_ascii=False)[:200]))
    print('')
    print('🎉 完成 —— 稍等 1-2 分钟访问 https://ann13wu.github.io')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
