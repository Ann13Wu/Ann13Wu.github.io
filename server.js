#!/usr/bin/env node
/* 本地预览服务器：node server.js  → http://127.0.0.1:4173 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = process.env.PORT || 4173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
  if (rel === '/' || rel === '') rel = '/index.html';

  const file = path.join(ROOT, path.normalize(rel));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403); return res.end('Forbidden');
  }

  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found: ' + rel);
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(buf);
  });
}).listen(PORT, () => {
  console.log('星轨纪 本地预览： http://127.0.0.1:' + PORT);
});
