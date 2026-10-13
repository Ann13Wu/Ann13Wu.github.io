/* ============================================================
   星轨纪 Nebula Journal — SPA 路由 / Markdown 渲染 / 交互
   ============================================================ */
(function () {
  'use strict';

  var app = document.getElementById('app');
  var PER_PAGE = 6;
  var POSTS = [];
  var SITE = {};
  var state = { q: '', tag: '', page: 1 };
  var scrollSpy = [];

  /* ---------------- 工具 ---------------- */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fmtDate(s) {
    var d = new Date(s);
    if (isNaN(d)) return s || '';
    return d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日';
  }

  function tagClass(name) {
    var h = 0, i;
    for (i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return ['', 'sky', 'rose', 'gold'][h % 4];
  }

  function tagHtml(name, href) {
    return '<a class="tag ' + tagClass(name) + '" href="' + (href || '#/tag/' + encodeURIComponent(name)) + '">' + esc(name) + '</a>';
  }

  /* GitHub 在线编辑器地址：把仓库/分支配置在 data/site.json 里 */
  function editUrl(file) {
    if (!SITE.repo || SITE.showEditButton === false) return '';
    return 'https://github.com/' + SITE.repo + '/edit/' + (SITE.branch || 'main') + '/' + file;
  }

  function editBtn(file, label) {
    var url = editUrl(file);
    if (!url) return '';
    return '<div class="edit-bar">' +
      '<a class="edit-btn" href="' + url + '" target="_blank" rel="noopener">' +
      '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>' +
      esc(label || '在 GitHub 编辑这篇') +
      '</a></div>';
  }

  function get(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' · ' + url);
      return r.text();
    });
  }

  /* ---------------- 页面：首页（文章列表） ---------------- */

  function viewHome() {
    var tags = allTags();
    var filtered = filterPosts();
    var totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
    if (state.page > totalPages) state.page = totalPages;
    var start = (state.page - 1) * PER_PAGE;
    var pageItems = filtered.slice(start, start + PER_PAGE);

    var h = '';

    /* Hero */
    h += '<section class="hero">' +
      '<span class="hero-badge">✧ ' + esc(SITE.badge || 'WRITING UNDER THE STARS') + ' ✧</span>' +
      '<h1>' + esc(SITE.heroTitle || '在星海的褶皱里，') + '<br><span class="grad">' + esc(SITE.heroAccent || '写下尚未命名的光') + '</span></h1>' +
      '<p class="sub">' + esc(SITE.heroSub || '') + '</p>' +
      '<div class="hero-stats">' +
        '<div><b>' + POSTS.length + '</b><span>ARTICLES</span></div>' +
        '<div><b>' + tags.length + '</b><span>TAGS</span></div>' +
        '<div><b>' + totalWords() + '</b><span>WORDS</span></div>' +
      '</div>' +
    '</section>';

    /* 搜索 */
    h += '<div class="search-bar">' +
      '<span class="icon">✦</span>' +
      '<input id="searchInput" type="search" placeholder="搜索标题、摘要或标签…" value="' + esc(state.q) + '">' +
    '</div>';

    /* 标签筛选 */
    if (tags.length) {
      h += '<div class="tag-cloud" style="padding:18px 20px">' +
        '<a href="#/" class="' + (state.tag ? '' : 'active') + '" style="' + (state.tag ? '' : 'background:rgba(167,139,250,.3);color:#fff') + '">全部</a>';
      for (var i = 0; i < tags.length; i++) {
        var on = state.tag === tags[i].name;
        h += '<a href="#/tag/' + encodeURIComponent(tags[i].name) + '"' +
          (on ? ' style="background:rgba(167,139,250,.3);color:#fff"' : '') +
          '>' + esc(tags[i].name) + '<span class="cnt">' + tags[i].count + '</span></a>';
      }
      h += '</div>';
    }

    /* 列表标题 */
    var label = state.tag ? '星丛 · ' + state.tag : (state.q ? '搜索 · ' + state.q : '最近的光');
    h += '<div class="sec-title">' + esc(label) + ' · ' + filtered.length + ' 篇</div>';

    if (!pageItems.length) {
      h += '<div class="panel empty"><span class="big">🌌</span>这里还没有星光落下的痕迹。<br>换个关键词试试。</div>';
    } else {
      h += '<div class="post-list">';
      for (var j = 0; j < pageItems.length; j++) h += cardHtml(pageItems[j]);
      h += '</div>';
    }

    /* 分页 */
    if (totalPages > 1) {
      h += '<div class="pager">';
      h += '<button data-p="' + (state.page - 1) + '"' + (state.page === 1 ? ' disabled' : '') + '>←</button>';
      for (var p = 1; p <= totalPages; p++) {
        h += '<button data-p="' + p + '" class="' + (p === state.page ? 'active' : '') + '">' + p + '</button>';
      }
      h += '<button data-p="' + (state.page + 1) + '"' + (state.page === totalPages ? ' disabled' : '') + '>→</button>';
      h += '</div>';
    }

    app.innerHTML = h;
    bindHome();
  }

  function cardHtml(post) {
    var href = '#/post/' + encodeURIComponent(post.slug);
    /* 注意：卡片容器不能用 <a> 包 <a>（标签也是链接），否则 HTML 解析器
       会强制提前闭合外层锚点，整张卡片的链接结构被打断。
       所以容器用 <article>，标题用真实 <a>，其余区域用 JS 代理跳转。 */
    var h = '<article class="post-card" data-slug="' + esc(post.slug) +
            '" tabindex="0" role="link" aria-label="打开文章：' + esc(post.title) + '">';
    h += '<div class="meta"><span>' + esc(fmtDate(post.date)) + '</span><i class="dot"></i>' +
         '<span>' + esc(post.category || '随笔') + '</span><i class="dot"></i>' +
         '<span>约 ' + post.readingTime + ' 分钟</span></div>';
    h += '<h2><a class="card-link" href="' + href + '">' + esc(post.title) + '</a></h2>';
    h += '<p class="excerpt">' + esc(post.excerpt) + '</p>';
    if (post.tags && post.tags.length) {
      h += '<div class="tag-row">';
      for (var i = 0; i < post.tags.length; i++) h += tagHtml(post.tags[i]);
      h += '</div>';
    }
    h += '</article>';
    return h;
  }

  function bindHome() {
    var input = document.getElementById('searchInput');
    if (input) {
      input.addEventListener('input', function () {
        state.q = input.value.trim();
        state.page = 1;
        viewHome();
        var again = document.getElementById('searchInput');
        if (again) { again.focus(); again.value = state.q; again.setSelectionRange(state.q.length, state.q.length); }
      });
    }

    var pager = app.querySelector('.pager');
    if (pager) {
      pager.addEventListener('click', function (e) {
        var b = e.target.closest('button');
        if (!b || b.disabled) return;
        state.page = parseInt(b.getAttribute('data-p'), 10) || 1;
        viewHome();
        window.scrollTo({ top: app.offsetTop - 90, behavior: 'smooth' });
      });
    }

    bindCards();
  }

  function bindCards() {
    var cards = app.querySelectorAll('.post-card');
    for (var i = 0; i < cards.length; i++) {
      (function (card) {
        var go = function () {
          var slug = card.getAttribute('data-slug');
          if (slug) location.hash = '#/post/' + encodeURIComponent(slug);
        };

        /* 整卡点击：标签链接和标题链接自行处理，其余区域代理跳转 */
        card.addEventListener('click', function (e) {
          if (e.target.closest('a')) return;
          go();
        });

        /* 键盘可达 */
        card.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
        });

        /* 光标跟随辉光 */
        card.addEventListener('mousemove', function (e) {
          var r = card.getBoundingClientRect();
          card.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100) + '%');
          card.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100) + '%');
        });
      })(cards[i]);
    }
  }

  /* ---------------- 页面：文章详情 ---------------- */

  function viewPost(slug) {
    var idx = -1, i;
    for (i = 0; i < POSTS.length; i++) if (POSTS[i].slug === slug) { idx = i; break; }
    if (idx < 0) return viewNotFound();

    var post = POSTS[idx];
    app.innerHTML = '<div class="loading-sky"><span></span><span></span><span></span></div>';

    get(encodeURI(post.file)).then(function (raw) {
      var body = stripFrontMatter(raw);
      var html = markdownToHtml(body);

      var h = '';
      h += '<div class="panel article-head">' +
        '<div class="meta"><span>' + esc(fmtDate(post.date)) + '</span><i class="dot"></i>' +
        '<span>' + esc(post.category || '随笔') + '</span><i class="dot"></i>' +
        '<span>约 ' + post.readingTime + ' 分钟</span><i class="dot"></i>' +
        '<span>' + post.words + ' 字</span></div>' +
        '<h1>' + esc(post.title) + '</h1>' +
        '<div class="tag-row">';
      for (var k = 0; k < (post.tags || []).length; k++) h += tagHtml(post.tags[k]);
      h += '</div></div>';

      h += '<nav class="panel toc" id="toc" hidden><h4>星图目录</h4><ol></ol></nav>';

      h += '<article class="panel markdown-body">' + html + '</article>';

      h += editBtn(post.file, '在 GitHub 编辑这篇');

      h += '<div class="post-nav">';
      if (POSTS[idx + 1]) {
        h += '<a href="#/post/' + encodeURIComponent(POSTS[idx + 1].slug) + '">' +
             '<span class="lbl">← 上一篇</span><span class="ttl">' + esc(POSTS[idx + 1].title) + '</span></a>';
      } else h += '<span></span>';
      if (POSTS[idx - 1]) {
        h += '<a class="next" href="#/post/' + encodeURIComponent(POSTS[idx - 1].slug) + '">' +
             '<span class="lbl">下一篇 →</span><span class="ttl">' + esc(POSTS[idx - 1].title) + '</span></a>';
      } else h += '<span></span>';
      h += '</div>';

      app.innerHTML = h;

      postProcess(app.querySelector('.markdown-body'));
      buildToc(app.querySelector('.markdown-body'));
      window.scrollTo(0, 0);
    }).catch(function (err) {
      app.innerHTML = '<div class="panel empty"><span class="big">💫</span>' +
        '这篇文章走失在星海里了。<br><code>' + esc(err.message) + '</code></div>';
    });
  }

  function stripFrontMatter(raw) {
    var m = /^\uFEFF?---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(raw);
    return m ? raw.slice(m[0].length) : raw;
  }

  function markdownToHtml(md) {
    if (typeof marked === 'undefined') return '<p>Markdown 引擎未加载。</p>';
    if (marked.setOptions) {
      marked.setOptions({ gfm: true, breaks: false, headerIds: false, mangle: false });
    }
    return marked.parse(md);
  }

  function postProcess(root) {
    if (!root) return;
    var i;

    /* 外链新窗口 */
    var links = root.querySelectorAll('a[href^="http"]');
    for (i = 0; i < links.length; i++) {
      if (links[i].host !== location.host) {
        links[i].setAttribute('target', '_blank');
        links[i].setAttribute('rel', 'noopener');
      }
    }

    /* 代码高亮 */
    if (typeof hljs !== 'undefined') {
      var blocks = root.querySelectorAll('pre code');
      for (i = 0; i < blocks.length; i++) {
        try { hljs.highlightElement(blocks[i]); } catch (e) { /* noop */ }
      }
    }

    /* 表格包裹，避免溢出 */
    var tables = root.querySelectorAll('table');
    for (i = 0; i < tables.length; i++) {
      var w = document.createElement('div');
      w.className = 'table-wrap';
      tables[i].parentNode.insertBefore(w, tables[i]);
      w.appendChild(tables[i]);
    }
  }

  function slugify(text) {
    return String(text)
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'h';
  }

  function buildToc(root) {
    var nav = document.getElementById('toc');
    if (!nav || !root) return;

    var heads = root.querySelectorAll('h2, h3');
    if (heads.length < 2) { nav.remove(); return; }

    var used = {}, list = '', i;
    for (i = 0; i < heads.length; i++) {
      var id = slugify(heads[i].textContent);
      var base = id, n = 2;
      while (used[id]) { id = base + '-' + n; n++; }
      used[id] = true;
      heads[i].id = id;

      list += '<li class="' + (heads[i].tagName === 'H3' ? 'lv3' : '') + '">' +
              '<a href="#' + id + '" data-target="' + id + '">' + esc(heads[i].textContent) + '</a></li>';
    }

    nav.querySelector('ol').innerHTML = list;
    nav.hidden = false;

    scrollSpy = [];
    var anchors = nav.querySelectorAll('a');
    for (i = 0; i < anchors.length; i++) {
      (function (a) {
        var target = document.getElementById(a.getAttribute('data-target'));
        if (target) { scrollSpy.push({ a: a, el: target }); }
        a.addEventListener('click', function (e) {
          e.preventDefault();
          if (target) {
            var y = target.getBoundingClientRect().top + window.pageYOffset - 100;
            window.scrollTo({ top: y, behavior: 'smooth' });
            history.replaceState(null, '', location.pathname + location.search + '#/post/' +
              encodeURIComponent(currentSlug) + '#' + target.id);
          }
        });
      })(anchors[i]);
    }
  }

  /* ---------------- 页面：标签 ---------------- */

  function viewTags() {
    var tags = allTags();
    var h = '';

    h += '<section class="hero" style="padding-bottom:20px">' +
      '<span class="hero-badge">✧ CONSTELLATIONS ✧</span>' +
      '<h1 style="margin-top:16px">星丛<span class="grad">索引</span></h1>' +
      '<p class="sub">每篇文章都归属于某片星云。循着标签，可以走进同一条思绪的深处。</p>' +
    '</section>';

    if (!tags.length) {
      h += '<div class="panel empty"><span class="big">🌠</span>还没有任何标签。</div>';
      app.innerHTML = h;
      return;
    }

    h += '<div class="tag-cloud">';
    for (var i = 0; i < tags.length; i++) {
      h += '<a href="#/tag/' + encodeURIComponent(tags[i].name) + '">' +
           esc(tags[i].name) + '<span class="cnt">' + tags[i].count + '</span></a>';
    }
    h += '</div>';

    for (var j = 0; j < tags.length; j++) {
      var list = POSTS.filter(function (p) {
        return (p.tags || []).indexOf(tags[j].name) >= 0;
      });
      h += '<div class="sec-title">' + esc(tags[j].name) + ' · ' + list.length + ' 篇</div>';
      h += '<div class="post-list">';
      for (var k = 0; k < list.length; k++) h += cardHtml(list[k]);
      h += '</div>';
    }

    app.innerHTML = h;
    bindCards();
  }

  function viewTag(name) {
    state.tag = name;
    state.q = '';
    state.page = 1;

    var list = POSTS.filter(function (p) {
      return (p.tags || []).indexOf(name) >= 0;
    });

    var h = '<section class="hero" style="padding-bottom:26px">' +
      '<span class="hero-badge">✧ TAG ✧</span>' +
      '<h1 style="margin-top:16px">' + esc(name) + '</h1>' +
      '<p class="sub">共 ' + list.length + ' 篇文章属于这片星丛。<a href="#/tags" style="color:var(--sky)">← 返回星丛索引</a></p>' +
    '</section>';

    if (!list.length) {
      h += '<div class="panel empty"><span class="big">🌌</span>这个标签下还没有文章。</div>';
    } else {
      h += '<div class="post-list">';
      for (var i = 0; i < list.length; i++) h += cardHtml(list[i]);
      h += '</div>';
    }

    app.innerHTML = h;
    bindCards();
  }

  /* ---------------- 页面：关于 ---------------- */

  function viewAbout() {
    app.innerHTML = '<div class="loading-sky"><span></span><span></span><span></span></div>';

    Promise.all([get('data/profile.json'), get('about.md')]).then(function (res) {
      var profile = {};
      try { profile = JSON.parse(res[0]); } catch (e) { profile = {}; }
      var body = stripFrontMatter(res[1]);
      var html = markdownToHtml(body);

      var h = '';
      h += '<div class="panel about-hero">' +
        '<div class="avatar">' + esc(profile.emoji || '🌌') + '</div>' +
        '<div>' +
          '<h1>' + esc(profile.name || '关于') + '</h1>' +
          (profile.title ? '<p>' + esc(profile.title) + '</p>' : '') +
        '</div>' +
      '</div>';

      /* 链接 */
      if (profile.links && profile.links.length) {
        h += '<div class="tag-cloud" style="padding:18px 20px">';
        for (var i = 0; i < profile.links.length; i++) {
          h += '<a href="' + esc(profile.links[i].url) + '" target="_blank" rel="noopener">✦ ' +
               esc(profile.links[i].label) + '</a>';
        }
        h += '</div>';
      }

      /* 技能 */
      if (profile.skills && profile.skills.length) {
        h += '<div class="sec-title">STELLAR SKILLS</div>';
        h += '<div class="skill-grid">';
        for (var j = 0; j < profile.skills.length; j++) {
          h += '<div class="skill"><b>' + esc(profile.skills[j].name) + '</b>' +
               '<span>' + esc(profile.skills[j].desc) + '</span></div>';
        }
        h += '</div>';
      }

      h += '<article class="panel markdown-body">' + html + '</article>';

      h += editBtn('about.md', '在 GitHub 编辑这一页');

      app.innerHTML = h;
      postProcess(app.querySelector('.markdown-body'));
      window.scrollTo(0, 0);
    }).catch(function (err) {
      app.innerHTML = '<div class="panel empty"><span class="big">🪐</span>' +
        '关于页加载失败。<br><code>' + esc(err.message) + '</code></div>';
    });
  }

  /* ---------------- 页面：404 ---------------- */

  function viewNotFound() {
    app.innerHTML = '<div class="panel empty" style="padding:90px 30px">' +
      '<span class="big">🌑</span>' +
      '<h2 style="color:#fff;margin:0 0 10px">这条轨道上没有星星</h2>' +
      '<p>你访问的页面走失了。<a href="#/" style="color:var(--sky)">回到星海 →</a></p>' +
    '</div>';
  }

  /* ---------------- 扩展点：给 cms.js 等插件用 ---------------- */

  window.NEBULA = {
    esc: esc,
    fmtDate: fmtDate,
    renderMarkdown: function (md) { return markdownToHtml(md); },
    enhance: postProcess,
    site: function () { return SITE; },
    reloadIndex: function () {
      return get('data/posts.json').then(function (t) {
        POSTS = JSON.parse(t);
        POSTS.sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
        return POSTS;
      });
    }
  };

  /* ---------------- 数据 ---------------- */

  function allTags() {
    var map = {};
    POSTS.forEach(function (p) {
      (p.tags || []).forEach(function (t) { map[t] = (map[t] || 0) + 1; });
    });
    return Object.keys(map)
      .map(function (k) { return { name: k, count: map[k] }; })
      .sort(function (a, b) { return b.count - a.count || a.name.localeCompare(b.name); });
  }

  function filterPosts() {
    var q = state.q.toLowerCase();
    return POSTS.filter(function (p) {
      if (state.tag && (p.tags || []).indexOf(state.tag) < 0) return false;
      if (!q) return true;
      var hay = (p.title + ' ' + p.excerpt + ' ' + (p.tags || []).join(' ') + ' ' + (p.category || '')).toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }

  function totalWords() {
    var n = 0;
    POSTS.forEach(function (p) { n += (p.words || 0); });
    if (n >= 10000) return (n / 10000).toFixed(1) + 'w';
    return n;
  }

  /* ---------------- 路由 ---------------- */

  var currentSlug = '';

  function router() {
    var hash = (location.hash || '#/').replace(/^#/, '');
    var clean = hash.split('#')[0];            // 去掉目录锚点
    var parts = clean.split('/').filter(Boolean);

    scrollSpy = [];

    if (!parts.length) {
      state.tag = ''; state.page = 1;
      syncNav('home');
      viewHome();
      return;
    }

    if (parts[0] === 'post' && parts[1]) {
      currentSlug = decodeURIComponent(parts[1]);
      state.tag = ''; state.q = '';
      syncNav('home');
      viewPost(currentSlug);
      return;
    }

    if (parts[0] === 'tags') { syncNav('tags'); viewTags(); return; }

    if (parts[0] === 'tag' && parts[1]) {
      syncNav('tags');
      viewTag(decodeURIComponent(parts[1]));
      return;
    }

    if (parts[0] === 'about') { syncNav('about'); viewAbout(); return; }

    /* 扩展路由（如 #/admin，由 cms.js 注册） */
    var ext = window.NEBULA_VIEWS && window.NEBULA_VIEWS[parts[0]];
    if (ext) {
      syncNav('');
      ext(parts.slice(1));
      return;
    }

    viewNotFound();
  }

  function syncNav(route) {
    var links = document.querySelectorAll('.site-nav a[data-route]');
    for (var i = 0; i < links.length; i++) {
      links[i].classList.toggle('active', links[i].getAttribute('data-route') === route);
    }
    closeNav();
  }

  /* ---------------- 全局交互 ---------------- */

  function closeNav() {
    var nav = document.getElementById('siteNav');
    var btn = document.getElementById('navToggle');
    if (nav) nav.classList.remove('open');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  function initUI() {
    var btn = document.getElementById('navToggle');
    var nav = document.getElementById('siteNav');
    if (btn && nav) {
      btn.addEventListener('click', function () {
        var open = nav.classList.toggle('open');
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    }

    var toTop = document.getElementById('toTop');
    if (toTop) {
      toTop.addEventListener('click', function () {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }

    var year = document.getElementById('footYear');
    if (year) year.textContent = new Date().getFullYear();

    /* 阅读进度条 */
    var bar = document.createElement('div');
    bar.className = 'progress';
    document.body.appendChild(bar);

    var ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        var y = window.pageYOffset || document.documentElement.scrollTop;
        var max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
        bar.style.width = Math.min(100, (y / max) * 100) + '%';

        if (toTop) toTop.classList.toggle('show', y > 420);

        var header = document.getElementById('siteHeader');
        if (header) header.style.background = y > 60
          ? 'linear-gradient(180deg, rgba(8,10,28,.95), rgba(8,10,28,.7))'
          : '';

        /* 目录高亮 */
        if (scrollSpy.length) {
          var active = null;
          for (var i = 0; i < scrollSpy.length; i++) {
            if (scrollSpy[i].el.getBoundingClientRect().top <= 140) active = scrollSpy[i];
          }
          for (var j = 0; j < scrollSpy.length; j++) {
            scrollSpy[j].a.classList.remove('active');
          }
          if (active) active.a.classList.add('active');
        }
        ticking = false;
      });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ---------------- 启动 ---------------- */

  function boot() {
    initUI();

    Promise.all([
      get('data/site.json').catch(function () { return '{}'; }),
      get('data/posts.json').catch(function () { return '[]'; })
    ]).then(function (res) {
      try { SITE = JSON.parse(res[0]) || {}; } catch (e) { SITE = {}; }
      try { POSTS = JSON.parse(res[1]) || []; } catch (e) { POSTS = []; }

      POSTS.sort(function (a, b) { return new Date(b.date) - new Date(a.date); });

      if (SITE.title) document.title = SITE.title;
      if (SITE.github) {
        var gh = document.querySelector('.gh-link');
        if (gh) gh.href = SITE.github;
      }

      window.addEventListener('hashchange', router);
      router();
    }).catch(function (err) {
      app.innerHTML = '<div class="panel empty"><span class="big">🌌</span>' +
        '站点数据加载失败：' + esc(err.message) + '</div>';
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
