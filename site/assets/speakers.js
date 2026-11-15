/* BFREEKY — Yamaha HS8 as a pure wireframe, drawn with ~90 lines of own 3D code.
   No three.js, no model file, no dependency: cabinet + drivers are built from the real
   dimensions (W250 x H390 x D334 mm) and projected to 2D lines on a canvas.
   Static render (no animation loop); redraws on resize. Hides itself if WebGL-free canvas
   is unavailable. */
(function () {
  'use strict';

  var HS8 = { w: 250, h: 390, d: 334 };
  var WOOFER = { rim: 106, cone: 78, cap: 25, coneDepth: 40, y: -40 };
  var HORN = { plate: 81, dome: 20, y: 110, screwR: 63, screws: 8 };
  var BADGE = { s: 36, y: -172 };

  /* ── helpers that emit line segments [x1,y1,z1, x2,y2,z2] ─────────────── */
  function seg(out, a, b) { out.push([a[0], a[1], a[2], b[0], b[1], b[2]]); }

  function polyline(out, pts, close) {
    for (var i = 0; i < pts.length - 1; i++) seg(out, pts[i], pts[i + 1]);
    if (close) seg(out, pts[pts.length - 1], pts[0]);
  }

  function ring(out, r, cx, cy, cz, n, from, to) {
    from = from || 0; to = (to === undefined ? Math.PI * 2 : to);
    var pts = [];
    for (var i = 0; i <= n; i++) {
      var a = from + (to - from) * (i / n);
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, cz]);
    }
    polyline(out, pts, true);
  }

  /* the cabinet as six faces with outward normals — hidden faces get culled, so the box
     reads like a photo (front + outer flank) instead of an X-ray with lines through the drivers */
  function cabinetFaces() {
    var W = HS8.w / 2, H = HS8.h / 2, D = HS8.d;
    var flb = [-W, -H, 0], frb = [W, -H, 0], frt = [W, H, 0], flt = [-W, H, 0];
    var blb = [-W, -H, -D], brb = [W, -H, -D], brt = [W, H, -D], blt = [-W, H, -D];
    return [
      { n: [0, 0, 1], v: [flb, frb, frt, flt] },      // front
      { n: [0, 0, -1], v: [brb, blb, blt, brt] },     // back
      { n: [-1, 0, 0], v: [blb, flb, flt, blt] },     // left
      { n: [1, 0, 0], v: [frb, brb, brt, frt] },      // right
      { n: [0, 1, 0], v: [flt, frt, brt, blt] },      // top
      { n: [0, -1, 0], v: [blb, brb, frb, flb] }      // bottom
    ];
  }

  function drivers(out) {
    // 1" dome tweeter in its round waveguide plate (upper third)
    ring(out, HORN.plate, 0, HORN.y, 3, 40);
    ring(out, HORN.dome, 0, HORN.y, 5, 24);
    for (var s = 0; s < HORN.screws; s++) {
      var a = s / HORN.screws * Math.PI * 2 + 0.4;
      ring(out, 4, Math.cos(a) * HORN.screwR, HORN.y + Math.sin(a) * HORN.screwR, 1, 6);
    }
    // 8" woofer: basket ring, cone rim, dust cap set back, 12 radial struts
    ring(out, WOOFER.rim, 0, WOOFER.y, 0, 44);
    ring(out, WOOFER.cone, 0, WOOFER.y, -2, 36);
    ring(out, WOOFER.cap, 0, WOOFER.y, -WOOFER.coneDepth, 20);
    var n = 8;
    for (var i = 0; i < n; i++) {
      var ang = i / n * Math.PI * 2;
      seg(out, [Math.cos(ang) * WOOFER.cone, WOOFER.y + Math.sin(ang) * WOOFER.cone, -2],
               [Math.cos(ang) * WOOFER.cap, WOOFER.y + Math.sin(ang) * WOOFER.cap, -WOOFER.coneDepth]);
    }
    for (var k = 0; k < 8; k++) {
      var b = k / 8 * Math.PI * 2 + 0.2;
      ring(out, 4, Math.cos(b) * 99, WOOFER.y + Math.sin(b) * 99, 1, 6);
    }
    // badge, bottom centre
    var s2 = BADGE.s / 2;
    polyline(out, [[-s2, BADGE.y - s2, 1], [s2, BADGE.y - s2, 1], [s2, BADGE.y + s2, 1],
                   [-s2, BADGE.y + s2, 1]], true);
  }

  /* ── projection ───────────────────────────────────────────────────────── */
  function render(canvas, deg) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var cssW = canvas.clientWidth, cssH = canvas.clientHeight;
    if (!cssW || !cssH) return;
    if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
    }
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    var camZ = CAM_Z, f = 2600;          // long lens: product-shot perspective, no fisheye
    var pts = buildSegments(deg);

    // fit: project everything once to find the bounds
    var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, znear = 1e9, zfar = -1e9;
    var flat = pts.map(function (s) {
      var p = [];
      for (var i = 0; i < 6; i += 3) {
        var k = f / (camZ - s[i + 2]);
        var X = s[i] * k, Y = -s[i + 1] * k;
        if (X < minX) minX = X; if (X > maxX) maxX = X;
        if (Y < minY) minY = Y; if (Y > maxY) maxY = Y;
        if (s[i + 2] < znear) znear = s[i + 2];
        if (s[i + 2] > zfar) zfar = s[i + 2];
        p.push(X, Y);
      }
      return p;
    });

    var pad = 6;
    var scale = Math.min((cssW - pad * 2) / (maxX - minX || 1), (cssH - pad * 2) / (maxY - minY || 1));
    var ox = (cssW - (maxX - minX) * scale) / 2 - minX * scale;
    var oy = (cssH - (maxY - minY) * scale) / 2 - minY * scale;

    ctx.lineWidth = 1;
    for (var i = 0; i < flat.length; i++) {
      var p = flat[i], s = pts[i];
      var depth = ((s[2] + s[5]) / 2 - znear) / ((zfar - znear) || 1);   // 0 front, 1 back
      var a = 0.9 - depth * 0.74;    // back edges stay as a faint depth hint, not clutter
      ctx.strokeStyle = 'rgba(255,255,255,' + a.toFixed(3) + ')';
      ctx.beginPath();
      ctx.moveTo(p[0] * scale + ox, p[1] * scale + oy);
      ctx.lineTo(p[2] * scale + ox, p[3] * scale + oy);
      ctx.stroke();
    }
  }

  var CAM_Z = 4200;                    // camera distance in mm (object is 390 mm tall)

  var FACES = cabinetFaces();

  /* everything that ends up on the canvas for a given toe-in: visible face outlines + drivers */
  function buildSegments(deg) {
    var t = deg * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
    function rot(p) { return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]; }
    var out = [];

    FACES.forEach(function (f) {
      var n = rot(f.n), v = f.v.map(rot);
      var ctr = [(v[0][0] + v[2][0]) / 2, (v[0][1] + v[2][1]) / 2, (v[0][2] + v[2][2]) / 2];
      var toCam = [-ctr[0], -ctr[1], CAM_Z - ctr[2]];
      if (n[0] * toCam[0] + n[1] * toCam[1] + n[2] * toCam[2] <= 0) return;   // facing away
      for (var i = 0; i < 4; i++) seg(out, v[i], v[(i + 1) % 4]);
    });

    var flat = [];
    drivers(flat);
    flat.forEach(function (g) {
      var a = rot([g[0], g[1], g[2]]), b = rot([g[3], g[4], g[5]]);
      out.push([a[0], a[1], a[2], b[0], b[1], b[2]]);
    });
    return out;
  }

  var left = document.getElementById('spk-l');
  var right = document.getElementById('spk-r');
  if (!left || !right) return;

  function drawAll() {
    render(left, 26);      // left box turned towards the middle
    render(right, -26);
  }

  var timer = null;
  window.addEventListener('resize', function () {
    clearTimeout(timer);
    timer = setTimeout(drawAll, 120);
  });
  if (document.readyState === 'complete') drawAll();
  else window.addEventListener('load', drawAll);
  drawAll();
})();
