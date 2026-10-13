/* ============================================================
   星空画布：恒星闪烁 + 星尘漂移 + 偶发流星
   ============================================================ */
(function () {
  'use strict';

  var canvas = document.getElementById('sky');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');

  var reduced = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var W = 0, H = 0, DPR = 1;
  var stars = [], dust = [], meteors = [];
  var t = 0;

  var PALETTE = ['#ffffff', '#dbeafe', '#e9d5ff', '#fbcfe8', '#cffafe'];

  function rand(a, b) { return a + Math.random() * (b - a); }

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    build();
  }

  function build() {
    var density = Math.round((W * H) / 7200);
    density = Math.max(90, Math.min(density, 460));

    stars = [];
    for (var i = 0; i < density; i++) {
      var big = Math.random() < 0.09;
      stars.push({
        x: rand(0, W),
        y: rand(0, H),
        r: big ? rand(1.25, 2.1) : rand(0.35, 1.05),
        a: rand(0.28, 0.95),
        sp: rand(0.006, 0.028),
        ph: rand(0, Math.PI * 2),
        c: PALETTE[(Math.random() * PALETTE.length) | 0],
        vy: rand(-0.045, -0.008),
        tw: big
      });
    }

    dust = [];
    for (var j = 0; j < 34; j++) {
      dust.push({
        x: rand(0, W), y: rand(0, H),
        r: rand(0.6, 2.2),
        vx: rand(-0.10, 0.10),
        vy: rand(-0.14, -0.03),
        a: rand(0.05, 0.20)
      });
    }
  }

  function spawnMeteor() {
    var fromLeft = Math.random() < 0.5;
    meteors.push({
      x: fromLeft ? rand(-60, W * 0.4) : rand(W * 0.6, W + 60),
      y: rand(-40, H * 0.42),
      len: rand(90, 210),
      vx: (fromLeft ? 1 : -1) * rand(4.6, 8.2),
      vy: rand(2.0, 3.6),
      life: 1
    });
  }

  function drawStar(s) {
    var alpha = s.a + Math.sin(t * s.sp + s.ph) * 0.34;
    if (alpha < 0.05) alpha = 0.05;
    if (alpha > 1) alpha = 1;

    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fillStyle = s.c;
    ctx.globalAlpha = alpha;
    ctx.shadowBlur = s.tw ? 12 : 5;
    ctx.shadowColor = s.c;
    ctx.fill();

    if (s.tw) {
      ctx.globalAlpha = alpha * 0.42;
      ctx.beginPath();
      ctx.moveTo(s.x - s.r * 3.4, s.y);
      ctx.lineTo(s.x + s.r * 3.4, s.y);
      ctx.moveTo(s.x, s.y - s.r * 3.4);
      ctx.lineTo(s.x, s.y + s.r * 3.4);
      ctx.lineWidth = 0.7;
      ctx.strokeStyle = s.c;
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  function drawMeteor(m) {
    var nx = m.x - m.vx, ny = m.y - m.vy;
    var g = ctx.createLinearGradient(m.x, m.y, nx, ny);
    g.addColorStop(0, 'rgba(255,255,255,' + (0.9 * m.life).toFixed(3) + ')');
    g.addColorStop(0.4, 'rgba(196,181,253,' + (0.45 * m.life).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(167,139,250,0)');
    ctx.strokeStyle = g;
    ctx.lineWidth = 1.9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(m.x, m.y);
    ctx.lineTo(nx, ny);
    ctx.stroke();
  }

  function frame() {
    t++;
    ctx.clearRect(0, 0, W, H);

    var i;
    for (i = 0; i < stars.length; i++) {
      var s = stars[i];
      if (!reduced) {
        s.y += s.vy;
        if (s.y < -4) { s.y = H + 4; s.x = rand(0, W); }
      }
      drawStar(s);
    }

    for (i = 0; i < dust.length; i++) {
      var d = dust[i];
      if (!reduced) {
        d.x += d.vx; d.y += d.vy;
        if (d.y < -6) { d.y = H + 6; d.x = rand(0, W); }
        if (d.x < -6) d.x = W + 6;
        if (d.x > W + 6) d.x = -6;
      }
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = d.a;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    if (!reduced) {
      if (meteors.length < 2 && Math.random() < 0.0028) spawnMeteor();
      for (i = meteors.length - 1; i >= 0; i--) {
        var m = meteors[i];
        m.x += m.vx; m.y += m.vy; m.life -= 0.009;
        if (m.life <= 0 || m.y > H + 80) { meteors.splice(i, 1); continue; }
        drawMeteor(m);
      }
    }

    requestAnimationFrame(frame);
  }

  var rt;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(resize, 160);
  });

  resize();
  requestAnimationFrame(frame);
})();
