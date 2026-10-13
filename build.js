#!/usr/bin/env node
/* ============================================================
   扫描 posts/ 下的 .md 文件，解析 frontmatter，生成 data/posts.json
   用法：node build.js
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const POSTS_DIR = path.join(ROOT, 'posts');
const OUT_DIR = path.join(ROOT, 'data');
const OUT_FILE = path.join(OUT_DIR, 'posts.json');

/* ---------- frontmatter ---------- */
function parseFrontMatter(raw) {
  const m = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!m) return { data: {}, body: raw };

  const data = {};
  m[1].split(/\r?\n/).forEach((line) => {
    if (!line.trim() || line.trim().startsWith('#')) return;
    const i = line.indexOf(':');
    if (i < 0) return;

    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();

    // 数组：[a, b, c] 或 ["a", "b"]
    if (/^\[.*\]$/.test(val)) {
      val = val
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
    } else {
      val = val.replace(/^['"]|['"]$/g, '');
    }

    data[key] = val;
  });

  return { data, body: raw.slice(m[0].length) };
}

/* ---------- 统计 ---------- */
function countWords(md) {
  const text = md
    .replace(/```[\s\S]*?```/g, ' ')   // 去掉代码块
    .replace(/`[^`]*`/g, ' ')          // 行内代码
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')  // 链接
    .replace(/[#>*_~|-]/g, ' ');

  const cjk = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const en = (text.match(/[A-Za-z0-9]+/g) || []).length;
  return cjk + en;
}

function makeExcerpt(md, limit) {
  const limitNum = limit || 110;
  const text = md
    .replace(/^---[\s\S]*?---/, '')     // frontmatter
    .replace(/```[\s\S]*?```/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/^#{1,6}\s.*$/gm, '')      // 标题
    .replace(/^>\s?/gm, '')             // 引用符号
    .replace(/[*_`~]/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  return text.length > limitNum ? text.slice(0, limitNum) + '…' : text;
}

function toArray(v) {
  if (v == null) return [];
  return Array.isArray(v) ? v : String(v).split(',').map((s) => s.trim()).filter(Boolean);
}

function slugify(name) {
  return name
    .replace(/\.md$/i, '')
    .replace(/^\d{4}-\d{2}-\d{2}-/, '');   // 去掉日期前缀
}

/* ---------- main ---------- */
function main() {
  if (!fs.existsSync(POSTS_DIR)) {
    console.error('找不到 posts/ 目录');
    process.exit(1);
  }

  const files = fs.readdirSync(POSTS_DIR).filter((f) => /\.md$/i.test(f));

  const posts = files.map((file) => {
    const raw = fs.readFileSync(path.join(POSTS_DIR, file), 'utf8');
    const { data, body } = parseFrontMatter(raw);
    const words = countWords(body);

    return {
      slug: data.slug || slugify(file),
      title: data.title || slugify(file),
      date: data.date || fs.statSync(path.join(POSTS_DIR, file)).mtime.toISOString().slice(0, 10),
      category: data.category || '随笔',
      tags: toArray(data.tags),
      excerpt: data.excerpt || makeExcerpt(body),
      cover: data.cover || '',
      words: words,
      readingTime: Math.max(1, Math.round(words / 350)),
      draft: String(data.draft).toLowerCase() === 'true',
      file: 'posts/' + file
    };
  }).filter((p) => !p.draft);

  posts.sort((a, b) => new Date(b.date) - new Date(a.date));

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(posts, null, 2), 'utf8');

  const tagSet = new Set();
  posts.forEach((p) => p.tags.forEach((t) => tagSet.add(t)));

  console.log('✔ 已生成 data/posts.json');
  console.log('  文章：' + posts.length + ' 篇   标签：' + tagSet.size + ' 个   总字数：' +
    posts.reduce((s, p) => s + p.words, 0));
  posts.forEach((p) => console.log('   · [' + p.date + '] ' + p.title + '  (' + p.slug + ')'));
}

main();
