(function () {
  "use strict";
  var SVGNS = "http://www.w3.org/2000/svg";
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function el(name, attrs, parent) {
    var node = document.createElementNS(SVGNS, name);
    for (var k in attrs) node.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(node);
    return node;
  }

  // ---------- figure panels ----------
  document.querySelectorAll(".actions button[aria-controls]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var panel = document.getElementById(btn.getAttribute("aria-controls"));
      var open = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", String(!open));
      panel.hidden = open;
      if (!open && panel.id === "ttt-figs") drawTTT();
    });
  });

  // ---------- theme toggle ----------
  var toggle = document.getElementById("theme-toggle");
  function currentTheme() {
    var t = document.documentElement.dataset.theme;
    if (t) return t;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  function labelToggle() { toggle.textContent = currentTheme() === "dark" ? "light mode" : "dark mode"; }
  if (toggle) {
    labelToggle();
    toggle.addEventListener("click", function () {
      var next = currentTheme() === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem("theme", next); } catch (e) {}
      labelToggle();
    });
  }

  // ---------- toy: Adam from a checkpoint, cold start vs rebuilt state ----------
  // The checkpoint lies on the floor of a narrow valley. Fine-tuning moves along the valley.
  // Cold Adam (m = v = 0) takes a first step of the full learning rate along both axes.
  // Rebuilt state: 200 tiny Adam steps at the checkpoint estimate the gradient's second moment first.
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(r) {
    var u = 0, v = 0;
    while (!u) u = r();
    while (!v) v = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  var P = { start: [-0.37, 0.07], target: [0.35, -0.04], sw: 0.05, sig: [0.12, 2.5], lr: 0.055, steps: 45 };
  P.phi = Math.atan2(P.start[1] - P.target[1], P.start[0] - P.target[0]);
  P.su = Math.hypot(P.start[0] - P.target[0], P.start[1] - P.target[1]);
  var cphi = Math.cos(P.phi), sphi = Math.sin(P.phi);
  function toUW(x, y) {
    var dx = x - P.target[0], dy = y - P.target[1];
    return [cphi * dx + sphi * dy, -sphi * dx + cphi * dy];
  }
  function loss(x, y) {
    var uw = toUW(x, y);
    return 0.5 * (uw[0] * uw[0] / (P.su * P.su) + uw[1] * uw[1] / (P.sw * P.sw));
  }
  function simulate(mode, seed) {
    var r = mulberry32(seed), b1 = 0.9, b2 = 0.99, m = [0, 0], v = [0, 0], t = 0;
    var x = P.start[0], y = P.start[1], w0 = toUW(x, y)[1];
    function noisyGrad(source) {
      var uw = toUW(x, y);
      var g = source ? [0, (uw[1] - w0) / (P.sw * P.sw)] : [uw[0] / (P.su * P.su), uw[1] / (P.sw * P.sw)];
      return [g[0] + P.sig[0] * gauss(r), g[1] + P.sig[1] * gauss(r)];
    }
    function adam(g, tt) {
      for (var i = 0; i < 2; i++) { m[i] = b1 * m[i] + (1 - b1) * g[i]; v[i] = b2 * v[i] + (1 - b2) * g[i] * g[i]; }
      var c1 = 1 - Math.pow(b1, tt), c2 = 1 - Math.pow(b2, tt);
      return [m[0] / c1 / (Math.sqrt(v[0] / c2) + 1e-8), m[1] / c1 / (Math.sqrt(v[1] / c2) + 1e-8)];
    }
    if (mode === "warm") { for (var k = 1; k <= 200; k++) adam(noisyGrad(true), k); t = 200; }
    var path = [[x, y]], L = [loss(x, y)];
    for (var s = 1; s <= P.steps; s++) {
      t++;
      var d = adam(noisyGrad(false), t);
      var du = -P.lr * d[0], dw = -P.lr * d[1];
      x += cphi * du - sphi * dw;
      y += sphi * du + cphi * dw;
      path.push([x, y]); L.push(loss(x, y));
    }
    return { path: path, L: L };
  }

  var toy = document.getElementById("toy");
  if (toy) {
    var W = 236, MAPH = 128, S = W / 0.94, cx0 = W / 2, cy0 = MAPH / 2;
    var sx = function (x) { return cx0 + x * S; };
    var sy = function (y) { return cy0 - y * S; };
    var defs = el("defs", {}, toy);
    var clip = el("clipPath", { id: "toy-clip" }, defs);
    el("rect", { x: 0, y: 0, width: W, height: MAPH }, clip);
    var map = el("g", { "clip-path": "url(#toy-clip)" }, toy);

    // contours of the fine-tuning loss, shaded like a depth chart
    var levels = [4.5, 3.2, 2.2, 1.5, 1.0, 0.65, 0.4, 0.22, 0.1, 0.03];
    var deg = -P.phi * 180 / Math.PI;
    levels.forEach(function (lv, i) {
      el("ellipse", {
        cx: sx(P.target[0]), cy: sy(P.target[1]),
        rx: P.su * Math.sqrt(2 * lv) * S, ry: P.sw * Math.sqrt(2 * lv) * S,
        transform: "rotate(" + deg + " " + sx(P.target[0]) + " " + sy(P.target[1]) + ")",
        style: "fill:var(--navy);fill-opacity:" + (0.035 + i * 0.006) + ";stroke:var(--navy);stroke-opacity:0.32",
        "stroke-width": 0.6
      }, map);
    });
    el("path", {
      d: "M" + (sx(P.target[0]) - 3) + " " + (sy(P.target[1]) - 3) + "l6 6m0 -6l-6 6",
      style: "stroke:var(--ink-2)", "stroke-width": 1.1
    }, map);
    var coldLine = el("polyline", { fill: "none", style: "stroke:var(--sand)", "stroke-width": 1.7, "stroke-linejoin": "round", "stroke-linecap": "round" }, map);
    var warmLine = el("polyline", { fill: "none", style: "stroke:var(--teal)", "stroke-width": 1.7, "stroke-linejoin": "round", "stroke-linecap": "round" }, map);
    el("circle", { cx: sx(P.start[0]), cy: sy(P.start[1]), r: 4, style: "fill:var(--paper);stroke:var(--ink)", "stroke-width": 1.3 }, map);
    var ckpt = el("text", { x: sx(P.start[0]) - 6, y: sy(P.start[1]) - 26, "font-size": 9, style: "fill:var(--ink-2)" }, map);
    ckpt.textContent = "checkpoint";
    var goal = el("text", { x: sx(P.target[0]) - 26, y: sy(P.target[1]) + 30, "font-size": 9, style: "fill:var(--ink-2)" }, map);
    goal.textContent = "new task";
    el("line", { x1: 0, x2: W, y1: MAPH, y2: MAPH, style: "stroke:var(--rule)" }, toy);

    // loss trace
    var SP = { x0: 34, x1: W - 10, y0: MAPH + 8, y1: 170 };
    var lossLabel = el("text", { x: 10, y: SP.y0 + 15, "font-size": 9, style: "fill:var(--muted)" }, toy);
    lossLabel.textContent = "loss";
    var coldTrace = el("polyline", { fill: "none", style: "stroke:var(--sand)", "stroke-width": 1.3 }, toy);
    var warmTrace = el("polyline", { fill: "none", style: "stroke:var(--teal)", "stroke-width": 1.3 }, toy);

    var seeds = [1, 2, 3, 4, 5], seedIdx = 0, timer = null;
    function pts(path, n) {
      return path.slice(0, n).map(function (p) { return sx(p[0]).toFixed(1) + "," + sy(p[1]).toFixed(1); }).join(" ");
    }
    function trace(L, n, maxL) {
      var out = [];
      for (var i = 0; i < n; i++) {
        var X = SP.x0 + (SP.x1 - SP.x0) * i / P.steps;
        var Y = SP.y1 - (SP.y1 - SP.y0) * Math.min(L[i], maxL) / maxL;
        out.push(X.toFixed(1) + "," + Y.toFixed(1));
      }
      return out.join(" ");
    }
    function play() {
      if (timer) cancelAnimationFrame(timer);
      var seed = seeds[seedIdx++ % seeds.length];
      var cold = simulate("cold", seed), warm = simulate("warm", seed);
      var maxL = Math.max.apply(null, cold.L.concat(warm.L)) * 1.05;
      var n = reduceMotion ? P.steps + 1 : 1, last = 0;
      function frame(ts) {
        if (!last) last = ts;
        if (ts - last > 55) { n++; last = ts; }
        coldLine.setAttribute("points", pts(cold.path, n));
        warmLine.setAttribute("points", pts(warm.path, n));
        coldTrace.setAttribute("points", trace(cold.L, n, maxL));
        warmTrace.setAttribute("points", trace(warm.L, n, maxL));
        if (n <= P.steps) timer = requestAnimationFrame(frame);
      }
      timer = requestAnimationFrame(frame);
    }
    var replay = document.getElementById("toy-replay");
    if (replay) replay.addEventListener("click", play);
    if ("IntersectionObserver" in window && !reduceMotion) {
      var io = new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) { play(); io.disconnect(); }
      }, { threshold: 0.6 });
      io.observe(toy);
    } else {
      play();
    }
  }

  // ---------- TTT: decomposition chart ----------
  var TTT = {
    lengths: ["4k", "8k", "16k", "32k", "64k", "64k, YaRN"],
    total: [[1.1, 0.8, 1.5], [1.9, 1.5, 2.3], [3.3, 2.9, 3.8], [-0.9, -1.4, -0.5], [3.2, 2.6, 3.8], [-1.7, -2.3, -1.2]],
    update: [[0.0, 0.0, 0.0], [-0.2, -0.4, 0.0], [-0.4, -0.6, -0.2], [0.2, -0.1, 0.5], [0.1, -0.4, 0.6], [-2.5, -3.0, -2.1]],
    training: [[1.1, 0.8, 1.5], [2.1, 1.7, 2.5], [3.8, 3.3, 4.2], [-1.1, -1.5, -0.7], [3.1, 2.5, 3.7], [0.8, 0.3, 1.3]]
  };
  var tttDrawn = false, tttMode = "split";
  function fmt(v) { return (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(1); }
  function drawTTT() {
    var svg = document.getElementById("ttt-chart");
    if (!svg) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    tttDrawn = true;
    var Wc = 640, Hc = 300, m = { l: 46, r: 14, t: 18, b: 44 }, lo = -3.5, hi = 4.5;
    var band = (Wc - m.l - m.r) / TTT.lengths.length;
    var X = function (i) { return m.l + band * (i + 0.5); };
    var Y = function (v) { return m.t + (hi - v) / (hi - lo) * (Hc - m.t - m.b); };
    for (var g = -3; g <= 4; g++) {
      el("line", { x1: m.l, x2: Wc - m.r, y1: Y(g), y2: Y(g), style: "stroke:var(--" + (g === 0 ? "muted" : "rule") + ")", "stroke-width": g === 0 ? 1 : 0.7 }, svg);
      var tl = el("text", { x: m.l - 8, y: Y(g) + 4, "text-anchor": "end", "font-size": 12 }, svg);
      tl.textContent = g === 0 ? "0" : (g > 0 ? "+" : "−") + Math.abs(g);
    }
    var yl = el("text", { x: 12, y: Y(0.5), "font-size": 12, transform: "rotate(-90 12 " + Y(0.5) + ")", "text-anchor": "middle" }, svg);
    yl.textContent = "RULER points";
    TTT.lengths.forEach(function (lab, i) {
      var t = el("text", { x: X(i), y: Hc - m.b + 22, "text-anchor": "middle", "font-size": 13 }, svg);
      t.textContent = lab;
    });
    var note = document.getElementById("ttt-note");
    var series = tttMode === "total"
      ? [{ key: "total", label: "TTT minus control", color: "var(--ink)", dx: 0 }]
      : [{ key: "training", label: "training effect", color: "var(--teal)", dx: -14 }, { key: "update", label: "update effect", color: "var(--coral)", dx: 14 }];
    series.forEach(function (s) {
      var d = TTT[s.key];
      el("polyline", {
        points: d.map(function (p, i) { return (X(i) + s.dx) + "," + Y(p[0]); }).join(" "),
        fill: "none", style: "stroke:" + s.color + ";stroke-opacity:0.35", "stroke-width": 1.2
      }, svg);
      d.forEach(function (p, i) {
        var gx = X(i) + s.dx;
        el("line", { x1: gx, x2: gx, y1: Y(p[1]), y2: Y(p[2]), style: "stroke:" + s.color, "stroke-width": 2 }, svg);
        var dot = el("circle", { cx: gx, cy: Y(p[0]), r: 5.5, style: "fill:" + s.color + ";stroke:var(--paper)", "stroke-width": 1.5, tabindex: 0 }, svg);
        var text = TTT.lengths[i] + ", " + s.label + ": " + fmt(p[0]) + " points (95% interval " + fmt(p[1]) + " to " + fmt(p[2]) + ")";
        el("title", {}, dot).textContent = text;
        var show = function () { note.textContent = text; };
        dot.addEventListener("mouseenter", show);
        dot.addEventListener("focus", show);
        dot.addEventListener("click", show);
      });
    });
    // legend
    var lx = m.l + 6;
    series.forEach(function (s) {
      el("circle", { cx: lx + 5, cy: m.t + 2, r: 5, style: "fill:" + s.color }, svg);
      var t = el("text", { x: lx + 15, y: m.t + 6, "font-size": 13, style: "fill:var(--ink-2)" }, svg);
      t.textContent = s.label;
      lx += 26 + s.label.length * 6.6;
    });
  }
  document.querySelectorAll(".seg button").forEach(function (b) {
    b.addEventListener("click", function () {
      tttMode = b.dataset.series;
      document.querySelectorAll(".seg button").forEach(function (o) { o.setAttribute("aria-pressed", String(o === b)); });
      drawTTT();
    });
  });
  if (location.hash === "#ttt") {
    var tb = document.querySelector('[aria-controls="ttt-figs"]');
    if (tb) tb.click();
  }
})();
