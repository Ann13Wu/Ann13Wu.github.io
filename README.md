# 🌌 星轨纪 · Nebula Journal

一个星空 / 奇幻 / 梦幻风格的个人静态博客。**视觉朦胧，文字清晰**。

- 文章列表（搜索 + 标签筛选 + 分页）
- 文章详情（Markdown 渲染 + 代码高亮 + 自动目录 + 上下篇）
- 标签分类（星丛索引 + 单标签归档）
- 关于页（同样由 Markdown 驱动）
- 零构建依赖，推到 GitHub Pages 即可

---

## 🚀 快速开始

### 本地预览

```bash
npm run dev     # http://127.0.0.1:4173
```

> `npm run dev` 只是起一个静态服务器，不需要 `npm install`（项目没有任何依赖）。

### 写文章

在 `posts/` 下新建一个 `.md` 文件，建议用 `日期-英文短名.md` 的格式命名：

```markdown
---
title: 文章标题
date: 2026-10-12
category: 前端
tags: [前端, Canvas, 动效]
excerpt: 不写的话会自动截取正文第一段
---

## 小标题

正文……
```

然后生成索引：

```bash
npm run build
```

文章就会出现在首页了。**新增或修改文章后都要跑一次 `npm run build`。**

### frontmatter 字段说明

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `title` | 否 | 缺省用文件名 |
| `date` | 否 | `YYYY-MM-DD`，缺省用文件修改时间 |
| `category` | 否 | 显示在元信息里，缺省「随笔」 |
| `tags` | 否 | `[标签1, 标签2]`，也支持 `标签1, 标签2` |
| `excerpt` | 否 | 缺省自动截取正文 |
| `cover` | 否 | 封面图路径（当前主题未启用） |
| `slug` | 否 | 自定义 URL，缺省为去掉日期的文件名 |
| `draft` | 否 | `true` 时不发布 |

---

## 🌐 部署到 GitHub Pages

### 方法一：GitHub Actions 自动部署（推荐）

1. 在 GitHub 上新建仓库 **`Ann13Wu.github.io`**（必须是这个名字，才能用根域名访问）
2. 把整个目录推上去：

```bash
git init
git add .
git commit -m "🌌 星轨纪 初始化"
git branch -M main
git remote add origin https://github.com/Ann13Wu/Ann13Wu.github.io.git
git push -u origin main
```

3. 进入仓库 **Settings → Pages → Build and deployment → Source**，选 **GitHub Actions**
4. 推送后 `.github/workflows/deploy.yml` 会自动跑，完成后访问 **https://ann13wu.github.io**

> 以后每次 `git push`，Actions 会自动 `node build.js` 并重新部署。**你甚至可以在 GitHub 网页上直接新建 `.md` 文件写文章**，push 后 Actions 会帮你生成索引。

### 方法二：部署到普通仓库（项目页）

如果仓库名不是 `用户名.github.io`，访问地址会是 `https://用户名.github.io/仓库名/`。本项目全部使用相对路径和 hash 路由，**这种情况也能正常工作**，无需改配置。

---

## ⚙️ 自定义

所有站点信息都抽成了 JSON，改这些文件即可，**不用碰代码**：

| 文件 | 作用 |
| --- | --- |
| `data/site.json` | 站点标题、首页大标题、副标题、GitHub 链接、**仓库名与分支（编辑按钮用）** |
| `data/profile.json` | 关于页的头像 emoji、名字、一句话简介、技能卡片、外链（留空则不显示） |
| `about.md` | 关于页正文（Markdown） |
| `posts/*.md` | 文章 |
| `assets/css/style.css` | 主题配色（顶部 `:root` 变量） |

### 文章底部的「编辑」按钮

每篇文章和关于页底部都会出现一个 **✎ 在 GitHub 编辑** 按钮，点击直接跳到该 `.md` 文件的 GitHub 在线编辑器。它由 `data/site.json` 控制：

```json
{
  "repo": "Ann13Wu/Ann13Wu.github.io",
  "branch": "main",
  "showEditButton": true
}
```

- `repo`：`用户名/仓库名`
- `branch`：默认 `main`
- `showEditButton`：设为 `false` 可一键关掉所有编辑按钮

> 按钮要在仓库推送到 GitHub 之后才能正常跳转；在那之前点击会到 GitHub 的 404。

改配色只需要动 `style.css` 最上面的 CSS 变量：

```css
:root{
  --bg-0:#070a1a;   /* 底色 */
  --glass:rgba(19,23,54,.62);  /* 面板透明度（影响文字清晰度） */
  --violet:#a78bfa; /* 主强调色 */
  --sky:#7dd3fc;
  --rose:#f0abfc;
}
```

⚠️ `--glass` 的透明度别调低于 `.5`，否则星点会穿透文字影响阅读。

---

## 📁 目录结构

```text
nebula-blog/
├── index.html              # 唯一页面（hash 路由 SPA）
├── about.md                # 关于页内容
├── build.js                # 扫描 posts/ → data/posts.json
├── server.js               # 本地预览服务器
├── package.json
├── .nojekyll               # 让 GitHub Pages 跳过 Jekyll
├── posts/                  # 👈 你的文章放这里
│   └── 2026-09-28-xxx.md
├── data/
│   ├── site.json           # 站点配置
│   ├── profile.json        # 关于页配置
│   └── posts.json          # 构建产物（自动生成）
├── assets/
│   ├── css/style.css
│   ├── js/app.js           # 路由 + 渲染
│   ├── js/starfield.js     # 星空 Canvas
│   └── vendor/             # marked.js + highlight.js（本地化，不依赖 CDN）
└── .github/workflows/deploy.yml
```

---

## ✍️ 网页内 CMS（写完保存即提交）

不用开编辑器、不用 git 命令行。**在浏览器里直接写 Markdown，点保存就自动提交到 GitHub**，Actions 会在 30 秒左右重建索引，前台自动出现。

### 怎么用

1. 打开你的站点 → 页脚那个小小的 **✎ 管理**（或直接访问 `#/admin`）
2. 生成一个 GitHub Token：
   <https://github.com/settings/personal-access-tokens/new>
   → 勾选 **`repo`** → 生成 → 复制那串 `ghp_...`
3. 粘贴进后台，点「连接仓库」
4. 之后就能新建 / 编辑 / 删除文章，还能拖动上传图片

### 它是怎么工作的

| 环节 | 实现 |
| --- | --- |
| 身份 | GitHub Personal Access Token，存在你浏览器的 `localStorage` |
| 读写 | GitHub Contents API（GET / PUT / DELETE），全程浏览器直连，无后端服务器 |
| 重建索引 | Actions 检测到 push 后自动 `node build.js` |
| 图片 | 拖进来会被 base64 传到 `assets/uploads/`，并自动插入 `![]()` |

### 安全须知（务必看）

- Token **只存在你自己的浏览器里**，不会被提交进仓库，也不会发到任何第三方
- 没勾选「记住」的话，关掉浏览器就消失，下次要重新粘
- Token = 仓库读写密码，**不要在公用电脑上用**，也不要把 `.env` 之类带上
- 后台页面本身是公开的，但没有 Token 的人什么都做不了
- 想撤销：GitHub → Settings → Developer settings → 删掉那个 Token，立即失效

### 相关文件

| 文件 | 作用 |
| --- | --- |
| `assets/js/cms.js` | CMS 全部逻辑 |
| `assets/css/style.css` | 搜 `CMS 管理后台样式` 那一段 |
| `data/site.json` | `repo` / `branch` 决定后台操作的仓库 |

---

## 🛠 技术说明

- **无框架、无打包**：原生 JS + hash 路由，双击 `index.html` 也能跑（不过 `fetch` 本地文件会被 CORS 拦，建议用 `npm run dev`）
- **Markdown**：marked.js v12，已本地化到 `assets/vendor/`
- **代码高亮**：highlight.js v11，主题 `github-dark-dimmed`
- **星空**：Canvas 2D，约 90～460 颗星（按屏幕面积自适应），含闪烁相位、视差漂移、随机流星
- **无障碍**：尊重 `prefers-reduced-motion`，检测到后关闭所有动效

## 📄 License

MIT
