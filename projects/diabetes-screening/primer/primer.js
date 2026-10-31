// Primer for the diabetes project: the base rate and the split, a one-rule model, decision trees grown by hand,
// tree depth and overfitting, boosting on one input and on two, a single unit with a choice of activation, the network's layout,
// cut-offs, split counts against the shuffle test, a Shapley value toy and the zeros in the data,
// plus the warm-up quiz and the tree to rebuild from memory.
// The tree, depth, boosting and unit figures come from the modules in treelab.js, boostlab.js and neuronlab.js (mounted in labs below).
// data.json holds the 768 rows with the same 80/20 split (random seed 42) as the rebuilt XGBoost model,
// and a depth curve for decision trees on all eight measurements averaged over 50 random 80/20 splits.
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
  function count(D, sel) { var n = 0; for (var i = 0; i < D.y.length; i++) if (sel(i)) n++; return n; }
  function setText(id, v) { var n = $(id); if (n) n.textContent = v; }
  function signed(v, d) { return (v < 0 ? "−" : "+") + Math.abs(v).toFixed(d); }
  // Woman A is held-out row 31 (glucose 158, BMI 31.6, had diabetes). The page follows her from section 2 on.
  var A = 31;
  Promise.all([
    fetch("data.json").then(function (r) { return r.json(); }),
    fetch("../xgb.json").then(function (r) { return r.json(); })
  ]).then(function (a) {
    var D = a[0], X = a[1];
    D.g = D.X.map(function (r) { return r[D.features.indexOf("Glucose")]; });
    D.b = D.X.map(function (r) { return r[D.features.indexOf("BMI")]; });
    D.train = []; D.held = [];
    D.y.forEach(function (v, i) { (D.test[i] ? D.held : D.train).push(i); });
    waffle(D, "wf", [0, 1], ["the data", "always say no"]);
    waffle(D, "sp", [0, 2], ["all 768", "80/20 split"]);
    rule(D); labs(D); network(D); splitCounts(X); zeros(D);
    if (typeof DiabetesXGB !== "undefined") { var S = scores(D, X); cutoff(D, S); }
    shapley();
  });

  // ---------- 1 and 2. the base rate and the split ----------

  // views picks from: 0 the data, 1 always say no, 2 the 80/20 split.
  function waffle(D, id, views, labels) {
    var svg = $(id + "-svg"), note = $(id + "-note"), view = views[0], W = 0, sq = [], L = null;
    var n = D.y.length, ord = D.y.map(function (v, i) { return i; }).sort(function (a, b) { return D.y[b] - D.y[a] || a - b; });
    var pos = D.y.length - count(D, function (i) { return D.y[i] === 0; });
    chips($(id + "-views"), labels, 0, function (i) { var was = view; view = views[i]; place(was === 2 || view === 2); paint(); });
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
      setText("rl-eq-tp", tp); setText("rl-eq-tn", tn); setText("rl-eq-acc", pct((tp + tn) / D.train.length));
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

  // ---------- 3 to 7. trees, depth, boosting and one unit: the modules of the How AI Learns primer ----------

  // TreeLab, BoostLab and NeuronLab (treelab.js, boostlab.js, neuronlab.js, on top of kit-lite.js, Plotly and D3) draw these figures.
  // The words in them come from the options below. Woman A is marked with a star in each figure.
  var WA = [158, 31.6];   // Woman A: glucose in mg/dL and BMI

  function labs(D) {
    var ids = ["tr-lab", "dp-lab", "bo1-lab", "bo2-lab", "un-lab"];
    if (typeof Kit === "undefined" || typeof TreeLab === "undefined" || typeof BoostLab === "undefined" || typeof NeuronLab === "undefined" || typeof Plotly === "undefined" || typeof d3 === "undefined") {
      ids.forEach(function (id) { var n = $(id); if (n) n.textContent = "This figure needs Plotly and D3, which did not load. Check your connection and reload the page."; });
      return;
    }
    var gj = D.features.indexOf("Glucose"), bj = D.features.indexOf("BMI");
    var rows = D.X.map(function (r, i) { return { n: i + 1, Glucose: r[gj], BMI: r[bj], y: D.y[i], test: D.test[i] }; });
    function held(r) { return r.test === 1; }
    var base = {
      rows: rows, features: ["Glucose", "BMI"], featureLabels: ["glucose, mg/dL", "BMI, kg/m²"], featureNames: ["glucose", "BMI"], units: ["mg/dL", "kg/m²"],
      label: "y", classNames: ["no diabetes", "had diabetes"], noun: "woman", nouns: "women", heldOut: held, ranges: [[40, 205], [15, 70]],
      ids: "n", idLabel: "Row", digits: [1, 2], stepFor: [0.5, 0.05], mark: { x: WA, label: "A", name: "Woman A" },
      footnote: "A zero for glucose or BMI means the measurement was not taken, which is why a few women lie off the edge of the plot. The last section returns to this."
    };
    function opt(extra) { var o = {}; Object.keys(base).forEach(function (k) { o[k] = base[k]; }); Object.keys(extra).forEach(function (k) { o[k] = extra[k]; }); return o; }
    function num(v) { return String(Math.round(v * 100) / 100); }

    // Decision tree: grow it box by box. Woman A's box follows the tree the reader has grown.
    TreeLab.mountGrow($("tr-lab"), opt({
      maxDepth: 4, aria: "Glucose and BMI of the women, with the boxes of the tree you are growing behind them and Woman A starred", treeAria: "The tree you are growing, drawn from left to right",
      onChange: function (info) {
        var T = info.tree, path = TreeLab.core.path(T, WA), nd = T.nodes[path[path.length - 1]], n = nd.n0 + nd.n1, parts = [];
        for (var k = 0; k < path.length - 1; k++) {
          var q = T.nodes[path[k]];
          parts.push((q.f === 0 ? "glucose" : "BMI") + (path[k + 1] === q.l ? " at most " : " above ") + num(q.t));
        }
        setText("tr-eq-box", parts.length ? parts.join(", ") : "no question yet, so all training women");
        setText("tr-eq-a", nd.n1); setText("tr-eq-n", n); setText("tr-eq-s", n ? Math.round(100 * nd.n1 / n) + "%" : "none");
        setText("tr-eq-call", nd.n1 > nd.n0 ? "more than half: call yes" : "half or less: call no");
      }
    }));

    // Depth: the same two measurements, deeper and deeper, against 50 other random splits.
    TreeLab.mountDepth($("dp-lab"), opt({
      maxDepth: 12, depth: 2, splits: 50, heldFrac: 0.2, footnote: "", aria: "Glucose and BMI of the women, divided into the boxes of a tree at the chosen depth limit, with Woman A starred",
      curveAria: "Accuracy of the tree against its depth limit, on the training women, the held-out women and 50 other random splits",
      onChange: function (info) {
        var gap = 100 * (info.train - info.held);
        setText("dp-eq-tr", pct(info.train)); setText("dp-eq-he", pct(info.held)); setText("dp-eq-gap", (gap < 0 ? "−" : "") + Math.abs(gap).toFixed(1));
      }
    }));

    // Boosting, one input: stumps fitted to the gaps, with Woman A, B and C as the women the equation boxes follow.
    BoostLab.mount1D($("bo1-lab"), {
      rows: rows, x: "Glucose", y: "y", xLabel: "glucose, mg/dL", yLabel: "had diabetes (1) or not (0)", residLabel: "gap: label minus score", xUnit: "mg/dL", yUnit: "",
      noun: "woman", nouns: "women", heldOut: held, xMin: 40, xMax: 205, yMax: 1.12, maxTrees: 100, eta: 0.3, depth: 1, lambda: 1, ids: "n", idLabel: "Row",
      probes: [{ name: "Woman A", row: A }, { name: "Woman B", row: 30 }, { name: "Woman C", row: 23 }],
      aria: "Glucose of the training women against their label, with the sum of the stumps added so far drawn as a staircase",
      residAria: "The gap between label and score for the training women as stumps are added, and the next stump's answer",
      footnote: "One input and large steps (stumps, learning rate 0.3) so that a few trees show the idea. The project's model uses trees of depth 3 and a learning rate of 0.01."
    });

    // Boosting, two inputs, with the settings of the project's model.
    var bo2 = null;
    function womanScore(info) {
      if (!bo2) return;
      var m = bo2.model(), s = BoostLab.core.margin(m, WA, info.k);
      setText("bo-eq-k", info.k); setText("bo-eq-sum", signed(s - m.base, 3)); setText("bo-eq-s", s.toFixed(3));
    }
    bo2 = BoostLab.mountBoundary($("bo2-lab"), opt({
      maxTrees: 100, eta: 0.01, depth: 3, lambda: 1, objective: "squared", classNames: ["no diabetes", "diabetes"], reference: { label: "Held-out accuracy of the project's model, all eight inputs", held: 0.786 },
      aria: "A heat map of the boosted model's score over glucose and BMI, with the women on top and Woman A starred",
      footnote: "Two inputs, so the numbers differ from the project's eight-input model. Learning rate, leaf penalty and depth are the project's.",
      onChange: womanScore
    }));
    womanScore({ k: 0 });

    // One unit: glucose and BMI scaled as in the text, a ReLU to begin with, the training women as the points of fit mode.
    var mg = D.scale.Glucose, mb = D.scale.BMI, unit = null;
    var sg = (WA[0] - mg[0]) / mg[1], sb = (WA[1] - mb[0]) / mb[1];
    var G = { none: "(", step: "step(", sigmoid: "σ(", tanh: "tanh(", relu: "ReLU(", gelu: "GELU(" };
    function womanUnit(st) {
      var z = st.w[0] * sg + st.w[1] * sb + st.b, a = NeuronLab.ACTS[st.activation].f(z);
      setText("un-eq-g", G[st.activation]);
      setText("un-eq-wg", st.w[0].toFixed(2)); setText("un-eq-wb", st.w[1].toFixed(2)); setText("un-eq-b", Kit.fmt(st.b, 2));
      setText("un-eq-out", Kit.fmt(a, 2));
    }
    var uo = {
      inputs: [{ name: "glucose, mg/dL", min: 40, max: 200, value: WA[0], digits: 0 }, { name: "BMI, kg/m²", min: 15, max: 55, value: WA[1], digits: 1 }],
      scale: { mean: [mg[0], mb[0]], sd: [mg[1], mb[1]] }, weights: [1.5, 0.8], bias: -1, activation: "relu", wRange: 4, bRange: 6, eta: 0.5,
      points: D.train.map(function (i) { return { x: [D.g[i], D.b[i]], y: D.y[i] }; }), classNames: ["no diabetes", "had diabetes"], probe: WA,
      notes: {
        none: "No activation: the output is the weighted sum itself, so the unit is a straight-line fit to the labels 0 and 1.",
        step: "Step: the output is 1 when the weighted sum is 0 or more, and 0 otherwise.",
        sigmoid: "Sigmoid: the output is a number between 0 and 1. With this activation the unit is a logistic regression.",
        tanh: "tanh: like the sigmoid, but the output runs from −1 to 1 and is 0 when the weighted sum is 0.",
        relu: "ReLU: the output is the weighted sum when it is positive and 0 otherwise, so half of the plane is flat. The deployed network uses ReLU.",
        gelu: "GELU: a smooth version of ReLU, with a small dip below zero."
      },
      onChange: womanUnit
    };
    // The starred input is Woman A until the reader moves it.
    Object.defineProperty(uo, "probeLabel", { enumerable: true, get: function () {
      var x = unit ? unit.get().x : WA;
      return Math.abs(x[0] - WA[0]) < 0.5 && Math.abs(x[1] - WA[1]) < 0.06 ? "Woman A" : "Your input";
    } });
    unit = NeuronLab.mount($("un-lab"), uo);
    var back = $("un-back");
    if (back) { back.hidden = false; back.addEventListener("click", function () { unit.set({ x: WA.slice() }); }); }
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
      setText("co-eq-tp", tp); setText("co-eq-tp2", tp); setText("co-eq-fn", fn); setText("co-eq-sens", pct(tp / (tp + fn)));
      setText("co-eq-tn", tn); setText("co-eq-tn2", tn); setText("co-eq-fp", fp); setText("co-eq-spec", pct(tn / (tn + fp)));
      note.textContent = "Sensitivity " + pct(tp / (tp + fn)) + ": caught " + tp + " of the " + (tp + fn) + " women with diabetes. Specificity " + pct(tn / (tn + fp)) + ": cleared " + tn + " of the " + (tn + fp) + " without. Accuracy " + pct((tp + tn) / D.held.length) + ".";
    }
    cut.addEventListener("input", update);
    build();
    var W = P.W;
    window.addEventListener("resize", debounce(function () { if (width(svg) !== W) { build(); W = P.W; } }));
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

  // ---------- 8. one prediction through the deployed network ----------

  // Three held-out women: A had diabetes and is caught, B had none and is cleared, C had diabetes and is missed.
  var WOMEN = [[A, "Woman A"], [30, "Woman B"], [23, "Woman C"]];

  function network(D) {
    var svg = $("nt-svg"), note = $("nt-note"), W = 0, G = null, M = null, R = null, U = null, who = 0, p = 0, raf = 0, seen = false;
    var ORDER = ["Glucose", "BMI", "BloodPressure", "SkinThickness", "Insulin", "DiabetesPedigreeFunction", "Age", "Pregnancies"];
    var LAB = { Glucose: "glucose", BMI: "BMI", BloodPressure: "blood pressure", SkinThickness: "skin fold", Insulin: "insulin", DiabetesPedigreeFunction: "pedigree", Age: "age", Pregnancies: "pregnancies" };
    if (typeof DiabetesNet === "undefined") return;
    chips($("nt-views"), WOMEN.map(function (w) { return w[1]; }), 0, function (i) { who = i; go(true); });
    $("nt-run").addEventListener("click", function () { go(true); });
    function input(i) { var v = {}; D.features.forEach(function (f, j) { v[f] = D.X[i][j]; }); return v; }
    function fmt(v) { return v === Math.round(v) ? String(v) : String(Math.round(v * 1000) / 1000); }
    // Run the network on all 768 women once. Draw the units that switch on for about half of the women,
    // so a drawn layer looks like the whole layer, and scale a unit's fill by its largest output.
    function prep() {
      var runs = D.X.map(function (r, i) { return DiabetesNet.run(M, input(i)); });
      function pick(key, n) {
        var u = [];
        for (var j = 0; j < runs[0][key].length; j++) {
          var on = 0, mx = 0;
          runs.forEach(function (r) { var v = r[key][j]; if (v > 0) on++; if (v > mx) mx = v; });
          var rate = on / runs.length; u.push([j, rate * (1 - rate), mx]);
        }
        return u.sort(function (a, b) { return b[1] - a[1]; }).slice(0, n).sort(function (a, b) { return a[0] - b[0]; });
      }
      U = { h1: pick("h1", 10), h2: pick("h2", 8) };
    }
    function build() {
      clear(svg);
      W = width(svg);
      var narrow = W < 560, H = narrow ? 330 : 360, top = 36, bot = 50;
      var lab = narrow ? 112 : 168, right = narrow ? 58 : 130, x0 = lab + 8, s = (W - right - x0) / 3;
      var xs = [x0, x0 + s, x0 + 2 * s, x0 + 3 * s], n = [8, U.h1.length, U.h2.length, 1];
      var ys = n.map(function (k) {
        var span = Math.min(H - top - bot, (k - 1) * 32), y0 = top + (H - top - bot - span) / 2, a = [];
        for (var i = 0; i < k; i++) a.push(k === 1 ? top + (H - top - bot) / 2 : y0 + span * i / (k - 1));
        return a;
      });
      G = { nodes: [[], [], [], []], wires: [[], [], []], names: [] };
      for (var c = 0; c < 3; c++) ys[c].forEach(function (ya, a) {
        ys[c + 1].forEach(function (yb) { G.wires[c].push([el("line", { x1: xs[c], y1: ya, x2: xs[c + 1], y2: yb, "stroke-width": 1.2 }, svg), a]); });
      });
      (narrow ? ["inputs", "layer 1", "layer 2", "score"] : ["8 inputs", "layer 1", "layer 2", "score"]).forEach(function (h, c) {
        text(svg, xs[c], 16, h, { "text-anchor": "middle", "font-size": 13, "font-weight": 600, style: "fill:var(--ink)" });
      });
      ORDER.forEach(function (f, i) {
        var y = ys[0][i];
        G.nodes[0].push(i >= 6 ? el("rect", { x: xs[0] - 7, y: y - 7, width: 14, height: 14, rx: 2 }, svg) : el("circle", { cx: xs[0], cy: y, r: 7 }, svg));
        G.names.push(text(svg, lab - 4, y + 4, "", { "text-anchor": "end", "font-size": 12.5, style: "fill:var(--ink-2)" }));
      });
      [1, 2].forEach(function (c) { ys[c].forEach(function (y) { G.nodes[c].push(el("circle", { cx: xs[c], cy: y, r: 8 }, svg)); }); });
      G.nodes[3].push(el("circle", { cx: xs[3], cy: ys[3][0], r: 13 }, svg));
      G.on = [1, 2].map(function (c) { return text(svg, xs[c], H - bot + 22 + (narrow && c === 2 ? 17 : 0), "", { "text-anchor": "middle", "font-size": 12.5, style: "fill:var(--ink-2)" }); });
      G.drawn = [1, 2].map(function (c) { return text(svg, xs[c], H - bot + 38, narrow ? "" : (c === 1 ? "showing 10 of 200" : "showing 8 of 100"), { "text-anchor": "middle", "font-size": 11.5, style: "fill:var(--muted)" }); });
      G.score = text(svg, xs[3] + (narrow ? 0 : 20), ys[3][0] + (narrow ? 34 : 6), "", { "text-anchor": narrow ? "middle" : "start", "font-size": 17, "font-weight": 600, style: "fill:var(--ink)" });
      G.call = text(svg, xs[3] + (narrow ? 0 : 20), ys[3][0] + (narrow ? 50 : 24), "", { "text-anchor": narrow ? "middle" : "start", "font-size": 12, style: "fill:var(--ink-2)" });
      svg.setAttribute("viewBox", "0 0 " + W + " " + H);
      paint();
    }
    // p runs from 0 to 1: inputs light up, then layer 1, layer 2 and the score in turn.
    function stage(a, b) { return Math.max(0, Math.min(1, (p - a) / (b - a))); }
    function paint() {
      if (!G || !R) return;
      var q = [stage(0, 0.12), stage(0.12, 0.42), stage(0.42, 0.72), stage(0.72, 1)], v = input(WOMEN[who][0]);
      var act = [ORDER.map(function () { return 1; }), U.h1.map(function (u) { return R.h1[u[0]] / u[2]; }), U.h2.map(function (u) { return R.h2[u[0]] / u[2]; }), [1]];
      ORDER.forEach(function (f, i) { G.names[i].textContent = LAB[f] + " " + fmt(v[f]); });
      G.nodes.forEach(function (col, c) {
        col.forEach(function (nd, i) {
          var a = Math.min(1, act[c][i]);
          if (c === 0) nd.setAttribute("style", "fill:var(--" + (i >= 6 ? "sand" : "navy") + ");fill-opacity:" + (0.2 + 0.8 * q[0]).toFixed(2));
          else if (c === 3) nd.setAttribute("style", "fill:var(--coral);fill-opacity:" + (0.12 + 0.88 * q[3]).toFixed(2) + ";stroke:var(--coral)");
          else if (a > 0) nd.setAttribute("style", "fill:var(--teal);fill-opacity:" + (q[c] * (0.3 + 0.7 * a)).toFixed(2) + ";stroke:var(--teal);stroke-width:1.5;stroke-opacity:" + (0.35 + 0.65 * q[c]).toFixed(2));
          else nd.setAttribute("style", "fill:var(--paper);stroke:var(--muted);stroke-width:1.5;stroke-opacity:0.6");
        });
      });
      G.wires.forEach(function (ws, c) {
        var t = q[c + 1], pulse = Math.sin(Math.PI * t);
        ws.forEach(function (w) {
          var live = c === 0 || act[c][w[1]] > 0;
          w[0].setAttribute("style", live ? "stroke:var(--teal);stroke-opacity:" + (0.08 + 0.55 * pulse + 0.12 * t).toFixed(2) : "stroke:var(--muted);stroke-opacity:0.07");
        });
      });
      var on1 = R.h1.filter(function (x) { return x > 0; }).length, on2 = R.h2.filter(function (x) { return x > 0; }).length;
      G.on[0].textContent = q[1] > 0 ? on1 + " of 200 on" : "200 units";
      G.on[1].textContent = q[2] > 0 ? on2 + " of 100 on" : "100 units";
      G.score.textContent = q[3] > 0 ? (R.score * q[3]).toFixed(3) : "";
      G.call.textContent = q[3] >= 1 ? (R.score > 0.5 ? "above 0.5: yes" : "below 0.5: no") : "";
    }
    function story() {
      var i = WOMEN[who][0], y = D.y[i], s = R.score, call = s > 0.5;
      var on1 = R.h1.filter(function (x) { return x > 0; }).length, on2 = R.h2.filter(function (x) { return x > 0; }).length;
      note.textContent = WOMEN[who][1] + (y ? " had diabetes." : " did not have diabetes.") + " The network gives her " + s.toFixed(3) + ", " + (call ? "above" : "below") + " the 0.5 cut-off, so it " +
        (call === Boolean(y) ? (call ? "catches her." : "clears her.") : (call ? "raises a false alarm." : "misses her.")) + " ReLU switched on " + on1 + " of the 200 units in layer 1 and " + on2 + " of the 100 in layer 2.";
      setText("nt-eq-z", R.logit.toFixed(2)); setText("nt-eq-score", s.toFixed(3));
      setText("nt-eq-s2", s.toFixed(3)); setText("nt-eq-y", y); setText("nt-eq-err", Math.pow(s - y, 2).toFixed(3));
    }
    // Played on request even with reduced motion; it starts by itself only when motion is welcome.
    function go(animate) {
      if (!M) return;
      seen = true;
      R = DiabetesNet.run(M, input(WOMEN[who][0]));
      story();
      cancelAnimationFrame(raf);
      if (!animate) { p = 1; paint(); return; }
      var t0 = 0;
      raf = requestAnimationFrame(function f(ts) {
        if (!t0) t0 = ts;
        p = Math.min(1, (ts - t0) / 2800);
        paint();
        if (p < 1) raf = requestAnimationFrame(f);
      });
    }
    fetch("../model.json?v=5").then(function (r) { return r.json(); }).then(function (m) {
      M = m; prep();
      R = DiabetesNet.run(M, input(WOMEN[who][0]));
      story(); p = reduce ? 1 : 0; build();
      if ("IntersectionObserver" in window && !reduce) new IntersectionObserver(function (es, io) {
        if (es[0].isIntersecting && !seen) { seen = true; go(true); io.disconnect(); }
      }, { threshold: 0.45 }).observe(svg);
      else p = 1, paint();
    });
    window.addEventListener("resize", debounce(function () { if (G && width(svg) !== W) build(); }));
  }

  // ---------- 10. split counts against the shuffle test ----------

  function splitCounts(X) {
    var svg = $("ct-svg"), W = 0;
    var NAME = { Pregnancies: "pregnancies", Glucose: "glucose", BloodPressure: "blood pressure", SkinThickness: "skin fold", Insulin: "insulin", BMI: "BMI", DiabetesPedigreeFunction: "pedigree", Age: "age" };
    var rows = X.features.slice().sort(function (a, b) { return X.weight[b] - X.weight[a]; });
    var mw = Math.max.apply(null, rows.map(function (f) { return X.weight[f]; }));
    function build() {
      clear(svg);
      W = width(svg);
      var narrow = W < 560, lab = narrow ? 96 : 124, gap = 20, rh = 28, top = 30, H = top + rows.length * rh + 6;
      var pw = (W - lab - gap) / 2, x1 = lab, x2 = lab + pw + gap;
      text(svg, x1, 14, narrow ? "times asked" : "times the trees ask about it", { "font-size": 13, "font-weight": 600, style: "fill:var(--ink)" });
      text(svg, x2, 14, narrow ? "accuracy lost" : "accuracy lost when shuffled", { "font-size": 13, "font-weight": 600, style: "fill:var(--ink)" });
      rows.forEach(function (f, r) {
        var y = top + r * rh, hl = f === "BloodPressure" || f === "Insulin";
        if (hl) el("rect", { x: 0, y: y - 5, width: W, height: rh - 2, rx: 4, style: "fill:var(--mark)" }, svg);
        text(svg, lab - 10, y + 13, NAME[f], { "text-anchor": "end", "font-size": 13.5, "font-weight": hl ? 600 : 400, style: "fill:var(--ink)" });
        var b1 = (pw - 44) * X.weight[f] / mw;
        el("rect", { x: x1, y: y, width: b1.toFixed(1), height: rh - 12, rx: 2, style: "fill:var(--navy);fill-opacity:0.85" }, svg);
        text(svg, x1 + b1 + 5, y + 13, String(X.weight[f]), { "font-size": 12.5, style: "fill:var(--ink-2)" });
        var p = Math.max(0, X.perm[f][0]), b2 = (pw - 64) * p / 0.19;
        if (p > 0.0005) el("rect", { x: x2, y: y, width: b2.toFixed(1), height: rh - 12, rx: 2, style: "fill:var(--coral);fill-opacity:0.85" }, svg);
        text(svg, x2 + b2 + 5, y + 13, p > 0.0005 ? (100 * p).toFixed(1) + " pts" : "0", { "font-size": 12.5, style: "fill:var(--ink-2)" });
      });
      [x1, x2].forEach(function (x) { el("line", { x1: x, x2: x, y1: top - 6, y2: H - 4, style: "stroke:var(--ink-2)" }, svg); });
      svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    }
    build();
    window.addEventListener("resize", debounce(function () { if (width(svg) !== W) build(); }));
  }

  // ---------- 12. zeros that mean "not measured" ----------

  function zeros(D) {
    var svg = $("zr-svg"), W = 0, n = D.y.length;
    var cols = [["Insulin", "insulin"], ["SkinThickness", "skin fold"], ["BloodPressure", "blood pressure"], ["BMI", "BMI"], ["Glucose", "glucose"]];
    var z = cols.map(function (c) { var j = D.features.indexOf(c[0]); return D.X.filter(function (r) { return r[j] === 0; }).length; });
    function build() {
      clear(svg);
      W = width(svg);
      var narrow = W < 560, lab = narrow ? 96 : 124, rh = 30, top = 24, H = top + cols.length * rh + 4, pw = W - lab - (narrow ? 104 : 150);
      text(svg, lab, 14, "women with a zero recorded, out of " + n, { "font-size": 13, "font-weight": 600, style: "fill:var(--ink)" });
      cols.forEach(function (c, r) {
        var y = top + r * rh, w = pw * z[r] / n;
        text(svg, lab - 10, y + 14, c[1], { "text-anchor": "end", "font-size": 13.5, style: "fill:var(--ink)" });
        el("rect", { x: lab, y: y + 2, width: pw.toFixed(1), height: rh - 12, rx: 2, style: "fill:var(--rule)" }, svg);
        el("rect", { x: lab, y: y + 2, width: Math.max(2, w).toFixed(1), height: rh - 12, rx: 2, style: "fill:var(--coral);fill-opacity:0.85" }, svg);
        text(svg, lab + pw + 8, y + 14, z[r] + " (" + Math.round(100 * z[r] / n) + "%)", { "font-size": 12.5, style: "fill:var(--ink-2)" });
      });
      svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    }
    build();
    window.addEventListener("resize", debounce(function () { if (width(svg) !== W) build(); }));
  }

  // ---------- the warm-up quiz, asked again at the end ----------

  var QUIZ = [
    { q: "A model is right about nearly all the women it trained on. What does that tell you about new women?",
      o: ["It will be right about nearly all of them too.", "Little. You need to grade it on women it never saw.", "It will be right about half of them."],
      a: 1, why: "The model has seen the answers for its training women, so its score there is too kind. A depth-12 tree on glucose and BMI is right about 93% of its training women and 73% of the held-out women.", link: "#depth" },
    { q: "After training, what does the model keep?",
      o: ["A copy of the 768 women, which it searches for the closest match.", "Rules that a programmer wrote by hand.", "A set of numbers, such as cut-offs and weights, tuned on those women."],
      a: 2, why: "Training tunes numbers: the questions and cut-offs of the trees, or the weights of the network. The women are not stored in the model.", link: "#tree" },
    { q: "You type your measurements into the app. What happens to the model?",
      o: ["Its numbers stay fixed. It computes your score and changes only if someone retrains it.", "It learns from your numbers and improves.", "It adds you to the women it compares new people with."],
      a: 0, why: "Training finished before the app went online. The model's 27,452 numbers stay the same whatever you type.", link: "#network" },
    { q: "The trees ask about blood pressure 52 times. What does that tell you?",
      o: ["Blood pressure is one of the most important inputs.", "Only that the trees ask about it often. Its effect on the calls could still be small.", "High blood pressure causes diabetes."],
      a: 1, why: "Shuffling blood pressure costs the model no accuracy, so its 52 questions change almost no calls. A count of questions measures habit.", link: "#count" }
  ];

  function quiz() {
    var KEY = "dm-primer-warmup", pre = {}, post = [];
    try { pre = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { pre = {}; }
    function save() { try { localStorage.setItem(KEY, JSON.stringify(pre)); } catch (e) { /* private window */ } }
    function render(box, late) {
      if (!box) return;
      QUIZ.forEach(function (Q, i) {
        var fs = document.createElement("fieldset"), lg = document.createElement("legend"), fb = document.createElement("p"), labs = [];
        lg.textContent = (i + 1) + ". " + Q.q;
        fs.appendChild(lg);
        fb.className = "fb"; fb.setAttribute("aria-live", "polite");
        Q.o.forEach(function (o, j) {
          var lab = document.createElement("label"), inp = document.createElement("input"), was = document.createElement("span");
          inp.type = "radio"; inp.name = (late ? "post" : "pre") + i; inp.value = j;
          if (!late && pre[i] === j) inp.checked = true;
          was.className = "was";
          lab.appendChild(inp); lab.appendChild(document.createTextNode(" " + o)); lab.appendChild(was);
          inp.addEventListener("change", function () {
            if (!late) { pre[i] = j; save(); mark(); return; }
            labs.forEach(function (l, m) { l.classList.toggle("ok", m === Q.a); l.classList.toggle("no", m === j && j !== Q.a); });
            fb.innerHTML = "<b>" + (j === Q.a ? "Right." : "Not quite.") + "</b> " + Q.why + " <a href=\"" + Q.link + "\">Back to that section</a>";
          });
          fs.appendChild(lab); labs.push(lab);
        });
        fs.appendChild(fb);
        box.appendChild(fs);
        if (late) post.push(labs);
      });
    }
    function mark() {
      post.forEach(function (labs, i) { labs.forEach(function (l, j) { l.querySelector(".was").textContent = pre[i] === j ? " (your warm-up pick)" : ""; }); });
    }
    render($("pre-quiz"), false);
    render($("post-quiz"), true);
    mark();
  }

  // ---------- 4. rebuild the tree from memory ----------

  function redraw() {
    var box = $("rd");
    if (!box) return;
    var BANK = ["a question with a cut-off", "a leaf that makes the call", "the depth", "the base rate", "a weight"];
    var CALL = ["most of its training women had diabetes", "a programmer decided it", "the newest woman in it had diabetes"];
    var ITEMS = [["the top box", BANK, 0], ["the two middle boxes", BANK, 0], ["the four bottom boxes", BANK, 1], ["the bracket on the right", BANK, 2], ["A leaf calls diabetes when", CALL, 0]];
    var svg = el("svg", { viewBox: "0 0 560 210", role: "img", "aria-label": "A tree skeleton with numbered blanks" }, box);
    var nodes = [[280, 24], [160, 98], [400, 98], [100, 172], [220, 172], [340, 172], [460, 172]];
    [[0, 1, "yes"], [0, 2, "no"], [1, 3, "yes"], [1, 4, "no"], [2, 5, "yes"], [2, 6, "no"]].forEach(function (e) {
      var a = nodes[e[0]], b = nodes[e[1]];
      el("line", { x1: a[0], y1: a[1] + 14, x2: b[0], y2: b[1] - 14, style: "stroke:var(--muted)" }, svg);
      text(svg, (a[0] + b[0]) / 2 + (b[0] < a[0] ? -16 : 16), (a[1] + b[1]) / 2 + 4, e[2], { "text-anchor": "middle", "font-size": 12, style: "fill:var(--muted)" });
    });
    nodes.forEach(function (p, i) {
      var tag = i === 0 ? 1 : i < 3 ? 2 : 3;
      el("rect", { x: p[0] - 46, y: p[1] - 14, width: 92, height: 28, rx: 5, style: "fill:var(--paper);stroke:var(--ink-2)", "stroke-dasharray": "4 3" }, svg);
      el("circle", { cx: p[0], cy: p[1], r: 10, style: "fill:var(--teal)" }, svg);
      text(svg, p[0], p[1] + 4.5, String(tag), { "text-anchor": "middle", "font-size": 13, "font-weight": 600, style: "fill:var(--bg)" });
    });
    el("path", { d: "M528 10 H536 V112 H528", style: "fill:none;stroke:var(--ink-2)" }, svg);
    el("circle", { cx: 548, cy: 61, r: 10, style: "fill:var(--teal)" }, svg);
    text(svg, 548, 65.5, "4", { "text-anchor": "middle", "font-size": 13, "font-weight": 600, style: "fill:var(--bg)" });
    var bank = document.createElement("p");
    bank.className = "note";
    bank.textContent = "Word bank: " + BANK.join(" · ");
    box.appendChild(bank);
    var list = document.createElement("div"), sels = [];
    list.className = "rd-list";
    ITEMS.forEach(function (it, i) {
      var lab = document.createElement("label"), sel = document.createElement("select"), res = document.createElement("span");
      var none = document.createElement("option"); none.value = ""; none.textContent = "choose";
      sel.appendChild(none);
      it[1].forEach(function (w, j) { var o = document.createElement("option"); o.value = j; o.textContent = w; sel.appendChild(o); });
      res.className = "res";
      lab.appendChild(document.createTextNode((i + 1) + ". " + it[0] + (i === 1 || i === 2 ? " are" : i < 4 ? " is" : "") + " "));
      lab.appendChild(sel); lab.appendChild(res);
      list.appendChild(lab); sels.push([sel, res, it[2]]);
    });
    box.appendChild(list);
    var btn = document.createElement("button"), out = document.createElement("span");
    btn.type = "button"; btn.className = "btn"; btn.textContent = "Check";
    out.className = "status"; out.setAttribute("aria-live", "polite");
    btn.addEventListener("click", function () {
      var ok = 0;
      sels.forEach(function (s) {
        var right = s[0].value !== "" && Number(s[0].value) === s[2];
        if (right) ok++;
        s[1].textContent = s[0].value === "" ? "" : right ? " ✓ right" : " ✗ try again";
        s[1].className = "res " + (right ? "ok" : "no");
      });
      out.textContent = " Right: " + ok + " of " + sels.length + ".";
    });
    var bar = document.createElement("div"); bar.className = "bar"; bar.appendChild(btn); bar.appendChild(out);
    box.appendChild(bar);
  }

  // These two need no data, and run after QUIZ is defined.
  quiz(); redraw();
})();
