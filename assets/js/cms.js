/* ============================================================
   星轨纪 CMS —— 浏览器内直接写 Markdown，保存即提交到 GitHub
   基于 GitHub Contents API，Token 只存在本机 localStorage
   使用方式：访问 #/admin
   ============================================================ */
(function () {
  'use strict';

  var N = window.NEBULA;
  var esc = N.esc;
  var TOKEN_KEY = 'nebula_cms_token';
  var app = document.getElementById('app');

  var token = '';
  var notice = '';
  var noticeKind = 'ok';

  /* ================= GitHub API ================= */

  function gh(path, opts) {
    opts = opts || {};
    var headers = {
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Authorization': 'Bearer ' + token
    };
    if (opts.body) headers['Content-Type'] = 'application/json';

    return fetch('https://api.github.com' + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (r) {
      return r.json().then(function (d) {
        if (!r.ok) {
          var msg = (d && d.message) || ('HTTP ' + r.status);
          if (r.status === 401) msg = 'Token 无效或已过期（401）';
          if (r.status === 403) msg = 'Token 权限不足或触发速率限制（403）：' + msg;
          if (r.status === 404) msg = '找不到该文件或仓库（404）：请确认仓库名、分支是否正确，仓库是否已创建';
          var err = new Error(msg);
          err.status = r.status;
          throw err;
        }
        return d;
      });
    });
  }

  /* ================= 编码工具 ================= */

  function b64encode(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function b64decode(b64) {
    var bin = atob(b64.replace(/\n/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function today() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  /* ================= frontmatter ================= */

  var FM_RE = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

  function splitDoc(raw) {
    var m = FM_RE.exec(raw);
    if (!m) return { data: {}, body: raw };
    var data = {};
    m[1].split(/\r?\n/).forEach(function (line) {
      if (!line.trim()) return;
      var i = line.indexOf(':');
      if (i < 0) return;
      var key = line.slice(0, i).trim();
      var val = line.slice(i + 1).trim();
      if (/^\[.*\]$/.test(val)) {
        val = val.slice(1, -1).split(',').map(function (s) {
          return s.trim().replace(/^['"]|['"]$/g, '');
        }).filter(Boolean);
      } else {
        val = val.replace(/^['"]|['"]$/g, '');
      }
      data[key] = val;
    });
    return { data: data, body: raw.slice(m[0].length) };
  }

  function buildDoc(fields) {
    var tags = String(fields.tags || '').split(/[,，]/)
      .map(function (s) { return s.trim(); })
      .filter(Boolean);

    var fm = '---\n' +
      'title: ' + fields.title + '\n' +
      'date: ' + fields.date + '\n' +
      'category: ' + (fields.category || '随笔') + '\n' +
      'tags: [' + tags.join(', ') + ']\n';

    if (fields.excerpt && fields.excerpt.trim()) {
      fm += 'excerpt: ' + fields.excerpt.trim() + '\n';
    }
    fm += '---\n\n';

    return fm + (fields.body || '').replace(/^\s+/, '');
  }

  function safeName(s) {
    return String(s || '').toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '') || 'untitled';
  }

  /* ================= 通用渲染 ================= */

  function setNotice(msg, kind) {
    notice = msg || '';
    noticeKind = kind || 'ok';
  }

  function noticeHtml() {
    if (!notice) return '';
    return '<div class="cms-notice ' + (noticeKind === 'err' ? 'is-err' : '') + '">' +
      esc(notice) + '</div>';
  }

  function shell(title, sub, inner) {
    return '<div class="cms-wrap">' +
      '<div class="cms-head">' +
        '<div><h1>' + esc(title) + '</h1><p>' + sub + '</p></div>' +
        '<div class="cms-head-act">' + actionsHtml() + '</div>' +
      '</div>' + noticeHtml() + inner + '</div>';
  }

  function actionsHtml() {
    var s = N.site();
    var h = '<a class="cms-btn ghost" href="#/">← 回前台</a>';
    if (token) {
      h += '<button class="cms-btn ghost" id="cmsLogout">退出</button>';
      if (N.site && N.site().repo) {
        h += '<a class="cms-btn ghost" href="https://github.com/' + esc(s.repo) +
             '" target="_blank" rel="noopener">仓库 ↗</a>';
      }
    }
    return h;
  }

  /* ================= 视图 1：Token 登录 ================= */

  function viewLogin(msg) {
    var s = N.site();
    setNotice(msg || '', msg ? 'err' : '');

    app.innerHTML = shell('管理后台', '需要一个 GitHub Token 才能读写仓库',
      '<div class="cms-panel">' +
        '<h3 class="cms-h3">① 生成 Token</h3>' +
        '<ol class="cms-steps">' +
          '<li>打开 <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token (classic)</a></li>' +
          '<li>勾选 <b>repo</b>（完整仓库读写权限）</li>' +
          '<li>生成后<b>立刻复制</b>那串 <code>ghp_...</code>，关掉页面就再也看不到了</li>' +
        '</ol>' +
        '<h3 class="cms-h3">② 粘贴到这里</h3>' +
        '<input class="cms-input" id="cmsToken" type="password" placeholder="ghp_xxxxxxxxxxxxxxxxxxxx" autocomplete="off">' +
        '<div class="cms-row">' +
          '<input class="cms-input" id="cmsRepo" placeholder="用户名/仓库名" value="' + esc((s && s.repo) || '') + '">' +
          '<input class="cms-input" id="cmsBranch" placeholder="分支" value="' + esc((s && s.branch) || 'main') + '">' +
        '</div>' +
        '<label class="cms-check"><input type="checkbox" id="cmsRemember" checked> 记住 Token（保存在本机浏览器，不会上传到任何地方）</label>' +
        '<div class="cms-row">' +
          '<button class="cms-btn primary" id="cmsLogin">连接仓库</button>' +
        '</div>' +
        '<p class="cms-tip">⚠️ Token 相当于你的仓库读写密码。<b>只在自己的电脑上使用</b>，不要在公用电脑上勾选记住。</p>' +
      '</div>');

    document.getElementById('cmsLogin').addEventListener('click', function () {
      var t = document.getElementById('cmsToken').value.trim();
      var repo = document.getElementById('cmsRepo').value.trim();
      var branch = document.getElementById('cmsBranch').value.trim() || 'main';
      if (!t) return viewLogin('请先粘贴 Token');
      if (!/^[^/]+\/[^/]+$/.test(repo)) return viewLogin('仓库名格式应为「用户名/仓库名」，例如 Ann13Wu/Ann13Wu.github.io');

      var btn = document.getElementById('cmsLogin');
      btn.disabled = true; btn.textContent = '验证中…';

      token = t;
      gh('/user').then(function (user) {
        N.site().repo = repo;
        N.site().branch = branch;
        try {
          localStorage.setItem(TOKEN_KEY, JSON.stringify({
            token: t, repo: repo, branch: branch,
            remember: document.getElementById('cmsRemember').checked
          }));
        } catch (e) { /* 隐私模式下可能写不了 */ }
        setNotice('已连接，欢迎回来 ' + user.login);
        viewList();
      }).catch(function (err) {
        token = '';
        viewLogin('连接失败：' + err.message);
      });
    });
  }

  /* ================= 视图 2：文章列表 ================= */

  function viewList() {
    app.innerHTML = shell('文章管理', '仓库：' + esc(N.site().repo || '') +
      ' · 分支 ' + esc(N.site().branch || 'main'),
      '<div class="cms-panel"><div class="cms-empty">正在读取 posts/ …</div></div>');

    gh('/repos/' + repo() + '/contents/posts?ref=' + enc(branch()))
      .then(function (files) {
        var mds = files.filter(function (f) { return /\.md$/i.test(f.name); })
          .sort(function (a, b) { return b.name.localeCompare(a.name); });

        var h = '<div class="cms-panel">' +
          '<div class="cms-toolbar">' +
            '<button class="cms-btn primary" id="cmsNew">＋ 新建文章</button>' +
            '<span class="cms-count">共 ' + mds.length + ' 篇</span>' +
          '</div>';

        if (!mds.length) {
          h += '<div class="cms-empty">还没有文章，点「新建文章」开始写吧。</div>';
        } else {
          h += '<div class="cms-list">';
          mds.forEach(function (f) {
            h += '<div class="cms-item">' +
              '<div class="cms-item-main">' +
                '<div class="cms-item-name">' + esc(f.name) + '</div>' +
                '<div class="cms-item-meta">' + (f.size / 1024).toFixed(1) + ' KB</div>' +
              '</div>' +
              '<div class="cms-item-act">' +
                '<button class="cms-btn small" data-edit="' + esc(f.path) + '">编辑</button>' +
                '<button class="cms-btn small danger" data-del="' + esc(f.path) + '" data-sha="' + f.sha + '">删除</button>' +
              '</div>' +
            '</div>';
          });
          h += '</div>';
        }
        h += '</div>';

        app.innerHTML = shell('文章管理', '仓库：' + esc(repo()) + ' · 分支 ' + esc(branch()), h);

        document.getElementById('cmsNew').addEventListener('click', function () {
          viewEditor(null);
        });

        Array.prototype.forEach.call(document.querySelectorAll('[data-edit]'), function (b) {
          b.addEventListener('click', function () {
            viewEditor(b.getAttribute('data-edit'));
          });
        });

        Array.prototype.forEach.call(document.querySelectorAll('[data-del]'), function (b) {
          b.addEventListener('click', function () {
            removePost(b.getAttribute('data-del'), b.getAttribute('data-sha'));
          });
        });

        bindHeadActions();
      })
      .catch(function (err) {
        app.innerHTML = shell('文章管理', '', '<div class="cms-panel"><div class="cms-empty">读取失败：' +
          esc(err.message) + '</div></div>');
        bindHeadActions();
      });
  }

  /* ================= 视图 3：编辑器 ================= */

  function viewEditor(path) {
    var isNew = !path;
    var sha = null;

    function open(raw) {
      var doc = splitDoc(raw || '');
      var fields = {
        title: doc.data.title || '',
        date: doc.data.date || today(),
        category: doc.data.category || '随笔',
        tags: Array.isArray(doc.data.tags) ? doc.data.tags.join(', ') : (doc.data.tags || ''),
        excerpt: doc.data.excerpt || '',
        body: doc.body
      };

      var h = '<input type="hidden" id="cmsPath" value="' + esc(path || '') + '">';

      h += '<div class="cms-panel">' +
        '<div class="cms-grid">' +
          '<label class="cms-field"><span>标题</span>' +
            '<input class="cms-input" id="f_title" value="' + esc(fields.title) + '" placeholder="文章标题">' +
          '</label>' +
          '<label class="cms-field"><span>日期</span>' +
            '<input class="cms-input" id="f_date" value="' + esc(fields.date) + '" placeholder="YYYY-MM-DD">' +
          '</label>' +
          '<label class="cms-field"><span>分类</span>' +
            '<input class="cms-input" id="f_category" value="' + esc(fields.category) + '">' +
          '</label>' +
          '<label class="cms-field"><span>标签（逗号分隔）</span>' +
            '<input class="cms-input" id="f_tags" value="' + esc(fields.tags) + '" placeholder="前端, 随笔">' +
          '</label>' +
        '</div>' +
        '<label class="cms-field"><span>文件名</span>' +
          '<input class="cms-input mono" id="f_name" value="' + esc(path ? path.replace(/^posts\//, '') : today() + '-new-post.md') + '"' +
          (isNew ? '' : ' readonly') + '>' +
        '</label>' +
        '<label class="cms-field"><span>摘要（留空则自动截取正文）</span>' +
          '<textarea class="cms-input" id="f_excerpt" rows="2">' + esc(fields.excerpt) + '</textarea>' +
        '</label>' +
      '</div>';

      h += '<div class="cms-panel">' +
        '<div class="cms-tabs">' +
          '<button class="cms-tab active" data-tab="write">编辑</button>' +
          '<button class="cms-tab" data-tab="preview">预览</button>' +
          '<span class="cms-toolbar-right">' +
            '<label class="cms-btn ghost small file-btn">🖼 插入图片<input type="file" id="cmsImg" accept="image/*" hidden></label>' +
          '</span>' +
        '</div>' +
        '<textarea class="cms-editor" id="f_body" spellcheck="false" placeholder="# 从这里开始写 Markdown…">' +
          esc(fields.body) +
        '</textarea>' +
        '<div class="cms-preview markdown-body" id="cmsPreview" hidden></div>' +
      '</div>';

      h += '<div class="cms-panel">' +
        '<label class="cms-field"><span>提交信息</span>' +
          '<input class="cms-input" id="f_msg" value="' + esc(isNew ? '新增文章' : '更新文章') + '">' +
        '</label>' +
        '<div class="cms-row">' +
          '<button class="cms-btn primary" id="cmsSave">💾 保存并提交到 GitHub</button>' +
          (isNew ? '' : '<button class="cms-btn danger" id="cmsDelThis">删除这篇</button>') +
        '</div>' +
        '<p class="cms-tip">保存后 GitHub Actions 会自动重建索引，大约 30 秒后前台就能看到。</p>' +
      '</div>';

      app.innerHTML = shell(isNew ? '新建文章' : '编辑文章', esc(path || '新文件'), h);

      /* 标签页切换 */
      Array.prototype.forEach.call(document.querySelectorAll('.cms-tab'), function (t) {
        t.addEventListener('click', function () {
          var which = t.getAttribute('data-tab');
          Array.prototype.forEach.call(document.querySelectorAll('.cms-tab'), function (x) {
            x.classList.toggle('active', x === t);
          });
          var ed = document.getElementById('f_body');
          var pv = document.getElementById('cmsPreview');
          if (which === 'preview') {
            pv.innerHTML = N.renderMarkdown(ed.value);
            N.enhance(pv);
            ed.hidden = true; pv.hidden = false;
          } else {
            ed.hidden = false; pv.hidden = true;
          }
        });
      });

      /* 图片上传 */
      document.getElementById('cmsImg').addEventListener('change', function (e) {
        var f = e.target.files && e.target.files[0];
        if (f) uploadImage(f);
      });

      /* 保存 */
      document.getElementById('cmsSave').addEventListener('click', function () {
        savePost(isNew);
      });

      if (!isNew) {
        document.getElementById('cmsDelThis').addEventListener('click', function () {
          removePost(path, sha, true);
        });
      }

      bindHeadActions();
    }

    if (isNew) {
      open('');
      return;
    }

    app.innerHTML = shell('编辑文章', '正在读取…', '<div class="cms-panel"><div class="cms-empty">读取中…</div></div>');
    gh('/repos/' + repo() + '/contents/' + enc(path) + '?ref=' + enc(branch()))
      .then(function (d) {
        sha = d.sha;
        open(b64decode(d.content));
      })
      .catch(function (err) {
        app.innerHTML = shell('编辑文章', '', '<div class="cms-panel"><div class="cms-empty">读取失败：' +
          esc(err.message) + '</div></div>');
        bindHeadActions();
      });
  }

  /* ================= 保存 / 删除 / 上传 ================= */

  function collect() {
    return {
      title: document.getElementById('f_title').value.trim(),
      date: document.getElementById('f_date').value.trim() || today(),
      category: document.getElementById('f_category').value.trim() || '随笔',
      tags: document.getElementById('f_tags').value.trim(),
      excerpt: document.getElementById('f_excerpt').value.trim(),
      name: document.getElementById('f_name').value.trim(),
      body: document.getElementById('f_body').value
    };
  }

  function targetPath(f) {
    var name = f.name.replace(/\.md$/i, '');
    if (!/^\d{4}-\d{2}-\d{2}-/.test(name)) name = f.date + '-' + name;
    return 'posts/' + name + '.md';
  }

  function savePost(isNew) {
    var f = collect();
    if (!f.title) return fail('标题不能为空');
    if (!f.name) return fail('文件名不能为空');

    var path = targetPath(f);
    var content = b64encode(buildDoc(f));
    var msg = document.getElementById('f_msg').value.trim() || (isNew ? '新增文章' : '更新文章');

    var body = { message: msg, content: content, branch: branch() };
    var btn = document.getElementById('cmsSave');

    btn.disabled = true; btn.textContent = '提交中…';

    var orig = document.getElementById('cmsPath').value;

    /* 先看目标路径是否已存在：存在则更新（需要 sha），404 则新建 */
    gh('/repos/' + repo() + '/contents/' + enc(path) + '?ref=' + enc(branch()))
      .then(function (d) {
        if (d.path === orig) { body.sha = d.sha; return; }
        throw new Error('该文件名已存在：' + path + '　请换一个');
      })
      .catch(function (e) { if (e.status !== 404) throw e; })
      .then(function () {
        return gh('/repos/' + repo() + '/contents/' + enc(path), {
          method: 'PUT', body: body
        });
      })
      .then(function () {
        setNotice('✔ 已提交：' + path + '　GitHub Actions 会在 30 秒左右重建索引');
        viewList();
      })
      .catch(function (err) {
        fail('保存失败：' + err.message);
      });

    function fail(m) {
      setNotice(m, 'err');
      var bar = document.querySelector('.cms-notice');
      if (bar) { bar.textContent = m; bar.className = 'cms-notice is-err'; }
      var b = document.getElementById('cmsSave');
      if (b) { b.disabled = false; b.textContent = '💾 保存并提交到 GitHub'; }
    }
  }

  function removePost(path, sha, silent) {
    if (!confirm('确定删除 ' + path + ' 吗？\n这会从仓库里移除该文件，可以用 Git 历史找回，但前台会立刻消失。')) return;
    if (!sha) {
      gh('/repos/' + repo() + '/contents/' + enc(path) + '?ref=' + enc(branch()))
        .then(function (d) { return doDelete(path, d.sha); })
        .catch(function (e) { setNotice('删除失败：' + e.message, 'err'); render(); });
      return;
    }
    doDelete(path, sha);
  }

  function doDelete(path, sha) {
    gh('/repos/' + repo() + '/contents/' + enc(path), {
      method: 'DELETE',
      body: { message: '删除 ' + path, sha: sha, branch: branch() }
    }).then(function () {
      setNotice('✔ 已删除：' + path);
      viewList();
    }).catch(function (e) {
      setNotice('删除失败：' + e.message, 'err');
      viewList();
    });
  }

  function uploadImage(file) {
    setNotice('正在上传图片…');
    render();

    var reader = new FileReader();
    reader.onload = function () {
      var b64 = String(reader.result).split(',')[1];
      var path = 'assets/uploads/' + Date.now() + '-' + file.name.replace(/[^\w.\-]/g, '_');

      gh('/repos/' + repo() + '/contents/' + enc(path), {
        method: 'PUT',
        body: {
          message: '上传图片 ' + file.name,
          content: b64,
          branch: branch()
        }
      }).then(function () {
        var md = '![' + file.name.replace(/\.[^.]+$/, '') + '](' + path + ')';
        var ta = document.getElementById('f_body');
        if (ta) {
          var pos = ta.selectionStart;
          ta.value = ta.value.slice(0, pos) + '\n' + md + '\n' + ta.value.slice(pos);
        }
        setNotice('✔ 图片已上传：' + path);
        render();
      }).catch(function (e) {
        setNotice('上传失败：' + e.message, 'err');
        render();
      });
    };
    reader.readAsDataURL(file);
  }

  /* ================= 小工具 ================= */

  function repo() { return N.site().repo || ''; }
  function branch() { return N.site().branch || 'main'; }
  function enc(s) { return encodeURIComponent(s).replace(/%2F/g, '/'); }

  function render() {
    var bar = document.querySelector('.cms-notice');
    if (!bar && notice) {
      var head = document.querySelector('.cms-head');
      if (head) {
        bar = document.createElement('div');
        head.insertAdjacentElement('afterend', bar);
      }
    }
    if (bar) {
      bar.textContent = notice;
      bar.className = 'cms-notice' + (noticeKind === 'err' ? ' is-err' : '');
      bar.hidden = !notice;
    }
  }

  function bindHeadActions() {
    var lo = document.getElementById('cmsLogout');
    if (lo) {
      lo.addEventListener('click', function () {
        if (!confirm('退出后需要重新输入 Token，确定吗？')) return;
        try { localStorage.removeItem(TOKEN_KEY); } catch (e) { /* noop */ }
        token = '';
        viewLogin('已退出');
      });
    }
  }

  /* ================= 路由入口 ================= */

  function entry(parts) {
    var saved = null;
    if (!token) {
      try { saved = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null'); } catch (e) { /* noop */ }
      if (saved && saved.token) {
        token = saved.token;
        if (saved.repo) N.site().repo = saved.repo;
        if (saved.branch) N.site().branch = saved.branch;
      }
    }

    if (!token) { viewLogin(); return; }

    if (!parts.length) { viewList(); return; }
    if (parts[0] === 'new') { viewEditor(null); return; }
    if (parts[0] === 'edit' && parts.length > 1) {
      viewEditor(decodeURIComponent(parts.slice(1).join('/')));
      return;
    }

    viewList();
  }

  window.NEBULA_VIEWS = window.NEBULA_VIEWS || {};
  window.NEBULA_VIEWS.admin = entry;
})();
