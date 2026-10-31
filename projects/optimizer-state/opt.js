// Rebuilt optimizer state project page: download sizes, the two-mode toy, the recovery steps,
// the check against true state, the results explorer and the structure controls.
// Numbers come from the manuscript and its supplement; the toy uses made-up numbers and says so.
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- data ----------

  var MODELS = [["GPT-2", 0.124], ["Pythia-1B", 1.01], ["Qwen2.5-3B", 3.09], ["OLMo-2-7B", 7.30], ["LLaMA-3-8B", 8.03]];

  // Validation against the true optimizer state: forgetting (nats), [mean, std or null].
  var CHECK = {
    gpt2: { rows: [["cold start, no anchor", 0.173, 0.012, "sand"], ["true v, λ = 10⁶", 0.122, 0.001, "navy"], ["rebuilt v, λ = 10⁶", 0.056, 0.002, "teal"], ["true v, matched strength", 0.052, 0.002, "navy"]],
      note: "At the same λ the true v forgets more, because it is 18 times smaller and penalises less. At matched strength the two agree: 0.052 against 0.056 nats." },
    olmo5: { rows: [["cold start, no anchor", 0.426, 0.005, "sand"], ["released v, matched strength", 0.221, 0.004, "navy"], ["released v, λ = 10⁶", 0.176, 0.004, "navy"], ["rebuilt v, λ = 10⁶", 0.131, 0.004, "teal"]],
      note: "The rebuilt v forgets least, here and at the other two penalty strengths tested, which span a factor of 30." },
    olmo50: { rows: [["cold start, no anchor", 0.853, null, "sand"], ["released v", 0.356, null, "navy"], ["rebuilt v", 0.172, null, "teal"]],
      note: "Over a longer run the gap widens. Target losses are 2.491, 2.380 and 2.299, so the rebuilt anchor also learns the most. Single seed." }
  };

  // Higher-rate grid (Table 2): target loss, forgetting and 8-task benchmark change, mean and std.
  var CONDS = ["cold", "warm", "ewc", "v_only", "full"];
  var COND_COLOR = { cold: "var(--sand)", warm: "var(--navy)", ewc: "var(--coral)", v_only: "var(--teal);fill-opacity:0.55", full: "var(--teal)" };
  var SCALES = [
    { name: "GPT-2, 124M", ratio: 3.06, t: [[3.274, .003], [3.271, .002], [3.289, .001], [3.288, 0], [3.288, .001]], f: [[.173, .012], [.151, .005], [.058, .002], [.056, .002], [.056, .002]], b: null },
    { name: "Pythia, 1B", ratio: 2.50, t: [[2.843, .007], [2.833, .004], [2.730, .006], [2.727, .007], [2.721, .004]], f: [[.660, .019], [.625, .026], [.268, .008], [.265, .009], [.264, .005]], b: [[-1.33, .24], [-1.07, .42], [-1.03, .40], [-0.78, .57], [-0.89, .45]] },
    { name: "Qwen2.5, 3B", ratio: 3.00, t: [[2.248, .005], [2.245, .006], [2.172, .005], [2.169, .005], [2.172, .007]], f: [[.444, .012], [.431, .008], [.153, .008], [.144, .006], [.148, .007]], b: [[-7.24, .67], [-7.43, 1.06], [-3.24, .33], [-3.01, .62], [-3.07, .45]] },
    { name: "LLaMA-3, 8B", ratio: 1.85, t: [[3.90, 1.52], [3.22, .29], [3.07, .22], [3.17, .29], [3.05, .16]], f: [[2.91, 1.92], [1.97, .31], [1.59, .19], [1.67, .31], [1.57, .07]], b: [[-29.54, 5.02], [-26.21, 2.18], [-24.69, 1.11], [-24.53, 1.96], [-23.65, 2.14]] }
  ];
  // Penalty-strength sweep (Table S2): [label, target, forgetting]; the first row is the cold start.
  var SWEEP = [
    null,
    [["cold", 2.84, 0.66], ["10⁴", 2.83, 0.53], ["10⁵", 2.80, 0.45], ["10⁶", 2.73, 0.27], ["10⁷", 2.65, 0.13]],
    [["cold", 2.25, 0.44], ["10⁴", 2.24, 0.32], ["10⁵", 2.22, 0.25], ["10⁶", 2.17, 0.15], ["10⁷", 2.09, 0.04]],
    [["cold", 3.90, 2.91], ["10⁶", 3.07, 1.59], ["5·10⁶", 3.09, 1.38], ["10⁷", 2.73, 0.96], ["3·10⁷", 2.59, 0.68]]
  ];

  // Structure controls on Pythia 1B: forgetting mean and std.
  var NULLS = [["rebuilt v", 0.0119, 0.0010, "teal"], ["uniform value", 0.0269, 0.0014, "sand"], ["tensor means", 0.0275, 0.0013, "sand"], ["permuted within tensors", 0.0305, 0.0014, "sand"], ["permuted across all", 0.0307, 0.0014, "sand"]];

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
  function tween(ms, fn, done) {
    if (reduce) { fn(1); if (done) done(); return; }
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
  // Horizontal bars with optional std whiskers: rows of [label, value, std, colour].
  function hbars(svg, rows, opts) {
    clear(svg);
    var W = width(svg), lab = W < 560 ? 150 : 230, rh = 38, H = rows.length * rh + 30;
    var max = opts.max || Math.max.apply(null, rows.map(function (r) { return r[1] + (r[2] || 0); })) * 1.08;
    var X = function (v) { return lab + (W - lab - 70) * v / max; };
    var ticks = opts.ticks || [0, max / 2];
    ticks.forEach(function (v) {
      el("line", { x1: X(v), x2: X(v), y1: 2, y2: rows.length * rh + 4, style: "stroke:var(--rule)", "stroke-dasharray": v === 0 ? "" : "2 4" }, svg);
      text(svg, X(v), rows.length * rh + 20, opts.fmt(v), { "text-anchor": "middle", "font-size": 12, style: "fill:var(--muted)" });
    });
    var parts = rows.map(function (r, i) {
      var y = 6 + i * rh;
      text(svg, lab - 10, y + 17, r[0], { "text-anchor": "end", "font-size": 14, style: "fill:var(--ink)" });
      var bar = el("rect", { x: X(0), y: y + 5, width: 0, height: 18, rx: 3, style: "fill:var(--" + r[3] + ")" }, svg);
      var wh = r[2] ? el("line", { x1: X(r[1] - r[2]), x2: X(r[1] + r[2]), y1: y + 14, y2: y + 14, style: "stroke:var(--ink);stroke-opacity:0", "stroke-width": 1.5 }, svg) : null;
      var t = text(svg, X(r[1] + (r[2] || 0)) + 8, y + 19, opts.fmt(r[1]) + (r[2] ? " ± " + opts.fmt(r[2]) : ""), { "font-size": 13, style: "fill:var(--ink-2);opacity:0" });
      return { bar: bar, wh: wh, t: t, v: r[1] };
    });
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    tween(700, function (e) {
      parts.forEach(function (p) {
        p.bar.setAttribute("width", Math.max(0, X(p.v * e) - X(0)).toFixed(1));
        if (e >= 1) { p.t.style.opacity = "1"; if (p.wh) p.wh.style.strokeOpacity = "0.6"; }
      });
    });
  }

  // ---------- 1. download sizes ----------

  (function sizes() {
    var svg = $("sz-svg"), box = $("sz-models");
    if (!svg) return;
    var pick = 4, W = 0, cur = null;
    chips(box, MODELS.map(function (m) { return m[0]; }), pick, function (i) { pick = i; draw(); });
    function draw() {
      clear(svg);
      W = width(svg);
      var p = MODELS[pick][1], wGB = p * 2, sGB = p * 8, narrow = W < 560;
      var lab = narrow ? 0 : 250, x0 = lab, full = W - x0 - 4, H = narrow ? 150 : 112;
      var rowY = narrow ? [22, 92] : [10, 62];
      var labels = ["weights only (bf16)", "weights with AdamW m and v (fp32)"];
      rowY.forEach(function (y, i) {
        text(svg, narrow ? 0 : lab - 12, narrow ? y - 6 : y + 21, labels[i], { "text-anchor": narrow ? "start" : "end", "font-size": 14, style: "fill:var(--ink)" });
      });
      var yb = narrow ? [rowY[0], rowY[1]] : rowY;
      var wBar = el("rect", { x: x0, y: yb[0], width: 0, height: 28, rx: 3, style: "fill:var(--navy)" }, svg);
      var aW = el("rect", { x: x0, y: yb[1], width: 0, height: 28, rx: 3, style: "fill:var(--navy)" }, svg);
      var aM = el("rect", { x: x0, y: yb[1], width: 0, height: 28, style: "fill:var(--sand)" }, svg);
      var aV = el("rect", { x: x0, y: yb[1], width: 0, height: 28, rx: 3, style: "fill:var(--coral)" }, svg);
      var tW = text(svg, x0 + 8, yb[0] + 19, "", { "font-size": 13.5, style: "fill:var(--ink)" });
      var tA = text(svg, x0 + 8, yb[1] + 48, "", { "font-size": 13.5, style: "fill:var(--ink-2)" });
      svg.setAttribute("viewBox", "0 0 " + W + " " + H);
      var u = full / 10;   // the full download is 10 bytes per parameter
      tween(650, function (e) {
        wBar.setAttribute("width", (2 * u * e).toFixed(1));
        aW.setAttribute("width", (2 * u * e).toFixed(1));
        aM.setAttribute("x", (x0 + 2 * u * e).toFixed(1)); aM.setAttribute("width", (4 * u * e).toFixed(1));
        aV.setAttribute("x", (x0 + 6 * u * e).toFixed(1)); aV.setAttribute("width", (4 * u * e).toFixed(1));
      }, function () {
        [["weights", x0 + u], ["m", x0 + 4 * u], ["v", x0 + 8 * u]].forEach(function (q) {
          text(svg, q[1], yb[1] + 19, q[0], { "text-anchor": "middle", "font-size": 13, "font-style": q[0] === "weights" ? "normal" : "italic", style: "fill:#fff" });
        });
        tW.setAttribute("x", x0 + 2 * u + 8);
        tW.textContent = wGB.toFixed(wGB < 1 ? 2 : 1) + " GB";
        tA.textContent = "weights " + wGB.toFixed(wGB < 1 ? 2 : 1) + " GB + m " + (sGB / 2).toFixed(sGB < 2 ? 2 : 1) + " GB + v " + (sGB / 2).toFixed(sGB < 2 ? 2 : 1) + " GB = " + (wGB + sGB).toFixed(1) + " GB";
      });
      cur = pick;
    }
    draw();
    window.addEventListener("resize", debounce(function () { if (width(svg) !== W) draw(); }));
    void cur;
  })();

  // ---------- 2. the toy: the early jump and forgetting ----------

  (function toy() {
    var svg = $("tp-svg");
    if (!svg) return;
    var note = $("tp-note"), rateBox = $("tp-rates");
    var modeBtns = [].slice.call(document.querySelectorAll("#play [data-tmode]"));
    var rateBtns = [].slice.call(document.querySelectorAll("#play [data-rate]"));
    var st = { mode: "jump", rate: "hi" }, raf = 0, W = 0, played = false;

    // Mode "jump": a narrow valley of the new task, the checkpoint on its floor.
    var J = { start: [-0.37, 0.07], target: [0.35, -0.04], sw: 0.05, sig: [0.12, 2.5], steps: 45 };
    J.phi = Math.atan2(J.start[1] - J.target[1], J.start[0] - J.target[0]);
    J.su = Math.hypot(J.start[0] - J.target[0], J.start[1] - J.target[1]);
    // Mode "forget": old-task loss steep in w around the checkpoint; new-task minimum mostly along u.
    var F = { a: 1.0, b: 0.05, ut: 0.9, wt: 0.06, c: 0.5, d: 0.1, sigT: [0.15, 1.5], sigS: [0.15, 2.5], lam: 16, lr: 0.03, steps: 60 };

    function adamRun(r, grad, lr, steps, warm, src) {
      var b1 = 0.9, b2 = 0.99, m = [0, 0], v = [0, 0], t = 0, vrec = [0, 0];
      function step(g, tt) {
        for (var i = 0; i < 2; i++) { m[i] = b1 * m[i] + (1 - b1) * g[i]; v[i] = b2 * v[i] + (1 - b2) * g[i] * g[i]; }
        var c1 = 1 - Math.pow(b1, tt), c2 = 1 - Math.pow(b2, tt);
        return [m[0] / c1 / (Math.sqrt(v[0] / c2) + 1e-8), m[1] / c1 / (Math.sqrt(v[1] / c2) + 1e-8)];
      }
      if (warm) {
        for (var k = 1; k <= 200; k++) step(src(), k);
        var c2 = 1 - Math.pow(b2, 200); vrec = [v[0] / c2, v[1] / c2]; t = 200;
      }
      var p = [0, 0], path = [p.slice()];
      for (var s = 1; s <= steps; s++) { t++; var d = step(grad(p, vrec), t); p = [p[0] - lr * d[0], p[1] - lr * d[1]]; path.push(p.slice()); }
      return path;
    }

    function simJump(seed) {
      var c = Math.cos(J.phi), s = Math.sin(J.phi);
      function toUW(x, y) { var dx = x - J.target[0], dy = y - J.target[1]; return [c * dx + s * dy, -s * dx + c * dy]; }
      function loss(x, y) { var uw = toUW(x, y); return 0.5 * (uw[0] * uw[0] / (J.su * J.su) + uw[1] * uw[1] / (J.sw * J.sw)); }
      var lr = st.rate === "hi" ? 0.055 : 0.02, w0 = toUW(J.start[0], J.start[1])[1];
      function runOne(warm) {
        var r = mulberry32(seed);
        // positions are tracked in (u, w); the optimizer works in those coordinates
        var uv = adamRun(r, function (p) {
          var u = p[0] + toUW(J.start[0], J.start[1])[0], w = p[1] + w0;
          return [u / (J.su * J.su) + J.sig[0] * gauss(r), w / (J.sw * J.sw) + J.sig[1] * gauss(r)];
        }, lr, J.steps, warm, function () { return [J.sig[0] * gauss(r), J.sig[1] * gauss(r)]; });
        var u0 = toUW(J.start[0], J.start[1])[0];
        return uv.map(function (q) {
          var u = q[0] + u0, w = q[1] + w0;
          return [J.target[0] + c * u - s * w, J.target[1] + s * u + c * w];
        });
      }
      var cold = runOne(false), warm = runOne(true);
      return { runs: [{ name: "cold start", color: "var(--sand)", path: cold, L: cold.map(function (p) { return loss(p[0], p[1]); }) },
                      { name: "rebuilt state", color: "var(--navy)", path: warm, L: warm.map(function (p) { return loss(p[0], p[1]); }) }],
               loss: loss, lr: lr };
    }

    function simForget(seed) {
      function Ls(p) { return 0.5 * (p[0] * p[0] / (F.a * F.a) + p[1] * p[1] / (F.b * F.b)); }
      function Lt(p) { return 0.5 * ((p[0] - F.ut) * (p[0] - F.ut) / (F.c * F.c) + (p[1] - F.wt) * (p[1] - F.wt) / (F.d * F.d)); }
      function runOne(anchor) {
        var r = mulberry32(seed);
        return adamRun(r, function (p, vrec) {
          var g = [(p[0] - F.ut) / (F.c * F.c) + F.sigT[0] * gauss(r), (p[1] - F.wt) / (F.d * F.d) + F.sigT[1] * gauss(r)];
          if (anchor) { g[0] += 2 * F.lam * vrec[0] * p[0]; g[1] += 2 * F.lam * vrec[1] * p[1]; }
          return g;
        }, F.lr, F.steps, true, function () { return [F.sigS[0] * gauss(r), F.sigS[1] * gauss(r)]; });
      }
      var warm = runOne(false), full = runOne(true);
      function pack(name, color, path) { return { name: name, color: color, path: path, L: path.map(Lt), FG: path.map(Ls) }; }
      return { runs: [pack("warm start", "var(--navy)", warm), pack("warm start with anchor", "var(--teal)", full)], Lt: Lt, Ls: Ls };
    }

    function render(animate) {
      cancelAnimationFrame(raf);
      clear(svg);
      W = width(svg);
      rateBox.style.display = st.mode === "jump" ? "" : "none";
      var narrow = W < 560, mapH = narrow ? 150 : 170, plotH = 96, gap = 18;
      var sim = st.mode === "jump" ? simJump(3) : simForget(4);
      var mapG = el("g", {}, svg), plotsY = mapH + gap + 14;
      el("rect", { x: 0, y: 0, width: W, height: mapH, rx: 4, style: "fill:var(--bg);stroke:var(--rule)" }, mapG);
      var clipId = "tp-clip-" + st.mode;
      var cp = el("clipPath", { id: clipId }, svg);
      el("rect", { x: 0, y: 0, width: W, height: mapH, rx: 4 }, cp);
      var map = el("g", { "clip-path": "url(#" + clipId + ")" }, mapG);
      // Contours are drawn as polylines in screen space, so x and y can use different scales.
      var X, Y;
      function ellipse(cx, cy, a, b, phi, style) {
        var pts = [], c = Math.cos(phi), s = Math.sin(phi);
        for (var k = 0; k <= 96; k++) {
          var t = 2 * Math.PI * k / 96, ex = a * Math.cos(t), ey = b * Math.sin(t);
          pts.push(X(cx + ex * c - ey * s).toFixed(1) + "," + Y(cy + ex * s + ey * c).toFixed(1));
        }
        return el("polygon", { points: pts.join(" "), style: style, "stroke-width": 0.8 }, map);
      }
      function setFrame(x0, x1, y0, y1) {
        X = function (x) { return (x - x0) / (x1 - x0) * W; };
        Y = function (y) { return mapH - (y - y0) / (y1 - y0) * mapH; };
      }
      if (st.mode === "jump") {
        setFrame(-0.47, 0.47, -0.15, 0.17);
        [4.5, 3.2, 2.2, 1.5, 1.0, 0.65, 0.4, 0.22, 0.1, 0.03].forEach(function (lv, i) {
          ellipse(J.target[0], J.target[1], J.su * Math.sqrt(2 * lv), J.sw * Math.sqrt(2 * lv), J.phi,
            "fill:var(--navy);fill-opacity:" + (0.03 + i * 0.006) + ";stroke:var(--navy);stroke-opacity:0.3");
        });
        text(map, 8, 16, "new task's loss", { "font-size": 12, style: "fill:var(--muted)" });
      } else {
        setFrame(-0.22, 1.12, -0.13, 0.16);
        [3, 1.6, 0.8, 0.4, 0.15, 0.04].forEach(function (lv, i) {
          ellipse(F.ut, F.wt, F.c * Math.sqrt(2 * lv), F.d * Math.sqrt(2 * lv), 0,
            "fill:var(--navy);fill-opacity:" + (0.03 + i * 0.008) + ";stroke:var(--navy);stroke-opacity:0.35");
        });
        [2.5, 1.2, 0.5, 0.15].forEach(function (lv) {
          ellipse(0, 0, F.a * Math.sqrt(2 * lv), F.b * Math.sqrt(2 * lv), 0, "fill:none;stroke:var(--sand);stroke-opacity:0.9;stroke-dasharray:4 4");
        });
        text(map, 8, 16, "blue: new task's loss \u00b7 dashed sand: old task's loss", { "font-size": 12, style: "fill:var(--muted)" });
        el("path", { d: "M" + (X(F.ut) - 4) + " " + (Y(F.wt) - 4) + "l8 8m0 -8l-8 8", style: "stroke:var(--ink-2)", "stroke-width": 1.2 }, map);
      }
      var start = st.mode === "jump" ? J.start : [0, 0];
      var lines = sim.runs.map(function (r) {
        return el("polyline", { fill: "none", style: "stroke:" + r.color, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }, map);
      });
      el("circle", { cx: X(start[0]), cy: Y(start[1]), r: 4.5, style: "fill:var(--paper);stroke:var(--ink)", "stroke-width": 1.4 }, map);
      text(map, X(start[0]) + 8, Y(start[1]) - 8, "checkpoint", { "font-size": 12, style: "fill:var(--ink-2)" });

      // loss plots under the map
      var plots = st.mode === "jump" ? [["new task's loss", "L"]] : [["new task's loss", "L"], ["forgetting: old task's loss", "FG"]];
      var pw = (W - (plots.length - 1) * 16) / plots.length;
      var traces = [];
      plots.forEach(function (pl, pi) {
        var px = pi * (pw + 16), key = pl[1];
        var maxV = Math.max.apply(null, sim.runs.map(function (r) { return Math.max.apply(null, r[key]); })) * 1.08;
        text(svg, px, plotsY - 4, pl[0], { "font-size": 13, style: "fill:var(--ink-2)" });
        el("line", { x1: px, x2: px + pw, y1: plotsY + plotH, y2: plotsY + plotH, style: "stroke:var(--rule)" }, svg);
        el("line", { x1: px, x2: px, y1: plotsY, y2: plotsY + plotH, style: "stroke:var(--rule)" }, svg);
        text(svg, px + pw, plotsY + plotH + 15, "steps", { "text-anchor": "end", "font-size": 11.5, style: "fill:var(--muted)" });
        sim.runs.forEach(function (r) {
          traces.push({ key: key, r: r, x: px, w: pw, max: maxV, line: el("polyline", { fill: "none", style: "stroke:" + r.color, "stroke-width": 1.8 }, svg) });
        });
      });
      var lx = 0, ly = plotsY + plotH + 36;
      sim.runs.forEach(function (r) {
        el("line", { x1: lx, x2: lx + 16, y1: ly - 4, y2: ly - 4, style: "stroke:" + r.color, "stroke-width": 3 }, svg);
        var t = text(svg, lx + 22, ly, r.name, { "font-size": 13, style: "fill:var(--ink-2)" });
        lx += 40 + t.getComputedTextLength();
      });
      svg.setAttribute("viewBox", "0 0 " + W + " " + (ly + 8));

      var n = sim.runs[0].path.length;
      function drawUpTo(k) {
        sim.runs.forEach(function (r, i) {
          lines[i].setAttribute("points", r.path.slice(0, k).map(function (p) { return X(p[0]).toFixed(1) + "," + Y(p[1]).toFixed(1); }).join(" "));
        });
        traces.forEach(function (tr) {
          var vals = tr.r[tr.key], steps = vals.length - 1;
          tr.line.setAttribute("points", vals.slice(0, k).map(function (v, j) {
            return (tr.x + tr.w * j / steps).toFixed(1) + "," + (plotsY + plotH - plotH * Math.min(v, tr.max) / tr.max).toFixed(1);
          }).join(" "));
        });
      }
      var r0 = sim.runs[0], r1 = sim.runs[1];
      if (st.mode === "jump") {
        note.textContent = "Cold start: the new task's loss goes from " + r0.L[0].toFixed(2) + " to " + r0.L[1].toFixed(2) + " on the first step. Rebuilt state: " + r1.L[0].toFixed(2) + " to " + r1.L[1].toFixed(2) + "." + (st.rate === "lo" ? " At the lower rate the jump is small, which is why the warm start matters most at high rates." : "");
      } else {
        var e0 = r0.FG[n - 1], e1 = r1.FG[n - 1];
        note.textContent = "After " + (n - 1) + " steps the warm start has forgetting " + e0.toFixed(2) + " and the anchored run " + e1.toFixed(2) + ", " + (e0 / e1).toFixed(1) + " times less, at a new-task loss of " + r0.L[n - 1].toFixed(2) + " against " + r1.L[n - 1].toFixed(2) + ". A cold start forgets like the warm start here.";
      }
      if (!animate) { drawUpTo(n); return; }
      var k = 1, last = 0, per = st.mode === "jump" ? 70 : 55;
      function frame(ts) {
        if (!last) last = ts;
        if (ts - last > per) { k++; last = ts; }
        drawUpTo(k);
        if (k < n) raf = requestAnimationFrame(frame);
      }
      raf = requestAnimationFrame(frame);
    }

    modeBtns.forEach(function (b) { b.addEventListener("click", function () { press(modeBtns, b); st.mode = b.dataset.tmode; render(true); }); });
    rateBtns.forEach(function (b) { b.addEventListener("click", function () { press(rateBtns, b); st.rate = b.dataset.rate; render(true); }); });
    $("tp-replay").addEventListener("click", function () { render(true); });
    render(false);
    if (!reduce) onVisible(svg, function () { if (!played) { played = true; render(true); } });
    window.addEventListener("resize", debounce(function () { if (width(svg) !== W) render(false); }));
  })();

  // ---------- 3. recovery steps ----------

  (function steps() {
    var svg = $("st-svg");
    if (!svg) return;
    var textBox = $("st-text"), tabs = [].slice.call(document.querySelectorAll("#steps [data-step]"));
    var prev = $("st-prev"), nextB = $("st-next"), dots = [].slice.call(document.querySelectorAll("#steps .dots span"));
    var step = 0, raf = 0, W = 0;
    var TEXT = [
      ["Start from zero", "Load the released weights θ* into a fresh AdamW optimizer. Its first moment m and second moment v are zero, because the release left them out."],
      ["Run 200 tiny steps", "Train for 200 steps at a learning rate of 10⁻⁷ on public text. The weights barely move, while v fills with a running average of squared gradients at θ*, an estimate of the empirical Fisher diagonal. A separate run of ten probe steps at 10⁻⁶ gives a fresh m, rescaled to match the better v."],
      ["Use the state twice", "Load the rebuilt m and v into AdamW to warm-start fine-tuning. Use v again as the weights of an EWC penalty, which keeps the parameters the old task is sensitive to near the checkpoint."]
    ];
    var COLS = 12, ROWS = 6, rand = mulberry32(11);
    var THETA = [], VREC = [], MREC = [];
    for (var i = 0; i < COLS * ROWS; i++) { THETA.push(0.2 + 0.6 * rand()); VREC.push(Math.pow(rand(), 3)); MREC.push(rand() * 2 - 1); }

    function grid(g, x, y, cell, title, vals, style) {
      text(g, x, y - 8, title, { "font-size": 13.5, style: "fill:var(--ink-2)" });
      var cells = [];
      for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) {
        var i = r * COLS + c;
        cells.push(el("rect", { x: x + c * (cell + 2), y: y + r * (cell + 2), width: cell, height: cell, rx: 1.5, style: style(vals ? vals[i] : 0, i) }, g));
      }
      return cells;
    }
    function render() {
      cancelAnimationFrame(raf);
      clear(svg);
      W = width(svg);
      textBox.innerHTML = "";
      var h = document.createElement("h3"); h.textContent = TEXT[step][0]; textBox.appendChild(h);
      var p = document.createElement("p"); p.style.margin = "0"; p.textContent = TEXT[step][1]; textBox.appendChild(p);
      tabs.forEach(function (b, i) { b.setAttribute("aria-selected", String(i === step)); });
      dots.forEach(function (d, i) { d.classList.toggle("on", i === step); });
      prev.disabled = step === 0; nextB.disabled = step === 2;
      var narrow = W < 600;
      var cell = narrow ? Math.floor((W - 4 - 11 * 2) / 12) : Math.min(14, Math.floor((W / 3 - 30 - 22) / 12));
      var gw = COLS * (cell + 2) - 2, gh = ROWS * (cell + 2) - 2;
      var pos = narrow ? [[0, 24], [0, 24 + gh + 40], [0, 24 + 2 * (gh + 40)]] : [[0, 24], [(W - gw) / 2, 24], [W - gw, 24]];
      var H = (narrow ? 24 + 3 * (gh + 40) : 24 + gh + 34) + (step === 2 ? 60 : 10);
      var g = el("g", {}, svg);
      var th = grid(g, pos[0][0], pos[0][1], cell, "weights θ*", THETA, function (v) { return "fill:var(--navy);fill-opacity:" + v.toFixed(2); });
      var mStyle = function () { return "fill:none;stroke:var(--rule);stroke-dasharray:2 2"; };
      var mm = grid(g, pos[1][0], pos[1][1], cell, "first moment m", null, mStyle);
      var vv = grid(g, pos[2][0], pos[2][1], cell, "second moment v", null, mStyle);
      var lab = text(svg, pos[2][0], pos[2][1] + gh + 22, "", { "font-size": 13, style: "fill:var(--muted)" });
      svg.setAttribute("viewBox", "0 0 " + W + " " + H);
      function fill(k) {   // k: recovery progress in [0, 1]
        var bias = 1 - Math.pow(0.95, Math.round(200 * k));
        vv.forEach(function (c, i) {
          var v = VREC[i] * bias;
          c.setAttribute("style", k > 0 ? "fill:var(--teal);fill-opacity:" + (0.08 + 0.9 * v).toFixed(2) + ";stroke:none" : mStyle());
        });
        mm.forEach(function (c, i) {
          var m = MREC[i] * Math.min(1, k * 4);
          c.setAttribute("style", k > 0 ? "fill:var(--" + (m >= 0 ? "teal" : "coral") + ");fill-opacity:" + (0.08 + 0.6 * Math.abs(m)).toFixed(2) + ";stroke:none" : mStyle());
        });
        lab.textContent = k > 0 ? "step " + Math.round(200 * k) + " of 200, bias correction " + bias.toFixed(3) : "zero: left out of the release";
      }
      if (step === 0) { fill(0); text(svg, pos[1][0], pos[1][1] + gh + 22, "zero: left out of the release", { "font-size": 13, style: "fill:var(--muted)" }); return; }
      if (step === 1) {
        if (reduce) { fill(1); return; }
        var t0 = 0;
        raf = requestAnimationFrame(function f(ts) {
          if (!t0) t0 = ts;
          var k = Math.min(1, (ts - t0) / 4200);
          fill(k);
          th.forEach(function (c, i) { c.style.fillOpacity = (THETA[i] + 0.004 * Math.sin(ts / 90 + i)).toFixed(3); });
          if (k < 1) raf = requestAnimationFrame(f);
        });
        return;
      }
      fill(1);
      lab.textContent = "";
      vv.forEach(function (c, i) { if (VREC[i] > 0.45) { c.setAttribute("style", c.getAttribute("style") + ";stroke:var(--coral);stroke-width:1.6"); } });
      var by = (narrow ? pos[2][1] + gh : pos[0][1] + gh) + 26;
      text(svg, 0, by, "Warm start: load m and v into AdamW.", { "font-size": 13.5, style: "fill:var(--ink)" });
      text(svg, 0, by + 22, "Anchor: λ Σ vᵢ (θᵢ − θ*ᵢ)², where the outlined cells of v weigh most.", { "font-size": 13.5, style: "fill:var(--ink)" });
      svg.setAttribute("viewBox", "0 0 " + W + " " + (by + 34));
    }
    tabs.forEach(function (b, i) { b.addEventListener("click", function () { step = i; render(); }); });
    prev.addEventListener("click", function () { if (step > 0) { step--; render(); } });
    nextB.addEventListener("click", function () { if (step < 2) { step++; render(); } });
    $("steps").addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight" && step < 2) { step++; render(); }
      if (e.key === "ArrowLeft" && step > 0) { step--; render(); }
    });
    render();
    window.addEventListener("resize", debounce(function () { if (width(svg) !== W) render(); }));
  })();

  // ---------- 4. check against the true state ----------

  (function check() {
    var svg = $("ck-svg");
    if (!svg) return;
    var btns = [].slice.call(document.querySelectorAll("#check [data-chk]")), key = "gpt2", W = 0;
    function draw() {
      W = width(svg);
      var c = CHECK[key];
      hbars(svg, c.rows, { fmt: function (v) { return v.toFixed(3).replace(/0+$/, "").replace(/\.$/, ""); }, ticks: [0, 0.2, 0.4, 0.6, 0.8].filter(function (t) { return t <= Math.max.apply(null, c.rows.map(function (r) { return r[1]; })) * 1.1; }) });
      $("ck-note").textContent = c.note;
    }
    btns.forEach(function (b) { b.addEventListener("click", function () { press(btns, b); key = b.dataset.chk; draw(); }); });
    onVisible(svg, draw);
    draw();
    window.addEventListener("resize", debounce(function () { if (width(svg) !== W) draw(); }));
  })();

  // ---------- 5. results explorer ----------

  (function explorer() {
    var svg = $("xr-svg");
    if (!svg) return;
    var note = $("xr-note"), metricBox = $("xr-metrics");
    var st = { view: "table", scale: 1, metric: "f" }, W = 0;
    var scaleBtns = chips($("xr-scales"), SCALES.map(function (s) { return s.name; }), st.scale, function (i) { st.scale = i; draw(); });
    var viewBtns = [].slice.call(document.querySelectorAll("#explorer [data-xview]"));
    var metricBtns = [].slice.call(document.querySelectorAll("#explorer [data-metric]"));
    viewBtns.forEach(function (b) { b.addEventListener("click", function () { press(viewBtns, b); st.view = b.dataset.xview; draw(); }); });
    metricBtns.forEach(function (b) { b.addEventListener("click", function () { press(metricBtns, b); st.metric = b.dataset.metric; draw(); }); });

    function draw() {
      clear(svg);
      W = width(svg);
      metricBox.style.display = st.view === "table" ? "" : "none";
      scaleBtns[0].disabled = st.view === "sweep";
      if (st.view === "sweep" && st.scale === 0) { st.scale = 1; press(scaleBtns, scaleBtns[1]); }
      if (st.view === "table") table(); else sweep();
    }

    function table() {
      var s = SCALES[st.scale], data = s[st.metric];
      if (!data) {
        svg.setAttribute("viewBox", "0 0 " + W + " 60");
        text(svg, W / 2, 34, "Not reported at 124M, where the benchmark suite is near chance.", { "text-anchor": "middle", "font-size": 14, style: "fill:var(--muted)" });
        note.textContent = "";
        return;
      }
      var lab = 76, rh = 40, H = CONDS.length * rh + 34, m = { r: 90 };
      var lo = Math.min.apply(null, data.map(function (d) { return d[0] - d[1]; })), hi = Math.max.apply(null, data.map(function (d) { return d[0] + d[1]; }));
      if (st.metric === "f") lo = 0;
      if (st.metric === "b") hi = Math.max(hi, 0);
      var pad = (hi - lo) * 0.08 || 0.01; lo -= st.metric === "f" ? 0 : pad; hi += pad;
      var X = function (v) { return lab + (W - lab - m.r) * (v - lo) / (hi - lo); };
      var raw = (hi - lo) / 4, mag = Math.pow(10, Math.floor(Math.log10(raw)));
      var stepT = [1, 2, 2.5, 5, 10].map(function (k) { return k * mag; }).filter(function (k) { return k >= raw; })[0];
      for (var v = Math.ceil(lo / stepT) * stepT; v <= hi + 1e-9; v += stepT) {
        el("line", { x1: X(v), x2: X(v), y1: 4, y2: CONDS.length * rh + 4, style: "stroke:var(--rule)", "stroke-dasharray": "2 4" }, svg);
        text(svg, X(v), CONDS.length * rh + 22, fmt(v), { "text-anchor": "middle", "font-size": 12, style: "fill:var(--muted)" });
      }
      if (lo < 0 && hi > 0) el("line", { x1: X(0), x2: X(0), y1: 4, y2: CONDS.length * rh + 4, style: "stroke:var(--muted)" }, svg);
      CONDS.forEach(function (c, i) {
        var y = 8 + i * rh + rh / 2 - 4, d = data[i];
        text(svg, lab - 12, y + 5, c, { "text-anchor": "end", "font-size": 14.5, "font-weight": c === "full" || c === "cold" ? 600 : 400, style: "fill:var(--ink)" });
        el("line", { x1: X(d[0] - d[1]), x2: X(d[0] + d[1]), y1: y, y2: y, style: "stroke:" + COND_COLOR[c].split(";")[0], "stroke-width": 2.5 }, svg);
        var dot = el("circle", { cx: X(d[0]), cy: y, r: 7, tabindex: 0, style: "fill:" + COND_COLOR[c] + ";stroke:var(--paper)", "stroke-width": 1.5 }, svg);
        text(svg, X(d[0] + d[1]) + 10, y + 5, fmt(d[0]) + " ± " + fmtSd(d[1]), { "font-size": 13, style: "fill:var(--ink-2)" });
        el("title", {}, dot).textContent = c + ": " + fmt(d[0]) + " ± " + fmtSd(d[1]);
      });
      svg.setAttribute("viewBox", "0 0 " + W + " " + H);
      var what = { f: "Forgetting in nats; lower is better.", t: "Target loss on HC4 in nats; lower means it learned more.", b: "Change in mean benchmark accuracy, in points; closer to zero is better." }[st.metric];
      note.textContent = what + " At " + s.name + ", full forgets " + s.ratio.toFixed(2) + " times less than cold" + (st.scale === 3 ? ", and cold diverged on one of three seeds." : ".");
    }

    function fmtSd(v) { return st.metric === "b" || Math.abs(v) >= 1 ? v.toFixed(2) : v.toFixed(3); }
    function fmt(v) {
      if (st.metric === "b") return (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(2);
      return Math.abs(v) >= 1 ? v.toFixed(2) : v.toFixed(3);
    }

    function sweep() {
      var pts = SWEEP[st.scale], m = { l: 58, r: 30, t: 16, b: 46 }, H = W < 560 ? 300 : 330;
      var xs = pts.map(function (p) { return p[1]; }), ys = pts.map(function (p) { return p[2]; });
      var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y1 = Math.max.apply(null, ys) * 1.1;
      var px = (x1 - x0) * 0.12; x0 -= px; x1 += px;
      var X = function (v) { return m.l + (W - m.l - m.r) * (v - x0) / (x1 - x0); }, Y = function (v) { return m.t + (H - m.t - m.b) * (1 - v / y1); };
      for (var i = 0; i <= 4; i++) {
        var yv = y1 * i / 4, xv = x0 + (x1 - x0) * i / 4;
        el("line", { x1: m.l, x2: W - m.r, y1: Y(yv), y2: Y(yv), style: "stroke:var(--rule)" }, svg);
        text(svg, m.l - 8, Y(yv) + 4, yv.toFixed(2), { "text-anchor": "end", "font-size": 12, style: "fill:var(--muted)" });
        text(svg, X(xv), H - m.b + 18, xv.toFixed(2), { "text-anchor": "middle", "font-size": 12, style: "fill:var(--muted)" });
      }
      text(svg, (m.l + W - m.r) / 2, H - 8, "target loss (lower = learned more)", { "text-anchor": "middle", "font-size": 13, style: "fill:var(--ink-2)" });
      text(svg, 14, (m.t + H - m.b) / 2, "forgetting", { "text-anchor": "middle", "font-size": 13, transform: "rotate(-90 14 " + (m.t + H - m.b) / 2 + ")", style: "fill:var(--ink-2)" });
      el("polyline", { points: pts.slice(1).map(function (p) { return X(p[1]) + "," + Y(p[2]); }).join(" "), fill: "none", style: "stroke:var(--teal);stroke-opacity:0.5", "stroke-width": 1.5 }, svg);
      pts.forEach(function (p, i) {
        var c = i === 0 ? "var(--sand)" : "var(--teal)";
        el("circle", { cx: X(p[1]), cy: Y(p[2]), r: i === 0 ? 7 : 6, style: "fill:" + c + ";stroke:var(--paper)", "stroke-width": 1.5 }, svg);
        text(svg, X(p[1]) + 10, Y(p[2]) - 8, i === 0 ? "cold start" : "λ = " + p[0], { "font-size": 12.5, style: "fill:var(--ink-2)" });
      });
      svg.setAttribute("viewBox", "0 0 " + W + " " + H);
      note.textContent = "The anchor alone (ewc) at increasing strength, " + SCALES[st.scale].name + ". Stronger anchors move both learning and forgetting toward the lower left at this rate. GPT-2 was not part of this sweep.";
    }

    draw();
    window.addEventListener("resize", debounce(function () { if (width(svg) !== W) draw(); }));
  })();

  // ---------- 6. structure controls ----------

  (function nulls() {
    var svg = $("nl-svg");
    if (!svg) return;
    var W = 0;
    function draw() { W = width(svg); hbars(svg, NULLS, { fmt: function (v) { return v.toFixed(4); }, max: 0.036, ticks: [0, 0.01, 0.02, 0.03] }); }
    onVisible(svg, draw);
    draw();
    window.addEventListener("resize", debounce(function () { if (width(svg) !== W) draw(); }));
  })();

  var copy = $("bib-copy");
  if (copy) copy.addEventListener("click", function () {
    var t = $("bib-text").textContent.replace(/\s*\n\s*/g, " ");
    if (navigator.clipboard) navigator.clipboard.writeText(t).then(function () { copy.textContent = "Copied"; setTimeout(function () { copy.textContent = "Copy"; }, 1500); });
  });
})();
