// In-Place TTT project page: the reading animation, the study steps, the results explorer,
// the inference learning-rate dial, the chunk-size chart and the gradient-share bars.
// All numbers come from the report (paper/main.tex) and docs/results.md in the study repository.
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- data ----------

  var LENGTHS = ["4k", "8k", "16k", "32k", "64k", "64k, YaRN"];
  var LENGTHS_SHORT = ["4k", "8k", "16k", "32k", "64k", "YaRN"];
  var LENGTHS_LONG = ["4k", "8k", "16k", "32k", "64k with plain RoPE", "64k with YaRN"];

  // Paired differences on the same RULER instances: [value, low, high] of the 95% bootstrap interval.
  // At 4k no update fires, so the update effect is zero without an interval.
  var Z = [0, null, null];
  var DIFF = {
    "13": {
      both: {
        total: [[1.1, 0.8, 1.5], [1.9, 1.5, 2.3], [3.3, 2.9, 3.8], [-0.9, -1.4, -0.5], [3.2, 2.6, 3.8], [-1.7, -2.3, -1.2]],
        update: [Z, [-0.2, -0.4, 0.0], [-0.4, -0.6, -0.2], [0.2, -0.1, 0.5], [0.1, -0.4, 0.6], [-2.5, -3.0, -2.1]],
        training: [[1.1, 0.8, 1.5], [2.1, 1.7, 2.5], [3.8, 3.3, 4.2], [-1.1, -1.5, -0.7], [3.1, 2.5, 3.7], [0.8, 0.3, 1.3]]
      },
      s1: {
        total: [[1.5, 1.1, 1.9], [1.5, 1.0, 2.1], [4.0, 3.5, 4.5], [-1.8, -2.4, -1.2], [2.4, 1.6, 3.1], [-5.1, -5.8, -4.4]],
        update: [Z, [-0.4, -0.6, -0.1], [-0.3, -0.6, -0.1], [0.9, 0.4, 1.3], [-1.4, -2.0, -0.8], [-4.4, -4.9, -3.8]],
        training: [[1.5, 1.1, 1.9], [1.9, 1.4, 2.4], [4.4, 3.9, 4.9], [-2.7, -3.3, -2.1], [3.8, 3.1, 4.5], [-0.7, -1.4, -0.1]]
      },
      s2: {
        total: [[0.7, 0.3, 1.1], [2.3, 1.8, 2.7], [2.6, 2.2, 3.1], [0.0, -0.6, 0.6], [4.0, 3.2, 4.7], [1.7, 1.0, 2.3]],
        update: [Z, [0.0, -0.3, 0.3], [-0.5, -0.8, -0.2], [-0.5, -0.9, 0.0], [1.5, 0.9, 2.2], [-0.7, -1.2, -0.1]],
        training: [[0.7, 0.3, 1.2], [2.3, 1.8, 2.7], [3.1, 2.7, 3.6], [0.5, 0.0, 1.0], [2.5, 1.8, 3.1], [2.3, 1.8, 2.9]]
      }
    },
    "11": {
      both: {
        total: [[0.2, 0.0, 0.4], [0.2, -0.1, 0.4], [0.6, 0.3, 0.8], [-0.2, -0.5, 0.3], [3.5, 2.8, 4.2], [-2.3, -2.8, -1.9]],
        update: [Z, [0.0, -0.1, 0.1], [-0.3, -0.5, -0.1], [0.0, -0.4, 0.3], [0.4, -0.2, 0.9], [-2.6, -3.1, -2.1]],
        training: [[0.2, 0.0, 0.4], [0.2, -0.1, 0.4], [0.9, 0.6, 1.1], [-0.1, -0.5, 0.2], [3.1, 2.5, 3.7], [0.2, -0.1, 0.6]]
      },
      s1: {
        total: [[0.1, -0.1, 0.4], [0.3, 0.0, 0.6], [0.7, 0.4, 1.1], [0.7, 0.2, 1.2], [2.3, 1.4, 3.1], [-3.8, -4.4, -3.2]],
        update: [Z, [0.0, -0.1, 0.2], [-0.1, -0.3, 0.1], [0.6, 0.1, 1.0], [-1.5, -2.2, -0.8], [-4.1, -4.7, -3.5]],
        training: [[0.1, -0.1, 0.4], [0.3, 0.0, 0.6], [0.8, 0.5, 1.2], [0.2, -0.3, 0.6], [3.8, 3.0, 4.5], [0.3, -0.2, 0.8]]
      },
      s2: {
        total: [[0.2, 0.0, 0.4], [0.0, -0.3, 0.3], [0.4, 0.1, 0.7], [-1.0, -1.5, -0.5], [4.7, 3.9, 5.6], [-0.8, -1.4, -0.3]],
        update: [Z, [0.0, -0.2, 0.1], [-0.5, -0.8, -0.3], [-0.6, -1.0, -0.2], [2.2, 1.5, 2.9], [-1.1, -1.6, -0.5]],
        training: [[0.2, 0.0, 0.4], [0.1, -0.2, 0.4], [0.9, 0.6, 1.2], [-0.4, -0.8, 0.0], [2.5, 1.8, 3.3], [0.2, -0.3, 0.7]]
      }
    }
  };

  // RULER mean over the 13 tasks.
  var SCORES = {
    base: [93.0, 84.1, 74.8, 75.4, 53.7, 61.9],
    s1: { control: [85.2, 82.8, 78.7, 77.7, 47.8, 64.6], on: [86.7, 84.4, 82.7, 75.8, 50.2, 59.5], off: [86.7, 84.7, 83.1, 75.0, 51.6, 63.8] },
    s2: { control: [86.5, 83.5, 78.8, 75.5, 47.8, 62.6], on: [87.3, 85.8, 81.4, 75.5, 51.7, 64.2], off: [87.3, 85.8, 81.9, 76.0, 50.2, 64.9] }
  };

  // Accumulated fast-weight change ||W - W0||_F after the first and seventh update, seeds 1 and 2.
  var DELTA = {
    layers: [0, 6, 12, 18, 24, 30],
    c1: [[0.13, 0.26, 0.10, 0.16, 0.21, 0.85], [0.10, 0.22, 0.11, 0.16, 0.18, 0.72]],
    c7: [[0.76, 0.82, 0.49, 0.86, 1.01, 3.02], [0.62, 0.74, 0.54, 0.83, 0.93, 2.84]]
  };

  // Inference-time variants of the seed-1 checkpoint: 13-task means, paired difference to update off,
  // and the frequent-words task at 32k and 64k with plain RoPE.
  var ETA = [
    { m32: 75.0, d32: null, m64: 51.6, d64: null, fw32: 95.3, fw64: 73.5, name: "η = 0" },
    { m32: 75.5, d32: [0.5, 0.1, 0.9], m64: 50.1, d64: [-1.5, -2.0, -1.0], fw32: 95.6, fw64: 63.7, name: "η = 1" },
    { m32: 75.8, d32: [0.9, 0.4, 1.3], m64: 50.2, d64: [-1.4, -2.0, -0.8], fw32: 95.3, fw64: 59.3, name: "η = 3" },
    { m32: 74.1, d32: [-0.8, null, null], m64: 48.2, d64: [-3.4, null, null], fw32: 79.1, fw64: 2.7, name: "η = 6" },
    { m32: 74.8, d32: [-0.2, -0.5, 0.2], m64: 51.7, d64: [0.2, -0.2, 0.5], fw32: 95.5, fw64: 73.3, name: "η = 3 with clipping" }
  ];

  // Chunk-size models at 1B tokens: paired difference to the 1B control on the 11 clean tasks.
  var CHUNK = {
    sizes: ["4,096", "1,024", "512"],
    on: { k32: [[-2.1, -2.7, -1.6], [-1.9, -2.4, -1.3], [-1.0, -1.5, -0.4]], k64: [[3.9, 3.1, 4.7], [5.0, null, null], [9.0, null, null]] },
    off: { k32: [[0.2, -0.3, 0.6], [-0.3, -0.8, 0.2], [0.0, -0.5, 0.5]], k64: [[7.8, 7.1, 8.5], [8.0, 7.2, 8.7], [9.2, 8.4, 9.9]] }
  };

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
  function sgn(v) { return (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(1); }
  function ci(d) { return d[1] === null ? "" : " [" + sgn(d[1]) + ", " + sgn(d[2]) + "]"; }
  function width(svg) { return Math.max(300, Math.round(svg.getBoundingClientRect().width || svg.parentNode.clientWidth)); }
  function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function press(buttons, on) { buttons.forEach(function (b) { b.setAttribute("aria-pressed", String(b === on)); }); }
  function rng(seed) { return function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
  function onVisible(node, fn) {
    if (!("IntersectionObserver" in window)) { fn(); return; }
    var io = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { io.disconnect(); fn(); } }, { threshold: 0.35 });
    io.observe(node);
  }
  function box(g, x, y, w, h, title, sub, style) {
    el("rect", { x: x, y: y, width: w, height: h, rx: 6, style: style || "fill:var(--bg);stroke:var(--rule)", "stroke-width": 1.2 }, g);
    text(g, x + w / 2, y + (sub ? h / 2 - 3 : h / 2 + 5), title, { "text-anchor": "middle", "font-size": 15, "font-weight": 600, style: "fill:var(--ink)" });
    if (sub) text(g, x + w / 2, y + h / 2 + 15, sub, { "text-anchor": "middle", "font-size": 13, style: "fill:var(--muted)" });
  }
  function curve(x1, y1, x2, y2, vertical) {
    if (vertical) { var my = (y1 + y2) / 2; return "M" + x1 + " " + y1 + " C" + x1 + " " + my + " " + x2 + " " + my + " " + x2 + " " + y2; }
    var mx = (x1 + x2) / 2;
    return "M" + x1 + " " + y1 + " C" + mx + " " + y1 + " " + mx + " " + y2 + " " + x2 + " " + y2;
  }

  // ---------- 0. primer: a small fast-weight memory ----------
  // Writing adds target x pattern (an outer product) to the change in W; reading multiplies by a pattern.

  (function memory() {
    var svg = $("mem-svg");
    if (!svg) return;
    var note = $("mem-note"), N = 8, r8 = 1 / Math.sqrt(8);
    function unit(v) { var n = Math.sqrt(v.reduce(function (s, x) { return s + x * x; }, 0)); return v.map(function (x) { return x / n; }); }
    var KEY = {
      A: [1, 1, 1, 1, -1, -1, -1, -1].map(function (x) { return x * r8; }),
      B: [1, -1, 1, -1, 1, -1, 1, -1].map(function (x) { return x * r8; }),
      C: [1, 1, -1, -1, 1, 1, -1, -1].map(function (x) { return x * r8; })
    };
    KEY.A2 = unit(KEY.A.map(function (x, i) { return x + [0.16, -0.09, 0.12, 0.02, 0.1, -0.14, 0.04, 0.08][i]; }));
    var VAL = { A: [0.9, 0.7, 0.3, -0.2, -0.6, -0.9, 0.1, 0.5], B: [-0.5, 0.2, 0.9, 0.8, 0.1, -0.4, -0.9, -0.3] };
    var dW = [], writes = { A: 0, B: 0 }, busy = false, G = null, W = 0;
    function zero() { dW = []; for (var i = 0; i < N; i++) { dW.push([0, 0, 0, 0, 0, 0, 0, 0]); } writes = { A: 0, B: 0 }; }
    zero();
    function shade(v, scale) {
      var a = Math.min(1, Math.abs(v) / scale);
      return "fill:var(--" + (v >= 0 ? "teal" : "coral") + ");fill-opacity:" + (0.06 + 0.9 * a).toFixed(2);
    }
    function build() {
      clear(svg);
      W = width(svg);
      var c = Math.max(18, Math.min(40, Math.floor((W - 70) / 10.6))), g = 2;
      var total = c + 16 + N * (c + g) + 26 + c, off = Math.max(0, (W - total) / 2);
      var vx = off, mx = off + c + 16, top = 40, my = top + c + 26, ox = mx + N * (c + g) + 26;
      G = { c: c, g: g, key: [], val: [], cells: [], out: [], mx: mx, my: my };
      G.valLabel = text(svg, vx, my - 8, "target", { "font-size": 13, style: "fill:var(--ink-2)" });
      G.keyLabel = text(svg, mx, top - 8, "pattern", { "font-size": 13, style: "fill:var(--ink-2)" });
      text(svg, ox, my - 8, "output", { "font-size": 13, style: "fill:var(--ink-2)" });
      for (var j = 0; j < N; j++) G.key.push(el("rect", { x: mx + j * (c + g), y: top, width: c, height: c, rx: 3, style: "fill:var(--rule)" }, svg));
      for (var i = 0; i < N; i++) {
        G.val.push(el("rect", { x: vx, y: my + i * (c + g), width: c, height: c, rx: 3, style: "fill:var(--rule)" }, svg));
        G.out.push(el("rect", { x: ox, y: my + i * (c + g), width: c, height: c, rx: 3, style: "fill:var(--rule)" }, svg));
        var row = [];
        for (var j2 = 0; j2 < N; j2++) row.push(el("rect", { x: mx + j2 * (c + g), y: my + i * (c + g), width: c, height: c, rx: 2, style: "fill:var(--rule)" }, svg));
        G.cells.push(row);
      }
      G.rowFrame = el("rect", { x: mx - 3, y: my - 3, width: N * (c + g) + 4, height: c + 6, rx: 4, fill: "none", style: "stroke:var(--coral);stroke-opacity:0", "stroke-width": 2 }, svg);
      G.keyFrame = el("rect", { x: mx - 3, y: top - 3, width: N * (c + g) + 4, height: c + 6, rx: 4, fill: "none", style: "stroke:var(--navy);stroke-opacity:0", "stroke-width": 2 }, svg);
      var by = my + N * (c + g) + 20;
      text(svg, mx, by, "change in the fast weight, W − W", { "font-size": 13, style: "fill:var(--muted)" }).appendChild(sub0());
      svg.setAttribute("viewBox", "0 0 " + W + " " + (by + 10));
      paintMatrix();
      if (writes.A + writes.B === 0) idle();
    }
    // Before the first write, show pair A beside the empty matrix so the parts are visible.
    function idle() {
      paintBar(G.key, KEY.A, r8); paintBar(G.val, VAL.A, 1); paintBar(G.out, null);
      G.keyLabel.textContent = "pattern A";
      G.valLabel.textContent = "target A";
    }
    function sub0() { var t = document.createElementNS(NS, "tspan"); t.setAttribute("dy", 4); t.setAttribute("font-size", 10); t.textContent = "0"; return t; }
    function paintMatrix() {
      var scale = 0.34;
      for (var i = 0; i < N; i++) for (var j = 0; j < N; j++) G.cells[i][j].setAttribute("style", dW[i][j] === 0 ? "fill:var(--rule)" : shade(dW[i][j], scale));
    }
    function paintBar(rects, v, scale) { rects.forEach(function (r, i) { r.setAttribute("style", v ? shade(v[i], scale) : "fill:var(--rule)"); }); }
    function dot(a, b) { return a.reduce(function (s, x, i) { return s + x * b[i]; }, 0); }
    function norm(a) { return Math.sqrt(dot(a, a)); }

    function write(name) {
      busy = true;
      var k = KEY[name], v = VAL[name], i = 0;
      G.keyLabel.textContent = "pattern " + name;
      G.valLabel.textContent = "target " + name;
      G.keyFrame.style.strokeOpacity = "0";
      paintBar(G.key, k, r8); paintBar(G.val, v, 1); paintBar(G.out, null);
      function rowStep() {
        for (var j = 0; j < N; j++) dW[i][j] += v[i] * k[j];
        G.rowFrame.setAttribute("y", G.my + i * (G.c + G.g) - 3);
        G.rowFrame.style.strokeOpacity = "0.9";
        paintMatrix();
        i++;
        if (i < N) setTimeout(rowStep, 260);
        else setTimeout(function () { G.rowFrame.style.strokeOpacity = "0"; busy = false; }, 300);
      }
      setTimeout(rowStep, 350);
      writes[name]++;
      note.textContent = writes[name] > 1
        ? "Pair " + name + " written again. The same association gets stronger."
        : name === "A" ? "Pair A written. The change to W is target A times pattern A: rows follow the target, and columns follow the pattern."
        : "Pair B written on top. Pattern B is at right angles to pattern A, so the two pairs share the matrix without overwriting one another.";
    }

    function read(which) {
      busy = true;
      var q = KEY[which], out = [];
      for (var i = 0; i < N; i++) out.push(dot(dW[i], q));
      G.keyLabel.textContent = which === "A" ? "reading with pattern A" : which === "A2" ? "reading with A, slightly changed" : "reading with a new pattern";
      G.keyFrame.style.strokeOpacity = "0.9";
      paintBar(G.key, q, r8); paintBar(G.val, null); paintBar(G.out, null);
      G.valLabel.textContent = "target";
      var shown = 0;
      function step() {
        G.out[shown].setAttribute("style", Math.abs(out[shown]) < 1e-9 ? "fill:var(--rule)" : shade(out[shown], 1));
        shown++;
        if (shown < N) setTimeout(step, 140); else busy = false;
      }
      setTimeout(step, 250);
      var n = norm(out);
      if (n < 0.08) {
        note.textContent = writes.A + writes.B === 0 ? "Very little comes back, because the memory is empty. Write a pair first."
          : which !== "C" && writes.A === 0 ? "Very little comes back, because pair A has not been written yet."
          : "Very little comes back. This pattern is unlike the stored patterns, so the memory has no target for it.";
        return;
      }
      var sA = dot(out, VAL.A) / (n * norm(VAL.A)), sB = dot(out, VAL.B) / (n * norm(VAL.B));
      var best = sA >= sB ? "A" : "B", s = Math.max(sA, sB);
      setTimeout(function () { paintBar(G.val, VAL[best], 1); G.valLabel.textContent = "target " + best; }, 250 + 140 * N);
      var strength = n / (norm(VAL[best]) * Math.max(1, writes[best]));
      note.textContent = which === "A2"
        ? "A slightly changed pattern still returns target " + best + ", with similarity " + s.toFixed(2) + " and " + Math.round(100 * strength) + "% of the full strength."
        : "The output matches target " + best + ", with similarity " + s.toFixed(2) + " on a scale where 1 is a perfect match.";
    }

    [].slice.call(document.querySelectorAll("#mem [data-mem]")).forEach(function (b) {
      b.addEventListener("click", function () {
        if (busy) return;
        var a = b.dataset.mem;
        if (a === "wA") write("A");
        else if (a === "wB") write("B");
        else if (a === "rA") read("A");
        else if (a === "rA2") read("A2");
        else if (a === "rC") read("C");
        else { zero(); G.keyFrame.style.strokeOpacity = "0"; paintMatrix(); idle(); note.textContent = "Cleared. The fast weight is back to its trained values. Press pair A to write it."; }
      });
    });
    build();
    window.addEventListener("resize", debounce(function () { if (width(svg) !== W) build(); }));
  })();

  // ---------- 1. reading animation ----------

  (function reader() {
    var svg = $("rd-svg");
    if (!svg) return;
    var status = $("rd-status");
    var playBtn = $("rd-play"), stepBtn = $("rd-step"), resetBtn = $("rd-reset");
    var modeBtns = [].slice.call(document.querySelectorAll("#reader [data-mode]"));
    var seedBtns = [].slice.call(document.querySelectorAll("#reader [data-seed]"));
    // Milliseconds to read one chunk, slow to fast; the update pause is a little longer.
    var PACE = [9000, 6000, 4000, 2600, 1600, 900], MAXV = 3.1;
    var pace = $("rd-pace"), paceIdx = pace ? Number(pace.value) : 1;
    if (pace) pace.addEventListener("input", function () { paceIdx = Number(pace.value); });
    function readMs() { return PACE[paceIdx]; }
    function updMs() { return PACE[paceIdx] * 1.1; }
    var st = { mode: "on", seed: 0, k: 0, phase: null, p: 0, u: 0, playing: false, once: false, last: 0, raf: 0 };
    var G = null;
    var ROWS = [5, 4, 3, 2, 1, 0];   // display order, top to bottom: layer 30 down to layer 0

    function val(li, k) {
      if (st.mode === "off" || k <= 0) return 0;
      var a = DELTA.c1[st.seed][li], b = DELTA.c7[st.seed][li];
      return a + (b - a) * (Math.min(k, 7) - 1) / 6;
    }

    function build() {
      clear(svg);
      var W = width(svg), wide = W >= 640, pad = 2;
      var perRow = wide ? 8 : 4, gap = 6, bh = 34;
      var bw = (W - 2 * pad - (perRow - 1) * gap) / perRow;
      G = { W: W, wide: wide, blocks: [], fills: [], rows: [], pulses: [] };
      text(svg, pad, 15, "Input: 32,768 tokens, read in 8 chunks of 4,096", { "font-size": 14, style: "fill:var(--ink-2)" });
      for (var i = 0; i < 8; i++) {
        var r = Math.floor(i / perRow), c = i % perRow;
        var x = pad + c * (bw + gap), y = 26 + r * (bh + 8);
        var g = el("g", {}, svg);
        el("rect", { x: x, y: y, width: bw, height: bh, rx: 4, style: "fill:var(--bg);stroke:var(--rule)" }, g);
        var f = el("rect", { x: x, y: y, width: 0, height: bh, rx: 4, style: "fill:var(--teal);fill-opacity:0.22" }, g);
        text(g, x + bw / 2, y + bh / 2 + 5, "chunk " + (i + 1), { "text-anchor": "middle", "font-size": 13, style: "fill:var(--ink-2)" });
        G.blocks.push({ x: x, y: y, w: bw, h: bh });
        G.fills.push(f);
      }
      var rowH = 42;
      var top = 26 + (8 / perRow) * (bh + 8) - 8 + (wide ? 64 : 44);
      var labelX, matX;
      if (wide) {
        var sx = pad, sw = 96, s = rowH / 6;
        text(svg, sx, top + rowH / 2 - 5 * s - 12, "Qwen3-4B, 36 layers", { "font-size": 13, style: "fill:var(--muted)" });
        for (var L = 35; L >= 0; L--) {
          var ly = top + rowH / 2 + (30 - L) * s;
          var ttt = L % 6 === 0;
          el("line", { x1: sx, x2: sx + sw, y1: ly, y2: ly, style: "stroke:var(--" + (ttt ? "teal" : "rule") + ")", "stroke-width": ttt ? 3 : 1.4, "stroke-linecap": "round" }, svg);
        }
        labelX = sx + sw + 18; matX = labelX + 70;
      } else {
        text(svg, pad, top - 12, "fast weights in 6 of the 36 layers", { "font-size": 13, style: "fill:var(--muted)" });
        labelX = pad; matX = pad + 62;
      }
      var cols = wide ? 10 : 8, rowsN = 5, cs = 6, cg = 1;
      var mw = cols * (cs + cg) - cg, mh = rowsN * (cs + cg) - cg;
      var gx0 = matX + mw + 16, gx1 = W - pad - 46;
      ROWS.forEach(function (li, ri) {
        var cy = top + ri * rowH + rowH / 2;
        var row = { li: li, cy: cy, cells: [], dirs: [] };
        text(svg, labelX, cy + 5, "layer " + DELTA.layers[li], { "font-size": 14, style: "fill:var(--ink)" });
        var mg = el("g", {}, svg);
        var rand = rng(97 + li * 31);
        for (var a = 0; a < rowsN; a++) for (var b = 0; b < cols; b++) {
          var cx = matX + b * (cs + cg), yy = cy - mh / 2 + a * (cs + cg);
          el("rect", { x: cx, y: yy, width: cs, height: cs, style: "fill:var(--navy);fill-opacity:" + (0.16 + 0.5 * rand()).toFixed(2) }, mg);
          row.cells.push(el("rect", { x: cx, y: yy, width: cs, height: cs, style: "fill:var(--teal);fill-opacity:0" }, mg));
          row.dirs.push(Math.pow(rand(), 0.7));
        }
        row.frame = el("rect", { x: matX - 3, y: cy - mh / 2 - 3, width: mw + 6, height: mh + 6, rx: 3, fill: "none", style: "stroke:var(--coral);stroke-opacity:0", "stroke-width": 1.6 }, svg);
        row.mx = matX - 3; row.my = cy;
        el("rect", { x: gx0, y: cy - 5, width: gx1 - gx0, height: 10, rx: 5, style: "fill:var(--rule)" }, svg);
        row.fill = el("rect", { x: gx0, y: cy - 5, width: 0, height: 10, rx: 5, style: "fill:var(--teal)" }, svg);
        row.val = text(svg, gx1 + 8, cy + 5, "0.00", { "font-size": 13.5, style: "fill:var(--ink-2)" });
        G.rows.push(row);
      });
      var axisY = top + 6 * rowH + 8;
      [0, 1, 2, 3].forEach(function (v) {
        var x = gx0 + (gx1 - gx0) * v / MAXV;
        el("line", { x1: x, x2: x, y1: axisY, y2: axisY + 5, style: "stroke:var(--muted)" }, svg);
        text(svg, x, axisY + 18, String(v), { "text-anchor": "middle", "font-size": 12, style: "fill:var(--muted)" });
      });
      var ax = text(svg, gx0, axisY + 36, "accumulated change ‖W − W", { "font-size": 13, style: "fill:var(--muted)" });
      el("tspan", { dy: 4, "font-size": 10 }, ax).textContent = "0";
      el("tspan", { dy: -4 }, ax).textContent = "‖ of the fast weight";
      G.gx0 = gx0; G.gx1 = gx1;
      svg.setAttribute("viewBox", "0 0 " + W + " " + (axisY + 44));
      draw();
    }

    function setStatus(s) { if (status.textContent !== s) status.textContent = s; }

    function draw() {
      if (!G) return;
      var k = st.k;
      G.fills.forEach(function (f, i) {
        var frac = i < k ? 1 : i === k ? (st.phase === "read" ? ease(st.p) : st.phase === "update" ? 1 : 0) : 0;
        f.setAttribute("width", (G.blocks[i].w * frac).toFixed(1));
      });
      var u = st.phase === "update" ? ease(st.u) : 0;
      G.rows.forEach(function (row) {
        var v = val(row.li, k) + (val(row.li, k + 1) - val(row.li, k)) * u;
        row.fill.setAttribute("width", ((G.gx1 - G.gx0) * v / MAXV).toFixed(1));
        row.val.textContent = st.mode === "off" ? "0 (frozen)" : v.toFixed(2);
        var amt = v / MAXV;
        row.cells.forEach(function (c, i) { c.style.fillOpacity = Math.min(0.92, amt * 2.1 * row.dirs[i]).toFixed(3); });
        row.frame.style.strokeOpacity = st.phase === "update" ? (Math.sin(Math.PI * st.u) * 0.9).toFixed(2) : "0";
      });
      G.pulses.forEach(function (p) {
        var L = p.path.getTotalLength(), pt = p.path.getPointAtLength(L * ease(Math.min(1, st.u * 1.25)));
        p.dot.setAttribute("cx", pt.x.toFixed(1)); p.dot.setAttribute("cy", pt.y.toFixed(1));
        p.dot.style.opacity = st.u < 0.85 ? "1" : String(Math.max(0, (1 - st.u) / 0.15));
      });
      if (st.phase === "read") {
        var n = k + 1;
        setStatus(st.mode === "on"
          ? "Reading chunk " + n + " of 8, with fast weights updated " + (n === 1 ? "zero times" : n === 2 ? "once" : (n - 1) + " times") + "."
          : "Reading chunk " + n + " of 8. With η = 0 the fast weights never move.");
      } else if (st.phase === "update") {
        setStatus("Chunk " + (k + 1) + " read. One gradient step on the fast weights of layers 0, 6, 12, 18, 24 and 30.");
      } else if (k >= 8) {
        setStatus(st.mode === "on"
          ? "Done. The last chunk was read after seven updates, and layer 30 moved the most."
          : "Done. With the update off, all eight chunks were read with the same weights.");
      } else if (k > 0 && !st.playing) {
        setStatus("Paused after chunk " + k + " of 8" + (st.mode === "on" ? ", with fast weights updated " + (k === 1 ? "once." : Math.min(k, 7) + " times.") : "."));
      }
    }

    function spawnPulses(i) {
      var b = G.blocks[i];
      G.pulses = G.rows.map(function (row) {
        var path = el("path", { d: curve(b.x + b.w / 2, b.y + b.h, row.mx, row.my, true), fill: "none", style: "stroke:var(--coral);stroke-opacity:0.35", "stroke-width": 1.2, "stroke-dasharray": "3 4" }, svg);
        var dot = el("circle", { r: 4, cx: b.x + b.w / 2, cy: b.y + b.h, style: "fill:var(--coral)" }, svg);
        return { path: path, dot: dot };
      });
    }
    function clearPulses() { G.pulses.forEach(function (p) { p.path.remove(); p.dot.remove(); }); G.pulses = []; }

    function tick(ts) {
      if (!st.playing) return;
      var dt = Math.min(64, ts - (st.last || ts));
      st.last = ts;
      if (st.phase === "read") {
        st.p += dt / readMs();
        if (st.p >= 1) {
          st.p = 1;
          if (st.mode === "on" && st.k + 1 <= 7) { st.phase = "update"; st.u = 0; spawnPulses(st.k); }
          else { st.k += 1; next(); }
        }
      } else if (st.phase === "update") {
        st.u += dt / updMs();
        if (st.u >= 1) { st.u = 1; st.k += 1; st.phase = null; clearPulses(); next(); }
      }
      draw();
      if (st.playing) st.raf = requestAnimationFrame(tick);
    }
    function next() {
      if (st.k >= 8 || st.once) { stop(); return; }
      st.phase = "read"; st.p = 0;
    }
    function play(once) {
      if (st.k >= 8) reset();
      st.once = !!once;
      st.playing = true; st.last = 0;
      if (!st.phase) { st.phase = "read"; st.p = 0; }
      playBtn.textContent = "Pause";
      cancelAnimationFrame(st.raf);
      st.raf = requestAnimationFrame(tick);
    }
    function stop() {
      st.playing = false; st.once = false;
      if (st.phase === "read" && st.p >= 1) st.phase = null;
      cancelAnimationFrame(st.raf);
      playBtn.textContent = st.k >= 8 ? "Replay" : "Play";
      draw();
    }
    function reset() {
      stop();
      if (G) clearPulses();
      st.k = 0; st.phase = null; st.p = 0; st.u = 0;
      playBtn.textContent = "Play";
      draw();
      setStatus("Press play to read a 32k-token input, the training length.");
    }

    playBtn.addEventListener("click", function () { if (st.playing) stop(); else play(false); });
    stepBtn.addEventListener("click", function () { if (!st.playing) play(true); });
    resetBtn.addEventListener("click", reset);
    modeBtns.forEach(function (b) {
      b.addEventListener("click", function () { press(modeBtns, b); st.mode = b.dataset.mode; reset(); });
    });
    seedBtns.forEach(function (b) {
      b.addEventListener("click", function () { press(seedBtns, b); st.seed = Number(b.dataset.seed); draw(); });
    });

    build();
    window.addEventListener("resize", debounce(function () { if (G && width(svg) !== G.W) { if (G) clearPulses(); build(); } }));
    if (!reduce) onVisible(svg, function () { if (st.k === 0 && !st.playing) play(false); });
  })();

  // ---------- 2. study steps ----------

  (function steps() {
    var svg = $("st-svg");
    if (!svg) return;
    var textBox = $("st-text"), tabs = [].slice.call(document.querySelectorAll("#steps [data-step]"));
    var prev = $("st-prev"), nextB = $("st-next"), dots = [].slice.call(document.querySelectorAll("#steps .dots span"));
    var step = 0, len = 4, raf = 0, W = 0;
    var TEXT = [
      ["Train two arms", "Both arms continue pretraining Qwen3-4B-Base for 3.0 billion tokens at 32k context, on identical batches in identical order and with the released optimizer settings. The only difference is whether the In-Place TTT module is switched on. Both arms were trained with two seeds."],
      ["Evaluate the TTT checkpoint twice", "The TTT checkpoint runs on RULER as released, with the update on (η = 3), and again with the update off (η = 0), so its fast weights never move. The control runs once. All three evaluations use the same 13 tasks and 500 instances per task, from 4k to 64k tokens."],
      ["Split the gain", "TTT minus control is the sum of two paired differences on the same instances. The update effect compares the TTT checkpoint with its update on and off. The training effect compares the update-off checkpoint with the control. Pick a length."]
    ];

    function render() {
      cancelAnimationFrame(raf);
      clear(svg);
      W = width(svg);
      var t = TEXT[step];
      textBox.innerHTML = "";
      var h = document.createElement("h3"); h.textContent = t[0]; textBox.appendChild(h);
      var p = document.createElement("p"); p.style.margin = "0"; p.textContent = t[1]; textBox.appendChild(p);
      tabs.forEach(function (b, i) { b.setAttribute("aria-selected", String(i === step)); });
      dots.forEach(function (d, i) { d.classList.toggle("on", i === step); });
      prev.disabled = step === 0; nextB.disabled = step === 2;
      [scene1, scene2, scene3][step]();
    }

    function flow(paths, color, count, period) {
      var dots = [];
      paths.forEach(function (path) {
        for (var i = 0; i < count; i++) dots.push({ path: path, off: i / count, d: el("rect", { width: 9, height: 7, rx: 1.5, style: "fill:" + color }, svg) });
      });
      function frame(ts) {
        dots.forEach(function (o) {
          var L = o.path.getTotalLength(), f = ((ts / period) + o.off) % 1;
          var pt = o.path.getPointAtLength(L * f);
          o.d.setAttribute("x", (pt.x - 4.5).toFixed(1)); o.d.setAttribute("y", (pt.y - 3.5).toFixed(1));
          o.d.style.opacity = String(Math.min(1, Math.min(f, 1 - f) * 8));
        });
        if (!reduce) raf = requestAnimationFrame(frame);
      }
      raf = requestAnimationFrame(frame);
    }

    function layout(nSrc, nDst) {
      var wide = W >= 640, bw = wide ? 220 : (W - 12) / 2, bh = 58;
      var src = [], dst = [];
      if (wide) {
        var H = Math.max(nSrc, nDst) * 86 + 10;
        for (var i = 0; i < nSrc; i++) src.push({ x: 2, y: H / 2 + (i - (nSrc - 1) / 2) * 96 - bh / 2, w: bw, h: bh });
        for (var j = 0; j < nDst; j++) dst.push({ x: W - bw - 2, y: H / 2 + (j - (nDst - 1) / 2) * 80 - bh / 2, w: bw, h: bh });
        return { wide: true, H: H, src: src, dst: dst };
      }
      var H2 = 250;
      for (var a = 0; a < nSrc; a++) src.push({ x: 2 + a * (bw + 8), y: 4, w: bw, h: bh });
      for (var b = 0; b < nDst; b++) dst.push({ x: 2 + b * (bw + 8) + (nDst === 1 ? (W - bw) / 2 - 2 : 0), y: H2 - bh - 4, w: bw, h: bh });
      return { wide: false, H: H2, src: src, dst: dst };
    }
    function link(a, b, vertical, style) {
      var d = vertical ? curve(a.x + a.w / 2, a.y + a.h, b.x + b.w / 2, b.y, true) : curve(a.x + a.w, a.y + a.h / 2, b.x, b.y + b.h / 2);
      return el("path", { d: d, fill: "none", style: style || "stroke:var(--muted);stroke-opacity:0.6", "stroke-width": 1.4 }, svg);
    }

    function scene1() {
      var Lo = layout(2, 2), v = !Lo.wide;
      var base = Lo.src[0], data = Lo.src[1], ttt = Lo.dst[0], ctl = Lo.dst[1];
      link(base, ttt, v); link(base, ctl, v);
      var p1 = link(data, ttt, v, "stroke:var(--sand);stroke-dasharray:4 4"), p2 = link(data, ctl, v, "stroke:var(--sand);stroke-dasharray:4 4");
      var g = el("g", {}, svg);
      box(g, base.x, base.y, base.w, base.h, "Qwen3-4B-Base", "the starting checkpoint");
      box(g, data.x, data.y, data.w, data.h, "Training data", "3.0B tokens at 32k context", "fill:var(--bg);stroke:var(--sand)");
      box(g, ttt.x, ttt.y, ttt.w, ttt.h, "TTT arm", "module on in 6 of 36 layers", "fill:var(--bg);stroke:var(--teal)");
      box(g, ctl.x, ctl.y, ctl.w, ctl.h, "Control arm", "module off, all else equal", "fill:var(--bg);stroke:var(--navy)");
      var H1 = Lo.H + 22;
      text(svg, Lo.wide ? data.x + data.w + 14 : W / 2, Lo.wide ? data.y + data.h + 18 : Lo.H + 16, Lo.wide ? "the same batches in the same order go to both arms" : "same batches, same order, both arms", { "text-anchor": Lo.wide ? "start" : "middle", "font-size": 13, "font-style": "italic", style: "fill:var(--sand)" });
      svg.setAttribute("viewBox", "0 0 " + W + " " + H1);
      flow([p1, p2], "var(--sand)", 4, 2600);
    }

    function scene2() {
      var wide = W >= 640, bh = 54, H, n = {};
      if (wide) {
        var c1 = 2, cw = Math.min(200, (W - 40) / 3.4), c2 = (W - cw) / 2, c3 = W - cw - 2;
        H = 250;
        n.ttt = { x: c1, y: 40, w: cw, h: bh }; n.ctl = { x: c1, y: 160, w: cw, h: bh };
        n.on = { x: c2, y: 4, w: cw, h: bh }; n.off = { x: c2, y: 86, w: cw, h: bh }; n.cev = { x: c2, y: 178, w: cw, h: bh };
        n.rul = { x: c3, y: 76, w: cw, h: 74 };
      } else {
        var w3 = (W - 16) / 3;
        H = 330;
        n.ttt = { x: 2, y: 4, w: (W - 12) / 2, h: bh }; n.ctl = { x: (W - 12) / 2 + 10, y: 4, w: (W - 12) / 2, h: bh };
        n.on = { x: 2, y: 128, w: w3, h: bh }; n.off = { x: 8 + w3, y: 128, w: w3, h: bh }; n.cev = { x: 14 + 2 * w3, y: 128, w: w3, h: bh };
        n.rul = { x: W / 2 - 110, y: 252, w: 220, h: 70 };
      }
      var v = !wide, ps = [];
      ps.push(link(n.ttt, n.on, v, "stroke:var(--teal)"), link(n.ttt, n.off, v, "stroke:var(--coral)"), link(n.ctl, n.cev, v, "stroke:var(--navy)"));
      ps.push(link(n.on, n.rul, v), link(n.off, n.rul, v), link(n.cev, n.rul, v));
      var g = el("g", {}, svg);
      box(g, n.ttt.x, n.ttt.y, n.ttt.w, n.ttt.h, "TTT checkpoint", wide ? "trained with the module" : "trained with module", "fill:var(--bg);stroke:var(--teal)");
      box(g, n.ctl.x, n.ctl.y, n.ctl.w, n.ctl.h, "Control checkpoint", wide ? "trained without it" : "trained without", "fill:var(--bg);stroke:var(--navy)");
      box(g, n.on.x, n.on.y, n.on.w, n.on.h, "update on", "η = 3, as released", "fill:var(--bg);stroke:var(--teal)");
      box(g, n.off.x, n.off.y, n.off.w, n.off.h, "update off", "η = 0, frozen", "fill:var(--bg);stroke:var(--coral)");
      box(g, n.cev.x, n.cev.y, n.cev.w, n.cev.h, "control", "evaluated once", "fill:var(--bg);stroke:var(--navy)");
      box(g, n.rul.x, n.rul.y, n.rul.w, n.rul.h, "RULER", "13 tasks × 500, 4k to 64k", "fill:var(--paper);stroke:var(--ink-2)");
      svg.setAttribute("viewBox", "0 0 " + W + " " + H);
      flow(ps, "var(--ink-2)", 2, 2200);
    }

    function scene3() {
      var d = DIFF["13"].both, rows = [["TTT − control", "total", "var(--ink)"], ["update effect", "update", "var(--coral)"], ["training effect", "training", "var(--teal)"]];
      var chips = document.createElement("div");
      chips.className = "group"; chips.style.marginTop = "10px"; chips.setAttribute("role", "group"); chips.setAttribute("aria-label", "Context length");
      var btns = LENGTHS.map(function (L, i) {
        var b = document.createElement("button");
        b.type = "button"; b.textContent = L; b.setAttribute("aria-pressed", String(i === len));
        b.addEventListener("click", function () { len = i; render(); });
        chips.appendChild(b);
        return b;
      });
      textBox.appendChild(chips);
      var tot = d.total[len][0], up = d.update[len][0], tr = d.training[len][0];
      var s = document.createElement("p");
      s.style.margin = "10px 0 0";
      s.textContent = "At " + LENGTHS_LONG[len] + ", the TTT arm " + (tot > 0 ? "leads the control by " + tot.toFixed(1) : tot < 0 ? "trails the control by " + Math.abs(tot).toFixed(1) : "ties the control") +
        " points. The update effect is " + sgn(up) + (len === 0 ? ", since no update fires at 4k," : "") + " and the training effect is " + sgn(tr) + " (both seeds, 13 tasks).";
      textBox.appendChild(s);
      var wide = W >= 640, lab = wide ? 150 : 112, x0 = lab + (W - lab - 60) / 2, sc = (W - lab - 60) / 2 / 6, rh = 46, H = 3 * rh + 34;
      el("line", { x1: x0, x2: x0, y1: 4, y2: 3 * rh + 6, style: "stroke:var(--muted)" }, svg);
      [-6, -3, 3, 6].forEach(function (v) {
        el("line", { x1: x0 + v * sc, x2: x0 + v * sc, y1: 4, y2: 3 * rh + 6, style: "stroke:var(--rule)", "stroke-dasharray": "2 4" }, svg);
        text(svg, x0 + v * sc, 3 * rh + 24, sgn(v).replace(".0", ""), { "text-anchor": "middle", "font-size": 12, style: "fill:var(--muted)" });
      });
      text(svg, x0, 3 * rh + 24, "0", { "text-anchor": "middle", "font-size": 12, style: "fill:var(--muted)" });
      var bars = rows.map(function (r, i) {
        var y = 10 + i * rh, v = d[r[1]][len];
        text(svg, 2, y + 19, r[0], { "font-size": 14.5, style: "fill:var(--ink)" });
        var bar = el("rect", { x: x0, y: y + 6, width: 0, height: 18, rx: 3, style: "fill:" + r[2] + (r[1] === "total" ? ";fill-opacity:0.85" : "") }, svg);
        var ciL = v[1] === null ? null : el("line", { x1: x0 + v[1] * sc, x2: x0 + v[2] * sc, y1: y + 15, y2: y + 15, style: "stroke:var(--ink);stroke-opacity:0", "stroke-width": 1.5 }, svg);
        var label = text(svg, 0, y + 20, sgn(v[0]) + ci(v), { "font-size": 13.5, style: "fill:var(--ink-2);opacity:0" });
        return { bar: bar, ciL: ciL, label: label, v: v[0], hi: v[1] === null ? v[0] : v[2], delay: i === 0 ? 0 : 450 + i * 150 };
      });
      svg.setAttribute("viewBox", "0 0 " + W + " " + H);
      var t0 = 0;
      function frame(ts) {
        if (!t0) t0 = ts;
        var done = true;
        bars.forEach(function (b) {
          var f = reduce ? 1 : Math.max(0, Math.min(1, (ts - t0 - b.delay) / 650));
          if (f < 1) done = false;
          var w = Math.abs(b.v) * sc * ease(f), x = b.v >= 0 ? x0 : x0 - w;
          b.bar.setAttribute("x", x.toFixed(1)); b.bar.setAttribute("width", w.toFixed(1));
          var lx = x0 + Math.max(0, b.v, b.hi) * sc + 8;
          b.label.setAttribute("x", lx.toFixed(1));
          b.label.style.opacity = String(f >= 1 ? 1 : 0);
          if (b.ciL) b.ciL.style.strokeOpacity = f >= 1 ? "0.55" : "0";
        });
        if (!done) raf = requestAnimationFrame(frame);
      }
      raf = requestAnimationFrame(frame);
      void btns;
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

  // ---------- 3. results explorer ----------

  (function explorer() {
    var svg = $("ex-svg");
    if (!svg) return;
    var note = $("ex-note"), taskGroup = $("ex-tasks");
    var st = { view: "diff", seeds: "both", tasks: "13" };
    var W = 0;
    function bind(attr, key) {
      var bs = [].slice.call(document.querySelectorAll("#explorer [data-" + attr + "]"));
      bs.forEach(function (b) { b.addEventListener("click", function () { press(bs, b); st[key] = b.dataset[attr]; render(); }); });
    }
    bind("view", "view"); bind("seeds", "seeds"); bind("tasks", "tasks");

    function scores(key) {
      if (st.seeds !== "both") return SCORES[st.seeds][key];
      return SCORES.s1[key].map(function (v, i) { return (v + SCORES.s2[key][i]) / 2; });
    }

    function render() {
      clear(svg);
      W = width(svg);
      taskGroup.style.display = st.view === "diff" ? "" : "none";
      var narrow = W < 560, H = narrow ? 300 : 340, m = { l: 44, r: 10, t: 34, b: 40 };
      var band = (W - m.l - m.r) / 6, X = function (i) { return m.l + band * (i + 0.5); };
      var series, lo, hi;
      if (st.view === "diff") {
        var d = DIFF[st.tasks][st.seeds];
        series = [
          { name: "TTT − control", key: "total", color: "var(--ink)", hollow: true, dx: -1 },
          { name: "update effect", key: "update", color: "var(--coral)", dx: 0 },
          { name: "training effect", key: "training", color: "var(--teal)", dx: 1 }
        ].map(function (s) { s.data = d[s.key]; return s; });
        lo = -6; hi = 6;
      } else {
        series = [
          { name: "base", vals: SCORES.base, color: "var(--sand)", dash: "4 4" },
          { name: "control", vals: scores("control"), color: "var(--navy)" },
          { name: "TTT, update on", vals: scores("on"), color: "var(--teal)" },
          { name: "TTT, update off", vals: scores("off"), color: "var(--coral)", dash: "6 4" }
        ];
        lo = 40; hi = 100;
      }
      var Y = function (v) { return m.t + (hi - v) / (hi - lo) * (H - m.t - m.b); };
      var lx = m.l, ly = 14;
      series.forEach(function (s) {
        var g = el("g", {}, svg);
        if (s.hollow) el("circle", { cx: 6, cy: 0, r: 5, style: "fill:var(--paper);stroke:" + s.color, "stroke-width": 1.8 }, g);
        else el("line", { x1: 0, x2: 14, y1: 0, y2: 0, style: "stroke:" + s.color, "stroke-width": 3, "stroke-dasharray": s.dash || "" }, g);
        var t = text(g, 20, 4, s.name, { "font-size": 13, style: "fill:var(--ink-2)" });
        var wItem = 30 + t.getComputedTextLength();
        if (lx > m.l && lx + wItem > W - m.r) { lx = m.l; ly += 20; }
        g.setAttribute("transform", "translate(" + lx + "," + ly + ")");
        lx += wItem;
      });
      if (ly > 14) {
        m.t += ly - 14;
        Y = function (v) { return m.t + (hi - v) / (hi - lo) * (H - m.t - m.b); };
      }
      var stepT = st.view === "diff" ? 2 : 10;
      for (var g = lo; g <= hi; g += stepT) {
        el("line", { x1: m.l, x2: W - m.r, y1: Y(g), y2: Y(g), style: "stroke:var(--" + (g === 0 && st.view === "diff" ? "muted" : "rule") + ")", "stroke-width": g === 0 && st.view === "diff" ? 1 : 0.8 }, svg);
        text(svg, m.l - 8, Y(g) + 4, st.view === "diff" ? sgn(g).replace(".0", "") : String(g), { "text-anchor": "end", "font-size": 12, style: "fill:var(--muted)" });
      }
      (narrow ? LENGTHS_SHORT : LENGTHS).forEach(function (L, i) {
        text(svg, X(i), H - m.b + 22, L, { "text-anchor": "middle", "font-size": 13, style: "fill:var(--muted)" });
      });
      var off = Math.min(14, band / 6);
      series.forEach(function (s) {
        if (st.view === "diff") {
          el("polyline", { points: s.data.map(function (v, i) { return (X(i) + s.dx * off) + "," + Y(v[0]); }).join(" "), fill: "none", style: "stroke:" + s.color + ";stroke-opacity:0.3", "stroke-width": 1.3 }, svg);
          s.data.forEach(function (v, i) {
            var x = X(i) + s.dx * off;
            if (v[1] !== null) el("line", { x1: x, x2: x, y1: Y(v[1]), y2: Y(v[2]), style: "stroke:" + s.color, "stroke-width": 2 }, svg);
            var c = el("circle", { cx: x, cy: Y(v[0]), r: 5.5, tabindex: 0, style: s.hollow ? "fill:var(--paper);stroke:" + s.color : "fill:" + s.color + ";stroke:var(--paper)", "stroke-width": s.hollow ? 2 : 1.5 }, svg);
            hook(c, LENGTHS_LONG[i] + ", " + s.name + ": " + sgn(v[0]) + " points" + (v[1] === null ? (i === 0 && s.key === "update" ? " (no update fires at 4k)" : "") : ", 95% interval " + sgn(v[1]) + " to " + sgn(v[2])));
          });
        } else {
          el("polyline", { points: s.vals.map(function (v, i) { return X(i) + "," + Y(v); }).join(" "), fill: "none", style: "stroke:" + s.color, "stroke-width": 2, "stroke-dasharray": s.dash || "" }, svg);
          s.vals.forEach(function (v, i) {
            var c = el("circle", { cx: X(i), cy: Y(v), r: 4.5, tabindex: 0, style: "fill:" + s.color + ";stroke:var(--paper)", "stroke-width": 1.5 }, svg);
            hook(c, LENGTHS_LONG[i] + ", " + s.name + ": " + v.toFixed(1) + (st.seeds === "both" && s.name !== "base" ? " (average of the two seeds)" : ""));
          });
        }
      });
      svg.setAttribute("viewBox", "0 0 " + W + " " + H);
      note.textContent = "Hover or tap a point for its value" + (st.view === "diff" ? " and 95% interval." : ".");
    }
    function hook(c, s) {
      el("title", {}, c).textContent = s;
      var show = function () { note.textContent = s; };
      c.addEventListener("mouseenter", show); c.addEventListener("focus", show); c.addEventListener("click", show);
    }
    render();
    window.addEventListener("resize", debounce(function () { if (width(svg) !== W) render(); }));
  })();

  // ---------- 4. inference learning-rate dial and the replay ----------

  (function dial() {
    var btns = [].slice.call(document.querySelectorAll("#dial [data-eta]"));
    if (!btns.length) return;
    var cur = { m32: ETA[2].m32, m64: ETA[2].m64 };
    function bar(svg, d) {
      clear(svg);
      var W = 320, x0 = 160, sc = 160 / 4;
      el("line", { x1: 0, x2: W, y1: 14, y2: 14, style: "stroke:var(--rule)", "stroke-width": 6, "stroke-linecap": "round" }, svg);
      el("line", { x1: x0, x2: x0, y1: 4, y2: 24, style: "stroke:var(--muted)" }, svg);
      text(svg, 0, 33, "−4", { "font-size": 10, style: "fill:var(--muted)" });
      text(svg, W, 33, "+4", { "font-size": 10, "text-anchor": "end", style: "fill:var(--muted)" });
      text(svg, x0, 33, "update off", { "font-size": 10, "text-anchor": "middle", style: "fill:var(--muted)" });
      if (!d) return;
      var color = d[0] >= 0 ? "var(--teal)" : "var(--coral)";
      var w = Math.abs(d[0]) * sc;
      el("rect", { x: d[0] >= 0 ? x0 : x0 - w, y: 9, width: w, height: 10, rx: 2, style: "fill:" + color }, svg);
      if (d[1] !== null) el("line", { x1: x0 + d[1] * sc, x2: x0 + d[2] * sc, y1: 14, y2: 14, style: "stroke:var(--ink)", "stroke-width": 1.5 }, svg);
    }
    function tween(node, from, to) {
      if (reduce) { node.textContent = to.toFixed(1); return; }
      var t0 = 0;
      requestAnimationFrame(function f(ts) {
        if (!t0) t0 = ts;
        var p = Math.min(1, (ts - t0) / 450);
        node.textContent = (from + (to - from) * ease(p)).toFixed(1);
        if (p < 1) requestAnimationFrame(f);
      });
    }
    function show(i) {
      var e = ETA[i];
      tween($("dl-32"), cur.m32, e.m32); tween($("dl-64"), cur.m64, e.m64);
      cur = { m32: e.m32, m64: e.m64 };
      $("dl-32d").textContent = e.d32 ? "vs update off: " + sgn(e.d32[0]) + ci(e.d32) : "the reference: update off";
      $("dl-64d").textContent = e.d64 ? "vs update off: " + sgn(e.d64[0]) + ci(e.d64) : "the reference: update off";
      bar($("dl-32s"), e.d32); bar($("dl-64s"), e.d64);
      $("dl-fw").textContent = "Frequent-words task, " + e.name + ": " + e.fw32.toFixed(1) + " at 32k and " + e.fw64.toFixed(1) + " at 64k with plain RoPE.";
    }
    btns.forEach(function (b) { b.addEventListener("click", function () { press(btns, b); show(Number(b.dataset.eta)); }); });
    show(2);

    var out = $("rp-out");
    if (!out) return;
    var line = "1. uumoqt - 10 times, 2. uumoqt - 9 times, …";
    var timer = 0;
    function type() {
      clearInterval(timer);
      out.innerHTML = "";
      var span = document.createElement("span"), caret = document.createElement("span");
      caret.className = "caret";
      out.appendChild(span); out.appendChild(caret);
      if (reduce) { span.textContent = line; return; }
      var i = 0;
      timer = setInterval(function () {
        i++;
        span.textContent = line.slice(0, i);
        if (i >= line.length) clearInterval(timer);
      }, 55);
    }
    onVisible(out, type);
    out.parentNode.addEventListener("click", type);
  })();

  // ---------- 5. chunk-size chart ----------

  (function chunks() {
    var svg = $("ch-svg");
    if (!svg) return;
    var btns = [].slice.call(document.querySelectorAll("#chunk [data-cmode]"));
    var mode = "on", W = 0, bars = [], raf = 0;
    var lo = -4, hi = 10;
    function geom() {
      var narrow = W < 560, H = 300, m = { l: 40, r: 8, t: 16, b: 52 };
      return { H: H, m: m, Y: function (v) { return m.t + (hi - v) / (hi - lo) * (H - m.t - m.b); }, narrow: narrow };
    }
    function build() {
      clear(svg);
      W = width(svg);
      var g = geom(), m = g.m, Y = g.Y;
      for (var v = lo; v <= hi; v += 2) {
        el("line", { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), style: "stroke:var(--" + (v === 0 ? "muted" : "rule") + ")", "stroke-width": v === 0 ? 1 : 0.8 }, svg);
        text(svg, m.l - 8, Y(v) + 4, sgn(v).replace(".0", ""), { "text-anchor": "end", "font-size": 12, style: "fill:var(--muted)" });
      }
      var groupW = (W - m.l - m.r) / 2, bw = Math.min(64, groupW / 5);
      bars = [];
      ["k32", "k64"].forEach(function (key, gi) {
        var cx = m.l + groupW * (gi + 0.5);
        text(svg, cx, g.H - 10, gi === 0 ? "32k, the training length" : "64k, plain RoPE", { "text-anchor": "middle", "font-size": 14, style: "fill:var(--ink-2)" });
        CHUNK.sizes.forEach(function (sz, i) {
          var x = cx + (i - 1) * (bw * 1.35) - bw / 2;
          var r = el("rect", { x: x, y: Y(0), width: bw, height: 0, rx: 3, style: "fill:var(--navy);fill-opacity:" + [1, 0.7, 0.45][i] }, svg);
          var ciL = el("line", { x1: x + bw / 2, x2: x + bw / 2, y1: Y(0), y2: Y(0), style: "stroke:var(--ink)", "stroke-width": 1.5 }, svg);
          var lab = text(svg, x + bw / 2, Y(0), "", { "text-anchor": "middle", "font-size": 12.5, style: "fill:var(--ink)" });
          text(svg, x + bw / 2, g.H - 32, g.narrow ? sz : "chunk " + sz, { "text-anchor": "middle", "font-size": 12, style: "fill:var(--muted)" });
          bars.push({ key: key, i: i, r: r, ciL: ciL, lab: lab, x: x, bw: bw, cur: 0 });
        });
      });
      svg.setAttribute("viewBox", "0 0 " + W + " " + g.H);
      animate(true);
    }
    function animate(instant) {
      cancelAnimationFrame(raf);
      var g = geom(), Y = g.Y, t0 = 0;
      var from = bars.map(function (b) { return b.cur; });
      var to = bars.map(function (b) { return CHUNK[mode][b.key][b.i]; });
      function frame(ts) {
        if (!t0) t0 = ts;
        var p = instant || reduce ? 1 : Math.min(1, (ts - t0) / 600), e = ease(p);
        bars.forEach(function (b, j) {
          var v = from[j] + (to[j][0] - from[j]) * e;
          b.cur = v;
          var y0 = Y(Math.max(0, v)), y1 = Y(Math.min(0, v));
          b.r.setAttribute("y", y0.toFixed(1)); b.r.setAttribute("height", Math.max(0.5, y1 - y0).toFixed(1));
          var d = to[j];
          var show = p >= 1 && d[1] !== null;
          b.ciL.setAttribute("y1", show ? Y(d[1]) : Y(0)); b.ciL.setAttribute("y2", show ? Y(d[2]) : Y(0));
          b.ciL.style.opacity = show ? "0.6" : "0";
          b.lab.textContent = sgn(v);
          b.lab.setAttribute("y", (v >= 0 ? Y(Math.max(v, d[2] || v)) - 6 : Y(Math.min(v, d[1] === null ? v : d[1])) + 15).toFixed(1));
        });
        if (p < 1) raf = requestAnimationFrame(frame);
      }
      raf = requestAnimationFrame(frame);
    }
    btns.forEach(function (b) { b.addEventListener("click", function () { press(btns, b); mode = b.dataset.cmode; animate(false); }); });
    build();
    window.addEventListener("resize", debounce(function () { if (width(svg) !== W) build(); }));
  })();

  // ---------- 6. gradient share and figure toggles ----------

  (function share() {
    var fills = [].slice.call(document.querySelectorAll("#share .fill"));
    if (!fills.length) return;
    onVisible($("share"), function () { fills.forEach(function (f) { f.style.width = f.dataset.w + "%"; }); });
  })();

  [].slice.call(document.querySelectorAll("[data-fig]")).forEach(function (b) {
    b.addEventListener("click", function () {
      var fig = b.dataset.fig, v = b.dataset.v;
      var group = [].slice.call(document.querySelectorAll('[data-fig="' + fig + '"]'));
      press(group, b);
      $("fig-" + fig).src = "img/" + fig + (fig === "effects" ? "_" : "_seed") + v + ".png";
    });
  });

  var copy = $("bib-copy");
  if (copy) copy.addEventListener("click", function () {
    var t = $("bib-text").textContent;
    if (navigator.clipboard) navigator.clipboard.writeText(t).then(function () { copy.textContent = "Copied"; setTimeout(function () { copy.textContent = "Copy"; }, 1500); });
  });

  function debounce(fn) { var t = 0; return function () { clearTimeout(t); t = setTimeout(fn, 150); }; }
})();
