// In-Place TTT primer: the interactive figures. Numbers in the demos are made up, except the
// fast-weight changes in the layer stack, which come from the study's held-out diagnostics
// (paper/main.tex, appendix table of accumulated changes per TTT layer).
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";
  var CHUNK = 4096;

  // ---------- helpers (as in ttt.js) ----------

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
  function press(buttons, on) { buttons.forEach(function (b) { b.setAttribute("aria-pressed", String(b === on)); }); }
  function debounce(fn) { var t = 0; return function () { clearTimeout(t); t = setTimeout(fn, 150); }; }
  function rng(seed) { return function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
  function onResize(svg, fn) {
    var w = width(svg);
    window.addEventListener("resize", debounce(function () { var n = width(svg); if (n !== w) { w = n; fn(); } }));
  }
  function signed(v, d) { return (v < 0 ? "−" : "") + Math.abs(v).toFixed(d); }
  function commas(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  function sub(n) { return String(n).replace(/\d/g, function (c) { return String.fromCharCode(0x2080 + Number(c)); }); }
  function shade(v, scale) {
    var a = Math.min(1, Math.abs(v) / scale);
    return "fill:var(--" + (v >= 0 ? "teal" : "coral") + ");fill-opacity:" + (0.08 + 0.88 * a).toFixed(2);
  }
  function arrow(parent, x1, y1, x2, y2, style) {
    el("line", { x1: x1, y1: y1, x2: x2, y2: y2, style: style, "stroke-width": 1.4 }, parent);
    var a = Math.atan2(y2 - y1, x2 - x1), s = 6;
    el("path", { d: "M" + x2 + " " + y2 + " L" + (x2 - s * Math.cos(a - 0.45)) + " " + (y2 - s * Math.sin(a - 0.45)) + " L" + (x2 - s * Math.cos(a + 0.45)) + " " + (y2 - s * Math.sin(a + 0.45)) + " Z", style: style.replace("stroke:", "fill:") }, parent);
  }
  function playButton(btn, running) { btn.textContent = running ? "Pause" : "Play"; }

  // ---------- 1. text becomes numbers ----------

  (function tokens() {
    var svg = $("tok-svg");
    if (!svg) return;
    var TOK = ["The", "key", "is", "under", "the", "mat"], D = 6, R = rng(11), emb = [], fin = [];
    TOK.forEach(function () {
      var e = [], f = [];
      for (var i = 0; i < D; i++) { var v = R() * 2 - 1; e.push(v); f.push(Math.max(-1, Math.min(1, v + (R() * 2 - 1) * 0.8))); }
      emb.push(e); fin.push(f);
    });
    function column(x, y, vals, c) { vals.forEach(function (v, i) { el("rect", { x: x, y: y + i * (c + 2), width: c, height: c, rx: 2, style: shade(v, 1) }, svg); }); }
    function build() {
      clear(svg);
      var W = width(svg), narrow = W < 560, n = TOK.length;
      var right = narrow ? 0 : 190, colW = (W - right) / n, c = Math.min(15, colW / 2.6), H0 = D * (c + 2) - 2;
      var top = narrow ? 120 : 8, yFin = top, yBand = yFin + H0 + 14, yEmb = yBand + 34 + 14, yLab = yEmb + H0 + 18;
      TOK.forEach(function (t, k) {
        var cx = colW * (k + 0.5);
        column(cx - c / 2, yEmb, emb[k], c);
        column(cx - c / 2, yFin, fin[k], c);
        text(svg, cx, yLab, t, { "text-anchor": "middle", "font-size": 14, style: "fill:var(--ink)" });
        arrow(svg, cx, yEmb - 2, cx, yBand + 34 + 2, "stroke:var(--muted)");
        arrow(svg, cx, yBand - 2, cx, yFin + H0 + 3, "stroke:var(--muted)");
      });
      el("rect", { x: 4, y: yBand, width: W - right - 8, height: 34, rx: 6, style: "fill:var(--mark);stroke:var(--teal)" }, svg);
      text(svg, (W - right) / 2, yBand + 22, "the 36 layers add to the vectors", { "text-anchor": "middle", "font-size": 14, style: "fill:var(--ink-2)" });
      // scores for the next token, made up
      var S = [[".", 0.55], [",", 0.17], ["and", 0.09], ["in", 0.06]], bx, by, bw = 120;
      var lastX = colW * (n - 0.5);
      if (narrow) { bx = Math.max(8, lastX - 150); by = 8; }
      else { bx = W - right + 40; by = yFin; arrow(svg, lastX + c / 2 + 6, yFin + H0 / 2, bx - 8, yFin + H0 / 2, "stroke:var(--ink-2)"); }
      text(svg, bx, by + 10, "next-token scores", { "font-size": 13, style: "fill:var(--muted)" });
      S.forEach(function (s, i) {
        var y = by + 18 + i * 20;
        text(svg, bx + 26, y + 12, s[0], { "text-anchor": "end", "font-size": 13.5, style: "fill:var(--ink)" });
        el("rect", { x: bx + 32, y: y + 2, width: bw * s[1] / 0.55, height: 12, rx: 2, style: "fill:var(--teal);fill-opacity:" + (0.35 + s[1]) }, svg);
      });
      if (narrow) arrow(svg, lastX, yFin - 4, lastX, by + 104, "stroke:var(--ink-2)");
      svg.setAttribute("viewBox", "0 0 " + W + " " + (yLab + 8));
    }
    build();
    onResize(svg, build);
  })();

  // ---------- 2. attention ----------

  (function attention() {
    var svg = $("att-svg");
    if (!svg) return;
    var note = $("att-note"), scaleIn = $("att-scale");
    var TOK = ["The", "key", "is", "under", "the", "mat", ".", "The", "key"];
    // four made-up features: noun, the word "key", place, function word
    var K = [[0, 0, 0, 1], [1, 1, 0, 0], [0, 0.2, 0, 0.6], [0, 0, 1, 0.3], [0, 0, 0, 1], [1, 0, 0.8, 0], [0, 0, 0, 0.2], [0, 0, 0, 1], [1, 1, 0, 0]];
    var Q = [[0, 0, 0, 0.4], [0, 0, 0, 1], [1, 0.6, 0, 0], [0.3, 0.6, 0, 0], [0, 0, 1, 0], [0, 0, 1, 0.5], [0.5, 0, 0.5, 0], [0, 0, 0, 0.4], [0.5, 1.5, 0, 0]];
    var n = TOK.length, sel = n - 1, masked = true;
    var maskBtns = [].slice.call(document.querySelectorAll("#att [data-mask]"));
    maskBtns.forEach(function (b) { b.addEventListener("click", function () { press(maskBtns, b); masked = b.dataset.mask === "on"; draw(); }); });
    scaleIn.addEventListener("input", draw);
    function weights(i) {
      var s = Number(scaleIn.value), sc = [], m = -1e9;
      for (var j = 0; j < n; j++) {
        if (masked && j > i) { sc.push(null); continue; }
        var d = 0;
        for (var k = 0; k < 4; k++) d += Q[i][k] * K[j][k];
        sc.push(s * d / 2);  // divided by the square root of d = 4
        m = Math.max(m, s * d / 2);
      }
      var z = 0, w = sc.map(function (v) { if (v === null) return null; var e = Math.exp(v - m); z += e; return e; });
      return w.map(function (v) { return v === null ? null : v / z; });
    }
    function draw() {
      clear(svg);
      var W = width(svg), colW = W / n, wsel = weights(sel);
      var arcTop = 8, chipY = 70, chipH = 28, base = chipY + chipH + 92;
      // arcs from the chosen token
      wsel.forEach(function (w, j) {
        if (w === null || w < 0.01 || j === sel) return;
        var x1 = colW * (sel + 0.5), x2 = colW * (j + 0.5), h = Math.min(56, 14 + Math.abs(x1 - x2) * 0.22);
        el("path", { d: "M" + x1 + " " + chipY + " Q" + (x1 + x2) / 2 + " " + (chipY - h * 1.6) + " " + x2 + " " + chipY, fill: "none", style: "stroke:var(--teal);stroke-opacity:" + (0.25 + 0.75 * w).toFixed(2), "stroke-width": (1 + 7 * w).toFixed(1) }, svg);
      });
      TOK.forEach(function (t, j) {
        var x = colW * j + 2, w = wsel[j], g = el("g", { tabindex: 0, role: "button", "aria-label": "Look from " + t + ", position " + (j + 1), style: "cursor:pointer" }, svg);
        el("rect", { x: x, y: chipY, width: colW - 4, height: chipH, rx: 5, style: j === sel ? "fill:var(--ink)" : "fill:var(--bg);stroke:var(--rule)" + (w === null ? ";opacity:0.45" : "") }, g);
        text(g, colW * (j + 0.5), chipY + 19, t, { "text-anchor": "middle", "font-size": colW < 40 ? 12 : 14, style: j === sel ? "fill:var(--bg)" : "fill:var(--ink)" + (w === null ? ";opacity:0.45" : "") });
        g.addEventListener("click", function () { sel = j; draw(); });
        g.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); sel = j; draw(); } });
        if (w === null) { text(svg, colW * (j + 0.5), base - 6, "×", { "text-anchor": "middle", "font-size": 16, style: "fill:var(--muted)" }); return; }
        var bh = 72 * w;
        el("rect", { x: colW * (j + 0.5) - Math.min(14, colW * 0.3), y: base - bh, width: Math.min(28, colW * 0.6), height: Math.max(0.5, bh), rx: 2, style: "fill:var(--teal)" }, svg);
        text(svg, colW * (j + 0.5), base - bh - 5, w.toFixed(2), { "text-anchor": "middle", "font-size": 11.5, style: "fill:var(--ink-2)" });
      });
      el("line", { x1: 0, x2: W, y1: base + 0.5, y2: base + 0.5, style: "stroke:var(--rule)" }, svg);
      text(svg, 0, arcTop + 6, "weights from “" + TOK[sel] + "” (position " + (sel + 1) + ")", { "font-size": 13, style: "fill:var(--muted)" });
      // the full grid of weights
      var cs = Math.min(26, (W - 70) / n), gx = Math.max(56, (W - cs * n) / 2), gy = base + 34;
      text(svg, gx, gy - 10, "all weights: row = token looking, column = token seen", { "font-size": 12.5, style: "fill:var(--muted)" });
      for (var i = 0; i < n; i++) {
        var wi = weights(i);
        var row = el("g", { style: "cursor:pointer" }, svg);
        text(row, gx - 6, gy + i * cs + cs * 0.68, TOK[i] + " " + (i + 1), { "text-anchor": "end", "font-size": 11.5, style: "fill:var(--ink-2)" });
        for (var j = 0; j < n; j++) {
          el("rect", { x: gx + j * cs + 1, y: gy + i * cs + 1, width: cs - 2, height: cs - 2, rx: 2, style: wi[j] === null ? "fill:none;stroke:var(--rule);stroke-dasharray:2 2" : "fill:var(--teal);fill-opacity:" + (0.1 + 0.9 * wi[j]).toFixed(2) }, row);
        }
        (function (i) { row.addEventListener("click", function () { sel = i; draw(); }); })(i);
      }
      el("rect", { x: gx - 1, y: gy + sel * cs - 1, width: n * cs + 2, height: cs + 2, rx: 3, fill: "none", style: "stroke:var(--ink)", "stroke-width": 1.5 }, svg);
      svg.setAttribute("viewBox", "0 0 " + W + " " + (gy + n * cs + 6));
      var ranked = wsel.map(function (w, j) { return [w === null ? -1 : w, j]; }).sort(function (a, b) { return b[0] - a[0]; });
      var parts = ranked.slice(0, 2).filter(function (r) { return r[0] > 0.05; }).map(function (r) {
        return (r[1] === sel ? "itself" : "“" + TOK[r[1]] + "” at position " + (r[1] + 1)) + " (" + r[0].toFixed(2) + ")";
      });
      var s = "“" + TOK[sel] + "” at position " + (sel + 1) + " puts most of its weight on " + parts.join(" and ") + ".";
      if (!masked) {
        var fut = wsel.reduce(function (a, w, j) { return a + (j > sel ? w : 0); }, 0);
        if (fut > 0.005) s += " With the mask off, " + Math.round(100 * fut) + "% of its weight goes to later tokens.";
      }
      note.textContent = s;
    }
    draw();
    onResize(svg, draw);
  })();

  // ---------- 3. the KV cache ----------

  (function kvcache() {
    var svg = $("kv-svg");
    if (!svg) return;
    var note = $("kv-note"), playBtn = $("kv-play");
    var PROMPT = ["The", "key", "is", "under", "the"], GEN = ["mat", ".", "It", "is", "old", "."];
    var P = PROMPT.length, LAST = GEN.length - 1;  // step 0: empty; 1: prefill; 2 and later: decoding
    var step = 0, cache = true, timer = 0;
    var kvBtns = [].slice.call(document.querySelectorAll("#kvc [data-kv]"));
    kvBtns.forEach(function (b) { b.addEventListener("click", function () { press(kvBtns, b); cache = b.dataset.kv === "on"; draw(); }); });
    function work(k, withCache) {
      var w = k >= 1 ? P : 0;
      for (var d = 1; d < k; d++) w += withCache ? 1 : P + d;
      return w;
    }
    function draw() {
      clear(svg);
      var W = width(svg), total = P + LAST + 1, cw = Math.min(64, (W - 30) / total), x0 = 30;
      var read = step === 0 ? 0 : P + step - 1, words = PROMPT.concat(GEN.slice(0, Math.max(0, step - 1)));
      var cs = Math.min(cw - 6, 22);
      words.forEach(function (t, j) {
        var x = x0 + j * cw;
        el("rect", { x: x + 2, y: 6, width: cw - 4, height: 26, rx: 5, style: j >= P ? "fill:var(--mark);stroke:var(--teal)" : "fill:var(--bg);stroke:var(--rule)" }, svg);
        text(svg, x + cw / 2, 24, t, { "text-anchor": "middle", "font-size": cw < 40 ? 12 : 14, style: "fill:var(--ink)" });
      });
      if (step >= 1) {
        var px = x0 + words.length * cw;
        el("rect", { x: px + 2, y: 6, width: cw - 4, height: 26, rx: 5, fill: "none", style: "stroke:var(--teal);stroke-dasharray:3 3" }, svg);
        text(svg, px + cw / 2, 24, GEN[step - 1], { "text-anchor": "middle", "font-size": cw < 40 ? 12 : 14, style: "fill:var(--teal)" });
        text(svg, px + cw / 2, 46, "next", { "text-anchor": "middle", "font-size": 11, style: "fill:var(--muted)" });
      }
      ["K", "V"].forEach(function (lab, r) {
        var y = 56 + r * (cs + 6);
        text(svg, 12, y + cs * 0.72, lab, { "text-anchor": "middle", "font-size": 13, "font-weight": 600, style: "fill:var(--ink-2)" });
        for (var j = 0; j < total - 1; j++) {
          var x = x0 + j * cw + (cw - cs) / 2, st;
          if (j >= read) st = "fill:none;stroke:var(--rule);stroke-dasharray:2 2";
          else if (step === 1 || !cache || j === read - 1) st = "fill:var(--teal)";
          else st = "fill:var(--muted);fill-opacity:0.35";
          el("rect", { x: x, y: y, width: cs, height: cs, rx: 3, style: st }, svg);
        }
      });
      // work counters
      var y0 = 56 + 2 * (cs + 6) + 22, maxW = work(LAST + 1, false), bw = W - 170;
      [[true, "with cache"], [false, "without cache"]].forEach(function (r, i) {
        var v = work(step, r[0]), y = y0 + i * 26;
        text(svg, 0, y + 12, r[1], { "font-size": 13, style: "fill:var(--ink-2)" });
        el("rect", { x: 110, y: y + 1, width: bw, height: 14, rx: 3, style: "fill:var(--rule);fill-opacity:0.5" }, svg);
        el("rect", { x: 110, y: y + 1, width: Math.max(0, bw * v / maxW), height: 14, rx: 3, style: r[0] === cache ? "fill:var(--teal)" : "fill:var(--muted);fill-opacity:0.6" }, svg);
        text(svg, 116 + bw * v / maxW, y + 12, String(v), { "font-size": 12.5, style: "fill:var(--ink-2)" });
      });
      text(svg, 0, y0 - 8, "keys and values computed so far, in this layer", { "font-size": 12.5, style: "fill:var(--muted)" });
      svg.setAttribute("viewBox", "0 0 " + W + " " + (y0 + 52));
      var s;
      if (step === 0) s = "Press play or next step.";
      else if (step === 1) s = "Prefill reads the five prompt tokens in one pass and computes their keys and values. It predicts “" + GEN[0] + "”.";
      else {
        var tok = GEN[step - 2], have = read - 1;
        s = "Decoding step " + (step - 1) + " reads “" + tok + "”. " + (cache
          ? "With the cache, it computes one new key and value and reuses " + have + " from the cache."
          : "Without a cache, it recomputes the keys and values of all " + read + " tokens.") + " It predicts “" + GEN[step - 1] + "”.";
      }
      note.textContent = s;
    }
    function advance() { if (step < LAST + 1) { step++; draw(); return true; } return false; }
    function stop() { clearInterval(timer); timer = 0; playButton(playBtn, false); }
    playBtn.addEventListener("click", function () {
      if (timer) { stop(); return; }
      if (step >= LAST + 1) { step = 0; draw(); }
      playButton(playBtn, true);
      advance();
      timer = setInterval(function () { if (!advance()) stop(); }, 1500);
    });
    $("kv-step").addEventListener("click", function () { stop(); advance(); });
    $("kv-reset").addEventListener("click", function () { stop(); step = 0; draw(); });
    draw();
    onResize(svg, draw);
  })();

  // ---------- 4. the block ----------

  (function block() {
    var svg = $("blk-svg");
    if (!svg) return;
    var box = $("blk-text"), count = $("blk-count");
    var PARTS = [
      ["Notepad in", "The vector of one token, with 2,560 numbers, as it arrives from the block below. The block adds to it twice and passes it on."],
      ["RMSNorm", "Rescales the vector to a standard size and multiplies it by learned weights, so the next part sees inputs on a similar scale."],
      ["Attention", "Queries, keys and values let this token collect information from itself and from earlier tokens. The output has 2,560 numbers."],
      ["Add", "The attention output is added to the notepad. This shortcut around the part is called a residual connection."],
      ["RMSNorm", "Rescales again. The result is x, the input of the MLP. In a fast-weight layer, the TTT target is made from this x."],
      ["U and gate_proj", "Two matrices map x from 2,560 to 9,728 numbers."],
      ["SiLU and multiply", "SiLU acts on the output of gate_proj, which then multiplies the output of U entry by entry. The result is h, with 9,728 numbers. In TTT terms, h is the pattern."],
      ["Down projection W", "Maps h back to 2,560 numbers. In layers 0, 6, 12, 18, 24 and 30, In-Place TTT updates this matrix while the model reads."],
      ["Add", "The MLP output is added to the notepad, which moves on to the next block."]
    ];
    var step = 0, nodes = [];
    function build() {
      clear(svg);
      var W = width(svg), cx = W / 2 + 18, bw = Math.min(250, W - 120), bh = 34, gap = 14, y = 8;
      var rx = cx - bw / 2 - 34;
      nodes = [];
      var Y = [];
      PARTS.forEach(function (p, i) {
        var isAdd = p[0] === "Add", isEnd = i === 0, h = isAdd ? 24 : bh;
        Y.push([y, h]);
        y += h + gap;
      });
      var bottom = y + 26;
      // main line and residual path
      el("line", { x1: cx, x2: cx, y1: Y[0][0] + Y[0][1], y2: bottom - 22, style: "stroke:var(--muted)", "stroke-width": 1.4 }, svg);
      [[0, 3], [3, 8]].forEach(function (r) {
        var ya = Y[r[0]][0] + Y[r[0]][1] / 2 + 6, yb = Y[r[1]][0] + Y[r[1]][1] / 2;
        el("path", { d: "M" + cx + " " + ya + " H" + rx + " V" + yb + " H" + (cx - 12), fill: "none", style: "stroke:var(--navy)", "stroke-width": 1.4 }, svg);
      });
      text(svg, rx - 6, (Y[0][0] + Y[3][0]) / 2 + 20, "residual", { "text-anchor": "end", "font-size": 12, style: "fill:var(--navy)" });
      PARTS.forEach(function (p, i) {
        var y0 = Y[i][0], h = Y[i][1], g = el("g", { tabindex: 0, role: "button", "aria-label": p[0], style: "cursor:pointer" }, svg), shape;
        if (p[0] === "Add") {
          shape = el("circle", { cx: cx, cy: y0 + h / 2, r: 12 }, g);
          text(g, cx, y0 + h / 2 + 6, "+", { "text-anchor": "middle", "font-size": 18, style: "fill:var(--ink)" });
        } else if (i === 0) {
          shape = el("rect", { x: cx - bw / 2, y: y0, width: bw, height: h, rx: h / 2 }, g);
          text(g, cx, y0 + 22, "notepad in, 2,560 numbers", { "text-anchor": "middle", "font-size": 14, style: "fill:var(--ink)" });
        } else {
          if (p[0] === "Down projection W") el("rect", { x: cx - bw / 2, y: y0, width: bw, height: h, rx: 6, style: "fill:var(--bg)" }, g);  // opaque backing for the tinted box
          shape = el("rect", { x: cx - bw / 2, y: y0, width: bw, height: h, rx: 6 }, g);
          text(g, cx, y0 + 22, W < 480 ? (p[0] === "Down projection W" ? "down projection W" : p[0]) : p[0] === "U and gate_proj" ? "U and gate_proj: 2,560 → 9,728" : p[0] === "Down projection W" ? "down projection W: 9,728 → 2,560" : p[0], { "text-anchor": "middle", "font-size": 14, style: "fill:var(--ink)" });
        }
        g.addEventListener("click", function () { go(i); });
        g.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(i); } });
        nodes.push({ shape: shape, i: i, w: p[0] === "Down projection W" });
      });
      arrow(svg, cx, bottom - 24, cx, bottom - 6, "stroke:var(--muted)");
      text(svg, cx + 10, bottom - 8, W < 480 ? "notepad out" : "notepad out, to the next block", { "font-size": 12.5, style: "fill:var(--muted)" });
      if (W >= 480) {
        text(svg, cx + bw / 2 + 8, Y[2][0] + 22, "mixes positions", { "font-size": 12, style: "fill:var(--muted)" });
        text(svg, cx + bw / 2 + 8, Y[6][0] + 22, "one position", { "font-size": 12, style: "fill:var(--muted)" });
      }
      if (W >= 480) el("path", { d: "M" + (cx + bw / 2 + 4) + " " + (Y[5][0] + 4) + " v" + (Y[7][0] + Y[7][1] - Y[5][0] - 8), fill: "none", style: "stroke:var(--rule)", "stroke-width": 2 }, svg);
      svg.setAttribute("viewBox", "0 0 " + W + " " + bottom);
      paint();
    }
    function paint() {
      nodes.forEach(function (nd) {
        var on = nd.i === step;
        var fill = nd.w ? "fill:var(--mark)" : "fill:var(--bg)";
        var stroke = on ? "stroke:var(--ink);stroke-width:2.4" : nd.w ? "stroke:var(--teal);stroke-width:1.6" : "stroke:var(--rule);stroke-width:1.2";
        nd.shape.setAttribute("style", fill + ";" + stroke);
      });
      box.innerHTML = "";
      var h = document.createElement("h3"); h.textContent = PARTS[step][0]; box.appendChild(h);
      var p = document.createElement("p"); p.style.margin = "0"; p.textContent = PARTS[step][1]; box.appendChild(p);
      count.textContent = "part " + (step + 1) + " of " + PARTS.length;
      $("blk-prev").disabled = step === 0; $("blk-next").disabled = step === PARTS.length - 1;
    }
    function go(i) { step = i; paint(); }
    $("blk-prev").addEventListener("click", function () { if (step > 0) go(step - 1); });
    $("blk-next").addEventListener("click", function () { if (step < PARTS.length - 1) go(step + 1); });
    build();
    onResize(svg, build);
  })();

  // ---------- 4b. W h as a weighted sum of columns ----------

  (function columns() {
    var svg = $("mlp-svg"), ctl = $("mlp-ctl");
    if (!svg) return;
    var COLS = [[0.9, 0.6, 0.1, -0.3, -0.7, 0.2], [-0.4, 0.2, 0.8, 0.7, 0.1, -0.5], [0.3, -0.8, 0.2, 0.5, 0.6, 0.9], [0.6, 0.5, -0.6, -0.2, 0.3, -0.7]];
    var h = [1, 0, 0.5, 0], ins = [];
    h.forEach(function (v, j) {
      var lab = document.createElement("label"), inp = document.createElement("input"), out = document.createElement("output");
      lab.appendChild(document.createTextNode("h" + sub(j + 1)));
      inp.type = "range"; inp.min = -1; inp.max = 1.5; inp.step = 0.1; inp.value = v; inp.setAttribute("aria-label", "Hidden unit " + (j + 1));
      out.textContent = v.toFixed(1);
      inp.addEventListener("input", function () { h[j] = Number(inp.value); out.textContent = h[j].toFixed(1); draw(); });
      lab.appendChild(inp); lab.appendChild(out); ctl.appendChild(lab); ins.push(inp);
    });
    function draw() {
      clear(svg);
      var W = width(svg), unit = W / 5.4, cs = Math.min(26, unit * 0.42), top = 22, rows = 6;
      var out = [0, 0, 0, 0, 0, 0];
      COLS.forEach(function (c, j) { c.forEach(function (v, i) { out[i] += h[j] * v; }); });
      function col(x, vals, label, strong) {
        vals.forEach(function (v, i) { el("rect", { x: x, y: top + i * (cs + 3), width: cs, height: cs, rx: 3, style: shade(v, 1.2) + (strong ? ";stroke:var(--ink);stroke-width:1" : "") }, svg); });
        text(svg, x + cs / 2, top - 8, label, { "text-anchor": "middle", "font-size": 12.5, style: "fill:var(--ink-2)" });
      }
      var mid = top + rows * (cs + 3) / 2 + 5;
      COLS.forEach(function (c, j) {
        var x = unit * j + unit * 0.3;
        col(x, c.map(function (v) { return v * h[j]; }), h[j].toFixed(1) + " × col " + (j + 1));
        text(svg, x + cs + (unit - cs) / 2 - unit * 0.12, mid, j < 3 ? "+" : "=", { "text-anchor": "middle", "font-size": 18, style: "fill:var(--muted)" });
      });
      col(unit * 4 + unit * 0.3, out, "W h", true);
      svg.setAttribute("viewBox", "0 0 " + W + " " + (top + rows * (cs + 3) + 6));
    }
    draw();
    onResize(svg, draw);
  })();

  // ---------- 5. how much of the target comes back ----------

  (function angle() {
    var svg = $("geo-svg"), inp = $("geo-angle");
    if (!svg) return;
    var out = $("geo-out"), note = $("geo-note"), H_ANG = 20, V_ANG = 70;
    inp.addEventListener("input", draw);
    function draw() {
      clear(svg);
      var W = width(svg), narrow = W < 540, th = Number(inp.value), c = Math.cos(th * Math.PI / 180);
      out.textContent = th + "°";
      var r = narrow ? 72 : 96, panelW = narrow ? W : W / 2;
      function vec(cx, cy, ang, len, style, label, dx, dy) {
        var a = ang * Math.PI / 180, x = cx + len * Math.cos(a), y = cy - len * Math.sin(a);
        if (Math.abs(len) > 2) arrow(svg, cx, cy, x, y, style);
        if (label) text(svg, x + (dx || 0), y + (dy || 0), label, { "text-anchor": "middle", "font-size": 13.5, "font-style": "italic", style: style.replace("stroke:", "fill:") });
      }
      // left: the two patterns
      var c1x = panelW / 2, c1y = r + 26;
      text(svg, c1x, 14, "patterns", { "text-anchor": "middle", "font-size": 13, style: "fill:var(--muted)" });
      el("circle", { cx: c1x, cy: c1y, r: r, fill: "none", style: "stroke:var(--rule);stroke-dasharray:3 4" }, svg);
      var a1 = H_ANG * Math.PI / 180, a2 = (H_ANG + th) * Math.PI / 180, ar = 28;
      el("path", { d: "M" + (c1x + ar * Math.cos(a1)) + " " + (c1y - ar * Math.sin(a1)) + " A" + ar + " " + ar + " 0 0 0 " + (c1x + ar * Math.cos(a2)) + " " + (c1y - ar * Math.sin(a2)), fill: "none", style: "stroke:var(--sand)", "stroke-width": 2 }, svg);
      vec(c1x, c1y, H_ANG, r, "stroke:var(--navy);stroke-width:2.4", "h (stored)", 0, 18);
      vec(c1x, c1y, H_ANG + th, r, "stroke:var(--teal);stroke-width:2.4", "g (reading)", 0, -8);
      // right: the target and what comes back
      var c2x = narrow ? W / 2 : W * 0.75, c2y = narrow ? 2 * r + 80 + r : c1y;
      text(svg, c2x, narrow ? c2y - r - 12 : 14, "change in the output", { "text-anchor": "middle", "font-size": 13, style: "fill:var(--muted)" });
      var va = V_ANG * Math.PI / 180;
      el("line", { x1: c2x - r * Math.cos(va), y1: c2y + r * Math.sin(va), x2: c2x + r * Math.cos(va), y2: c2y - r * Math.sin(va), style: "stroke:var(--rule);stroke-dasharray:3 4" }, svg);
      el("circle", { cx: c2x + r * Math.cos(va), cy: c2y - r * Math.sin(va), r: 4, style: "fill:none;stroke:var(--coral)" }, svg);
      text(svg, c2x + r * Math.cos(va) + 10, c2y - r * Math.sin(va) + 4, "v", { "font-size": 13.5, "font-style": "italic", style: "fill:var(--coral)" });
      vec(c2x, c2y, c >= 0 ? V_ANG : V_ANG + 180, r * Math.abs(c), "stroke:var(--coral);stroke-width:2.6", "", 0, 0);
      el("circle", { cx: c2x, cy: c2y, r: 2.5, style: "fill:var(--ink-2)" }, svg);
      var H = narrow ? c2y + r + 20 : c1y + r + 20;
      svg.setAttribute("viewBox", "0 0 " + W + " " + H);
      var cr = Math.abs(c) < 0.005 ? 0 : c;
      note.textContent = th === 90 ? "At 90°, h · g = 0, so the target does not come back at all."
        : cr > 0 ? "At " + th + "°, h · g = " + cr.toFixed(2) + ", so " + Math.round(100 * cr) + "% of the target comes back."
        : "At " + th + "°, h · g = " + signed(cr, 2) + ", so the output moves away from the target, by " + Math.round(-100 * cr) + "% of its size.";
    }
    draw();
    onResize(svg, draw);
  })();

  // ---------- 6. the layer stack and measured changes ----------

  (function stack() {
    var svg = $("stk-svg");
    if (!svg) return;
    var note = $("stk-note");
    // Frobenius norm of W - W0 after the first and the seventh update on eight held-out 32k
    // sequences, seeds 1 and 2, and the seventh as a share of the norm of W0 (paper, appendix).
    var D = {
      0: { c1: [0.13, 0.10], c7: [0.76, 0.62], rel: [0.64, 0.52] },
      6: { c1: [0.26, 0.22], c7: [0.82, 0.74], rel: [0.74, 0.67] },
      12: { c1: [0.10, 0.11], c7: [0.49, 0.54], rel: [0.42, 0.47] },
      18: { c1: [0.16, 0.16], c7: [0.86, 0.83], rel: [0.75, 0.73] },
      24: { c1: [0.21, 0.18], c7: [1.01, 0.93], rel: [0.86, 0.79] },
      30: { c1: [0.85, 0.72], c7: [3.02, 2.84], rel: [2.41, 2.26] }
    };
    var LAYERS = [0, 6, 12, 18, 24, 30], layer = 30, seed = 0;
    var lb = LAYERS.map(function (L) {
      var b = document.createElement("button"); b.type = "button"; b.textContent = "layer " + L; b.setAttribute("aria-pressed", String(L === layer));
      b.addEventListener("click", function () { pick(L); }); $("stk-layers").appendChild(b); return b;
    });
    var sb = ["seed 1", "seed 2"].map(function (s, i) {
      var b = document.createElement("button"); b.type = "button"; b.textContent = s; b.setAttribute("aria-pressed", String(i === seed));
      b.addEventListener("click", function () { seed = i; press(sb, b); draw(); }); $("stk-seeds").appendChild(b); return b;
    });
    function pick(L) { layer = L; press(lb, lb[LAYERS.indexOf(L)]); draw(); }
    function draw() {
      clear(svg);
      var W = width(svg), bw = W / 36, top = 10;
      for (var i = 0; i < 36; i++) {
        var fast = LAYERS.indexOf(i) >= 0, h = fast ? 46 : 30;
        var r = el("rect", { x: i * bw + 1, y: top + 46 - h, width: Math.max(1, bw - 2), height: h, rx: 1.5, style: fast ? "fill:var(--teal)" + (i === layer ? ";stroke:var(--ink);stroke-width:2" : ";fill-opacity:0.7") : "fill:var(--muted);fill-opacity:0.25" }, svg);
        if (fast) {
          r.style.cursor = "pointer";
          (function (L) { r.addEventListener("click", function () { pick(L); }); })(i);
          text(svg, i * bw + bw / 2, top + 62, String(i), { "text-anchor": "middle", "font-size": 12, style: i === layer ? "fill:var(--ink);font-weight:600" : "fill:var(--ink-2)" });
        }
      }
      text(svg, 0, top + 80, "layer 0 at the bottom of the stack, layer 35 at the top", { "font-size": 12, style: "fill:var(--muted)" });
      var d = D[layer], y0 = top + 104, lab = 128, max = 3.2, bwid = W - lab - 50;
      [["after update 1", d.c1[seed]], ["after update 7", d.c7[seed]]].forEach(function (row, i) {
        var y = y0 + i * 28;
        text(svg, lab - 10, y + 13, row[0], { "text-anchor": "end", "font-size": 13, style: "fill:var(--ink-2)" });
        el("rect", { x: lab, y: y + 2, width: bwid, height: 14, rx: 3, style: "fill:var(--rule);fill-opacity:0.5" }, svg);
        el("rect", { x: lab, y: y + 2, width: bwid * row[1] / max, height: 14, rx: 3, style: "fill:var(--teal)" }, svg);
        text(svg, lab + bwid * row[1] / max + 6, y + 13, row[1].toFixed(2), { "font-size": 12.5, style: "fill:var(--ink-2)" });
      });
      svg.setAttribute("viewBox", "0 0 " + W + " " + (y0 + 60));
      note.textContent = "Layer " + layer + ", seed " + (seed + 1) + ". The change after the first update has a norm of " + d.c1[seed].toFixed(2) +
        ". After the seventh it is " + d.c7[seed].toFixed(2) + ", which is " + d.rel[seed].toFixed(2) + "% of the norm of W₀.";
    }
    draw();
    onResize(svg, draw);
  })();

  // ---------- 7. building one update ----------

  (function update() {
    var svg = $("up-svg");
    if (!svg) return;
    var note = $("up-note"), playBtn = $("up-play"), etaIn = $("up-eta"), etaOut = $("up-eta-out");
    var TOK = ["The", "key", "is", "under", "the", "mat"];
    var H = [[1, 0, 0.5, 0], [0, 1, 0, 0.5], [0.5, 0, 1, 0], [0, 0.5, 0, 1], [1, 0, 0.5, 0], [0, 1, 0.5, 0]];
    var V = [[0.5, 0, 0, 0.5], [0, 1, 0, 0], [0, 0, 0.5, 0.5], [0.5, 0.5, 0, 0], [0.5, 0, 0, 0.5], [0, 0.5, 0.5, 0]];
    var W0 = [[0.2, -0.1, 0, 0.1], [0, 0.1, 0.2, -0.1], [0.1, 0, -0.2, 0.1], [-0.1, 0.2, 0, 0]];
    var N = TOK.length, k = 0, timer = 0;
    function sumG(m) {
      var G = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
      for (var t = 0; t < m; t++) for (var i = 0; i < 4; i++) for (var j = 0; j < 4; j++) G[i][j] += V[t][i] * H[t][j];
      return G;
    }
    function loss(Wm) {
      var L = 0;
      for (var t = 0; t < N; t++) for (var i = 0; i < 4; i++) { var o = 0; for (var j = 0; j < 4; j++) o += Wm[i][j] * H[t][j]; L -= V[t][i] * o; }
      return L;
    }
    var GF = sumG(N), NORM2 = 0, L0 = loss(W0);
    GF.forEach(function (r) { r.forEach(function (v) { NORM2 += v * v; }); });
    etaIn.addEventListener("input", function () { etaOut.textContent = Number(etaIn.value).toFixed(1); draw(); });
    function draw() {
      clear(svg);
      var W = width(svg), wide = W >= 680, eta = Number(etaIn.value), G = sumG(k);
      var cs = 18, rowH = 26, tx = 0, ty = 24;
      // left: the chunk
      text(svg, tx + 52, ty - 10, "pattern h", { "font-size": 12.5, style: "fill:var(--muted)" });
      text(svg, tx + 52 + 4 * (cs + 2) + 16, ty - 10, "target v̂", { "font-size": 12.5, style: "fill:var(--muted)" });
      TOK.forEach(function (t, r) {
        var y = ty + r * rowH, on = r < k;
        text(svg, tx + 44, y + 13, t, { "text-anchor": "end", "font-size": 13.5, style: on ? "fill:var(--ink)" : "fill:var(--muted)" });
        for (var j = 0; j < 4; j++) {
          el("rect", { x: tx + 52 + j * (cs + 2), y: y, width: cs, height: cs, rx: 2, style: shade(H[r][j], 1) + (on ? "" : ";opacity:0.4") }, svg);
          el("rect", { x: tx + 52 + 4 * (cs + 2) + 16 + j * (cs + 2), y: y, width: cs, height: cs, rx: 2, style: shade(V[r][j], 1) + (on ? "" : ";opacity:0.4") }, svg);
        }
        if (r === k - 1) el("rect", { x: tx + 2, y: y - 3, width: 52 + 8 * (cs + 2) + 20, height: cs + 6, rx: 4, fill: "none", style: "stroke:var(--ink)", "stroke-width": 1.4 }, svg);
      });
      var leftW = 52 + 8 * (cs + 2) + 24, leftH = ty + N * rowH;
      // middle: the summed outer products
      var mc = 30, mx = wide ? leftW + 40 : 52, my = wide ? ty : leftH + 30;
      text(svg, mx, my - 10, "Σ v̂ hᵀ after " + k + " of " + N + " tokens", { "font-size": 12.5, style: "fill:var(--muted)" });
      for (var i = 0; i < 4; i++) for (var j = 0; j < 4; j++) {
        el("rect", { x: mx + j * (mc + 2), y: my + i * (mc + 2), width: mc, height: mc, rx: 3, style: G[i][j] === 0 ? "fill:var(--rule);fill-opacity:0.5" : shade(G[i][j], 1.5) }, svg);
        if (G[i][j] !== 0) text(svg, mx + j * (mc + 2) + mc / 2, my + i * (mc + 2) + mc / 2 + 4, G[i][j].toFixed(2).replace(/\.?0+$/, ""), { "text-anchor": "middle", "font-size": 11.5, style: "fill:var(--ink)" });
      }
      // right: the loss on this chunk
      var lx = wide ? mx + 4 * (mc + 2) + 50 : 52, ly = wide ? ty : my + 4 * (mc + 2) + 34, lh = 132;
      var lo = -1.2 - 2 * NORM2, hi = 0.5, Y = function (v) { return ly + lh * (hi - v) / (hi - lo); };
      text(svg, lx, ly - 10, "loss on this chunk", { "font-size": 12.5, style: "fill:var(--muted)" });
      el("line", { x1: lx + 8, x2: lx + 8, y1: Y(hi), y2: Y(lo), style: "stroke:var(--rule)", "stroke-width": 2 }, svg);
      [0, -5, -10, -15].forEach(function (v) { if (v >= lo) { el("line", { x1: lx + 4, x2: lx + 12, y1: Y(v), y2: Y(v), style: "stroke:var(--muted)" }, svg); text(svg, lx + 1, Y(v) + 4, signed(v, 0), { "text-anchor": "end", "font-size": 11, style: "fill:var(--muted)" }); } });
      el("circle", { cx: lx + 8, cy: Y(L0), r: 5, style: "fill:var(--navy)" }, svg);
      text(svg, lx + 20, Y(L0) + 4, "before: " + signed(L0, 2), { "font-size": 13, style: "fill:var(--ink-2)" });
      if (k === N) {
        var L1 = L0 - eta * NORM2;
        el("circle", { cx: lx + 8, cy: Y(L1), r: 5, style: "fill:var(--teal)" }, svg);
        text(svg, lx + 20, Y(L1) + 4, "after: " + signed(L1, 2), { "font-size": 13, style: "fill:var(--ink-2)" });
      } else text(svg, lx + 20, Y(L0) + 24, "after: once the chunk is read", { "font-size": 12.5, style: "fill:var(--muted)" });
      var Hh = wide ? Math.max(leftH, ly + lh) + 10 : ly + lh + 10;
      svg.setAttribute("viewBox", "0 0 " + W + " " + Hh);
      if (k === 0) note.textContent = "Press play to add the tokens of the chunk one at a time.";
      else if (k < N) note.textContent = "Token " + k + ", “" + TOK[k - 1] + "”, adds its outer product v̂ hᵀ to the sum. W does not change until the chunk is complete.";
      else note.textContent = "The chunk is complete. W₀ + η Σ v̂ hᵀ lowers the loss on this chunk by η × " + NORM2.toFixed(2) + " = " + (eta * NORM2).toFixed(2) +
        ", where " + NORM2.toFixed(2) + " is the sum of the squared entries of the matrix. Move η to see the drop scale with it.";
    }
    function advance() { if (k < N) { k++; draw(); return true; } return false; }
    function stop() { clearInterval(timer); timer = 0; playButton(playBtn, false); }
    playBtn.addEventListener("click", function () {
      if (timer) { stop(); return; }
      if (k >= N) { k = 0; draw(); }
      playButton(playBtn, true);
      advance();
      timer = setInterval(function () { if (!advance()) stop(); }, 1400);
    });
    $("up-step").addEventListener("click", function () { stop(); advance(); });
    $("up-reset").addEventListener("click", function () { stop(); k = 0; draw(); });
    draw();
    onResize(svg, draw);
  })();

  // ---------- 8. the timeline, with and without TTT ----------

  (function timeline() {
    var svg = $("tl-svg");
    if (!svg) return;
    var note = $("tl-note"), lenIn = $("tl-len"), genIn = $("tl-gen"), playBtn = $("tl-play");
    var frames = [], f = -1, timer = 0;
    function model() {
      var P = Number(lenIn.value), G = Number(genIn.value), read = P + Math.max(0, G - 1);
      return { P: P, G: G, read: read, pre: Math.floor(P / CHUNK), all: Math.floor(read / CHUNK) };
    }
    // Prefill advances one chunk per frame; decoding advances a few tokens per frame.
    function plan(m) {
      var fr = [], s = 0;
      while (s < m.P) { var e = Math.min(m.P, s + CHUNK - (s % CHUNK)); fr.push({ a: s, b: e, phase: "prefill" }); s = e; }
      var per = Math.max(1, Math.round((m.read - m.P) / 40));
      while (s < m.read) {
        var e2 = Math.min(m.read, s + per), nb = (Math.floor(s / CHUNK) + 1) * CHUNK;
        if (nb > s && nb < e2) e2 = nb;  // stop at a chunk boundary so the update shows
        fr.push({ a: s, b: e2, phase: "decoding" }); s = e2;
      }
      return fr;
    }
    function draw() {
      clear(svg);
      var m = model(), W = width(svg), x0 = 4, x1 = W - 4, dom = Math.max(m.read, CHUNK) * 1.015;
      var X = function (t) { return x0 + (x1 - x0) * t / dom; };
      $("tl-len-out").textContent = commas(m.P); $("tl-gen-out").textContent = commas(m.G);
      var cur = f >= 0 ? frames[f] : null, lanes = [["Without TTT", 30], ["With In-Place TTT", 104]];
      lanes.forEach(function (ln, li) {
        var y = ln[1];
        text(svg, x0, y - 10, ln[0], { "font-size": 13.5, "font-weight": 600, style: "fill:var(--ink)" });
        el("rect", { x: X(0), y: y, width: X(m.P) - X(0), height: 30, style: "fill:var(--navy);fill-opacity:0.22" }, svg);
        if (m.read > m.P) el("rect", { x: X(m.P), y: y, width: Math.max(1.5, X(m.read) - X(m.P)), height: 30, style: "fill:var(--sand);fill-opacity:0.7" }, svg);
        if (cur) el("rect", { x: X(cur.a), y: y - 3, width: Math.max(2, X(cur.b) - X(cur.a)), height: 36, rx: 2, fill: "none", style: "stroke:var(--ink)", "stroke-width": 1.6 }, svg);
        if (li === 0) text(svg, (X(0) + X(m.read)) / 2, y + 20, "W₀ throughout", { "text-anchor": "middle", "font-size": 13, style: "fill:var(--ink)" });
      });
      // chunk boundaries, updates and weight versions in the TTT lane
      var y = 104, nB = Math.floor(dom / CHUNK);
      for (var k = 1; k <= nB; k++) {
        var bx = X(k * CHUNK);
        el("line", { x1: bx, x2: bx, y1: y - 4, y2: y + 34, style: "stroke:var(--muted);stroke-dasharray:3 3" }, svg);
        if (k * CHUNK <= m.read) el("path", { d: "M" + (bx - 5) + " " + (y + 42) + " L" + (bx + 5) + " " + (y + 42) + " L" + bx + " " + (y + 34) + " Z", style: "fill:var(--teal)" }, svg);
      }
      for (var v = 0; v * CHUNK < m.read; v++) {
        var a = X(v * CHUNK), b = X(Math.min((v + 1) * CHUNK, m.read));
        if (b - a > 24) text(svg, (a + b) / 2, y + 20, "W" + sub(v), { "text-anchor": "middle", "font-size": 13, style: "fill:var(--ink)" });
      }
      // legend
      var ly = 162;
      el("rect", { x: x0, y: ly, width: 12, height: 12, style: "fill:var(--navy);fill-opacity:0.35" }, svg);
      text(svg, x0 + 18, ly + 11, "prefill", { "font-size": 12.5, style: "fill:var(--ink-2)" });
      el("rect", { x: x0 + 76, y: ly, width: 12, height: 12, style: "fill:var(--sand);fill-opacity:0.8" }, svg);
      text(svg, x0 + 94, ly + 11, "decoding", { "font-size": 12.5, style: "fill:var(--ink-2)" });
      el("path", { d: "M" + (x0 + 166) + " " + (ly + 2) + " L" + (x0 + 176) + " " + (ly + 2) + " L" + (x0 + 171) + " " + (ly + 11) + " Z", style: "fill:var(--teal)" }, svg);
      text(svg, x0 + 182, ly + 11, "update", { "font-size": 12.5, style: "fill:var(--ink-2)" });
      svg.setAttribute("viewBox", "0 0 " + W + " " + (ly + 18));
      note.textContent = cur ? describe(m, cur) : summary(m);
    }
    function summary(m) {
      var dec = m.all - m.pre, tail = m.P - m.pre * CHUNK;
      var s = m.pre === 0 ? "Prefill: no update, because the prompt is shorter than one chunk."
        : "Prefill: " + m.pre + (m.pre === 1 ? " update" : " updates") + (tail ? ", then a partial chunk of " + commas(tail) + " tokens goes to the cache." : ". The prompt ends on a chunk boundary.");
      s += " Decoding reads " + commas(m.read - m.P) + (m.read - m.P === 1 ? " token" : " tokens") + " back and applies " + (dec === 0 ? "no update" : dec === 1 ? "one update" : dec + " updates") + ".";
      s += " The last token read uses W" + sub(Math.floor((m.read - 1) / CHUNK)) + " in the TTT lane and W₀ in the other.";
      return s;
    }
    function describe(m, c) {
      var v = Math.floor(c.a / CHUNK), full = c.b % CHUNK === 0;
      if (c.phase === "prefill") {
        return full ? "Prefill, tokens " + commas(c.a + 1) + " to " + commas(c.b) + ": this chunk is read with W" + sub(v) + ", then the update makes W" + sub(v + 1) + "."
          : "Prefill, tokens " + commas(c.a + 1) + " to " + commas(c.b) + ": a partial chunk, read with W" + sub(v) + ". Its patterns and targets wait in the cache.";
      }
      return full ? "Decoding: token " + commas(c.b) + " completes a chunk. It is read with W" + sub(v) + ", and the update makes W" + sub(v + 1) + " for the tokens after it."
        : "Decoding, up to token " + commas(c.b) + ": read with W" + sub(v) + " while the partial chunk grows.";
    }
    function reset() { stop(); f = -1; frames = plan(model()); draw(); }
    function advance() { if (f < frames.length - 1) { f++; draw(); return true; } return false; }
    function stop() { clearTimeout(timer); timer = 0; playButton(playBtn, false); }
    function tick() {
      if (!advance()) { stop(); f = -1; draw(); return; }
      timer = setTimeout(tick, frames[f].phase === "prefill" ? 1300 : 160);
    }
    playBtn.addEventListener("click", function () {
      if (timer) { stop(); return; }
      if (f >= frames.length - 1) f = -1;
      playButton(playBtn, true);
      tick();
    });
    $("tl-next").addEventListener("click", function () {
      stop();
      // jump to the next frame that ends on a chunk boundary, or to the end
      do { if (!advance()) break; } while (frames[f].b % CHUNK !== 0 && f < frames.length - 1);
    });
    $("tl-reset").addEventListener("click", reset);
    lenIn.addEventListener("input", reset);
    genIn.addEventListener("input", reset);
    reset();
    onResize(svg, draw);
  })();
})();
