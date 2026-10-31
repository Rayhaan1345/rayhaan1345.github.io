// Primer for the diabetes project: the base rate and the split, a one-rule model, a depth-2 tree,
// boosting tree by tree, a single ReLU unit, cut-offs and a Shapley value toy.
// data.json holds the 768 rows with the same 80/20 split (random seed 42) as the rebuilt XGBoost model.
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
  function pct(v) { return (100 * v).toFixed(1) + "%"; }
  function tween(ms, fn) {
    if (reduce) { fn(1); return; }
    var t0 = 0;
    requestAnimationFrame(function f(ts) {
      if (!t0) t0 = ts;
      var p = Math.min(1, (ts - t0) / ms);
      fn(ease(p));
      if (p < 1) requestAnimationFrame(f);
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
  // A labelled slider in the style of the project page: [key, label, min, max, step, value].
  function slider(container, s, onInput) {
    var lab = document.createElement("label"), name = document.createElement("span"), o = document.createElement("output"), inp = document.createElement("input");
    name.textContent = s[1];
    inp.type = "range"; inp.min = s[2]; inp.max = s[3]; inp.step = s[4]; inp.value = s[5];
    lab.appendChild(name); lab.appendChild(o); lab.appendChild(inp); container.appendChild(lab);
    function show() { o.textContent = Number(inp.value).toFixed(s[4] < 1 ? (s[4] < 0.1 ? 2 : 1) : 0); }
    inp.addEventListener("input", function () { show(); onInput(); });
    show();
    return { input: inp, show: show, get: function () { return Number(inp.value); }, set: function (v) { inp.value = v; show(); } };
  }
  function count(D, sel) { var n = 0; for (var i = 0; i < D.y.length; i++) if (sel(i)) n++; return n; }

  Promise.all([
    fetch("data.json").then(function (r) { return r.json(); }),
    fetch("../xgb.json").then(function (r) { return r.json(); })
  ]).then(function (a) {
    var D = a[0], X = a[1];
    D.g = D.X.map(function (r) { return r[D.features.indexOf("Glucose")]; });
    D.b = D.X.map(function (r) { return r[D.features.indexOf("BMI")]; });
    D.train = []; D.held = [];
    D.y.forEach(function (v, i) { (D.test[i] ? D.held : D.train).push(i); });
    waffle(D); rule(D); tree(D); unit(D);
    if (typeof DiabetesXGB !== "undefined") { var S = scores(D, X); boost(D, S); cutoff(D, S); }
    shapley();
  });

  // ---------- 1. the base rate and the split ----------

  function waffle(D) {
    var svg = $("wf-svg"), note = $("wf-note"), view = 0, W = 0, sq = [], L = null;
    var n = D.y.length, ord = D.y.map(function (v, i) { return i; }).sort(function (a, b) { return D.y[b] - D.y[a] || a - b; });
    var pos = D.y.length - count(D, function (i) { return D.y[i] === 0; });
    chips($("wf-views"), ["the data", "always say no", "80/20 split"], view, function (i) { var was = view; view = i; place(was === 2 || i === 2); paint(); });
    function layouts() {
      var cols = W < 460 ? 24 : 48, gap = 2, c = Math.min(14, (W - gap * (cols - 1)) / cols), top = 22;
      var full = {}, split = {};
      ord.forEach(function (idx, k) { full[idx] = [(k % cols) * (c + gap), top + Math.floor(k / cols) * (c + gap)]; });
      var trc = Math.round((cols - 1) * 0.8), tec = cols - 1 - trc, x2 = (trc + 1) * (c + gap), a = 0, b = 0;
      ord.forEach(function (idx) {
        if (D.test[idx]) { split[idx] = [x2 + (b % tec) * (c + gap), top + Math.floor(b / tec) * (c + gap)]; b++; }
        else { split[idx] = [(a % trc) * (c + gap), top + Math.floor(a / trc) * (c + gap)]; a++; }
      });
      var rows = Math.max(Math.ceil(n / cols), Math.ceil(a / trc), Math.ceil(b / tec));
      return { c: c, full: full, split: split, x2: x2, H: top + rows * (c + gap) + 4 };
    }
    function build() {
      clear(svg);
      W = width(svg);
      L = layouts();
      L.lab1 = text(svg, 0, 14, "", { "font-size": 13, style: "fill:var(--ink-2)" });
      L.lab2 = text(svg, L.x2, 14, "", { "font-size": 13, style: "fill:var(--ink-2)" });
      sq = [];
      for (var i = 0; i < n; i++) {
        var p = (view === 2 ? L.split : L.full)[i];
        sq[i] = el("rect", { x: p[0].toFixed(1), y: p[1].toFixed(1), width: L.c.toFixed(1), height: L.c.toFixed(1), rx: 2 }, svg);
      }
      svg.setAttribute("viewBox", "0 0 " + W + " " + L.H);
      paint();
    }
    function place(move) {
      if (!move) return;
      var from = view === 2 ? L.full : L.split, to = view === 2 ? L.split : L.full;
      tween(900, function (e) {
        for (var i = 0; i < n; i++) {
          sq[i].setAttribute("x", (from[i][0] + (to[i][0] - from[i][0]) * e).toFixed(1));
          sq[i].setAttribute("y", (from[i][1] + (to[i][1] - from[i][1]) * e).toFixed(1));
        }
      });
    }
    function paint() {
      for (var i = 0; i < n; i++) {
        var col = view === 1 ? (D.y[i] ? "coral" : "teal") : (D.y[i] ? "coral" : "navy");
        sq[i].setAttribute("style", "fill:var(--" + col + ");fill-opacity:" + (view === 1 && !D.y[i] ? 0.7 : 0.85));
      }
      var tp = count(D, function (i) { return D.test[i] && D.y[i]; }), tn = D.held.length;
      L.lab1.textContent = view === 2 ? "training: " + D.train.length : "";
      L.lab2.textContent = view === 2 ? "held out: " + tn : "";
      note.textContent = view === 0 ? "Coral squares are the " + pos + " women with diabetes, and navy squares the " + (n - pos) + " without."
        : view === 1 ? "Always answering no is right for the " + (n - pos) + " teal squares and wrong for the " + pos + " coral ones, " + pct((n - pos) / n) + " in all."
        : "Training: " + D.train.length + " women, " + pct((pos - tp) / D.train.length) + " with diabetes. Held out: " + tn + " women, " + pct(tp / tn) + " with diabetes.";
    }
    build();
    window.addEventListener("resize", debounce(function () { if (width(svg) !== W) build(); }));
  }

  // ---------- 2. one rule on glucose ----------

  function rule(D) {
    var svg = $("rl-svg"), note = $("rl-note"), cut = $("rl-cut"), out = $("rl-val"), W = 0, G = null;
    var lo = 40, hi = 200, bw = 5, nb = (hi - lo) / bw;
    var up = new Array(nb).fill(0), dn = new Array(nb).fill(0);
    D.train.forEach(function (i) {
      var k = Math.max(0, Math.min(nb - 1, Math.floor((D.g[i] - lo) / bw)));
      (D.y[i] ? up : dn)[k]++;
    });
    function build() {
      clear(svg);
      W = width(svg);
      var m = { l: 8, r: 8, t: 10, b: 30 }, H = W < 560 ? 220 : 260, mid = m.t + (H - m.t - m.b) * 0.45;
      var mx = Math.max(Math.max.apply(null, up), Math.max.apply(null, dn));
      var X = function (g) { return m.l + (W - m.l - m.r) * (g - lo) / (hi - lo); };
      var hUp = mid - m.t, hDn = H - m.b - mid;
      G = { X: X, m: m, H: H };
      G.shade = el("rect", { x: 0, y: m.t, width: 0, height: H - m.t - m.b, style: "fill:var(--coral);fill-opacity:0.08" }, svg);
      for (var k = 0; k < nb; k++) {
        var x = X(lo + k * bw) + 0.5, w = X(lo + bw) - X(lo) - 1;
        if (up[k]) el("rect", { x: x, y: mid - hUp * up[k] / mx, width: w, height: hUp * up[k] / mx, style: "fill:var(--coral)" }, svg);
        if (dn[k]) el("rect", { x: x, y: mid, width: w, height: hDn * dn[k] / mx, style: "fill:var(--navy)" }, svg);
      }
      el("line", { x1: m.l, x2: W - m.r, y1: mid, y2: mid, style: "stroke:var(--ink-2)" }, svg);
      text(svg, m.l, m.t + 12, "had diabetes", { "font-size": 12.5, style: "fill:var(--ink-2)" });
      text(svg, m.l, H - m.b - 6, "no diabetes", { "font-size": 12.5, style: "fill:var(--ink-2)" });
      [60, 100, 140, 180].forEach(function (g) { text(svg, X(g), H - 10, String(g), { "text-anchor": "middle", "font-size": 12, style: "fill:var(--muted)" }); });
      G.line = el("line", { y1: m.t - 4, y2: H - m.b + 4, style: "stroke:var(--ink)", "stroke-width": 2.5 }, svg);
      G.knob = el("circle", { cy: m.t - 4, r: 6, style: "fill:var(--ink);cursor:ew-resize" }, svg);
      svg.setAttribute("viewBox", "0 0 " + W + " " + H);
      svg.style.touchAction = "pan-y";
      update();
    }
    function update() {
      var c = Number(cut.value);
      out.textContent = c;
      var x = G.X(c);
      G.line.setAttribute("x1", x); G.line.setAttribute("x2", x); G.knob.setAttribute("cx", x);
      G.shade.setAttribute("x", x); G.shade.setAttribute("width", Math.max(0, W - G.m.r - x));
      var tp = 0, fn = 0, fp = 0, tn = 0;
      D.train.forEach(function (i) { var call = D.g[i] >= c; if (D.y[i]) { if (call) tp++; else fn++; } else { if (call) fp++; else tn++; } });
      var held = D.held.filter(function (i) { return (D.g[i] >= c ? 1 : 0) === D.y[i]; }).length;
      counts($("rl-counts"), tp, fn, fp, tn);
      note.textContent = "Training accuracy " + pct((tp + tn) / D.train.length) + ". Held-out accuracy " + pct(held / D.held.length) + ".";
    }
    var drag = false;
    function fromEvent(e) {
      var r = svg.getBoundingClientRect(), x = (e.clientX - r.left) * W / r.width;
      var g = lo + (x - G.m.l) / (W - G.m.l - G.m.r) * (hi - lo);
      cut.value = Math.round(Math.max(60, Math.min(199, g))); update();
    }
    svg.addEventListener("pointerdown", function (e) { drag = true; svg.setPointerCapture(e.pointerId); fromEvent(e); });
    svg.addEventListener("pointermove", function (e) { if (drag) fromEvent(e); });
    svg.addEventListener("pointerup", function () { drag = false; });
    cut.addEventListener("input", update);
    build();
    window.addEventListener("resize", debounce(function () { if (width(svg) !== W) build(); }));
  }

  function counts(box, tp, fn, fp, tn) {
    box.innerHTML = "";
    [["hit", tp, "caught: diabetes, called yes"], ["miss", fn, "missed: diabetes, called no"], ["miss", fp, "false alarms: no diabetes, called yes"], ["hit", tn, "cleared: no diabetes, called no"]].forEach(function (c) {
      var d = document.createElement("div"); d.className = c[0];
      var b = document.createElement("b"); b.textContent = c[1];
      var s = document.createElement("span"); s.textContent = c[2];
      d.appendChild(b); d.appendChild(s); box.appendChild(d);
    });
  }

  // ---------- 3. a decision tree of depth 2 ----------

  function tree(D) {
    var svg = $("tr-svg"), note = $("tr-note"), list = $("tr-leaves"), W = 0, G = null;
    var gx = [40, 200], by = [15, 60];
    var S = {
      g: slider($("tr-sliders"), ["g", "First: glucose at least", 60, 190, 1, 128], update),
      bl: slider($("tr-sliders"), ["bl", "If lower glucose: BMI at least", 18, 55, 0.5, 27], update),
      bh: slider($("tr-sliders"), ["bh", "If higher glucose: BMI at least", 18, 55, 0.5, 30], update)
    };
    function leafOf(i, g, bl, bh) { return D.g[i] >= g ? (D.b[i] >= bh ? 3 : 2) : (D.b[i] >= bl ? 1 : 0); }
    function stats(idx, g, bl, bh) {
      var L = [[0, 0], [0, 0], [0, 0], [0, 0]];
      idx.forEach(function (i) { L[leafOf(i, g, bl, bh)][D.y[i]]++; });
      return L;
    }
    function build() {
      clear(svg);
      W = width(svg);
      var m = { l: 40, r: 8, t: 8, b: 40 }, H = Math.min(380, Math.max(250, W * 0.55));
      var X = function (g) { return m.l + (W - m.l - m.r) * (Math.max(gx[0], Math.min(gx[1], g)) - gx[0]) / (gx[1] - gx[0]); };
      var Y = function (b) { return H - m.b - (H - m.t - m.b) * (Math.max(by[0], Math.min(by[1], b)) - by[0]) / (by[1] - by[0]); };
      G = { X: X, Y: Y, m: m, H: H, boxes: [], labels: [] };
      for (var k = 0; k < 4; k++) G.boxes.push(el("rect", { style: "fill:var(--navy);fill-opacity:0.08" }, svg));
      D.train.forEach(function (i) {
        el("circle", { cx: X(D.g[i]).toFixed(1), cy: Y(D.b[i]).toFixed(1), r: W < 560 ? 2.2 : 2.8, style: "fill:var(--" + (D.y[i] ? "coral" : "navy") + ");fill-opacity:0.75" }, svg);
      });
      G.v = el("line", { style: "stroke:var(--ink)", "stroke-width": 2.5 }, svg);
      G.hl = el("line", { style: "stroke:var(--ink)", "stroke-width": 2 }, svg);
      G.hh = el("line", { style: "stroke:var(--ink)", "stroke-width": 2 }, svg);
      for (k = 0; k < 4; k++) G.labels.push(text(svg, 0, 0, "", { "text-anchor": "middle", "font-size": 13, "font-weight": 600, style: "fill:var(--ink);paint-order:stroke;stroke:var(--paper);stroke-width:4px" }));
      [60, 100, 140, 180].forEach(function (g) { text(svg, X(g), H - m.b + 15, String(g), { "text-anchor": "middle", "font-size": 12, style: "fill:var(--muted)" }); });
      [20, 30, 40, 50].forEach(function (b) { text(svg, m.l - 6, Y(b) + 4, String(b), { "text-anchor": "end", "font-size": 12, style: "fill:var(--muted)" }); });
      text(svg, (m.l + W - m.r) / 2, H - 4, "glucose, mg/dL", { "text-anchor": "middle", "font-size": 13, style: "fill:var(--ink-2)" });
      text(svg, 12, (m.t + H - m.b) / 2, "BMI", { "text-anchor": "middle", "font-size": 13, transform: "rotate(-90 12 " + ((m.t + H - m.b) / 2) + ")", style: "fill:var(--ink-2)" });
      svg.setAttribute("viewBox", "0 0 " + W + " " + H);
      update();
    }
    function update() {
      var g = S.g.get(), bl = S.bl.get(), bh = S.bh.get(), X = G.X, Y = G.Y, m = G.m;
      var x = X(g), x0 = m.l, x1 = W - m.r, y0 = m.t, y1 = G.H - m.b;
      var R = [[x0, Y(bl), x, y1], [x0, y0, x, Y(bl)], [x, Y(bh), x1, y1], [x, y0, x1, Y(bh)]];
      var L = stats(D.train, g, bl, bh), held = 0, ok = 0;
      D.held.forEach(function (i) { var s = L[leafOf(i, g, bl, bh)]; if ((s[1] > s[0] ? 1 : 0) === D.y[i]) held++; });
      L.forEach(function (s) { ok += Math.max(s[0], s[1]); });
      list.innerHTML = "";
      var names = ["glucose below " + g + ", BMI below " + bl, "glucose below " + g + ", BMI " + bl + " or more", "glucose " + g + " or more, BMI below " + bh, "glucose " + g + " or more, BMI " + bh + " or more"];
      R.forEach(function (r, k) {
        var s = L[k], tot = s[0] + s[1], yes = s[1] > s[0];
        G.boxes[k].setAttribute("x", r[0]); G.boxes[k].setAttribute("y", r[1]);
        G.boxes[k].setAttribute("width", Math.max(0, r[2] - r[0])); G.boxes[k].setAttribute("height", Math.max(0, r[3] - r[1]));
        G.boxes[k].setAttribute("style", "fill:var(--" + (yes ? "coral" : "navy") + ");fill-opacity:" + (yes ? 0.16 : 0.07));
        G.labels[k].setAttribute("x", ((r[0] + r[2]) / 2).toFixed(1)); G.labels[k].setAttribute("y", ((r[1] + r[3]) / 2 + 5).toFixed(1));
        G.labels[k].textContent = tot ? Math.round(100 * s[1] / tot) + "%" : "";
        var li = document.createElement("li"); if (yes) li.className = "yes";
        li.textContent = names[k] + ": " + s[1] + " of " + tot + " had diabetes. Call: " + (yes ? "yes." : "no.");
        list.appendChild(li);
      });
      G.v.setAttribute("x1", x); G.v.setAttribute("x2", x); G.v.setAttribute("y1", y0); G.v.setAttribute("y2", y1);
      G.hl.setAttribute("x1", x0); G.hl.setAttribute("x2", x); G.hl.setAttribute("y1", Y(bl)); G.hl.setAttribute("y2", Y(bl));
      G.hh.setAttribute("x1", x); G.hh.setAttribute("x2", x1); G.hh.setAttribute("y1", Y(bh)); G.hh.setAttribute("y2", Y(bh));
      note.textContent = "Training accuracy " + pct(ok / D.train.length) + ". Held-out accuracy " + pct(held / D.held.length) + ". The numbers in the boxes give the share with diabetes.";
    }
    // Training: try all questions on a grid and keep the ones with the most correct training calls.
    function fit() {
      var best = [-1, 0, 0, 0];
      for (var g = 60; g <= 190; g++) {
        var left = D.train.filter(function (i) { return D.g[i] < g; }), right = D.train.filter(function (i) { return D.g[i] >= g; });
        var bl = bestB(left), bh = bestB(right);
        if (bl[0] + bh[0] > best[0]) best = [bl[0] + bh[0], g, bl[1], bh[1]];
      }
      var from = [S.g.get(), S.bl.get(), S.bh.get()];
      tween(700, function (e) {
        S.g.set(Math.round(from[0] + (best[1] - from[0]) * e));
        S.bl.set(Math.round(2 * (from[1] + (best[2] - from[1]) * e)) / 2);
        S.bh.set(Math.round(2 * (from[2] + (best[3] - from[2]) * e)) / 2);
        update();
      });
    }
    function bestB(idx) {
      var best = [-1, 18];
      for (var b = 18; b <= 55; b += 0.5) {
        var c = [[0, 0], [0, 0]];
        idx.forEach(function (i) { c[D.b[i] >= b ? 1 : 0][D.y[i]]++; });
        var ok = Math.max(c[0][0], c[0][1]) + Math.max(c[1][0], c[1][1]);
        if (ok > best[0]) best = [ok, b];
      }
      return best;
    }
    $("tr-fit").addEventListener("click", fit);
    build();
    window.addEventListener("resize", debounce(function () { if (width(svg) !== W) build(); }));
  }

  // ---------- 4 and 6. the rebuilt XGBoost model ----------

  // Scores of the held-out and training women after k trees, for k from 0 to 100.
  function scores(D, X) {
    var n = D.y.length, k, i, cum = [D.y.map(function () { return X.base; })];
    for (k = 0; k < X.trees.length; k++) {
      var T = X.trees[k], prev = cum[k], next = new Array(n);
      for (i = 0; i < n; i++) {
        var node = 0, x = D.X[i];
        while (T.l[node] >= 0) node = Math.fround(x[T.f[node]]) < Math.fround(T.t[node]) ? T.l[node] : T.r[node];
        next[i] = prev[i] + T.v[node];
      }
      cum.push(next);
    }
    return cum;
  }

  // Two rows of dots, held-out women with and without diabetes, placed by score.
  function strips(svg, D) {
    var W = width(svg), m = { l: 8, r: 8, t: 22, b: 26 }, rowH = 46, H = m.t + 2 * rowH + 12 + m.b;
    clear(svg);
    var X = function (s) { return m.l + (W - m.l - m.r) * (s - 0.1) / 0.7; };
    var dots = {};
    [1, 0].forEach(function (yv, r) {
      var y0 = m.t + r * (rowH + 12);
      el("rect", { x: m.l, y: y0, width: W - m.l - m.r, height: rowH, rx: 4, style: "fill:var(--bg)" }, svg);
      text(svg, m.l + 6, y0 - 6, yv ? "had diabetes" : "no diabetes", { "font-size": 12.5, style: "fill:var(--ink-2)" });
      D.held.forEach(function (i, k) {
        if (D.y[i] !== yv) return;
        var j = ((i * 9301 + 49297) % 233280) / 233280;
        dots[i] = el("circle", { cx: X(0.35), cy: (y0 + 6 + j * (rowH - 12)).toFixed(1), r: 3.4, style: "fill:var(--" + (yv ? "coral" : "navy") + ");fill-opacity:0.8" }, svg);
      });
    });
    [0.1, 0.3, 0.5, 0.7].forEach(function (s) { text(svg, X(s), H - 6, s.toFixed(1), { "text-anchor": "middle", "font-size": 12, style: "fill:var(--muted)" }); });
    var cut = el("line", { y1: m.t - 4, y2: m.t + 2 * rowH + 16, style: "stroke:var(--ink)", "stroke-width": 2 }, svg);
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    return { W: W, X: X, dots: dots, cut: cut };
  }

  function boost(D, S) {
    var svg = $("bo-svg"), note = $("bo-note"), k = $("bo-k"), out = $("bo-val"), play = $("bo-play"), P = null, timer = 0;
    function build() { P = strips(svg, D); P.cut.setAttribute("stroke-dasharray", "5 4"); P.cut.setAttribute("x1", P.X(0.5)); P.cut.setAttribute("x2", P.X(0.5)); update(); }
    function update() {
      var n = Number(k.value), s = S[n];
      out.textContent = n;
      for (var i in P.dots) P.dots[i].setAttribute("cx", P.X(s[i]).toFixed(1));
      var held = D.held.filter(function (i) { return (s[i] > 0.5 ? 1 : 0) === D.y[i]; }).length;
      var tr = D.train.filter(function (i) { return (s[i] > 0.5 ? 1 : 0) === D.y[i]; }).length;
      var lo = Math.min.apply(null, D.held.map(function (i) { return s[i]; })), hi = Math.max.apply(null, D.held.map(function (i) { return s[i]; }));
      note.textContent = (n === 0 ? "Before any tree, all women get the training average, 0.347, and the model calls no for all of them." : "After " + n + (n === 1 ? " tree" : " trees") + ", held-out scores run from " + lo.toFixed(2) + " to " + hi.toFixed(2) + ".")
        + " Held-out accuracy " + pct(held / D.held.length) + ", training accuracy " + pct(tr / D.train.length) + ".";
    }
    function stop() { clearInterval(timer); timer = 0; play.textContent = "Play"; }
    play.addEventListener("click", function () {
      if (timer) { stop(); return; }
      if (Number(k.value) >= 100) k.value = 0;
      play.textContent = "Pause";
      timer = setInterval(function () { k.value = Number(k.value) + 1; update(); if (Number(k.value) >= 100) stop(); }, 70);
    });
    k.addEventListener("input", function () { stop(); update(); });
    build();
    var W = P.W;
    window.addEventListener("resize", debounce(function () { if (width(svg) !== W) { build(); W = P.W; } }));
  }

  function cutoff(D, S) {
    var svg = $("co-svg"), note = $("co-note"), cut = $("co-cut"), out = $("co-val"), P = null, s = S[S.length - 1];
    function build() {
      P = strips(svg, D);
      for (var i in P.dots) P.dots[i].setAttribute("cx", P.X(s[i]).toFixed(1));
      update();
    }
    function update() {
      var c = Number(cut.value), tp = 0, fn = 0, fp = 0, tn = 0;
      out.textContent = c.toFixed(2);
      P.cut.setAttribute("x1", P.X(c)); P.cut.setAttribute("x2", P.X(c));
      D.held.forEach(function (i) { var call = s[i] > c; if (D.y[i]) { if (call) tp++; else fn++; } else { if (call) fp++; else tn++; } });
      counts($("co-counts"), tp, fn, fp, tn);
      note.textContent = "Sensitivity " + pct(tp / (tp + fn)) + ": caught " + tp + " of the " + (tp + fn) + " women with diabetes. Specificity " + pct(tn / (tn + fp)) + ": cleared " + tn + " of the " + (tn + fp) + " without. Accuracy " + pct((tp + tn) / D.held.length) + ".";
    }
    cut.addEventListener("input", update);
    build();
    var W = P.W;
    window.addEventListener("resize", debounce(function () { if (width(svg) !== W) { build(); W = P.W; } }));
  }

  // ---------- 5. one unit ----------

  function unit(D) {
    var svg = $("un-svg"), note = $("un-note"), W = 0, G = null;
    var mg = D.scale.Glucose, mb = D.scale.BMI;
    var S = {
      wg: slider($("un-sliders"), ["wg", "Weight on glucose", -3, 3, 0.1, 1.5], update),
      wb: slider($("un-sliders"), ["wb", "Weight on BMI", -3, 3, 0.1, 0.8], update),
      c: slider($("un-sliders"), ["c", "Bias", -3, 3, 0.1, -1], update)
    };
    var gx = [40, 200], by = [15, 60], NX = 40, NY = 28;
    function build() {
      clear(svg);
      W = width(svg);
      var m = { l: 34, r: 6, t: 6, b: 40 }, H = Math.min(320, Math.max(230, W * 0.62));
      var X = function (g) { return m.l + (W - m.l - m.r) * (g - gx[0]) / (gx[1] - gx[0]); };
      var Y = function (b) { return H - m.b - (H - m.t - m.b) * (b - by[0]) / (by[1] - by[0]); };
      G = { X: X, Y: Y, cells: [], m: m, H: H };
      var cw = (W - m.l - m.r) / NX, ch = (H - m.t - m.b) / NY;
      for (var a = 0; a < NX; a++) for (var b = 0; b < NY; b++) {
        G.cells.push([gx[0] + (a + 0.5) * (gx[1] - gx[0]) / NX, by[0] + (b + 0.5) * (by[1] - by[0]) / NY,
          el("rect", { x: (m.l + a * cw).toFixed(1), y: (H - m.b - (b + 1) * ch).toFixed(1), width: (cw + 0.5).toFixed(1), height: (ch + 0.5).toFixed(1) }, svg)]);
      }
      D.train.forEach(function (i) {
        if (D.g[i] < gx[0] || D.b[i] < by[0] || D.b[i] > by[1]) return;
        el("circle", { cx: X(D.g[i]).toFixed(1), cy: Y(D.b[i]).toFixed(1), r: 1.9, style: "fill:var(--" + (D.y[i] ? "coral" : "navy") + ");fill-opacity:0.7" }, svg);
      });
      var clip = el("clipPath", { id: "un-clip" }, el("defs", {}, svg));
      el("rect", { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b }, clip);
      G.edge = el("line", { style: "stroke:var(--ink)", "stroke-width": 2, "stroke-dasharray": "5 4", "clip-path": "url(#un-clip)" }, svg);
      [60, 100, 140, 180].forEach(function (g) { text(svg, X(g), H - m.b + 15, String(g), { "text-anchor": "middle", "font-size": 12, style: "fill:var(--muted)" }); });
      [20, 30, 40, 50].forEach(function (b) { text(svg, m.l - 6, Y(b) + 4, String(b), { "text-anchor": "end", "font-size": 12, style: "fill:var(--muted)" }); });
      text(svg, (m.l + W - m.r) / 2, H - 4, "glucose, mg/dL", { "text-anchor": "middle", "font-size": 13, style: "fill:var(--ink-2)" });
      text(svg, 10, (m.t + H - m.b) / 2, "BMI", { "text-anchor": "middle", "font-size": 13, transform: "rotate(-90 10 " + ((m.t + H - m.b) / 2) + ")", style: "fill:var(--ink-2)" });
      svg.setAttribute("viewBox", "0 0 " + W + " " + H);
      update();
    }
    function out(g, b) { return S.wg.get() * (g - mg[0]) / mg[1] + S.wb.get() * (b - mb[0]) / mb[1] + S.c.get(); }
    function update() {
      if (!G) return;
      var mx = 0;
      G.cells.forEach(function (c) { mx = Math.max(mx, out(c[0], c[1])); });
      G.cells.forEach(function (c) {
        var v = Math.max(0, out(c[0], c[1]));
        c[2].setAttribute("style", v > 0 ? "fill:var(--teal);fill-opacity:" + (0.08 + 0.42 * v / (mx || 1)).toFixed(2) : "fill:none");
      });
      // the edge where the weighted sum is zero: wg*(g-mg)/sg + wb*(b-mb)/sb + c = 0
      var wg = S.wg.get(), wb = S.wb.get(), c = S.c.get(), pts = [];
      if (Math.abs(wb) > 1e-6) {
        [gx[0], gx[1]].forEach(function (g) { pts.push([g, mb[0] - mb[1] * (c + wg * (g - mg[0]) / mg[1]) / wb]); });
      } else if (Math.abs(wg) > 1e-6) {
        var g0 = mg[0] - mg[1] * c / wg; pts = [[g0, by[0]], [g0, by[1]]];
      }
      if (pts.length) {
        G.edge.setAttribute("x1", G.X(pts[0][0])); G.edge.setAttribute("y1", G.Y(pts[0][1]));
        G.edge.setAttribute("x2", G.X(pts[1][0])); G.edge.setAttribute("y2", G.Y(pts[1][1]));
        G.edge.style.display = "";
      } else G.edge.style.display = "none";
      var on = D.train.filter(function (i) { return out(D.g[i], D.b[i]) > 0; }), pos = on.filter(function (i) { return D.y[i]; }).length;
      note.textContent = on.length ? "The unit is active for " + on.length + " of the " + D.train.length + " training women, and " + pct(pos / on.length) + " of them had diabetes, against 34.9% overall."
        : "The unit is never active on these women, so it passes nothing on.";
    }
    build();
    window.addEventListener("resize", debounce(function () { if (width(svg) !== W) build(); }));
  }

  // ---------- 8. Shapley values in a toy with three inputs ----------

  function shapley() {
    var svg = $("sv-svg"), note = $("sv-note"), W = 0, pick = 0;
    var P = ["glucose", "BMI", "age"], C = ["coral", "navy", "sand"];
    // Made-up scores for any set of known inputs, keyed by the set's members.
    var V = { "": 0.35, "0": 0.55, "1": 0.41, "2": 0.38, "01": 0.63, "02": 0.59, "12": 0.44, "012": 0.67 };
    function v(set) { return V[set.slice().sort().join("")]; }
    var ORDERS = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
    var adds = ORDERS.map(function (o) {
      var a = [0, 0, 0], have = [];
      o.forEach(function (p) { var before = v(have); have.push(p); a[p] = v(have) - before; });
      return a;
    });
    var phi = [0, 1, 2].map(function (p) { return adds.reduce(function (s, a) { return s + a[p]; }, 0) / ORDERS.length; });
    function f2(x) { return x.toFixed(2); }
    var tv = $("sv-values"), to = $("sv-orders");
    tv.innerHTML = "<thead><tr><th>known inputs</th><th>score</th></tr></thead><tbody>" +
      ["", "0", "1", "2", "01", "02", "12", "012"].map(function (k) {
        var name = k === "" ? "none (average)" : k.split("").map(function (c) { return P[c]; }).join(" + ");
        return "<tr><td>" + name + "</td><td>" + f2(V[k]) + "</td></tr>";
      }).join("") + "</tbody>";
    to.innerHTML = "<thead><tr><th>order</th>" + P.map(function (p) { return "<th>" + p + "</th>"; }).join("") + "</tr></thead><tbody>" +
      ORDERS.map(function (o, i) { return "<tr data-order='" + i + "' tabindex='0'><td>" + o.map(function (p) { return P[p]; }).join(", ") + "</td>" + adds[i].map(function (a) { return "<td>+" + f2(a) + "</td>"; }).join("") + "</tr>"; }).join("") +
      "</tbody><tfoot><tr><td>average</td>" + phi.map(function (x) { return "<td>+" + x.toFixed(3) + "</td>"; }).join("") + "</tr></tfoot>";
    var rows = [].slice.call(to.querySelectorAll("tbody tr"));
    rows.forEach(function (r) {
      function go() { pick = Number(r.dataset.order); draw(); }
      r.addEventListener("click", go);
      r.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
    });
    function draw() {
      rows.forEach(function (r, i) { r.classList.toggle("on", i === pick); });
      clear(svg);
      W = width(svg);
      var lab = W < 560 ? 120 : 170, m = { r: 50 }, rh = 40, H = 2 * rh + 30;
      var X = function (s) { return lab + (W - lab - m.r) * (s - 0.3) / 0.4; };
      function row(y, label, seq) {
        text(svg, lab - 10, y + 18, label, { "text-anchor": "end", "font-size": 14, style: "fill:var(--ink)" });
        var at = 0.35, segs = [];
        seq.forEach(function (p) {
          var r = el("rect", { x: X(at), y: y + 4, width: 0, height: 20, style: "fill:var(--" + C[p[0]] + ");fill-opacity:0.85" }, svg);
          var t = text(svg, X(at + p[1] / 2), y + 37, P[p[0]] + " +" + p[1].toFixed(p[2] || 2), { "text-anchor": "middle", "font-size": 11.5, style: "fill:var(--ink-2);opacity:0" });
          if (X(at + p[1]) - X(at) < 70) t.textContent = "";
          segs.push([r, at, p[1], t]); at += p[1];
        });
        text(svg, X(at) + 6, y + 19, "= " + at.toFixed(2), { "font-size": 12.5, style: "fill:var(--ink)" });
        return segs;
      }
      var o = ORDERS[pick];
      var segs = row(4, "order chosen", o.map(function (p) { return [p, adds[pick][p]]; }))
        .concat(row(4 + rh + 10, "Shapley values", [0, 1, 2].map(function (p) { return [p, phi[p], 3]; })));
      el("line", { x1: X(0.35), x2: X(0.35), y1: 0, y2: H - 18, style: "stroke:var(--muted)", "stroke-dasharray": "3 3" }, svg);
      text(svg, X(0.35), H - 4, "average 0.35", { "text-anchor": "middle", "font-size": 12, style: "fill:var(--muted)" });
      svg.setAttribute("viewBox", "0 0 " + W + " " + H);
      tween(600, function (e) {
        segs.forEach(function (s) { s[0].setAttribute("width", Math.max(0, X(s[1] + s[2] * e) - X(s[1])).toFixed(1)); if (e >= 1) s[3].style.opacity = "1"; });
      });
      note.textContent = "In the order " + o.map(function (p) { return P[p]; }).join(", ") + ", " + o.map(function (p, i) { return (i ? "then " : "") + P[p] + " adds " + f2(adds[pick][p]); }).join(", ") + ". Glucose adds more when it comes later, because BMI and age raise its effect a little.";
    }
    draw();
    window.addEventListener("resize", debounce(function () { if (width(svg) !== W) draw(); }));
  }
})();
