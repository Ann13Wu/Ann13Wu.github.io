#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
auto-github.py —— 一条龙完成 GitHub 授权 + 建仓 + 推送 + 开 Pages

流程：
  1. 申请设备授权码（Device Flow）
  2. 在屏幕上弹出一个 Edge 窗口（headful），打开 github.com/login/device
  3. 你只需在窗口里登录 GitHub（如需两步验证也自己过一下）
  4. 脚本检测到已登录 → 自动填入授权码 → 点 Continue → 点 Authorize
  5. 拿到令牌 → 写入 .token → 调用 setup-github.js 完成余下全部工作

用法：python auto-github.py
"""

import os
import re
import sys
import time
import subprocess
import json
import urllib.request
import urllib.error
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.abspath(__file__))
CLIENT_ID = 'Iv1.b507a08c87ecfe98'
MAIN_PROFILE = r'C:\Users\wojack\AppData\Local\Microsoft\Edge\User Data'
DEDICATED_PROFILE = os.path.join(ROOT, '.edge-auth-profile')
HDR = {'Accept': 'application/json', 'Content-Type': 'application/json',
       'User-Agent': 'nebula-setup'}


def post(url, body, tries=60, gap=5):
    """github.com 网络时好时坏，失败就重试"""
    data = json.dumps(body).encode('utf-8')
    for i in range(1, tries + 1):
        try:
            req = urllib.request.Request(url, data=data, headers=HDR, method='POST')
            with urllib.request.urlopen(req, timeout=20) as r:
                return json.loads(r.read().decode('utf-8'))
        except Exception as e:
            if i % 5 == 0:
                print('   网络超时，第 %d/%d 次重试…' % (i, tries), flush=True)
            time.sleep(gap)
    return {}


def log(msg):
    print(msg, flush=True)


def edge_running():
    try:
        out = subprocess.check_output(['tasklist', '/FI', 'IMAGENAME eq msedge.exe'],
                                      stderr=subprocess.DEVNULL).decode('gbk', 'ignore')
        return 'msedge.exe' in out.lower()
    except Exception:
        return True


def main():
    log('=' * 48)
    log('① 申请授权码…')
    d = post('https://github.com/login/device/code',
             {'client_id': CLIENT_ID, 'scope': 'repo workflow'})
    if not d.get('user_code'):
        log('申请失败：%s' % d)
        return 1
    code = d['user_code']
    expires = int(d.get('expires_in', 900))
    log('   授权码：%s（%d 分钟有效）' % (code, round(expires / 60)))

    # 优先复用用户自己的 Edge 配置（里面可能已经有 GitHub 登录态）
    if os.path.exists(os.path.join(MAIN_PROFILE, 'Local State')):
        profile = MAIN_PROFILE
        if edge_running():
            log('⚠ Edge 还在运行，可能无法复用配置 —— 请先关闭所有 Edge 窗口')
        else:
            log('② 使用你自己的 Edge 配置（若已登录 GitHub 则全自动）')
    else:
        profile = DEDICATED_PROFILE
        log('② 使用独立配置，需要你在弹出窗口里登录一次')
    os.makedirs(profile, exist_ok=True)

    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            user_data_dir=profile, channel='msedge', headless=False,
            args=['--start-maximized', '--disable-blink-features=AutomationControlled'],
            no_viewport=True)
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        page.goto(d.get('verification_uri', 'https://github.com/login/device'),
                  timeout=60000)

        log('')
        log('   >>> 请在刚弹出的 Edge 窗口里登录 GitHub <<<')
        log('   （登录成功后脚本会自动填码并确认，你不用再操作）')
        log('')

        # ---- 等待登录完成 ----
        deadline = time.time() + expires - 60
        logged_in = False
        while time.time() < deadline:
            url = page.url
            if 'login/device' in url and 'return_to' not in url:
                logged_in = True
                break
            time.sleep(2)
        if not logged_in:
            log('等待登录超时。关闭窗口后重新运行本脚本即可。')
            ctx.close()
            return 1

        log('③ 已登录，正在自动填入授权码 %s …' % code)
        time.sleep(1.5)

        # ---- 填入授权码 ----
        try:
            vis = [i for i in page.query_selector_all('input') if i.is_visible()]
            boxes = [i for i in vis if (i.get_attribute('maxlength') == '1')]
            if len(boxes) >= 8:
                boxes[0].click()
                page.keyboard.type(code.replace('-', ''), delay=80)
            else:
                target = None
                for i in vis:
                    t = (i.get_attribute('type') or 'text').lower()
                    if t in ('text', 'tel', ''):
                        target = i
                        break
                target = target or vis[0]
                target.click()
                page.keyboard.type(code, delay=80)
                got = target.input_value()
                if got.replace('-', '').upper() != code.replace('-', '').upper():
                    target.fill('')
                    page.keyboard.type(code.replace('-', ''), delay=80)
        except Exception as e:
            log('   自动填码失败（%s），请手动输入：%s' % (str(e)[:80], code))

        # ---- 提交 ----
        try:
            page.keyboard.press('Enter')
        except Exception:
            pass
        time.sleep(2.5)
        try:
            for sel in ['button[type="submit"]', 'input[type="submit"]']:
                b = page.query_selector(sel)
                if b and b.is_visible():
                    b.click()
                    break
        except Exception:
            pass
        time.sleep(2.5)

        # ---- 点确认 ----
        clicked = False
        for _ in range(20):
            try:
                for sel in ['button#js-oauth-authorize-btn',
                            'button:has-text("Authorize GitHub CLI")',
                            'button:has-text("Authorize")']:
                    b = page.query_selector(sel)
                    if b and b.is_visible():
                        b.click()
                        clicked = True
                        break
                if clicked:
                    break
            except Exception:
                pass
            time.sleep(1.5)
        log('④ 确认按钮：%s' % ('已点击 ✓' if clicked else '没找到，请在窗口里手动点一下绿色的 Authorize'))

        # ---- 轮询令牌 ----
        log('⑤ 等待授权结果…')
        end = time.time() + max(60, expires - (time.time() - (deadline - expires + 60)))
        end = time.time() + 600
        token = None
        while time.time() < end:
            j = post('https://github.com/login/oauth/access_token', {
                'client_id': CLIENT_ID,
                'device_code': d['device_code'],
                'grant_type': 'urn:ietf:params:oauth:grant-type:device_code'
            }, tries=3, gap=3)
            if j.get('access_token'):
                token = j['access_token']
                break
            if j.get('error') and j['error'] != 'authorization_pending':
                log('授权失败：%s %s' % (j.get('error'), j.get('error_description', '')))
                break
            time.sleep(5)

        if not token:
            log('未拿到令牌。确认窗口里已点过 Authorize 后，重新运行本脚本。')
            ctx.close()
            return 1

        with open(os.path.join(ROOT, '.token'), 'w') as f:
            f.write(token + '\n')
        log('✓ 授权成功，令牌已保存，开始建仓 + 推送…')
        ctx.close()

    node = r'C:\Users\wojack\.workbuddy\binaries\node\versions\22.22.2-6\node.exe'
    res = subprocess.run([node, os.path.join(ROOT, 'setup-github.js')],
                         cwd=ROOT, capture_output=True, text=True, encoding='utf-8')
    sys.stdout.write(res.stdout or '')
    if res.stderr:
        sys.stderr.write(res.stderr)
    return 0


if __name__ == '__main__':
    sys.exit(main())
