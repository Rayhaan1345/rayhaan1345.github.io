// Optimizer-state primer: a gradient-descent toy, one weight's running averages, AdamW built in
// stages, the epsilon curve, bytes per parameter, cold against warm step sizes, EWC springs,
// the 200-step Fisher run, similarity against penalty scale, and the condition builder.
// Toys use made-up numbers and say so on the page; model numbers come from the manuscript.
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var B1 = 0.9, B2 = 0.95;

  // ---------- helpers ----------

  function $(id) { return document.getElementById(id); }
  function el(name, attrs, parent) {
    var n = document.createElementNS(NS, name);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function text(parent, x, y, s, attrs) {
    var a = { x: x, y: y };
    for (var k in attrs) a[k] = attrs[k];
    var t = el("text", a, parent);
    t.textContent = s;
    return t;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function width(svg) { return Math.max(300, Math.round(svg.getBoundingClientRect().width || svg.parentNode.clientWidth)); }
  function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function press(buttons, on) { buttons.forEach(function (b) { b.setAttribute("aria-pressed", String(b === on)); }); }
  function debounce(fn) { var t = 0; return function () { clearTimeout(t); t = setTimeout(fn, 150); }; }
  function onVisible(node, fn) {
    if (!("IntersectionObserver" in window)) { fn(); return; }
    var io = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { io.disconnect(); fn(); } }, { threshold: 0.35 });
    io.observe(node);
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(r) { var u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  // Animations run when the reader asks for them; reduced motion only turns off autoplay.
  function tween(ms, fn, done) {
    var t0 = 0;
    requestAnimationFrame(function f(ts) {
      if (!t0) t0 = ts;
      var p = Math.min(1, (ts - t0) / ms);
      fn(ease(p));
      if (p < 1) requestAnimationFrame(f); else if (done) done();
    });
  }
  function chips(container, labels, initial, onPick) {
    var bs = labels.map(function (l, i) {
      var b = document.createElement("button");
      b.type = "button"; b.textContent = l; b.setAttribute("aria-pressed", String(i === initial));
      b.addEventListener("click", function () { press(bs, b); onPick(i); });
      container.appendChild(b);
      return b;
    });
    return bs;
  }
  function group(selector, attr, onPick) {
    var bs = [].slice.call(document.querySelectorAll(selector));
    bs.forEach(function (b) { b.addEventListener("click", function () { press(bs, b); onPick(b.getAttribute(attr)); }); });
    return bs;
  }
  var SUP = { "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };
  function num(x, d) { return x.toFixed(d).replace("-", "\u2212"); }
  function sup(n) { return String(n).split("").map(function (c) { return SUP[c] || c; }).join(""); }
  function sci(x) {
    var e = Math.floor(Math.log10(x) + 1e-9), m = x / Math.pow(10, e);
    if (m >= 9.95) { m = 1; e += 1; }
    return (Math.abs(m - 1) < 0.05 ? "" : m.toFixed(1) + " × ") + "10" + sup(e);
  }
  function legend(svg, x, y, items) {
    items.forEach(function (it) {
      if (it.dot) el("circle", { cx: x + 6, cy: y - 4, r: 3.5, style: it.style }, svg);
      else el("line", { x1: x, x2: x + 16, y1: y - 4, y2: y - 4, style: it.style, "stroke-width": 2.5, "stroke-dasharray": it.dash || "" }, svg);
      var t = text(svg, x + 22, y, it.label, { "font-size": 12.5, style: "fill:var(--ink-2)" });
      x += 34 + t.getComputedTextLength();
    });
  }

  // ---------- 1. gradient descent on a bowl ----------

  (function gd() {
    var svg = $("gd-svg");
    if (!svg) return;
    var note = $("gd-note"), lrIn = $("gd-lr"), lrOut = $("gd-lr-out");
    var th = -2.6, hist = [th], W = 0, busy = false, G = null;
    function L(x) { return 0.5 * x * x; }
    function lr() { return Number(lrIn.value); }
    function build() {
      clear(svg);
      W = width(svg);
      var H = W < 560 ? 220 : 250, m = { l: 8, r: 8, t: 12, b: 28 };
      var X = function (x) { return m.l + (x + 3.3) / 6.6 * (W - m.l - m.r); };
      var Y = function (y) { return m.t + (1 - y / 5.6) * (H - m.t - m.b); };
      el("line", { x1: m.l, x2: W - m.r, y1: Y(0), y2: Y(0), style: "stroke:var(--rule)" }, svg);
      var pts = [];
      for (var k = 0; k <= 160; k++) { var x = -3.3 + 6.6 * k / 160; pts.push(X(x).toFixed(1) + "," + Y(L(x)).toFixed(1)); }
      el("polyline", { points: pts.join(" "), fill: "none", style: "stroke:var(--navy)", "stroke-width": 2.2 }, svg);
      text(svg, X(0), H - 8, "bottom, θ = 0", { "text-anchor": "middle", "font-size": 12.5, style: "fill:var(--muted)" });
      text(svg, X(-3.2), H - 8, "θ = −3", { "font-size": 12, style: "fill:var(--muted)" });
      text(svg, X(3.2), H - 8, "θ = 3", { "text-anchor": "end", "font-size": 12, style: "fill:var(--muted)" });
      text(svg, X(-0.25), Y(5.1), "loss", { "text-anchor": "end", "font-size": 12.5, style: "fill:var(--muted)" });
      var arcs = el("g", {}, svg);
      var tan = el("line", { style: "stroke:var(--coral);stroke-opacity:0.8", "stroke-width": 1.5, "stroke-dasharray": "5 4" }, svg);
      var ball = el("circle", { r: 7, style: "fill:var(--coral);stroke:var(--paper)", "stroke-width": 2 }, svg);
      svg.setAttribute("viewBox", "0 0 " + W + " " + H);
      G = { X: X, Y: Y, arcs: arcs, tan: tan, ball: ball };
      paint(th);
    }
    function clampX(x) { return Math.max(-3.3, Math.min(3.3, x)); }
    function paint(x) {
      var X = G.X, Y = G.Y;
      clear(G.arcs);
      for (var i = 1; i < hist.length; i++) {
        var a = clampX(hist[i - 1]), b = clampX(hist[i]), ya = Y(Math.min(L(a), 5.4)), yb = Y(Math.min(L(b), 5.4));
        el("path", { d: "M" + X(a).toFixed(1) + " " + ya.toFixed(1) + " Q" + ((X(a) + X(b)) / 2).toFixed(1) + " " + (Math.min(ya, yb) - 26).toFixed(1) + " " + X(b).toFixed(1) + " " + yb.toFixed(1), fill: "none", style: "stroke:var(--muted);stroke-opacity:0.6", "stroke-width": 1.2 }, G.arcs);
        el("circle", { cx: X(a), cy: ya, r: 2.5, style: "fill:var(--muted)" }, G.arcs);
      }
      var cx = clampX(x), cy = Math.min(L(cx), 5.4);
      G.ball.setAttribute("cx", X(cx).toFixed(1)); G.ball.setAttribute("cy", Y(cy).toFixed(1));
      var dx = 0.7;
      G.tan.setAttribute("x1", X(cx - dx)); G.tan.setAttribute("y1", Y(cy - cx * dx));
      G.tan.setAttribute("x2", X(cx + dx)); G.tan.setAttribute("y2", Y(cy + cx * dx));
    }
    function status() {
      var k = hist.length - 1, x = th;
      if (Math.abs(x) > 3.3) { note.textContent = "Step " + k + ": the ball has left the picture. With η above 2, a step overshoots by more than it corrects, and the steps grow. Press Reset."; return; }
      if (k === 0) { note.textContent = "The ball starts at θ = −2.6, where the slope is −2.6. Press Take a step."; return; }
      if (Math.abs(x) < 0.005) { note.textContent = "Step " + k + ": the ball has settled at the bottom."; return; }
      note.textContent = "Step " + k + ": θ = " + num(x, 3) + " and the slope g = " + num(x, 3) + ". The next step moves by −ηg = " + num(-lr() * x, 3) + ".";
    }
    function step(done) {
      if (busy || Math.abs(th) > 3.3) { if (done) done(); return; }
      busy = true;
      var from = th, to = th - lr() * th;
      tween(520, function (e) {
        var x = from + (to - from) * e;
        G.ball.setAttribute("cx", G.X(clampX(x)).toFixed(1));
        var lift = 26 * Math.sin(Math.PI * e);
        G.ball.setAttribute("cy", (G.Y(Math.min(L(clampX(from)) + (L(clampX(to)) - L(clampX(from))) * e, 5.4)) - lift).toFixed(1));
      }, function () { th = to; hist.push(th); paint(th); status(); busy = false; if (done) done(); });
    }
    $("gd-step").addEventListener("click", function () { step(); });
    $("gd-play").addEventListener("click", function () {
      var n = 0;
      (function go() { if (n++ < 10 && Math.abs(th) <= 3.3) step(function () { setTimeout(go, 120); }); })();
    });
    $("gd-reset").addEventListener("click", function () { if (busy) return; th = -2.6; hist = [th]; paint(th); status(); });
    lrIn.addEventListener("input", function () { lrOut.textContent = lr().toFixed(2); status(); });
    lrOut.textContent = lr().toFixed(2);
    build(); status();
    window.addEventListener("resize", debounce(function () { if (width(svg) !== W) build(); }));
  })();

  // ---------- 2. one weight's running averages ----------

  (function ema() {
    var svg = $("ema-svg");
    if (!svg) return;
    var note = $("ema-note"), tIn = $("ema-t"), tOut = $("ema-t-out");
    var T = 80, MU = 0.4, r = mulberry32(11), g = [0], m = [0], v = [0], bc = true, W = 0, G = null, playing = false;
    for (var t = 1; t <= T; t++) {
      g.push(MU + gauss(r));
      m.push(B1 * m[t - 1] + (1 - B1) * g[t]);
      v.push(B2 * v[t - 1] + (1 - B2) * g[t] * g[t]);
    }
    function mh(t) { return bc ? m[t] / (1 - Math.pow(B1, t)) : m[t]; }
    function sv(t) { return Math.sqrt(bc ? v[t] / (1 - Math.pow(B2, t)) : v[t]); }
    function build() {
      clear(svg);
      W = width(svg);
      var H = W < 560 ? 250 : 270, m0 = { l: 34, r: 10, t: 26, b: 26 };
      var X = function (t) { return m0.l + (t - 0.5) / T * (W - m0.l - m0.r); };
      var Y = function (y) { return m0.t + (3.6 - Math.max(-3, Math.min(3.6, y))) / 6.6 * (H - m0.t - m0.b); };
      [-2, -1, 0, 1, 2, 3].forEach(function (y) {
        el("line", { x1: m0.l, x2: W - m0.r, y1: Y(y), y2: Y(y), style: "stroke:var(--rule)", "stroke-dasharray": y === 0 ? "" : "2 4" }, svg);
        text(svg, m0.l - 6, Y(y) + 4, String(y), { "text-anchor": "end", "font-size": 11.5, style: "fill:var(--muted)" });
      });
      el("line", { x1: m0.l, x2: W - m0.r, y1: Y(MU), y2: Y(MU), style: "stroke:var(--teal);stroke-opacity:0.55", "stroke-dasharray": "1 4", "stroke-width": 2 }, svg);
      el("line", { x1: m0.l, x2: W - m0.r, y1: Y(Math.sqrt(MU * MU + 1)), y2: Y(Math.sqrt(MU * MU + 1)), style: "stroke:var(--navy);stroke-opacity:0.55", "stroke-dasharray": "1 4", "stroke-width": 2 }, svg);
      text(svg, W - m0.r, H - 6, "steps", { "text-anchor": "end", "font-size": 12, style: "fill:var(--muted)" });
      var dots = [];
      for (var t = 1; t <= T; t++) dots.push(el("circle", { cx: X(t).toFixed(1), cy: Y(g[t]).toFixed(1), r: 2.6, style: "fill:var(--ink-2);fill-opacity:0.35" }, svg));
      var lm = el("polyline", { fill: "none", style: "stroke:var(--teal)", "stroke-width": 2.4 }, svg);
      var lv = el("polyline", { fill: "none", style: "stroke:var(--navy)", "stroke-width": 2.4 }, svg);
      var cur = el("line", { y1: m0.t - 4, y2: H - m0.b, style: "stroke:var(--ink);stroke-opacity:0.35" }, svg);
      legend(svg, m0.l, 14, [{ dot: true, style: "fill:var(--ink-2);fill-opacity:0.45", label: "batch gradient g" }, { style: "stroke:var(--teal)", label: bc ? "m̂" : "m" }, { style: "stroke:var(--navy)", label: bc ? "√v̂" : "√v" }, { style: "stroke:var(--muted)", dash: "1 4", label: "true average and typical size" }]);
      svg.setAttribute("viewBox", "0 0 " + W + " " + H);
      G = { X: X, Y: Y, dots: dots, lm: lm, lv: lv, cur: cur };
      paint(Number(tIn.value));
    }
    function paint(tc) {
      var X = G.X, Y = G.Y, pm = [], pv = [];
      G.dots.forEach(function (d, i) { d.style.display = i + 1 <= tc ? "" : "none"; });
      for (var t = 1; t <= tc; t++) { pm.push(X(t).toFixed(1) + "," + Y(mh(t)).toFixed(1)); pv.push(X(t).toFixed(1) + "," + Y(sv(t)).toFixed(1)); }
      G.lm.setAttribute("points", pm.join(" ")); G.lv.setAttribute("points", pv.join(" "));
      G.cur.setAttribute("x1", X(tc)); G.cur.setAttribute("x2", X(tc));
      tOut.textContent = tc;
      var a = mh(tc), b = sv(tc);
      note.textContent = "Step " + tc + ": g = " + num(g[tc], 2) + (bc ? ", m̂ = " : ", m = ") + num(a, 2) + (bc ? ", √v̂ = " : ", √v = ") + num(b, 2) +
        ". Their ratio is " + num(a / b, 2) + ", so Adam would step by " + Math.abs(a / b).toFixed(2) + "η." + (tc === 1 && bc ? " At step 1 the ratio is g/|g|, a full step." : "");
    }
    tIn.addEventListener("input", function () { playing = false; paint(Number(tIn.value)); });
    group("#w-ema [data-bc]", "data-bc", function (k) { bc = k === "on"; build(); });
    function play() {
      if (playing) return;
      playing = true;
      var t = 1;
      (function next() {
        if (!playing) return;
        tIn.value = t; paint(t);
        if (t++ < T) setTimeout(next, 70); else playing = false;
      })();
    }
    $("ema-play").addEventListener("click", function () { playing = false; setTimeout(play, 0); });
    build();
    if (!reduce) onVisible(svg, function () { tIn.value = 1; paint(1); setTimeout(play, 300); });
    window.addEventListener("resize", debounce(function () { if (width(svg) !== W) build(); }));
  })();

  // ---------- 3. AdamW in stages ----------

  (function buildUp() {
    var svg = $("bd-svg");
    if (!svg) return;
    var STAGES = [
      { tab: "1. Plain SGD", lr: 0.055,
        text: "One learning rate serves both weights. It must be small enough for the steep direction, so progress along the gentle direction is slow, and the noise shakes the path across the valley.",
        eq: "<i>&theta;</i> &larr; <i>&theta;</i> &minus; <i>&eta;</i> <i>g</i>" },
      { tab: "2. Momentum", lr: 0.055, mom: true,
        text: "Replace the gradient with its running average m. Averaging cancels much of the noise and the back-and-forth across the valley, and the path smooths out. Because m starts at zero, the first steps are short.",
        eq: "<i>&theta;</i> &larr; <i>&theta;</i> &minus; <i>&eta;</i> <span class=\"new\"><i>m</i></span>" },
      { tab: "3. Divide by √v", lr: 0.07, mom: true, sec: true,
        text: "Divide the step for a weight by its typical gradient size √v. Steep and gentle directions now move at a similar pace. Without bias correction, m and v both start near zero, and the first steps come out at less than half size here.",
        eq: "<i>&theta;</i> &larr; <i>&theta;</i> &minus; <i>&eta;</i> <i>m</i> / <span class=\"new\">&radic;<i>v</i></span>" },
      { tab: "4. Bias correction", lr: 0.07, mom: true, sec: true, bc: true,
        text: "Divide m and v by 1 − βᵗ before use. The first step now has m̂/√v̂ = g/|g|, which is +1 or −1, so both weights move by the full η at once, whatever their slope. A cold restart begins with this same step.",
        eq: "<i>&theta;</i> &larr; <i>&theta;</i> &minus; <i>&eta;</i> <span class=\"new\"><i>m&#770;</i></span> / &radic;<span class=\"new\"><i>v&#770;</i></span>" },
      { tab: "5. Epsilon", lr: 0.07, mom: true, sec: true, bc: true, eps: 1e-8,
        text: "Add a tiny ε to the divisor so that it never gets close to zero. With gradients of ordinary size the path does not change. The next section shows when ε matters.",
        eq: "<i>&theta;</i> &larr; <i>&theta;</i> &minus; <i>&eta;</i> <i>m&#770;</i> / (&radic;<i>v&#770;</i> <span class=\"new\">+ <i>&epsilon;</i></span>)" },
      { tab: "6. AdamW", lr: 0.07, mom: true, sec: true, bc: true, eps: 1e-8, wd: 0.8,
        text: "Add decoupled weight decay. All weights shrink toward zero by the fraction ηw per step, outside the division by √v̂. The end point moves toward the origin, marked +, where the decay pulls.",
        eq: "<i>&theta;</i> &larr; <i>&theta;</i> &minus; <i>&eta;</i> ( <i>m&#770;</i> / (&radic;<i>v&#770;</i> + <i>&epsilon;</i>) <span class=\"new\">+ <i>w</i> <i>&theta;</i></span> )" }
    ];
    var A = 0.4, Bc = 30, OPT = [1.2, 0.1], START = [-1.9, 0.42], SIG = [0.25, 2.0], T = 60;
    var r = mulberry32(21), NX = [0], NY = [0];
    for (var t = 1; t <= T; t++) { NX.push(gauss(r)); NY.push(gauss(r)); }
    function loss(p) { return 0.5 * (A * (p[0] - OPT[0]) * (p[0] - OPT[0]) + Bc * (p[1] - OPT[1]) * (p[1] - OPT[1])); }
    function run(c) {
      var p = START.slice(), m = [0, 0], v = [0, 0], path = [p.slice()];
      for (var t = 1; t <= T; t++) {
        var g = [A * (p[0] - OPT[0]) + SIG[0] * NX[t], Bc * (p[1] - OPT[1]) + SIG[1] * NY[t]];
        for (var i = 0; i < 2; i++) {
          m[i] = c.mom ? B1 * m[i] + (1 - B1) * g[i] : g[i];
          v[i] = B2 * v[i] + (1 - B2) * g[i] * g[i];
          var num = c.mom && c.bc ? m[i] / (1 - Math.pow(B1, t)) : m[i], den = 1;
          if (c.sec) den = Math.sqrt(c.bc ? v[i] / (1 - Math.pow(B2, t)) : v[i]) + (c.eps || 1e-12);
          p[i] -= c.lr * (num / den + (c.wd || 0) * p[i]);
        }
        path.push(p.slice());
      }
      return path;
    }
    var paths = STAGES.map(run);
    var tabs = $("bd-tabs"), box = $("bd-text"), eq = $("bd-eq"), cur = 0, W = 0, G = null, anim = 0;
    var tabBtns = STAGES.map(function (s, i) {
      var b = document.createElement("button");
      b.type = "button"; b.setAttribute("role", "tab"); b.textContent = s.tab;
      b.addEventListener("click", function () { go(i, false); });
      tabs.appendChild(b);
      return b;
    });
    function build() {
      clear(svg);
      W = width(svg);
      var narrow = W < 560, mapH = narrow ? 190 : 230, plotH = 92, gap = 34, H = mapH + gap + plotH + 44;
      var x0 = -2.3, x1 = 1.8, y0 = -0.32, y1 = 0.62;
      var X = function (x) { return (x - x0) / (x1 - x0) * W; };
      var Y = function (y) { return mapH - (y - y0) / (y1 - y0) * mapH; };
      el("rect", { x: 0, y: 0, width: W, height: mapH, rx: 4, style: "fill:var(--bg);stroke:var(--rule)" }, svg);
      var cp = el("clipPath", { id: "bd-clip" }, svg);
      el("rect", { x: 0, y: 0, width: W, height: mapH, rx: 4 }, cp);
      var map = el("g", { "clip-path": "url(#bd-clip)" }, svg);
      [3.0, 2.2, 1.6, 1.1, 0.7, 0.4, 0.2, 0.08, 0.02].forEach(function (lv, i) {
        var a = Math.sqrt(2 * lv / A), b = Math.sqrt(2 * lv / Bc), pts = [];
        for (var k = 0; k <= 96; k++) { var q = 2 * Math.PI * k / 96; pts.push(X(OPT[0] + a * Math.cos(q)).toFixed(1) + "," + Y(OPT[1] + b * Math.sin(q)).toFixed(1)); }
        el("polygon", { points: pts.join(" "), style: "fill:var(--navy);fill-opacity:" + (0.03 + i * 0.006) + ";stroke:var(--navy);stroke-opacity:0.3", "stroke-width": 0.8 }, map);
      });
      el("path", { d: "M" + (X(0) - 6) + " " + Y(0) + "h12M" + X(0) + " " + (Y(0) - 6) + "v12", style: "stroke:var(--ink-2)", "stroke-width": 1.4 }, map);
      el("circle", { cx: X(OPT[0]), cy: Y(OPT[1]), r: 3.5, style: "fill:var(--navy)" }, map);
      text(map, X(OPT[0]) - 6, Y(OPT[1]) + 17, "minimum", { "text-anchor": "end", "font-size": 12, style: "fill:var(--ink-2)" });
      var ghost = el("polyline", { fill: "none", style: "stroke:var(--sand)", "stroke-width": 1.6, "stroke-dasharray": "4 4" }, map);
      var line = el("polyline", { fill: "none", style: "stroke:var(--teal)", "stroke-width": 2.2, "stroke-linejoin": "round" }, map);
      var head = el("circle", { r: 4, style: "fill:var(--teal)" }, map);
      el("circle", { cx: X(START[0]), cy: Y(START[1]), r: 4.5, style: "fill:var(--paper);stroke:var(--ink)", "stroke-width": 1.4 }, map);
      text(map, X(START[0]) + 8, Y(START[1]) - 8, "start", { "font-size": 12, style: "fill:var(--ink-2)" });
      text(map, 8, 16, "loss of a narrow valley", { "font-size": 12, style: "fill:var(--muted)" });
      // loss over steps, log scale
      var py = mapH + gap, LX = function (t) { return 36 + (W - 44) * t / T; }, LY = function (l) { return py + plotH * (1 - (Math.log10(Math.max(l, 0.002)) + 2.7) / 3.5); };
      text(svg, 0, py - 10, "loss over steps (log scale)", { "font-size": 13, style: "fill:var(--ink-2)" });
      [0.01, 0.1, 1].forEach(function (l) {
        el("line", { x1: 36, x2: W - 8, y1: LY(l), y2: LY(l), style: "stroke:var(--rule)" }, svg);
        text(svg, 30, LY(l) + 4, String(l), { "text-anchor": "end", "font-size": 11.5, style: "fill:var(--muted)" });
      });
      text(svg, W - 8, py + plotH + 16, "steps", { "text-anchor": "end", "font-size": 11.5, style: "fill:var(--muted)" });
      var lg = el("polyline", { fill: "none", style: "stroke:var(--sand)", "stroke-width": 1.6, "stroke-dasharray": "4 4" }, svg);
      var ll = el("polyline", { fill: "none", style: "stroke:var(--teal)", "stroke-width": 2 }, svg);
      var leg = el("g", {}, svg);
      svg.setAttribute("viewBox", "0 0 " + W + " " + H);
      G = { X: X, Y: Y, LX: LX, LY: LY, ghost: ghost, line: line, head: head, lg: lg, ll: ll, leg: leg, H: H };
      paint(T);
    }
    function pts(path, k, X, Y) { return path.slice(0, k + 1).map(function (p) { return X(p[0]).toFixed(1) + "," + Y(p[1]).toFixed(1); }).join(" "); }
    function lpts(path, k) { return path.slice(0, k + 1).map(function (p, t) { return G.LX(t).toFixed(1) + "," + G.LY(loss(p)).toFixed(1); }).join(" "); }
    function paint(k) {
      var p = paths[cur], prev = cur > 0 ? paths[cur - 1] : null;
      G.line.setAttribute("points", pts(p, k, G.X, G.Y));
      G.head.setAttribute("cx", G.X(p[k][0])); G.head.setAttribute("cy", G.Y(p[k][1]));
      G.ghost.setAttribute("points", prev ? pts(prev, T, G.X, G.Y) : "");
      G.lg.setAttribute("points", prev ? lpts(prev, T) : "");
      G.ll.setAttribute("points", lpts(p, k));
      clear(G.leg);
      var items = [{ style: "stroke:var(--teal)", label: "stage " + (cur + 1) }];
      if (prev) items.push({ style: "stroke:var(--sand)", dash: "4 4", label: "stage " + cur });
      legend(G.leg, 0, G.H - 6, items);
    }
    function go(i, animate) {
      cur = i;
      tabBtns.forEach(function (b, j) { b.setAttribute("aria-selected", String(j === i)); b.tabIndex = j === i ? 0 : -1; });
      var s = STAGES[i];
      box.innerHTML = "";
      var h = document.createElement("h3"); h.textContent = s.tab.replace(/^\d\. /, ""); box.appendChild(h);
      var p = document.createElement("p"); p.style.margin = "0"; p.textContent = s.text; box.appendChild(p);
      eq.innerHTML = s.eq + " &emsp;<span class=\"eq-note\">&eta; = " + s.lr + "</span>";
      $("bd-prev").disabled = i === 0; $("bd-next").disabled = i === STAGES.length - 1;
      cancelAnimationFrame(anim);
      if (animate) play(); else paint(T);
    }
    function play() {
      var t0 = 0;
      cancelAnimationFrame(anim);
      anim = requestAnimationFrame(function f(ts) {
        if (!t0) t0 = ts;
        var k = Math.min(T, Math.floor((ts - t0) / 60));
        paint(k);
        if (k < T) anim = requestAnimationFrame(f);
      });
    }
    $("bd-prev").addEventListener("click", function () { if (cur > 0) go(cur - 1, false); });
    $("bd-next").addEventListener("click", function () { if (cur < STAGES.length - 1) go(cur + 1, false); });
    $("bd-play").addEventListener("click", play);
    tabs.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight" && cur < STAGES.length - 1) { go(cur + 1, false); tabBtns[cur].focus(); }
      if (e.key === "ArrowLeft" && cur > 0) { go(cur - 1, false); tabBtns[cur].focus(); }
    });
    build(); go(0, false);
    if (!reduce) onVisible(svg, play);
    window.addEventListener("resize", debounce(function () { if (width(svg) !== W) { build(); paint(T); } }));
  })();

  // ---------- 4. epsilon ----------

  (function eps() {
    var svg = $("eps-svg");
    if (!svg) return;
    var note = $("eps-note"), gIn = $("eps-g"), gOut = $("eps-g-out"), W = 0, G = null;
    var EPS = [[1e-8, "ε = 10⁻⁸", "teal"], [1e-6, "ε = 10⁻⁶ (Qwen2.5)", "coral"]];
    function step(g, e) { return g / (g + e); }
    function build() {
      clear(svg);
      W = width(svg);
      var H = 230, m = { l: 40, r: 12, t: 24, b: 34 };
      var X = function (lg) { return m.l + (lg + 11) / 8 * (W - m.l - m.r); };
      var Y = function (y) { return m.t + (1.05 - y) / 1.05 * (H - m.t - m.b); };
      [0, 0.5, 1].forEach(function (y) {
        el("line", { x1: m.l, x2: W - m.r, y1: Y(y), y2: Y(y), style: "stroke:var(--rule)" }, svg);
        text(svg, m.l - 6, Y(y) + 4, y === 1 ? "1 × η" : String(y), { "text-anchor": "end", "font-size": 11.5, style: "fill:var(--muted)" });
      });
      for (var lg = -11; lg <= -3; lg += 2) text(svg, X(lg), H - 16, "10" + sup(lg), { "text-anchor": "middle", "font-size": 12, style: "fill:var(--muted)" });
      text(svg, W - m.r, H - 2, "gradient size |g|", { "text-anchor": "end", "font-size": 12, style: "fill:var(--muted)" });
      EPS.forEach(function (e) {
        var pts = [];
        for (var k = 0; k <= 160; k++) { var lg = -11 + 8 * k / 160; pts.push(X(lg).toFixed(1) + "," + Y(step(Math.pow(10, lg), e[0])).toFixed(1)); }
        el("polyline", { points: pts.join(" "), fill: "none", style: "stroke:var(--" + e[2] + ")", "stroke-width": 2.4 }, svg);
      });
      var cur = el("line", { y1: m.t, y2: H - m.b, style: "stroke:var(--ink);stroke-opacity:0.4", "stroke-dasharray": "3 3" }, svg);
      var dots = EPS.map(function (e) { return el("circle", { r: 5, style: "fill:var(--" + e[2] + ");stroke:var(--paper)", "stroke-width": 1.5 }, svg); });
      legend(svg, m.l, 13, EPS.map(function (e) { return { style: "stroke:var(--" + e[2] + ")", label: e[1] }; }));
      svg.setAttribute("viewBox", "0 0 " + W + " " + H);
      G = { X: X, Y: Y, cur: cur, dots: dots };
      paint();
    }
    function paint() {
      var lg = Number(gIn.value), g = Math.pow(10, lg);
      G.cur.setAttribute("x1", G.X(lg)); G.cur.setAttribute("x2", G.X(lg));
      var s = EPS.map(function (e, i) { var y = step(g, e[0]); G.dots[i].setAttribute("cx", G.X(lg)); G.dots[i].setAttribute("cy", G.Y(y)); return y; });
      gOut.textContent = sci(g);
      function f(y) { return y >= 0.995 ? "about the full η" : y < 0.01 ? (y * 100).toFixed(2) + "% of η" : y.toFixed(2) + "η"; }
      note.textContent = "For a steady gradient of size " + sci(g) + ", the step is " + f(s[0]) + " with ε = 10⁻⁸ and " + f(s[1]) + " with ε = 10⁻⁶.";
    }
    gIn.addEventListener("input", paint);
    build();
    window.addEventListener("resize", debounce(function () { if (width(svg) !== W) build(); }));
  })();

  // ---------- 5. bytes per parameter ----------

  (function bytes() {
    var svg = $("by-svg");
    if (!svg) return;
    var MODELS = [["GPT-2", 0.124], ["Pythia-1B", 1.01], ["Qwen2.5-3B", 3.09], ["OLMo-2-7B", 7.30], ["LLaMA-3-8B", 8.03]];
    var pick = 4, W = 0;
    chips($("by-models"), MODELS.map(function (m) { return m[0]; }), pick, function (i) { pick = i; draw(); });
    function gb(x) { return x < 1 ? x.toFixed(2) : x.toFixed(1); }
    function draw() {
      clear(svg);
      W = width(svg);
      var narrow = W < 560, s = Math.min(46, (W - 12) / 10.6), x0 = 0, y0 = 26;
      var parts = [[narrow ? "weight" : "weight, bf16", 2, "navy"], [narrow ? "m" : "m, fp32", 4, "sand"], [narrow ? "v" : "v, fp32", 4, "coral"]], x = x0, cells = [];
      parts.forEach(function (p, pi) {
        var gx = x;
        for (var j = 0; j < p[1]; j++) { cells.push(el("rect", { x: x.toFixed(1), y: y0, width: (s - 4).toFixed(1), height: (s - 4).toFixed(1), rx: 3, style: "fill:var(--" + p[2] + ");opacity:0" }, svg)); x += s; }
        text(svg, gx, y0 - 8, p[0], { "font-size": 12.5, "font-style": pi ? "italic" : "normal", style: "fill:var(--ink-2)" });
        text(svg, gx, y0 + s + 12, p[1] + " bytes", { "font-size": 12, style: "fill:var(--muted)" });
        x += pi < 2 ? s * 0.3 : 0;
      });
      var p = MODELS[pick][1], yT = y0 + s + 40;
      var lines = [MODELS[pick][0] + ", about " + (p < 1 ? Math.round(p * 1000) + " million" : p.toFixed(1) + " billion") + " parameters"];
      if (narrow) lines.push("weights only: " + gb(2 * p) + " GB", "with m and v: " + gb(10 * p) + " GB, five times as much");
      else lines.push("weights only " + gb(2 * p) + " GB; with m and v " + gb(10 * p) + " GB, five times as much");
      lines.forEach(function (l, i) { text(svg, 0, yT + 21 * i, l, { "font-size": 14, style: "fill:var(--" + (i ? "ink-2" : "ink") + ")" }); });
      svg.setAttribute("viewBox", "0 0 " + W + " " + (yT + 21 * (lines.length - 1) + 10));
      cells.forEach(function (c, i) { setTimeout(function () { c.style.opacity = "1"; }, reduce ? 0 : 40 * i); });
    }
    draw();
    window.addEventListener("resize", debounce(function () { if (width(svg) !== W) draw(); }));
  })();

  // ---------- 6. cold against warm step sizes ----------

  (function cold() {
    var svg = $("cd-svg");
    if (!svg) return;
    var note = $("cd-note"), tIn = $("cd-t"), tOut = $("cd-t-out");
    var N = 200, T = 60, r = mulberry32(5), cold = [], warm = [], meanC = [0], meanW = [0], W = 0, G = null, playing = false;
    for (var t = 0; t <= T; t++) { cold.push([]); warm.push([]); }
    for (var i = 0; i < N; i++) {
      var mu = 0.25 * gauss(r), sc = Math.pow(10, -3 + 4 * r());
      var mw = 0, vw = 0;
      for (var k = 1; k <= 200; k++) { var gp = sc * (mu + gauss(r)); mw = B1 * mw + (1 - B1) * gp; vw = B2 * vw + (1 - B2) * gp * gp; }
      // the rebuilt state is loaded bias-corrected, and the counter is set so the correction stays near 1
      mw /= 1 - Math.pow(B1, 200); vw /= 1 - Math.pow(B2, 200);
      var mc = 0, vc = 0;
      for (t = 1; t <= T; t++) {
        var g = sc * (mu + gauss(r));
        mc = B1 * mc + (1 - B1) * g; vc = B2 * vc + (1 - B2) * g * g;
        mw = B1 * mw + (1 - B1) * g; vw = B2 * vw + (1 - B2) * g * g;
        cold[t].push(Math.abs(mc / (1 - Math.pow(B1, t))) / (Math.sqrt(vc / (1 - Math.pow(B2, t))) + 1e-8));
        warm[t].push(Math.abs(mw) / (Math.sqrt(vw) + 1e-8));
      }
    }
    function avg(a) { return a.reduce(function (s, x) { return s + x; }, 0) / a.length; }
    for (t = 1; t <= T; t++) { meanC.push(avg(cold[t])); meanW.push(avg(warm[t])); cold[t].sort(function (a, b) { return b - a; }); warm[t].sort(function (a, b) { return b - a; }); }
    function build() {
      clear(svg);
      W = width(svg);
      var narrow = W < 560, lab = narrow ? 0 : 92, sh = 46, sy = [narrow ? 18 : 6, narrow ? 18 + sh + 26 : 6 + sh + 14];
      var bw = (W - lab) / N, strips = [];
      [["cold start", "sand"], ["warm start", "navy"]].forEach(function (s, j) {
        text(svg, narrow ? 0 : lab - 10, narrow ? sy[j] - 5 : sy[j] + sh / 2 + 4, s[0], { "text-anchor": narrow ? "start" : "end", "font-size": 13.5, style: "fill:var(--ink)" });
        el("line", { x1: lab, x2: W, y1: sy[j], y2: sy[j], style: "stroke:var(--rule)", "stroke-dasharray": "2 3" }, svg);
        el("line", { x1: lab, x2: W, y1: sy[j] + sh, y2: sy[j] + sh, style: "stroke:var(--rule)" }, svg);
        var bars = [];
        for (var i = 0; i < N; i++) bars.push(el("rect", { x: (lab + i * bw).toFixed(2), width: Math.max(0.6, bw - 0.4).toFixed(2), style: "fill:var(--" + s[1] + ")" }, svg));
        strips.push({ bars: bars, y: sy[j] });
      });
      if (!narrow) text(svg, lab - 10, sy[0] + 4, "η", { "text-anchor": "end", "font-size": 12, "font-style": "italic", style: "fill:var(--muted)" });
      var py = sy[1] + sh + 40, ph = 120, X = function (t) { return 34 + (W - 42) * (t - 1) / (T - 1); }, Y = function (y) { return py + ph * (1 - y / 1.05); };
      text(svg, 0, py - 12, "average step size, in units of η", { "font-size": 13, style: "fill:var(--ink-2)" });
      [0, 0.5, 1].forEach(function (y) {
        el("line", { x1: 34, x2: W - 8, y1: Y(y), y2: Y(y), style: "stroke:var(--rule)" }, svg);
        text(svg, 28, Y(y) + 4, String(y), { "text-anchor": "end", "font-size": 11.5, style: "fill:var(--muted)" });
      });
      el("line", { x1: X(20), x2: X(20), y1: py, y2: py + ph, style: "stroke:var(--muted)", "stroke-dasharray": "3 3" }, svg);
      text(svg, X(20) + 6, py + 12, "1/(1 − β₂) = 20 steps", { "font-size": 12, style: "fill:var(--muted)" });
      text(svg, W - 8, py + ph + 16, "steps", { "text-anchor": "end", "font-size": 11.5, style: "fill:var(--muted)" });
      function line(arr, color) {
        var pts = [];
        for (var t = 1; t <= T; t++) pts.push(X(t).toFixed(1) + "," + Y(arr[t]).toFixed(1));
        el("polyline", { points: pts.join(" "), fill: "none", style: "stroke:var(--" + color + ")", "stroke-width": 2.2 }, svg);
      }
      line(meanC, "sand"); line(meanW, "navy");
      var cur = el("line", { y1: py - 2, y2: py + ph, style: "stroke:var(--ink);stroke-opacity:0.4" }, svg);
      var dc = el("circle", { r: 4.5, style: "fill:var(--sand)" }, svg), dw = el("circle", { r: 4.5, style: "fill:var(--navy)" }, svg);
      svg.setAttribute("viewBox", "0 0 " + W + " " + (py + ph + 22));
      G = { strips: strips, sh: sh, X: X, Y: Y, cur: cur, dc: dc, dw: dw };
      paint(Number(tIn.value));
    }
    function paint(t) {
      [cold[t], warm[t]].forEach(function (vals, j) {
        var s = G.strips[j];
        vals.forEach(function (v, i) { var h = G.sh * Math.min(v, 1); s.bars[i].setAttribute("y", (s.y + G.sh - h).toFixed(1)); s.bars[i].setAttribute("height", Math.max(0.5, h).toFixed(1)); });
      });
      G.cur.setAttribute("x1", G.X(t)); G.cur.setAttribute("x2", G.X(t));
      G.dc.setAttribute("cx", G.X(t)); G.dc.setAttribute("cy", G.Y(meanC[t]));
      G.dw.setAttribute("cx", G.X(t)); G.dw.setAttribute("cy", G.Y(meanW[t]));
      tOut.textContent = t;
      note.textContent = t === 1
        ? "Step 1: all 200 cold-start steps have size η, the sign step. Warm-start steps average " + meanW[1].toFixed(2) + "η."
        : "Step " + t + ": cold-start steps average " + meanC[t].toFixed(2) + "η and warm-start steps " + meanW[t].toFixed(2) + "η.";
    }
    function play() {
      if (playing) return;
      playing = true;
      var t = 1;
      (function next() {
        if (!playing) return;
        tIn.value = t; paint(t);
        if (t++ < T) setTimeout(next, 110); else playing = false;
      })();
    }
    tIn.addEventListener("input", function () { playing = false; paint(Number(tIn.value)); });
    $("cd-play").addEventListener("click", function () { playing = false; setTimeout(play, 0); });
    build();
    if (!reduce) onVisible(svg, function () { setTimeout(play, 300); });
    window.addEventListener("resize", debounce(function () { if (width(svg) !== W) build(); }));
  })();

  // ---------- 7. EWC springs ----------

  (function springs() {
    var svg = $("sp-svg");
    if (!svg) return;
    var note = $("sp-note"), lamIn = $("sp-lam"), lamOut = $("sp-lam-out"), show = "both", W = 0;
    var F = [0.12, 6], AT = [1, 1], U = [1.3, 0.55], KU = [(F[0] + F[1]) / 2, (F[0] + F[1]) / 2];
    function end(K, lam) { return [AT[0] * U[0] / (AT[0] + 2 * lam * K[0]), AT[1] * U[1] / (AT[1] + 2 * lam * K[1])]; }
    function Tl(p) { return 0.5 * (AT[0] * (p[0] - U[0]) * (p[0] - U[0]) + AT[1] * (p[1] - U[1]) * (p[1] - U[1])); }
    function Sl(p) { return 0.5 * (F[0] * p[0] * p[0] + F[1] * p[1] * p[1]); }
    var KINDS = [{ key: "ewc", K: F, color: "teal", name: "Fisher-weighted", cap: "Fisher-weighted" }, { key: "uni", K: KU, color: "coral", name: "uniform", cap: "Uniform" }];
    function lam() { return Math.pow(10, Number(lamIn.value)); }
    function fmtLam(l) { return l >= 10 ? l.toFixed(0) : l >= 1 ? l.toFixed(1) : l.toFixed(2); }
    function draw() {
      clear(svg);
      W = width(svg);
      var narrow = W < 640, mw = narrow ? W : Math.round(W * 0.54), mh = narrow ? 210 : 260;
      var fx = narrow ? 0 : mw + 26, fy = narrow ? mh + 44 : 0, fw = narrow ? W : W - fx, fh = narrow ? 200 : mh;
      // map
      var x0 = -0.3, x1 = 1.55, y0 = -0.28, y1 = 0.78;
      var X = function (x) { return (x - x0) / (x1 - x0) * mw; }, Y = function (y) { return mh - (y - y0) / (y1 - y0) * mh; };
      el("rect", { x: 0, y: 0, width: mw, height: mh, rx: 4, style: "fill:var(--bg);stroke:var(--rule)" }, svg);
      var cp = el("clipPath", { id: "sp-clip" }, svg);
      el("rect", { x: 0, y: 0, width: mw, height: mh, rx: 4 }, cp);
      var map = el("g", { "clip-path": "url(#sp-clip)" }, svg);
      function ell(cx, cy, a, b, style) {
        var pts = [];
        for (var k = 0; k <= 96; k++) { var q = 2 * Math.PI * k / 96; pts.push(X(cx + a * Math.cos(q)).toFixed(1) + "," + Y(cy + b * Math.sin(q)).toFixed(1)); }
        el("polygon", { points: pts.join(" "), style: style, "stroke-width": 0.9 }, map);
      }
      [0.7, 0.4, 0.2, 0.08, 0.02].forEach(function (lv, i) { ell(U[0], U[1], Math.sqrt(2 * lv / AT[0]), Math.sqrt(2 * lv / AT[1]), "fill:var(--navy);fill-opacity:" + (0.04 + 0.012 * i) + ";stroke:var(--navy);stroke-opacity:0.3"); });
      [1.6, 0.8, 0.35, 0.1, 0.02].forEach(function (lv) { ell(0, 0, Math.sqrt(2 * lv / F[0]), Math.sqrt(2 * lv / F[1]), "fill:none;stroke:var(--sand);stroke-dasharray:4 4"); });
      el("path", { d: "M" + (X(U[0]) - 5) + " " + (Y(U[1]) - 5) + "l10 10m0 -10l-10 10", style: "stroke:var(--ink-2)", "stroke-width": 1.5 }, map);
      text(map, X(U[0]) - 8, Y(U[1]) - 10, "new task's minimum", { "text-anchor": "end", "font-size": 12, style: "fill:var(--ink-2)" });
      el("circle", { cx: X(0), cy: Y(0), r: 5, style: "fill:var(--paper);stroke:var(--ink)", "stroke-width": 1.4 }, map);
      text(map, X(0), Y(0) + 24, "checkpoint θ*", { "text-anchor": "middle", "font-size": 12, style: "fill:var(--ink-2)" });
      text(map, 8, 16, "dashed sand: old task's loss", { "font-size": 12, style: "fill:var(--muted)" });
      var mk = KINDS.map(function (k) {
        var ln = el("line", { x1: X(0), y1: Y(0), style: "stroke:var(--" + k.color + ")", "stroke-width": 1.6, "stroke-dasharray": "2 3" }, map);
        var d = el("circle", { r: 6, style: "fill:var(--" + k.color + ");stroke:var(--paper)", "stroke-width": 1.5 }, map);
        return { ln: ln, d: d };
      });
      // frontier
      var TX = function (t) { return fx + 40 + (fw - 52) * t / 1.05; }, SY = function (s) { return fy + 18 + (fh - 56) * (1 - s / 1.05); };
      text(svg, fx, fy + 10, "old-task loss (forgetting)", { "font-size": 12.5, style: "fill:var(--ink-2)" });
      [0, 0.5, 1].forEach(function (v) {
        el("line", { x1: TX(0), x2: TX(1.05), y1: SY(v), y2: SY(v), style: "stroke:var(--rule)" }, svg);
        text(svg, TX(0) - 6, SY(v) + 4, String(v), { "text-anchor": "end", "font-size": 11.5, style: "fill:var(--muted)" });
        text(svg, TX(v), SY(0) + 16, String(v), { "text-anchor": "middle", "font-size": 11.5, style: "fill:var(--muted)" });
      });
      text(svg, TX(1.05), SY(0) + 32, "new-task loss (less learning →)", { "text-anchor": "end", "font-size": 12.5, style: "fill:var(--ink-2)" });
      text(svg, TX(1.05), SY(1.0), "lower left is better", { "text-anchor": "end", "font-size": 12, "font-style": "italic", style: "fill:var(--muted)" });
      var fdots = KINDS.map(function (k) {
        var pts = [];
        for (var i = 0; i <= 140; i++) { var p = end(k.K, Math.pow(10, -3 + 6 * i / 140)); pts.push(TX(Tl(p)).toFixed(1) + "," + SY(Sl(p)).toFixed(1)); }
        el("polyline", { points: pts.join(" "), fill: "none", style: "stroke:var(--" + k.color + ")", "stroke-width": 2 }, svg);
        return el("circle", { r: 5.5, style: "fill:var(--" + k.color + ");stroke:var(--paper)", "stroke-width": 1.5 }, svg);
      });
      el("circle", { cx: TX(Tl(U)), cy: SY(Sl(U)), r: 4, style: "fill:var(--ink-2)" }, svg);
      text(svg, TX(Tl(U)) + 8, SY(Sl(U)) + 4, "no anchor", { "font-size": 12, style: "fill:var(--ink-2)" });
      legend(svg, narrow ? 0 : fx + 40, narrow ? fy + fh + 22 : fh + 34, KINDS.map(function (k) { return { style: "stroke:var(--" + k.color + ")", label: k.name + " anchor" }; }));
      svg.setAttribute("viewBox", "0 0 " + W + " " + (narrow ? fy + fh + 30 : fh + 42));
      function paint() {
        var l = lam(), out = [];
        lamOut.textContent = fmtLam(l);
        KINDS.forEach(function (k, i) {
          var p = end(k.K, l), on = show === "both" || show === k.key;
          mk[i].ln.setAttribute("x2", X(p[0])); mk[i].ln.setAttribute("y2", Y(p[1]));
          mk[i].d.setAttribute("cx", X(p[0])); mk[i].d.setAttribute("cy", Y(p[1]));
          fdots[i].setAttribute("cx", TX(Tl(p))); fdots[i].setAttribute("cy", SY(Sl(p)));
          [mk[i].ln, mk[i].d, fdots[i]].forEach(function (n) { n.style.display = on ? "" : "none"; });
          if (on) out.push(k.cap + ": new-task loss " + Tl(p).toFixed(2) + ", old-task loss " + Sl(p).toFixed(2));
        });
        note.textContent = "λ = " + fmtLam(l) + ". " + out.join(". ") + ". Spring stiffness, horizontal and vertical: Fisher-weighted 0.12 and 6, uniform 3.06 and 3.06, the same total.";
      }
      draw.paint = paint;
      paint();
    }
    lamIn.addEventListener("input", function () { draw.paint(); });
    group("#w-spring [data-sp]", "data-sp", function (k) { show = k; draw.paint(); });
    draw();
    window.addEventListener("resize", debounce(function () { if (width(svg) !== W) draw(); }));
  })();

  // ---------- 8. the 200-step Fisher run ----------

  (function fisher() {
    var svg = $("fr-svg");
    if (!svg) return;
    var note = $("fr-note"), tIn = $("fr-t"), tOut = $("fr-t-out"), mode = "hat", W = 0, G = null, playing = false;
    var TRUE = [1e-6, 1e-4, 1e-2, 1], COL = ["teal", "navy", "coral", "sand"], MU = 0.3, T = 200, r = mulberry32(8);
    var raw = TRUE.map(function () { return [0]; });
    TRUE.forEach(function (tv, i) {
      var s = Math.sqrt(tv / (MU * MU + 1)), v = 0;
      for (var t = 1; t <= T; t++) { var g = s * (MU + gauss(r)); v = B2 * v + (1 - B2) * g * g; raw[i].push(v); }
    });
    function val(i, t) { return mode === "hat" ? raw[i][t] / (1 - Math.pow(B2, t)) : raw[i][t]; }
    function build() {
      clear(svg);
      W = width(svg);
      var narrow = W < 560, lab = narrow ? 0 : 150, X = function (t) { return lab + (W - lab - 8) * t / T; };
      var lanes = [["probe run, 10 steps at η = 10⁻⁶", 10, "coral"], ["Fisher run, 200 steps at η = 10⁻⁷", 200, "teal"]], ly = 4;
      lanes.forEach(function (l) {
        if (narrow) { text(svg, 0, ly + 11, l[0], { "font-size": 12, style: "fill:var(--ink-2)" }); ly += 16; }
        else text(svg, lab - 10, ly + 13, l[0].split(",")[0], { "text-anchor": "end", "font-size": 12.5, style: "fill:var(--ink-2)" });
        el("rect", { x: X(0), y: ly, width: X(l[1]) - X(0), height: 16, rx: 3, style: "fill:var(--" + l[2] + ");fill-opacity:0.75" }, svg);
        if (!narrow && l[1] < T) text(svg, X(l[1]) + 6, ly + 13, l[0].split(", ")[1], { "font-size": 12, style: "fill:var(--muted)" });
        if (!narrow && l[1] === T) text(svg, X(0) + 8, ly + 12.5, l[0].split(", ")[1], { "font-size": 12, style: "fill:#fff" });
        ly += 24;
      });
      var py = ly + 18, ph = narrow ? 170 : 190, Y = function (v) { return py + ph * (1 - Math.max(0, Math.min(1, (Math.log10(Math.max(v, 1e-12)) + 7.5) / 8.3))); };
      [1e-6, 1e-4, 1e-2, 1].forEach(function (v) {
        el("line", { x1: lab, x2: W - 8, y1: Y(v), y2: Y(v), style: "stroke:var(--rule)" }, svg);
        text(svg, lab - 6, Y(v) + 4, "10" + sup(Math.round(Math.log10(v))), { "text-anchor": "end", "font-size": 11.5, style: "fill:var(--muted)" });
      });
      TRUE.forEach(function (tv, i) { el("line", { x1: lab, x2: W - 8, y1: Y(tv), y2: Y(tv), style: "stroke:var(--" + COL[i] + ")", "stroke-dasharray": "5 4", "stroke-opacity": 0.7 }, svg); });
      var lines = TRUE.map(function (tv, i) { return el("polyline", { fill: "none", style: "stroke:var(--" + COL[i] + ")", "stroke-width": 2 }, svg); });
      var cur = el("line", { y1: 2, y2: py + ph, style: "stroke:var(--ink);stroke-opacity:0.4" }, svg);
      text(svg, W - 8, py + ph + 16, "steps", { "text-anchor": "end", "font-size": 11.5, style: "fill:var(--muted)" });
      text(svg, lab, py + ph + 16, mode === "hat" ? "estimate of v (log scale)" : "raw v (log scale)", { "font-size": 12, style: "fill:var(--ink-2)" });
      svg.setAttribute("viewBox", "0 0 " + W + " " + (py + ph + 22));
      G = { X: X, Y: Y, lines: lines, cur: cur };
      paint(Number(tIn.value));
    }
    function paint(tc) {
      G.lines.forEach(function (ln, i) {
        var pts = [];
        for (var t = 1; t <= tc; t++) pts.push(G.X(t).toFixed(1) + "," + G.Y(val(i, t)).toFixed(1));
        ln.setAttribute("points", pts.join(" "));
      });
      G.cur.setAttribute("x1", G.X(tc)); G.cur.setAttribute("x2", G.X(tc));
      tOut.textContent = tc;
      var worst = 1;
      TRUE.forEach(function (tv, i) { var q = val(i, tc) / tv; worst = Math.max(worst, q, 1 / q); });
      var corr = 1 / (1 - Math.pow(B2, tc));
      note.textContent = "Step " + tc + ": the correction factor 1/(1 − 0.95" + sup(tc) + ") is " + (corr < 1.001 ? corr.toFixed(5) : corr.toFixed(2)) + ". " +
        (mode === "hat" ? "The corrected estimates" : "The raw values") + (worst < 100 ? " are within a factor of " + worst.toFixed(1) + " of the true averages." : " are off by more than a factor of 100 for at least one weight.");
    }
    function play() {
      if (playing) return;
      playing = true;
      var t = 1;
      (function next() {
        if (!playing) return;
        tIn.value = t; paint(t);
        t += 2;
        if (t <= T) setTimeout(next, 40); else { tIn.value = T; paint(T); playing = false; }
      })();
    }
    tIn.addEventListener("input", function () { playing = false; paint(Number(tIn.value)); });
    group("#w-fisher [data-fr]", "data-fr", function (k) { mode = k; build(); });
    $("fr-play").addEventListener("click", function () { playing = false; setTimeout(play, 0); });
    build();
    window.addEventListener("resize", debounce(function () { if (width(svg) !== W) build(); }));
  })();

  // ---------- 9. similarity against penalty scale ----------

  (function scale() {
    var svg = $("sc-svg");
    if (!svg) return;
    var note = $("sc-note"), W = 0, G = null, view = "18", r = mulberry32(17);
    var MATS = [[1e-6, "navy"], [1e-4, "teal"], [1e-2, "coral"]], vt = [], vb = [], mat = [];
    MATS.forEach(function (m, j) { for (var i = 0; i < 100; i++) { var a = m[0] * Math.exp(1.2 * gauss(r)); vt.push(a); vb.push(a * Math.exp(0.9 * gauss(r))); mat.push(j); } });
    function sum(a) { return a.reduce(function (s, x) { return s + x; }, 0); }
    var R0 = sum(vb) / sum(vt), SCALE = { "18": 18.3 / R0, "1": 1 / R0 };
    function cosine(a, b) { var d = 0, na = 0, nb = 0; a.forEach(function (x, i) { d += x * b[i]; na += x * x; nb += b[i] * b[i]; }); return d / Math.sqrt(na * nb); }
    function ranks(a) { var idx = a.map(function (x, i) { return i; }).sort(function (i, j) { return a[i] - a[j]; }), rk = []; idx.forEach(function (i, k) { rk[i] = k; }); return rk; }
    function pearson(a, b) { var n = a.length, ma = sum(a) / n, mb = sum(b) / n, c = 0, va = 0, vb2 = 0; for (var i = 0; i < n; i++) { c += (a[i] - ma) * (b[i] - mb); va += (a[i] - ma) * (a[i] - ma); vb2 += (b[i] - mb) * (b[i] - mb); } return c / Math.sqrt(va * vb2); }
    var COS = cosine(vb, vt), RHO = pearson(ranks(vb), ranks(vt));
    // rank correlation inside a single matrix, then the median over the three
    var PER = MATS.map(function (m, j) { var a = vb.slice(100 * j, 100 * j + 100), b = vt.slice(100 * j, 100 * j + 100); return pearson(ranks(a), ranks(b)); }).sort()[1];
    function build() {
      clear(svg);
      W = width(svg);
      var S = Math.min(W, 420), H = S, m = { l: 44, r: 10, t: 10, b: 36 }, ox = (W - S) / 2;
      var X = function (lg) { return ox + m.l + (lg + 9) / 9 * (S - m.l - m.r); }, Y = function (lg) { return m.t + (1 - (lg + 9) / 11) * (H - m.t - m.b); };
      for (var lg = -8; lg <= 0; lg += 2) {
        el("line", { x1: X(lg), x2: X(lg), y1: m.t, y2: H - m.b, style: "stroke:var(--rule)" }, svg);
        text(svg, X(lg), H - m.b + 15, "10" + sup(lg), { "text-anchor": "middle", "font-size": 11.5, style: "fill:var(--muted)" });
      }
      for (lg = -8; lg <= 2; lg += 2) {
        el("line", { x1: X(-9), x2: X(0), y1: Y(lg), y2: Y(lg), style: "stroke:var(--rule)" }, svg);
        text(svg, X(-9) - 6, Y(lg) + 4, "10" + sup(lg), { "text-anchor": "end", "font-size": 11.5, style: "fill:var(--muted)" });
      }
      el("line", { x1: X(-9), y1: Y(-9), x2: X(0), y2: Y(0), style: "stroke:var(--ink-2)", "stroke-dasharray": "4 4" }, svg);
      text(svg, X(-1.2), Y(-0.4), "equal", { "text-anchor": "end", "font-size": 12, "font-style": "italic", style: "fill:var(--muted)" });
      text(svg, X(0), H - 4, "true v", { "text-anchor": "end", "font-size": 12.5, style: "fill:var(--ink-2)" });
      text(svg, X(-9) + 4, m.t + 12, "rebuilt v", { "font-size": 12.5, style: "fill:var(--ink-2)" });
      var dots = vt.map(function (a, i) { return el("circle", { cx: X(Math.log10(a)).toFixed(1), r: 2.6, style: "fill:var(--" + MATS[mat[i]][1] + ");fill-opacity:0.75" }, svg); });
      svg.setAttribute("viewBox", "0 0 " + W + " " + H);
      G = { Y: Y, dots: dots };
      place(SCALE[view], SCALE[view]);
    }
    function place(fromS, toS) {
      tween(fromS === toS ? 1 : 700, function (e) {
        var s = Math.exp(Math.log(fromS) + (Math.log(toS) - Math.log(fromS)) * e);
        G.dots.forEach(function (d, i) { d.setAttribute("cy", G.Y(Math.log10(vb[i] * s)).toFixed(1)); });
      });
      var ratio = sum(vb) * toS / sum(vt);
      note.textContent = "Cosine similarity " + COS.toFixed(2) + " and global ρ " + RHO.toFixed(2) + " in both views. The median ρ inside one matrix is lower, " + PER.toFixed(2) + ", because the gaps in scale between matrices lift the global figure. At the same λ, the rebuilt v pulls " +
        (ratio > 1.5 ? ratio.toFixed(1) + " times as hard as the true one." : "as hard as the true one, because the strengths now match.");
    }
    group("#w-scale [data-sc]", "data-sc", function (k) { var from = SCALE[view]; view = k; place(from, SCALE[view]); });
    build();
    window.addEventListener("resize", debounce(function () { if (width(svg) !== W) build(); }));
  })();

  // ---------- 10. the condition builder ----------

  (function conditions() {
    var cards = $("cn-cards");
    if (!cards) return;
    // Table 2 of the manuscript: target loss, forgetting and benchmark change (points), mean and std.
    var SCALES = [
      { name: "GPT-2, 124M", t: [[3.274, .003], [3.271, .002], [3.289, .001], [3.288, 0], [3.288, .001]], f: [[.173, .012], [.151, .005], [.058, .002], [.056, .002], [.056, .002]], b: null },
      { name: "Pythia, 1B", t: [[2.843, .007], [2.833, .004], [2.730, .006], [2.727, .007], [2.721, .004]], f: [[.660, .019], [.625, .026], [.268, .008], [.265, .009], [.264, .005]], b: [[-1.33, .24], [-1.07, .42], [-1.03, .40], [-0.78, .57], [-0.89, .45]] },
      { name: "Qwen2.5, 3B", t: [[2.248, .005], [2.245, .006], [2.172, .005], [2.169, .005], [2.172, .007]], f: [[.444, .012], [.431, .008], [.153, .008], [.144, .006], [.148, .007]], b: [[-7.24, .67], [-7.43, 1.06], [-3.24, .33], [-3.01, .62], [-3.07, .45]] },
      { name: "LLaMA-3, 8B", t: [[3.90, 1.52], [3.22, .29], [3.07, .22], [3.17, .29], [3.05, .16]], f: [[2.91, 1.92], [1.97, .31], [1.59, .19], [1.67, .31], [1.57, .07]], b: [[-29.54, 5.02], [-26.21, 2.18], [-24.69, 1.11], [-24.53, 1.96], [-23.65, 2.14]] }
    ];
    var NAMES = ["cold", "warm", "ewc", "v_only", "full"];
    var DESC = ["no rebuilt state: m = v = 0 and no anchor", "warm start from m and v, no anchor", "the anchor alone, with a cold optimizer", "v loaded into the optimizer and used as the anchor, m left at zero", "warm start from m and v, plus the anchor"];
    var sc = 1, warm = "none", anchor = "on", nameEl = $("cn-name"), note = $("cn-note");
    chips($("cn-scales"), SCALES.map(function (s) { return s.name; }), sc, function (i) { sc = i; draw(); });
    group("#cn-warm [data-w]", "data-w", function (k) { warm = k; draw(); });
    group("#cn-anchor [data-a]", "data-a", function (k) { anchor = k; draw(); });
    function idx() {
      if (anchor === "off") return warm === "none" ? 0 : warm === "mv" ? 1 : -1;
      return warm === "none" ? 2 : warm === "v" ? 3 : 4;
    }
    // LLaMA-3 8B values are reported to two decimals in the manuscript, the others to three.
    function f3(x) { return x.toFixed(sc === 3 ? 2 : 3); }
    function card(title, sub, val, cold, meter, color) {
      var d = document.createElement("div"); d.className = "dial-card";
      d.innerHTML = "<h3></h3><div class=\"big\"></div><div class=\"vs\"></div>" + (meter === null ? "" : "<div class=\"meter\"><span></span></div>");
      d.querySelector("h3").textContent = title;
      d.querySelector(".big").textContent = val;
      d.querySelector(".vs").textContent = sub + (cold ? " · cold: " + cold : "");
      if (meter !== null) { var s = d.querySelector(".meter span"); s.style.width = "0"; s.style.background = "var(--" + color + ")"; requestAnimationFrame(function () { s.style.width = Math.max(2, 100 * meter).toFixed(1) + "%"; }); }
      cards.appendChild(d);
    }
    function pm(a, d) { return (a[0] > 0 && d === "f" ? "+" : "") + f3(a[0]) + " ± " + f3(a[1]); }
    function draw() {
      var S = SCALES[sc], i = idx();
      cards.innerHTML = "";
      if (i < 0) {
        nameEl.innerHTML = "No such condition";
        note.textContent = "The manuscript did not run v alone without the anchor. Turn the anchor on for v_only, or load m and v for warm.";
        return;
      }
      nameEl.innerHTML = "<b>" + NAMES[i] + "</b> &nbsp;" + DESC[i];
      var maxF = Math.max.apply(null, S.f.map(function (x) { return x[0]; }));
      card("target loss", "lower learned more", pm(S.t[i], "t"), i ? f3(S.t[0][0]) : "", null);
      card("forget-Δ", "lower forgot less", pm(S.f[i], "f"), i ? "+" + f3(S.f[0][0]) : "", S.f[i][0] / maxF, i === 0 ? "sand" : "teal");
      if (S.b) {
        var maxB = Math.max.apply(null, S.b.map(function (x) { return -x[0]; }));
        card("benchmarks (BWT)", "points, closer to 0 kept more", (S.b[i][0] > 0 ? "+" : "") + S.b[i][0].toFixed(2) + " ± " + S.b[i][1].toFixed(2), i ? S.b[0][0].toFixed(2) : "", -S.b[i][0] / maxB, "coral");
      } else card("benchmarks (BWT)", "not measured at 124M, where the suite is near chance", "n/a", "", null);
      var msg = i === 0 ? "The baseline. Pick another condition to compare." : "Forget-Δ is " + (S.f[0][0] / S.f[i][0]).toFixed(1) + " times smaller than cold.";
      if (sc === 3 && i === 0) msg += " The cold mean at 8B includes one diverged seed, with target loss 5.65.";
      if (i === 1) msg += S.f[0][0] / S.f[1][0] < 1.2 ? " The warm start alone does little for forgetting here, and the anchor does most of the work." : " At 8B the warm start also avoids the cold start's diverged seed.";
      note.textContent = msg;
    }
    draw();
  })();
})();
