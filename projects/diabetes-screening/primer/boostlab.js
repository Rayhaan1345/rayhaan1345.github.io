/* BoostLab: figures for random forests, boosting, XGBoost-style importance and SHAP values.
 * Copied from mailab.in/primer/a6-boosting/boostlab.js for the diabetes primer. Local changes, marked LOCAL below:
 *   - mountBoundary takes objective: "squared" (trees fitted to the gap between label and score, scores not squashed),
 *     which is how the project's XGBoost model works; the default stays "logistic".
 *   - option `mark` ({x: [v1, v2], label, name}) draws one starred, labelled point on the heat map of mountBoundary.
 *   - mount1D can follow a probe row that is not a training row (the ring on the left-over plot and the name in the equation boxes).
 *
 *
 * Needs: Kit (primer/assets/kit.js), Plotly (a bundle with heatmap and contour), D3 v7. Free of chapter text:
 * phrases that name the data come from the options. The pure logic (core) also runs in Node: require("./boostlab.js").core
 *
 * Common options for the figures that take rows
 *   rows         array of objects, one per example
 *   features     [key1, key2]      two numeric columns (the axes)
 *   featureLabels, featureNames, units, label, classNames, noun, nouns, heldOut, ranges, ids, idLabel, digits
 *                (same meaning as in TreeLab; see treelab.js)
 *   footnote     text shown under the figure
 *   mark         LOCAL: {x: [v1, v2], label: "A", name: "Woman A"}, one starred point on the heat map of mountBoundary
 *   onChange     function (info) called after every change (optional)
 *   Pima example: build rows as in treelab.js (Glucose and BMI, label y, heldOut r.test === 1) and call BoostLab.mountBoundary(el, {rows: rows, features: ["Glucose", "BMI"], label: "y", ranges: [[40, 205], [15, 70]], maxTrees: 100, eta: 0.1, depth: 3, lambda: 1, ...}).
 *   grid         [nx, ny] cells of the heat map (default [64, 52])
 *
 * BoostLab.mount1D(el, opts)        boosting on residuals for one input and a number: stumps added one at a time
 *     rows, x (key), y (key), xLabel, yLabel, xUnit, yUnit, heldOut, law (function x => y, optional), xMin, xMax, yMax,
 *     probes [{name, row}] (rows shown in the equation boxes), maxTrees (default 100), eta (0.3), depth (1), lambda (0)
 * BoostLab.mountBoundary(el, opts)  boosted trees on two inputs and a yes/no label: a heat map that sharpens as trees are added
 *     extra: maxTrees (300), eta (0.1), depth (3), lambda (1), reference {label, held} (a number shown for comparison),
 *     objective (LOCAL: "logistic" by default, or "squared": scores start at the training average, colour is the raw score, accuracy uses the 0.5 cut-off)
 * BoostLab.mountForest(el, opts)    a random forest vote on two inputs: heat map of the vote share, click a point to see the votes
 *     extra: trees (100), depth (3), seed (4127)
 * BoostLab.mountLeaf(el, opts)      the regularised leaf value: sum of residuals over (count + lambda), for leaves of different sizes
 *     extra: leaves [{n, sum}], unit
 * BoostLab.mountImportance(el, opts) four importance measures side by side and a live shuffle test
 *     model (object loaded from the exported JSON: features, base_margin, trees, importance, rows), featureLabels (names to show),
 *     units, classNames, hot (feature key to point at)
 * BoostLab.mountWaterfall(el, opts)  SHAP waterfall of one example, the one-order view, and the 720-orders strip
 *     model, featureLabels, units, picks [{name, id}] (ids of rows in model.rows), classNames, noun
 *
 * Exported JSON model (written by make_a6.py): {features, base_margin, trees: [{f, t, l, r, v, c}], importance, rows: [{id, x, y, shap, bias, margin}]}.
 * A node goes left when float32(x[f]) < t, as in XGBoost. v holds the leaf value with the learning rate already applied; c is the cover.
 */
var BoostLab = (function () {
  "use strict";

  /* ======================================================================
     Core: pure functions, no DOM
     ====================================================================== */
  var core = {};
  function sigmoid(z) { return 1 / (1 + Math.exp(-z)); }
  core.sigmoid = sigmoid;

  // ---- XGBoost-style boosting (greedy over all cuts, second-order). cols: array of columns, y: 0/1 or numbers.
  // opts: objective "squared" | "logistic", rounds, eta, depth, lambda, gamma (0), minChild (1), idx (rows to train on)
  core.train = function (cols, y, o) {
    var d = cols.length, idx = o.idx || y.map(function (v, i) { return i; }), n = y.length, lam = o.lambda == null ? 1 : o.lambda;
    var gamma = o.gamma || 0, minChild = o.minChild == null ? 1 : o.minChild, depth = o.depth || 1, eta = o.eta == null ? 0.3 : o.eta;
    var logistic = o.objective === "logistic", m = idx.length, mean = 0, i, k;
    for (k = 0; k < m; k++) mean += y[idx[k]];
    mean /= m;
    var base = o.base != null ? o.base : (logistic ? Math.log(mean / (1 - mean)) : mean);
    var F = new Float64Array(n), g = new Float64Array(n), h = new Float64Array(n);
    for (i = 0; i < n; i++) F[i] = base;
    // global sort order of the training rows by feature
    var order = cols.map(function (c) { return idx.slice().sort(function (a, b) { return c[a] - c[b] || a - b; }); });
    var member = new Uint8Array(n), model = { base: base, eta: eta, trees: [], objective: o.objective, lambda: lam, depth: depth };
    var history = [];
    function stats() {
      var loss = 0, wrong = 0;
      for (var q = 0; q < m; q++) {
        var j = idx[q];
        if (logistic) { var p = sigmoid(F[j]); loss += -(y[j] ? Math.log(Math.max(p, 1e-12)) : Math.log(Math.max(1 - p, 1e-12))); if ((p > 0.5 ? 1 : 0) !== y[j]) wrong++; }
        else { var e = F[j] - y[j]; loss += e * e; }
      }
      return logistic ? { loss: loss / m, acc: 1 - wrong / m } : { loss: Math.sqrt(loss / m) };
    }
    history.push(stats());
    for (var r = 0; r < o.rounds; r++) {
      for (k = 0; k < m; k++) {
        i = idx[k];
        if (logistic) { var p2 = sigmoid(F[i]); g[i] = p2 - y[i]; h[i] = Math.max(p2 * (1 - p2), 1e-16); } else { g[i] = F[i] - y[i]; h[i] = 1; }
      }
      var tree = { f: [], t: [], l: [], r: [], v: [], c: [], n: [] };
      // build recursively; rows of a node are given as a list
      (function build(rows, dep) {
        var id = tree.f.length, G = 0, Hh = 0, q;
        for (q = 0; q < rows.length; q++) { G += g[rows[q]]; Hh += h[rows[q]]; }
        tree.f.push(-1); tree.t.push(0); tree.l.push(-1); tree.r.push(-1); tree.v.push(-eta * G / (Hh + lam)); tree.c.push(Hh); tree.n.push(rows.length);
        if (dep >= depth || rows.length < 2) return id;
        for (q = 0; q < rows.length; q++) member[rows[q]] = 1;
        var best = null, parent = G * G / (Hh + lam);
        for (var f = 0; f < d; f++) {
          var col = cols[f], GL = 0, HL = 0, prev = -1;
          for (q = 0; q < order[f].length; q++) {
            var j = order[f][q];
            if (!member[j]) continue;
            if (prev >= 0 && col[j] !== col[prev]) {
              var GR = G - GL, HR = Hh - HL;
              if (HL >= minChild && HR >= minChild) {
                var gain = 0.5 * (GL * GL / (HL + lam) + GR * GR / (HR + lam) - parent) - gamma;
                if (gain > 1e-5 && (!best || gain > best.gain)) best = { gain: gain, f: f, t: Math.fround(Math.fround(col[prev]) + Math.fround(col[j])) * 0.5 };
              }
            }
            GL += g[j]; HL += h[j]; prev = j;
          }
        }
        for (q = 0; q < rows.length; q++) member[rows[q]] = 0;
        if (!best) return id;
        var L = [], R = [];
        rows.forEach(function (j) { (Math.fround(cols[best.f][j]) < best.t ? L : R).push(j); });
        if (!L.length || !R.length) return id;
        tree.f[id] = best.f; tree.t[id] = best.t;
        tree.l[id] = build(L, dep + 1); tree.r[id] = build(R, dep + 1);
        return id;
      })(idx, 0);
      model.trees.push(tree);
      for (i = 0; i < n; i++) F[i] += core.treeOut(tree, cols, i, false, true);
      history.push(stats());
    }
    model.history = history;
    return model;
  };
  // Output of one tree for row i of a column set, or for a vector x when cols is null.
  core.treeOut = function (tree, cols, i, isVec, fr) {
    var nd = 0;
    while (tree.f[nd] >= 0) {
      var v = isVec ? cols[tree.f[nd]] : cols[tree.f[nd]][i];
      if (fr) v = Math.fround(v);
      nd = v < tree.t[nd] ? tree.l[nd] : tree.r[nd];
    }
    return tree.v[nd];
  };
  // Margin of a model after k trees for a vector x (array of feature values).
  core.margin = function (model, x, k, fr) {
    var s = model.base, K = k == null ? model.trees.length : k;
    for (var q = 0; q < K; q++) s += core.treeOut(model.trees[q], x, 0, true, fr !== false);
    return s;
  };
  core.leafId = function (tree, x) {
    var nd = 0; while (tree.f[nd] >= 0) nd = Math.fround(x[tree.f[nd]]) < tree.t[nd] ? tree.l[nd] : tree.r[nd];
    return nd;
  };

  // ---- random forest: classification trees on bootstrap samples, one random feature tried first at a split
  core.forestTree = function (cols, y, idx, depth, rng) {
    var tree = { f: [], t: [], l: [], r: [], p: [] };
    function gini(a, b) { var n = a + b; return n ? 1 - (a / n) * (a / n) - (b / n) * (b / n) : 0; }
    function cut(f, rows) {
      var col = cols[f], o = rows.slice().sort(function (a, b) { return col[a] - col[b] || a - b; }), n = o.length, tot1 = 0, i;
      for (i = 0; i < n; i++) tot1 += y[o[i]];
      var l1 = 0, best = null;
      for (i = 0; i < n - 1; i++) {
        l1 += y[o[i]];
        if (col[o[i]] === col[o[i + 1]]) continue;
        var nl = i + 1, s = (nl * gini(nl - l1, l1) + (n - nl) * gini(n - nl - (tot1 - l1), tot1 - l1)) / n;
        if (!best || s < best.s) best = { s: s, t: (col[o[i]] + col[o[i + 1]]) / 2 };
      }
      return best;
    }
    (function build(rows, dep) {
      var id = tree.f.length, n1 = 0;
      rows.forEach(function (j) { n1 += y[j]; });
      tree.f.push(-1); tree.t.push(0); tree.l.push(-1); tree.r.push(-1); tree.p.push(rows.length ? n1 / rows.length : 0);
      if (dep >= depth || n1 === 0 || n1 === rows.length) return id;
      var feats = cols.map(function (c, k) { return k; }), first = Math.floor(rng() * feats.length);
      feats = [feats[first]].concat(feats.filter(function (k) { return k !== feats[first]; }));
      var best = null;
      for (var q = 0; q < feats.length && !best; q++) { var c = cut(feats[q], rows); if (c) best = { f: feats[q], t: c.t }; }
      if (!best) return id;
      var L = [], R = [];
      rows.forEach(function (j) { (cols[best.f][j] <= best.t ? L : R).push(j); });
      tree.f[id] = best.f; tree.t[id] = best.t; tree.l[id] = build(L, dep + 1); tree.r[id] = build(R, dep + 1);
      return id;
    })(idx, 0);
    return tree;
  };
  core.forestPredict = function (tree, x) {
    var nd = 0; while (tree.f[nd] >= 0) nd = x[tree.f[nd]] <= tree.t[nd] ? tree.l[nd] : tree.r[nd];
    return tree.p[nd] > 0.5 ? 1 : 0;
  };

  // ---- SHAP values by enumeration. The value of a set S of known features is the model's margin when the
  // trees follow x for features in S and split their weight by cover (training share) for the others.
  function treeExpect(tree, x, inS, nd) {
    var f = tree.f[nd];
    if (f < 0) return tree.v[nd];
    var l = tree.l[nd], r = tree.r[nd];
    if (inS[f]) return treeExpect(tree, x, inS, Math.fround(x[f]) < tree.t[nd] ? l : r);
    return (tree.c[l] * treeExpect(tree, x, inS, l) + tree.c[r] * treeExpect(tree, x, inS, r)) / tree.c[nd];
  }
  // Returns {v: array of 2^d set values (bit j set means feature j known), shap: [d], base, margin}.
  core.shap = function (model, x) {
    var d = x.length, nsub = 1 << d, v = new Float64Array(nsub), inS = new Array(d), S, j, t;
    for (S = 0; S < nsub; S++) {
      for (j = 0; j < d; j++) inS[j] = !!(S & (1 << j));
      var s = model.base_margin;
      for (t = 0; t < model.trees.length; t++) s += treeExpect(model.trees[t], x, inS, 0);
      v[S] = s;
    }
    var fact = [1]; for (j = 1; j <= d; j++) fact.push(fact[j - 1] * j);
    var shap = [];
    for (j = 0; j < d; j++) {
      var tot = 0;
      for (S = 0; S < nsub; S++) {
        if (S & (1 << j)) continue;
        var size = 0, q; for (q = 0; q < d; q++) if (S & (1 << q)) size++;
        tot += fact[size] * fact[d - size - 1] / fact[d] * (v[S | (1 << j)] - v[S]);
      }
      shap.push(tot);
    }
    return { v: v, shap: shap, base: v[0], margin: v[nsub - 1] };
  };
  // All orders of d features (as arrays), for d up to 7.
  core.orders = function (d) {
    var out = [];
    (function rec(cur, left) { if (!left.length) { out.push(cur); return; } left.forEach(function (f, i) { rec(cur.concat(f), left.slice(0, i).concat(left.slice(i + 1))); }); })([], Array.apply(null, Array(d)).map(function (_, i) { return i; }));
    return out;
  };
  // Steps of one order: increments of the set value as the features are revealed in that order.
  core.orderSteps = function (v, order) {
    var S = 0, steps = [];
    order.forEach(function (j) { var S2 = S | (1 << j); steps.push({ f: j, from: v[S], to: v[S2], d: v[S2] - v[S] }); S = S2; });
    return steps;
  };
  // Margin for a whole model on rows of feature vectors, with float32 comparisons (as in XGBoost).
  core.predictMargin = function (model, x) {
    var s = model.base_margin;
    for (var t = 0; t < model.trees.length; t++) s += core.treeOut(model.trees[t], x, 0, true, true);
    return s;
  };
  // Deterministic shuffle helper for the shuffle test.
  core.permute = function (arr, rng) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  };

  /* ======================================================================
     Small helpers for the views
     ====================================================================== */
  var counter = 0;
  function uid(p) { counter += 1; return (p || "bl") + counter; }
  function trim(v, d) { var s = (+v).toFixed(d == null ? 2 : d); if (s.indexOf(".") >= 0) s = s.replace(/0+$/, "").replace(/\.$/, ""); return s.replace("-", "−"); }
  function f2(v) { return Kit.fmt(v, 2); }
  function f3(v) { return Kit.fmt(v, 3); }
  function pc(v, d) { return isNaN(v) ? "n/a" : (100 * v).toFixed(d == null ? 1 : d) + "%"; }
  function rgbOf(c) {
    var m, c2 = String(c).trim();
    if ((m = /^#([0-9a-f]{3})$/i.exec(c2))) return [parseInt(m[1][0] + m[1][0], 16), parseInt(m[1][1] + m[1][1], 16), parseInt(m[1][2] + m[1][2], 16)];
    if ((m = /^#([0-9a-f]{6})/i.exec(c2))) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
    if ((m = /rgba?\(([^)]+)\)/.exec(c2))) { var q = m[1].split(","); return [+q[0], +q[1], +q[2]]; }
    return [128, 128, 128];
  }
  function rgba(c, a) { var r = rgbOf(c); return "rgba(" + r[0] + "," + r[1] + "," + r[2] + "," + a + ")"; }
  function mix(c1, c2, t) { var a = rgbOf(c1), b = rgbOf(c2); return "rgb(" + Math.round(a[0] + (b[0] - a[0]) * t) + "," + Math.round(a[1] + (b[1] - a[1]) * t) + "," + Math.round(a[2] + (b[2] - a[2]) * t) + ")"; }
  function H(tag, attrs, parent, text) { return Kit.html(tag, attrs, parent, text); }
  function eqBox(parent, cls, caption) { var s = H("span", { class: "t" + (cls ? " " + cls : "") }, parent), b = H("b", {}, s, ""); H("i", {}, s, caption || ""); return b; }
  function op(parent, text) { return H("span", { class: "op" }, parent, text); }
  function cap(b, t) { b.nextSibling.textContent = t; }
  function foot(el, opts) { if (opts.footnote) H("p", { class: "note" }, el, opts.footnote); }
  function styleAxis(P) { return function (g) { g.select(".domain").attr("stroke", P.muted); g.selectAll("line").attr("stroke", P.muted); g.selectAll("text").attr("fill", P.muted).attr("font-size", 11); }; }
  function playLoop(ms, step) {                     // returns {toggle, running, stop}
    var tm = 0, L = { running: false };
    L.stop = function () { clearInterval(tm); L.running = false; if (L.onStop) L.onStop(); };
    L.start = function () { L.running = true; tm = setInterval(function () { if (!step()) L.stop(); }, ms); };
    L.toggle = function () { if (L.running) L.stop(); else L.start(); };
    return L;
  }

  // LOCAL: one starred, labelled point.
  function markTrace(P, m) {
    return { type: "scatter", mode: "markers+text", x: [m.x[0]], y: [m.x[1]], text: [m.label || ""], textposition: "top right", textfont: { color: P.ink, size: 13 },
      hoverinfo: "skip", showlegend: false, marker: { symbol: "star", size: 16, color: P.teal, line: { color: P.ink, width: 1.6 } } };
  }
  function heatScale(P) { return [[0, mix(P.navy, P.bg, 0.15)], [0.25, mix(P.navy, P.bg, 0.62)], [0.5, P.bg], [0.75, mix(P.coral, P.bg, 0.62)], [1, mix(P.coral, P.bg, 0.15)]]; }

  var api = { core: core };
  /* ======================================================================
     Styles (added once)
     ====================================================================== */
  function injectCss() {
    if (document.getElementById("boostlab-css")) return;
    var s = document.createElement("style");
    s.id = "boostlab-css";
    s.textContent = [
      ".bl .bl-grid { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 14px 22px; align-items: start; }",
      ".bl .bl-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; margin: 0 0 10px; }",
      ".bl .bl-row .label { font-size: 14px; color: var(--muted); }",
      ".bl .bl-eq { margin: 12px 0 0; }",
      ".bl .bl-eq .row { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; margin: 8px 0; }",
      ".bl .bl-eq .row > .name { flex: 0 0 100%; font-size: 14px; color: var(--muted); }",
      ".bl .bl-eq .eqn { margin: 0; }",
      ".bl .bl-h4 { margin: 0 0 2px; font-size: 14px; font-weight: 500; color: var(--muted); }",
      ".bl svg { height: auto; }",
      ".bl .bl-thumbs { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0 0; }",
      ".bl .bl-thumbs figure { margin: 0; text-align: center; font-size: 12.5px; color: var(--muted); }",
      ".bl .bl-thumbs canvas { display: block; width: 78px; height: 62px; border: 1px solid var(--rule); border-radius: 4px; }",
      ".bl .bl-votes { display: flex; flex-wrap: wrap; gap: 3px; margin: 8px 0 0; max-width: 100%; }",
      ".bl .bl-votes i { display: inline-block; width: 11px; height: 11px; border-radius: 2px; border: 2px solid var(--navy); background: transparent; box-sizing: border-box; }",
      ".bl .bl-votes i.y { background: var(--coral); border-color: var(--coral); }",
      ".bl .bl-imp { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 14px 18px; }",
      ".bl .bl-imp h4 { margin: 0 0 2px; font-size: 15px; font-weight: 600; color: var(--ink); }",
      ".bl .bl-imp p { margin: 0 0 4px; font-size: 13px; color: var(--muted); line-height: 1.35; }",
      ".bl table.bl-t { border-collapse: collapse; margin: 8px 0 0; font-size: 14.5px; font-feature-settings: \"tnum\" 1, \"lnum\" 1; }",
      ".bl table.bl-t th, .bl table.bl-t td { padding: 3px 12px; border-bottom: 1px solid var(--rule); text-align: right; }",
      ".bl table.bl-t th:first-child, .bl table.bl-t td:first-child { text-align: left; }",
      ".bl table.bl-t th { font-weight: 500; color: var(--muted); }",
      ".bl table.bl-t tr.on td { background: var(--mark); font-weight: 600; color: var(--ink); }",
      ".bl .bl-order { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin: 4px 0 8px; font-size: 14px; color: var(--ink-2); }",
      ".bl .bl-order span.chip { padding: 1px 9px; border: 1px solid var(--rule); border-radius: 999px; background: var(--bg); }",
      "@media (max-width: 760px) { .bl .bl-grid { grid-template-columns: minmax(0, 1fr); } }"
    ].join("\n");
    document.head.appendChild(s);
  }
  function stepOfTree(tree, lo, hi) {
    // The step function of one tree over one input: breakpoints x and values y (for a "hv" line).
    var th = [], i;
    for (i = 0; i < tree.f.length; i++) if (tree.f[i] >= 0) th.push(tree.t[i]);
    th.sort(function (a, b) { return a - b; });
    var edges = [lo].concat(th.filter(function (t) { return t > lo && t < hi; })).concat([hi]), xs = [], ys = [];
    for (i = 0; i + 1 < edges.length; i++) { xs.push(edges[i]); ys.push(core.treeOut(tree, [(edges[i] + edges[i + 1]) / 2], 0, true, true)); }
    xs.push(hi); ys.push(ys[ys.length - 1]);
    return { x: xs, y: ys };
  }
  function stepOfModel(model, k, lo, hi) {
    var th = [], q, i;
    for (q = 0; q < k; q++) { var T = model.trees[q]; for (i = 0; i < T.f.length; i++) if (T.f[i] >= 0) th.push(T.t[i]); }
    th.sort(function (a, b) { return a - b; });
    var u = [lo]; th.forEach(function (t) { if (t > lo && t < hi && t !== u[u.length - 1]) u.push(t); }); u.push(hi);
    var xs = [], ys = [];
    for (i = 0; i + 1 < u.length; i++) { xs.push(u[i]); ys.push(core.margin(model, [(u[i] + u[i + 1]) / 2], k)); }
    xs.push(hi); ys.push(ys[ys.length - 1]);
    return { x: xs, y: ys };
  }
  // Rows of two features: columns, labels, held flags and notes, as in TreeLab.
  function prep2(opts) {
    var d = { rows: opts.rows };
    d.cols = opts.features.map(function (f) { return opts.rows.map(function (r) { return +r[f]; }); });
    d.X = opts.rows.map(function (r, i) { return [d.cols[0][i], d.cols[1][i]]; });
    d.y = opts.rows.map(function (r) { return +(typeof opts.label === "function" ? opts.label(r) : r[opts.label]) ? 1 : 0; });
    d.held = opts.rows.map(function (r) { return opts.heldOut ? !!opts.heldOut(r) : false; });
    d.train = []; d.test = [];
    d.held.forEach(function (h, i) { (h ? d.test : d.train).push(i); });
    d.ranges = opts.ranges || [0, 1].map(function (f) { var lo = Math.min.apply(null, d.cols[f]), hi = Math.max.apply(null, d.cols[f]), p = (hi - lo) * 0.04; return [lo - p, hi + p]; });
    d.noun = opts.noun || "case"; d.nouns = opts.nouns || d.noun + "s";
    d.cn = opts.classNames || ["no", "yes"]; d.fl = opts.featureLabels || opts.features; d.fn = opts.featureNames || opts.features;
    d.units = opts.units || ["", ""]; d.digits = opts.digits || [1, 1];
    d.inside = function (i) { return d.cols[0][i] >= d.ranges[0][0] && d.cols[0][i] <= d.ranges[0][1] && d.cols[1][i] >= d.ranges[1][0] && d.cols[1][i] <= d.ranges[1][1]; };
    d.outside = 0; d.rows.forEach(function (r, i) { if (!d.inside(i)) d.outside++; });
    return d;
  }
  // Point traces for two-feature plots (coral diamonds for class 1, navy circles for class 0; held-out ones open).
  function pointTraces(d, P, showHeld, o) {
    o = o || {};
    function ix(cls, held) { var a = []; for (var i = 0; i < d.rows.length; i++) if (d.y[i] === cls && d.held[i] === held && d.inside(i)) a.push(i); return a; }
    function text(i) {
      var r = d.rows[i], id = o.ids && r[o.ids] != null ? (o.idLabel || o.ids) + " " + r[o.ids] + ": " : "";
      return id + trim(d.cols[0][i], d.digits[0]) + " " + d.units[0] + ", " + trim(d.cols[1][i], d.digits[1]) + " " + d.units[1] + ", " + d.cn[d.y[i]];
    }
    function tr(list, symbol, color, held, name) {
      return { type: "scatter", mode: "markers", name: name, x: list.map(function (i) { return d.cols[0][i]; }), y: list.map(function (i) { return d.cols[1][i]; }),
        text: list.map(text), hovertemplate: "%{text}<extra></extra>", visible: held ? showHeld : true,
        marker: held ? { symbol: symbol + "-open", size: 9, color: color, line: { color: color, width: 2 } } : { symbol: symbol, size: symbol === "diamond" ? 8 : 7, color: color, opacity: 0.9, line: { color: P.bg, width: 0.8 } } };
    }
    return [tr(ix(0, false), "circle", P.navy, false, d.cn[0]), tr(ix(1, false), "diamond", P.coral, false, d.cn[1]),
            tr(ix(0, true), "circle", P.navy, true, d.cn[0] + " (held out)"), tr(ix(1, true), "diamond", P.coral, true, d.cn[1] + " (held out)")];
  }
  function heatScale(P) { return [[0, mix(P.navy, P.bg, 0.15)], [0.25, mix(P.navy, P.bg, 0.62)], [0.5, P.bg], [0.75, mix(P.coral, P.bg, 0.62)], [1, mix(P.coral, P.bg, 0.15)]]; }
  function lineChart(host, o) {
    // A small D3 line chart: o.series [{name, y: [..], color, dash}], o.x0 (first x), marker (x position), labels; redraws on call.
    var C = { box: H("div", {}, host) };
    C.svg = Kit.el("svg", { role: "img", "aria-label": o.aria || "Chart" }, C.box);
    C.draw = function (s) {
      if (s) C.s = s; s = C.s; if (!s) return;
      var P = Kit.palette(), W = Kit.width(C.box), Hh = s.height || 190, m = { l: 46, r: 62, t: 10, b: 34 };
      var svg = d3.select(C.svg); svg.attr("viewBox", "0 0 " + W + " " + Hh).attr("width", W).selectAll("*").remove();
      var n = s.series[0].y.length, xs = d3.scaleLinear().domain([s.x0 || 0, (s.x0 || 0) + n - 1]).range([m.l, W - m.r]);
      var lo = Infinity, hi = -Infinity;
      s.series.forEach(function (q) { q.y.forEach(function (v) { if (isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; } }); });
      var padv = (hi - lo) * 0.06 || 0.05, ys = d3.scaleLinear().domain([s.yLo != null ? s.yLo : lo - padv, s.yHi != null ? s.yHi : hi + padv]).range([Hh - m.b, m.t]);
      svg.append("g").attr("transform", "translate(0," + (Hh - m.b) + ")").call(d3.axisBottom(xs).ticks(Math.max(3, Math.floor(W / 90))).tickSize(3)).call(styleAxis(P));
      svg.append("g").attr("transform", "translate(" + m.l + ",0)").call(d3.axisLeft(ys).ticks(4).tickSize(-(W - m.l - m.r)).tickFormat(s.yFmt || d3.format(".2f"))).call(styleAxis(P)).call(function (g) { g.selectAll("line").attr("stroke", P.rule); });
      svg.append("text").attr("x", (m.l + W - m.r) / 2).attr("y", Hh - 3).attr("text-anchor", "middle").attr("font-size", 12.5).attr("fill", P.ink2).text(s.xLabel || "");
      s.series.forEach(function (q) {
        var line = d3.line().defined(function (v) { return isFinite(v); }).x(function (v, i) { return xs((s.x0 || 0) + i); }).y(function (v) { return ys(v); });
        svg.append("path").attr("d", line(q.y)).attr("fill", "none").attr("stroke", P[q.color] || q.color).attr("stroke-width", q.width || 2.4).attr("stroke-dasharray", q.dash || null).attr("opacity", q.opacity || 1);
        var last = q.y[n - 1];
        if (q.label && isFinite(last)) svg.append("text").attr("x", W - m.r + 5).attr("y", ys(last) + (q.dy || 4)).attr("font-size", 12).attr("font-weight", 600).attr("fill", P[q.color] || q.color).text(q.label);
        if (s.marker != null && isFinite(q.y[s.marker])) svg.append("circle").attr("cx", xs((s.x0 || 0) + s.marker)).attr("cy", ys(q.y[s.marker])).attr("r", 5).attr("fill", P.bg).attr("stroke", P[q.color] || q.color).attr("stroke-width", 3);
      });
      if (s.marker != null) svg.append("line").attr("x1", xs((s.x0 || 0) + s.marker)).attr("x2", xs((s.x0 || 0) + s.marker)).attr("y1", m.t).attr("y2", Hh - m.b).attr("stroke", P.ink).attr("opacity", 0.45);
    };
    Kit.onTheme(function () { C.draw(); });
    window.addEventListener("resize", Kit.debounce(function () { C.draw(); }));
    return C;
  }

  /* ======================================================================
     mount1D: boosting on residuals, one input and a number
     ====================================================================== */
  api.mount1D = function (el, opts) {
    injectCss();
    var rows = opts.rows, X = rows.map(function (r) { return +r[opts.x]; }), Y = rows.map(function (r) { return +r[opts.y]; });
    var held = rows.map(function (r) { return opts.heldOut ? !!opts.heldOut(r) : false; }), train = [], test = [];
    held.forEach(function (h, i) { (h ? test : train).push(i); });
    var R = opts.maxTrees || 100, eta = opts.eta == null ? 0.3 : opts.eta, depth = opts.depth || 1, lam = opts.lambda || 0, k = 0;
    var xLo = opts.xMin != null ? opts.xMin : Math.min.apply(null, X) - 2, xHi = opts.xMax != null ? opts.xMax : Math.max.apply(null, X) + 2;
    var yHi = opts.yMax || Math.max.apply(null, Y) * 1.1, yU = opts.yUnit || "", xU = opts.xUnit || "", noun = opts.noun || "case", nouns = opts.nouns || noun + "s";
    var probes = opts.probes || [], probe = probes.length ? probes[0].row : train[0], showHeld = false, showLaw = false, model = null, hist = null, heldHist = null;
    el.classList.add("bl"); el.innerHTML = "";

    // controls
    var ctrl = H("div", { class: "controls" }, el);
    var sk = Kit.slider(ctrl, { label: "Trees added", min: 0, max: R, step: 1, value: 0, digits: 0 }, function (v) { k = v; draw(); });
    var se = Kit.slider(ctrl, { label: "Learning rate η", min: 0.01, max: 1, step: 0.01, value: eta, digits: 2 }, function (v) { eta = v; retrain(); draw(); });
    var sl = opts.lambda === false ? null : Kit.slider(ctrl, { label: "Leaf penalty λ", min: 0, max: 20, step: 0.5, value: lam, digits: 1 }, function (v) { lam = v; retrain(); draw(); });
    var row = H("div", { class: "bl-row" }, el);
    var bStep = Kit.button(row, "Step", function () { stopPlay(); if (k < R) { k++; sk.set(k); draw(); } });
    var bPlay = Kit.button(row, "Play", function () { if (loop.running) stopPlay(); else { if (k >= R) { k = 0; sk.set(0); } bPlay.textContent = "Pause"; loop.start(); } });
    Kit.button(row, "Reset", function () { stopPlay(); k = 0; sk.set(0); draw(); });
    H("span", { class: "label" }, row, "Tree depth");
    Kit.chips(row, ["1 (a stump)", "2", "3"], depth - 1, function (i) { depth = i + 1; retrain(); draw(); });
    var tg = H("div", { class: "group", role: "group" }, row);
    var bHeld = H("button", { type: "button", "aria-pressed": "false" }, tg, "held-out points");
    bHeld.addEventListener("click", function () { showHeld = !showHeld; bHeld.setAttribute("aria-pressed", String(showHeld)); draw(); });
    var bLaw = null;
    if (opts.law) { bLaw = H("button", { type: "button", "aria-pressed": "false" }, tg, opts.lawName || "the rule behind the data"); bLaw.addEventListener("click", function () { showLaw = !showLaw; bLaw.setAttribute("aria-pressed", String(showLaw)); draw(); }); }
    var loop = playLoop(130, function () { if (k >= R) return false; k++; sk.set(k); draw(); return k < R; });
    loop.onStop = function () { bPlay.textContent = "Play"; };
    function stopPlay() { if (loop.running) loop.stop(); }
    var status = H("p", { class: "status", "aria-live": "polite" }, el, "");

    // figure
    var grid = H("div", { class: "bl-grid" }, el), left = H("div", {}, grid), right = H("div", {}, grid);
    H("p", { class: "bl-h4" }, left, "The model so far, and the data");
    var pA = H("div", { class: "plot", role: "img", "aria-label": opts.aria || "Points, and the sum of the trees added so far drawn as a staircase" }, left);
    H("p", { class: "bl-h4" }, left, "What is left over as trees are added, and the next tree's answer");
    var pB = H("div", { class: "plot short", role: "img", "aria-label": opts.residAria || "What is left over as trees are added, shrinking toward zero" }, left);
    H("p", { class: "bl-h4" }, right, "Error against the number of trees");
    var chart = lineChart(right, { aria: "Training and held-out error against the number of trees" });
    var ro = H("div", { class: "readout" }, right), RO = {};
    ["k", "train", "held", "base"].forEach(function (q) { RO[q] = H("span", {}, ro); });
    var chipsHost = H("div", { class: "bl-row" }, right);
    if (probes.length) { H("span", { class: "label" }, chipsHost, "Equation boxes follow"); Kit.chips(chipsHost, probes.map(function (p) { return p.name; }).concat(["hover a point"]), 0, function (i) { if (i < probes.length) { probe = probes[i].row; draw(); } }); }
    H("p", { class: "bl-h4" }, right, "Hover or tap a point on the upper plot to follow it in the equation boxes.");

    // equations
    var eq = H("div", { class: "bl-eq" }, el), E = {};
    (function () {
      var r1 = H("div", { class: "row" }, eq); E.n1 = H("span", { class: "name" }, r1, "");
      var q1 = H("div", { class: "eqn", role: "img", "aria-label": "Left over equals the actual value minus the model's value" }, r1);
      E.y = eqBox(q1, "c-navy", "actual"); op(q1, "−"); E.F0 = eqBox(q1, "c-teal", "model so far"); op(q1, "="); E.r = eqBox(q1, "c-coral", "left over, r");
      var r2 = H("div", { class: "row" }, eq); E.n2 = H("span", { class: "name" }, r2, "");
      var q2 = H("div", { class: "eqn", role: "img", "aria-label": "The tree's answer equals the sum of the left-over values divided by the count plus lambda" }, r2);
      E.sr = eqBox(q2, "c-coral", "sum of the left-over values in this leaf"); op(q2, "÷"); op(q2, "("); E.cnt = eqBox(q2, "", nouns + " in the leaf"); op(q2, "+"); E.lam = eqBox(q2, "c-sand", "λ"); op(q2, ")"); op(q2, "="); E.h = eqBox(q2, "c-coral", "tree's answer, h");
      var r3 = H("div", { class: "row" }, eq); E.n3 = H("span", { class: "name" }, r3, "");
      var q3 = H("div", { class: "eqn", role: "img", "aria-label": "The new model equals the old model plus the learning rate times the tree's answer" }, r3);
      E.F1 = eqBox(q3, "c-teal", "model before"); op(q3, "+"); E.eta = eqBox(q3, "c-sand", "learning rate η"); op(q3, "×"); E.h2 = eqBox(q3, "c-coral", "tree's answer, h"); op(q3, "="); E.F2 = eqBox(q3, "c-teal", "model after"); op(q3, "⇒"); E.r2 = eqBox(q3, "c-coral", "new left over");
    })();
    foot(el, opts);

    // training and evaluation
    function retrain() {
      model = core.train([X], Y, { objective: "squared", rounds: R, eta: eta, depth: depth, lambda: lam, idx: train });
      var F = X.map(function () { return model.base; }), loss = function (idx) { var s = 0; idx.forEach(function (i) { var e = F[i] - Y[i]; s += e * e; }); return idx.length ? Math.sqrt(s / idx.length) : NaN; };
      hist = [loss(train)]; heldHist = [loss(test)];
      for (var q = 0; q < R; q++) { for (var i = 0; i < X.length; i++) F[i] += core.treeOut(model.trees[q], [X[i]], 0, true, true); hist.push(loss(train)); heldHist.push(loss(test)); }
    }
    function Fat(i, kk) { return core.margin(model, [X[i]], kk); }
    function fmtY(v) { return f3(v) + (yU ? " " + yU : ""); }
    function fv(v) { return Math.abs(v) < 0.01 && v !== 0 ? Kit.fmt(v, 4) : f3(v); }

    function draw() {
      var tr = model.trees[k - 1], prev = k > 0 ? k - 1 : 0, lawX = [], lawY = [];
      var cur = stepOfModel(model, k, xLo, xHi), old = k > 0 ? stepOfModel(model, k - 1, xLo, xHi) : null;
      if (opts.law) for (var x = xLo; x <= xHi + 1e-9; x += (xHi - xLo) / 100) { lawX.push(x); lawY.push(opts.law(x)); }
      var rk = {}, rp = {}; train.forEach(function (i) { rk[i] = Y[i] - Fat(i, k); rp[i] = Y[i] - Fat(i, prev); });
      if (rk[probe] === undefined) { rk[probe] = Y[probe] - Fat(probe, k); rp[probe] = Y[probe] - Fat(probe, prev); }   // LOCAL: a held-out probe
      var rmax = 0; train.forEach(function (i) { rmax = Math.max(rmax, Math.abs(Y[i] - model.base)); }); rmax *= 1.08;
      var Fprobe = Fat(probe, k), Fprev = Fat(probe, prev);
      Kit.plot(pA, function (P) {
        var t = [
          { type: "scatter", mode: "markers", x: train.map(function (i) { return X[i]; }), y: train.map(function (i) { return Y[i]; }), text: train.map(function (i) { return (opts.idLabel || "") + " " + (opts.ids ? rows[i][opts.ids] : "") + ": " + trim(X[i], 1) + " " + xU + ", " + trim(Y[i], 3) + " " + yU; }), hovertemplate: "%{text}<extra></extra>", marker: { color: P.navy, size: 6.5, opacity: 0.75, line: { color: P.bg, width: 0.5 } } },
          { type: "scatter", mode: "markers", visible: showHeld, x: test.map(function (i) { return X[i]; }), y: test.map(function (i) { return Y[i]; }), hoverinfo: "skip", marker: { symbol: "circle-open", color: P.navy, size: 8, line: { color: P.navy, width: 1.6 } } },
          { type: "scatter", mode: "lines", visible: !!(opts.law && showLaw), x: lawX, y: lawY, hoverinfo: "skip", line: { color: P.ink2, width: 1.6, dash: "dash" } },
          { type: "scatter", mode: "lines", visible: !!old, x: old ? old.x : [], y: old ? old.y : [], hoverinfo: "skip", line: { color: rgba(P.teal, 0.4), width: 2, shape: "hv", dash: "dot" } },
          { type: "scatter", mode: "lines", x: cur.x, y: cur.y, hoverinfo: "skip", line: { color: P.teal, width: 3.2, shape: "hv" } },
          { type: "scatter", mode: "lines", x: [X[probe], X[probe]], y: [Fprev, Y[probe]], hoverinfo: "skip", line: { color: P.coral, width: 3.5 } },
          { type: "scatter", mode: "markers", x: [X[probe]], y: [Y[probe]], hoverinfo: "skip", marker: { symbol: "circle-open", color: P.coral, size: 15, line: { color: P.coral, width: 2.5 } } }
        ];
        return t;
      }, function (P) {
        var ann = [{ x: xHi, y: cur.y[cur.y.length - 1], xref: "x", yref: "y", text: k === 0 ? "average only" : k + (k === 1 ? " tree" : " trees"), showarrow: false, xanchor: "right", yanchor: "bottom", font: { size: 12.5, color: P.teal } }];
        if (showLaw && opts.law) ann.push({ x: xHi, y: opts.law(xHi), xref: "x", yref: "y", text: "rule", showarrow: false, xanchor: "right", yanchor: "top", font: { size: 12, color: P.ink2 } });
        return { margin: { l: 56, r: 14, t: 8, b: 56 }, dragmode: false, hovermode: "closest", annotations: ann,
          xaxis: { title: { text: opts.xLabel || "x" }, range: [xLo, xHi], fixedrange: true, zeroline: false }, yaxis: { title: { text: opts.yLabel || "y" }, range: [0, yHi], fixedrange: true, zeroline: false } };
      });
      Kit.plot(pB, function (P) {
        var stump = tr ? stepOfTree(tr, xLo, xHi) : { x: [], y: [] }, segX = [], segY = [];
        if (k > 0) train.forEach(function (i) { segX.push(X[i], X[i], null); segY.push(rp[i], rk[i], null); });
        return [
          { type: "scatter", mode: "lines", visible: k > 0, x: segX, y: segY, hoverinfo: "skip", line: { color: rgba(P.muted, 0.35), width: 1 } },
          { type: "scatter", mode: "markers", visible: k > 0, x: train.map(function (i) { return X[i]; }), y: train.map(function (i) { return rp[i]; }), hoverinfo: "skip", marker: { color: rgba(P.muted, 0.55), size: 5 } },
          { type: "scatter", mode: "lines", visible: k > 0, x: stump.x, y: stump.y.map(function (v) { return v / eta; }), hoverinfo: "skip", line: { color: P.coral, width: 3, shape: "hv" } },
          { type: "scatter", mode: "markers", x: train.map(function (i) { return X[i]; }), y: train.map(function (i) { return rk[i]; }), hoverinfo: "skip", marker: { color: P.navy, size: 5.5, opacity: 0.85 } },
          { type: "scatter", mode: "markers", x: [X[probe]], y: [rk[probe]], hoverinfo: "skip", marker: { symbol: "circle-open", color: P.coral, size: 14, line: { color: P.coral, width: 2.5 } } }
        ];
      }, function (P) {
        var ann = [];
        if (k > 0) ann.push({ x: xHi, y: 0, xref: "x", yref: "y", text: "<b>tree " + k + "'s answer</b>", showarrow: false, xanchor: "right", yanchor: "bottom", yshift: 6, font: { size: 12, color: P.coral } });
        return { margin: { l: 56, r: 14, t: 6, b: 52 }, dragmode: false, hovermode: false, annotations: ann,
          xaxis: { title: { text: opts.xLabel || "x" }, range: [xLo, xHi], fixedrange: true, zeroline: false }, yaxis: { title: { text: opts.residLabel || "left over" }, range: [-rmax, rmax], fixedrange: true, zeroline: false },
          shapes: [{ type: "line", x0: xLo, x1: xHi, y0: 0, y1: 0, line: { color: P.muted, width: 1 } }] };
      });
      if (!pA._hb && pA.on) { pA._hb = true; pA.on("plotly_hover", function (e) { var p = e.points[0]; if (p.curveNumber === 0) { var i = train[p.pointIndex]; if (i !== probe) { probe = i; drawEq(); markProbe(); } } }); }
      chart.draw({ series: [{ y: hist, color: "navy", label: "training" }, { y: heldHist, color: "coral", label: "held-out", dy: -2 }], marker: k, xLabel: "trees added", yFmt: d3.format(".2f"), yLo: 0, height: 200 });
      RO.k.innerHTML = "Trees: <b>" + k + "</b>"; RO.train.innerHTML = "Training error: <b>" + fmtY(hist[k]) + "</b>"; RO.held.innerHTML = "Held-out error: <b>" + fmtY(heldHist[k]) + "</b>"; RO.base.innerHTML = "Average only: <b>" + fmtY(hist[0]) + "</b>";
      status.textContent = k === 0 ? "No trees yet: the model answers with the average, " + fmtY(model.base) + ". Press Step to add the first tree." : "After " + k + (k === 1 ? " tree" : " trees") + ", the training error is " + fmtY(hist[k]) + " and the held-out error is " + fmtY(heldHist[k]) + ".";
      drawEq();
      if (opts.onChange) opts.onChange({ k: k, train: hist[k], held: heldHist[k], eta: eta, lambda: lam, depth: depth });
    }
    function markProbe() { draw(); }
    function drawEq() {
      var i = probe, tag = (opts.idLabel || "") + " " + (opts.ids ? rows[i][opts.ids] : "");
      var pn = probes.filter(function (p) { return p.row === i; })[0]; if (pn) tag = pn.name;   // LOCAL: name of the probe
      var Fp = Fat(i, k > 0 ? k - 1 : 0), Fn = Fat(i, k);
      E.n1.textContent = "Follow " + tag.trim() + " (" + trim(X[i], 1) + " " + xU + "): what is left over before the tree that is about to be added";
      E.y.textContent = fmtY(Y[i]); E.F0.textContent = fmtY(Fp); E.r.textContent = (Y[i] - Fp < 0 ? "" : "") + fmtY(Y[i] - Fp);
      cap(E.F0, k > 1 ? "model after " + (k - 1) + " trees" : (k === 1 ? "the average" : "the average"));
      if (k > 0) {
        var T = model.trees[k - 1], leaf = core.leafId(T, [X[i]]), h = T.v[leaf] / eta, n = T.n[leaf];
        E.n2.textContent = "Tree " + k + " puts " + tag.trim() + " in a leaf with " + n + " " + nouns + " and answers with the sum of their left-over values over the count plus λ";
        E.sr.textContent = fv(h * (n + lam)); E.cnt.textContent = String(n); E.lam.textContent = trim(lam, 1); E.h.textContent = fv(h);
        E.n3.textContent = "The update: new model = old model + η × tree's answer";
        E.F1.textContent = fv(Fp); E.eta.textContent = trim(eta, 2); E.h2.textContent = fv(h); E.F2.textContent = fv(Fn); E.r2.textContent = fv(Y[i] - Fn);
      } else {
        E.n2.textContent = "Press Step or Play: a new tree answers with an average of the left-over values in its leaves";
        E.n3.textContent = "";
        ["sr", "cnt", "lam", "h", "F1", "eta", "h2", "F2", "r2"].forEach(function (q) { E[q].textContent = "–"; });
      }
    }
    retrain(); draw();
    return { setTrees: function (v) { k = v; sk.set(v); draw(); }, model: function () { return model; }, play: function () { bPlay.click(); } };
  };

  /* ======================================================================
     mountLeaf: the regularised leaf value for leaves of different sizes
     ====================================================================== */
  api.mountLeaf = function (el, opts) {
    injectCss();
    var leaves = opts.leaves, unit = opts.unit || "", lam = opts.lambda == null ? 3 : opts.lambda;
    el.classList.add("bl"); el.innerHTML = "";
    var ctrl = H("div", { class: "controls" }, el);
    var sl = Kit.slider(ctrl, { label: "Leaf penalty λ", min: 0, max: 20, step: 0.5, value: lam, digits: 1 }, function (v) { lam = v; draw(); });
    var box = H("div", {}, el), svg = Kit.el("svg", { role: "img", "aria-label": opts.aria || "Bars comparing the plain average and the shrunk value for leaves of different sizes" }, box);
    var eq = H("div", { class: "bl-eq" }, el), E = [];
    leaves.forEach(function (lf, i) {
      var r = H("div", { class: "row" }, eq); H("span", { class: "name" }, r, lf.name);
      var q = H("div", { class: "eqn", role: "img", "aria-label": "Leaf value equals the sum of the left-over values over the count plus lambda" }, r), e = {};
      e.s = eqBox(q, "c-coral", "sum of left-over values"); op(q, "÷"); op(q, "("); e.n = eqBox(q, "", lf.n === 1 ? "one " + (opts.noun || "case") : (opts.nouns || "cases")); op(q, "+"); e.l = eqBox(q, "c-sand", "λ"); op(q, ")"); op(q, "="); e.v = eqBox(q, "c-teal", "leaf value"); op(q, "vs"); e.p = eqBox(q, "", "plain average"); e.c = H("span", { class: "note" }, r, "");
      E.push(e);
    });
    function draw() {
      var P = Kit.palette(), W = Kit.width(box), Hh = 70 + leaves.length * 54, m = { l: 12, r: 16, t: 24, b: 8 };
      var s = d3.select(svg); s.attr("viewBox", "0 0 " + W + " " + Hh).attr("width", W).selectAll("*").remove();
      var maxv = d3.max(leaves, function (l) { return l.sum / l.n; }) * 1.15, xs = d3.scaleLinear().domain([0, maxv]).range([m.l + 96, Math.max(m.l + 150, W - m.r - 96)]);
      s.append("text").attr("x", m.l).attr("y", 13).attr("font-size", 12).attr("fill", P.muted).text("dashed: plain average. solid: shrunk value, sum / (count + λ)");
      leaves.forEach(function (l, i) {
        var y0 = m.t + 10 + i * 54, avg = l.sum / l.n, val = l.sum / (l.n + lam);
        s.append("text").attr("x", m.l).attr("y", y0 + 14).attr("font-size", 13).attr("fill", P.ink).attr("font-weight", 600).text(l.n + (l.n === 1 ? " " + (opts.noun || "case") : " " + (opts.nouns || "cases")));
        s.append("rect").attr("x", xs(0)).attr("y", y0).attr("width", xs(avg) - xs(0)).attr("height", 16).attr("fill", "none").attr("stroke", P.muted).attr("stroke-width", 1.5).attr("stroke-dasharray", "4 3");
        s.append("rect").attr("x", xs(0)).attr("y", y0 + 20).attr("width", Math.max(1, xs(val) - xs(0))).attr("height", 16).attr("fill", P.teal);
        s.append("text").attr("x", xs(avg) + 6).attr("y", y0 + 13).attr("font-size", 12).attr("fill", P.muted).text(f3(avg));
        s.append("text").attr("x", xs(val) + 6).attr("y", y0 + 33).attr("font-size", 12.5).attr("fill", P.teal).attr("font-weight", 600).text(f3(val) + (avg > 0 ? " (" + Math.round(100 * val / avg) + "%)" : ""));
        var e = E[i]; e.s.textContent = f3(l.sum); e.n.textContent = String(l.n); e.l.textContent = trim(lam, 1); e.v.textContent = f3(val) + (unit ? " " + unit : ""); e.p.textContent = f3(avg);
        e.c.textContent = lam === 0 ? "No penalty: the leaf answers with the plain average." : "Shrunk to " + Math.round(100 * val / avg) + "% of the average.";
      });
    }
    Kit.onTheme(draw); window.addEventListener("resize", Kit.debounce(draw));
    draw(); foot(el, opts);
    return { setLambda: function (v) { lam = v; sl.set(v); draw(); } };
  };

  /* ======================================================================
     mountBoundary: boosted trees on two inputs and a yes/no label
     ====================================================================== */
  api.mountBoundary = function (el, opts) {
    injectCss();
    var d = prep2(opts), R = opts.maxTrees || 300, eta = opts.eta == null ? 0.1 : opts.eta, depth = opts.depth || 3, lam = opts.lambda == null ? 1 : opts.lambda, k = 0, sq = opts.objective === "squared";   // LOCAL: sq
    var nx = (opts.grid || [64, 52])[0], ny = (opts.grid || [64, 52])[1], showHeld = false, model = null, gridK = 0, hist = null;
    var gx = [], gy = [], i, j;
    for (i = 0; i < nx; i++) gx.push(d.ranges[0][0] + (i + 0.5) / nx * (d.ranges[0][1] - d.ranges[0][0]));
    for (j = 0; j < ny; j++) gy.push(d.ranges[1][0] + (j + 0.5) / ny * (d.ranges[1][1] - d.ranges[1][0]));
    var gm = new Float64Array(nx * ny);
    el.classList.add("bl"); el.innerHTML = "";
    var ctrl = H("div", { class: "controls" }, el);
    var sk = Kit.slider(ctrl, { label: "Trees added", min: 0, max: R, step: 1, value: 0, digits: 0 }, function (v) { k = v; draw(); });
    var se = Kit.slider(ctrl, { label: "Learning rate η", min: 0.01, max: 1, step: 0.01, value: eta, digits: 2 }, function (v) { eta = v; retrain(); draw(); });
    var sl = Kit.slider(ctrl, { label: "Leaf penalty λ", min: 0, max: 20, step: 0.5, value: lam, digits: 1 }, function (v) { lam = v; retrain(); draw(); });
    var row = H("div", { class: "bl-row" }, el);
    Kit.button(row, "Step", function () { stopPlay(); if (k < R) { k++; sk.set(k); draw(); } });
    var bPlay = Kit.button(row, "Play", function () { if (loop.running) stopPlay(); else { if (k >= R) { k = 0; sk.set(0); } bPlay.textContent = "Pause"; loop.start(); } });
    Kit.button(row, "Reset", function () { stopPlay(); k = 0; sk.set(0); draw(); });
    H("span", { class: "label" }, row, "Tree depth");
    Kit.chips(row, ["1", "2", "3", "4"], depth - 1, function (q) { depth = q + 1; retrain(); draw(); });
    var tg = H("div", { class: "group", role: "group" }, row), bHeld = H("button", { type: "button", "aria-pressed": "false" }, tg, "held-out points");
    bHeld.addEventListener("click", function () { showHeld = !showHeld; bHeld.setAttribute("aria-pressed", String(showHeld)); draw(); });
    var step = Math.max(1, Math.round(R / 100));
    var loop = playLoop(90, function () { if (k >= R) return false; k = Math.min(R, k + step); sk.set(k); draw(); return k < R; });
    loop.onStop = function () { bPlay.textContent = "Play"; };
    function stopPlay() { if (loop.running) loop.stop(); }
    var status = H("p", { class: "status", "aria-live": "polite" }, el, "");
    var grid = H("div", { class: "bl-grid" }, el), left = H("div", {}, grid), right = H("div", {}, grid);
    var pdiv = H("div", { class: "plot tall", role: "img", "aria-label": opts.aria || "A heat map of the model's score over the two inputs, with the training examples on top" }, left);
    H("p", { class: "bl-h4" }, right, sq ? "Mean squared error against the number of trees (lower is better)" : "Loss against the number of trees (lower is better)");
    var chart = lineChart(right, { aria: sq ? "Training and held-out squared error against the number of trees" : "Training and held-out log loss against the number of trees" });
    var ro = H("div", { class: "readout" }, right), RO = {};
    ["k", "train", "held", "ref"].forEach(function (q) { RO[q] = H("span", {}, ro); });
    var note = H("p", { class: "note" }, right, sq ? "Colour is the model's score: coral for high, navy for low, white near 0.5. The black line is where the score equals 0.5, the cut-off for calling " + d.cn[1] + "." : "Colour is the model's chance of class " + d.cn[1] + ": coral for high, navy for low, white near 0.5. The black line is where it equals 0.5.");
    foot(el, opts);

    function retrain() {
      model = core.train(d.cols, d.y, { objective: sq ? "squared" : "logistic", rounds: R, eta: eta, depth: depth, lambda: lam, idx: d.train });   // LOCAL: sq
      // loss and accuracy of all examples after the trees are added
      var F = d.X.map(function () { return model.base; }), m = d.rows.length;
      function metr(idx) {
        var L = 0, ok = 0; idx.forEach(function (q) { var p = sq ? F[q] : sigmoid(F[q]); L += sq ? (p - d.y[q]) * (p - d.y[q]) : -(d.y[q] ? Math.log(Math.max(p, 1e-12)) : Math.log(Math.max(1 - p, 1e-12))); if ((p > 0.5 ? 1 : 0) === d.y[q]) ok++; });   // LOCAL: sq
        return idx.length ? [L / idx.length, ok / idx.length] : [NaN, NaN];
      }
      hist = { tl: [], ta: [], hl: [], ha: [] };
      function push() { var a = metr(d.train), b = metr(d.test); hist.tl.push(a[0]); hist.ta.push(a[1]); hist.hl.push(b[0]); hist.ha.push(b[1]); }
      push();
      for (var q = 0; q < R; q++) { for (var r = 0; r < m; r++) F[r] += core.treeOut(model.trees[q], d.X[r], 0, true, true); push(); }
      gridK = 0; for (var c = 0; c < gm.length; c++) gm[c] = model.base;
    }
    function updateGrid() {
      var t, a, b, x = [0, 0];
      if (k < gridK) { gridK = 0; for (a = 0; a < gm.length; a++) gm[a] = model.base; }
      for (t = gridK; t < k; t++) for (b = 0; b < ny; b++) for (a = 0; a < nx; a++) { x[0] = gx[a]; x[1] = gy[b]; gm[b * nx + a] += core.treeOut(model.trees[t], x, 0, true, true); }
      gridK = k;
    }
    function draw() {
      updateGrid();
      var z = []; for (var b = 0; b < ny; b++) { var rowz = []; for (var a = 0; a < nx; a++) rowz.push(/* LOCAL */ sq ? gm[b * nx + a] : sigmoid(gm[b * nx + a])); z.push(rowz); }
      Kit.plot(pdiv, function (P) {
        var pts = pointTraces(d, P, showHeld, { ids: opts.ids, idLabel: opts.idLabel });
        return [{ type: "heatmap", x: gx, y: gy, z: z, zmin: 0, zmax: 1, colorscale: heatScale(P), showscale: false, zsmooth: false, hovertemplate: d.fn[0] + " %{x:.0f}, " + d.fn[1] + " %{y:.0f}<br>" + (sq ? "score" : "chance of " + d.cn[1]) + " %{z:.2f}<extra></extra>" },
          { type: "contour", x: gx, y: gy, z: z, showscale: false, hoverinfo: "skip", contours: { start: 0.5, end: 0.5, size: 1, coloring: "none" }, line: { color: P.ink, width: 2.2 } }].concat(pts, opts.mark ? [markTrace(P, opts.mark)] : []);   // LOCAL: mark
      }, function () {
        return { margin: { l: 54, r: 12, t: 10, b: 46 }, dragmode: false, hovermode: "closest", xaxis: { title: { text: d.fl[0] }, range: d.ranges[0], fixedrange: true, zeroline: false }, yaxis: { title: { text: d.fl[1] }, range: d.ranges[1], fixedrange: true, zeroline: false } };
      });
      chart.draw({ series: [{ y: hist.tl, color: "navy", label: "training" }, { y: hist.hl, color: "coral", label: "held-out", dy: -2 }], marker: k, xLabel: "trees added", yLo: 0, height: 210 });
      RO.k.innerHTML = "Trees: <b>" + k + "</b>";
      RO.train.innerHTML = "Training accuracy: <b>" + pc(hist.ta[k]) + "</b> (loss " + f3(hist.tl[k]) + ")";
      RO.held.innerHTML = "Held-out accuracy: <b>" + pc(hist.ha[k]) + "</b> (loss " + f3(hist.hl[k]) + ")";
      RO.ref.innerHTML = opts.reference ? opts.reference.label + ": <b>" + pc(opts.reference.held) + "</b>" : "";
      status.textContent = k === 0 ? "No trees yet: all examples get the same " + (sq ? "score" : "chance") + ", the share of class " + d.cn[1] + " in the training examples." : "After " + k + (k === 1 ? " tree" : " trees") + ": training accuracy " + pc(hist.ta[k]) + ", held-out accuracy " + pc(hist.ha[k]) + ".";
      if (opts.onChange) opts.onChange({ k: k, trainAcc: hist.ta[k], heldAcc: hist.ha[k], trainLoss: hist.tl[k], heldLoss: hist.hl[k] });
    }
    retrain(); draw();
    return { setTrees: function (v) { k = v; sk.set(v); draw(); }, setEta: function (v) { eta = v; se.set(v); retrain(); draw(); }, model: function () { return model; }, hist: function () { return hist; } };
  };

  /* ======================================================================
     mountForest: a random forest vote on two inputs
     ====================================================================== */
  api.mountForest = function (el, opts) {
    injectCss();
    var d = prep2(opts), B = opts.trees || 100, depth = opts.depth || 3, rng = Kit.rng(opts.seed || 4127), k = Math.min(B, opts.start || 1), showHeld = false;
    var nx = (opts.grid || [64, 52])[0], ny = (opts.grid || [64, 52])[1], gx = [], gy = [], i, j, b;
    for (i = 0; i < nx; i++) gx.push(d.ranges[0][0] + (i + 0.5) / nx * (d.ranges[0][1] - d.ranges[0][0]));
    for (j = 0; j < ny; j++) gy.push(d.ranges[1][0] + (j + 0.5) / ny * (d.ranges[1][1] - d.ranges[1][0]));
    // the forest
    var trees = [], seen = [], cellVotes = [], rowVotes = [];
    for (b = 0; b < B; b++) {
      var sample = []; for (i = 0; i < d.train.length; i++) sample.push(d.train[Math.floor(rng() * d.train.length)]);
      seen.push(new Set(sample).size);
      var T = core.forestTree(d.cols, d.y, sample, depth, rng); trees.push(T);
      var cv = new Uint8Array(nx * ny); for (j = 0; j < ny; j++) for (i = 0; i < nx; i++) cv[j * nx + i] = core.forestPredict(T, [gx[i], gy[j]]);
      cellVotes.push(cv);
      var rv = new Uint8Array(d.rows.length); for (i = 0; i < d.rows.length; i++) rv[i] = core.forestPredict(T, d.X[i]); rowVotes.push(rv);
    }
    // accuracy of the forest with 1..B trees, and of single trees
    var accT = [], accH = [], single = [], cnt = new Int32Array(d.rows.length);
    function acc(idx, kk) { var ok = 0; idx.forEach(function (q) { if ((cnt[q] * 2 > kk ? 1 : 0) === d.y[q]) ok++; }); return idx.length ? ok / idx.length : NaN; }
    for (b = 0; b < B; b++) {
      for (i = 0; i < d.rows.length; i++) cnt[i] += rowVotes[b][i];
      accT.push(acc(d.train, b + 1)); accH.push(acc(d.test, b + 1));
      var ok = 0; d.test.forEach(function (q) { if (rowVotes[b][q] === d.y[q]) ok++; }); single.push(d.test.length ? ok / d.test.length : NaN);
    }
    var singleMean = single.reduce(function (a, c) { return a + c; }, 0) / B, pick = opts.point ? opts.point.slice() : [(d.ranges[0][0] + d.ranges[0][1]) / 2, (d.ranges[1][0] + d.ranges[1][1]) / 2];
    el.classList.add("bl"); el.innerHTML = "";
    var ctrl = H("div", { class: "controls" }, el);
    var sk = Kit.slider(ctrl, { label: "Trees voting", min: 1, max: B, step: 1, value: k, digits: 0 }, function (v) { k = v; draw(); });
    var row = H("div", { class: "bl-row" }, el);
    var tg = H("div", { class: "group", role: "group" }, row), bHeld = H("button", { type: "button", "aria-pressed": "false" }, tg, "held-out points");
    bHeld.addEventListener("click", function () { showHeld = !showHeld; bHeld.setAttribute("aria-pressed", String(showHeld)); draw(); });
    Kit.button(row, "Draw a new forest", function () { var o2 = {}; Object.keys(opts).forEach(function (q) { o2[q] = opts[q]; }); o2.seed = (opts.seed || 4127) + 1; o2.start = k; o2.point = pick.slice(); api.mountForest(el, o2); });
    var status = H("p", { class: "status", "aria-live": "polite" }, el, "Click the map to see how the trees vote at that point.");
    var grid = H("div", { class: "bl-grid" }, el), left = H("div", { style: "position:relative" }, grid), right = H("div", {}, grid);
    var pdiv = H("div", { class: "plot tall", role: "img", "aria-label": opts.aria || "A heat map of the share of trees that vote for class 1, with the training examples on top" }, left);
    H("p", { class: "bl-h4" }, right, "The first six trees, grown on different bootstrap samples");
    var th = H("div", { class: "bl-thumbs" }, right), cvs = [];
    for (b = 0; b < Math.min(6, B); b++) { var fg = H("figure", {}, th), cv = H("canvas", { width: nx, height: ny, "aria-label": "Boundary of tree " + (b + 1) }, fg); H("figcaption", {}, fg, "tree " + (b + 1)); cvs.push(cv); }
    H("p", { class: "bl-h4" }, right, "Held-out accuracy of the forest against the number of trees");
    var chart = lineChart(right, { aria: "Held-out accuracy of the forest against the number of trees" });
    var ro = H("div", { class: "readout" }, right), RO = {};
    ["k", "held", "single", "seen"].forEach(function (q) { RO[q] = H("span", {}, ro); });
    var vh = H("p", { class: "bl-h4" }, el, ""), votes = H("div", { class: "bl-votes", role: "img", "aria-label": "One square per tree: filled for a vote for class 1, hollow for a vote for class 0" }, el);
    var eq = H("div", { class: "bl-eq" }, el), E = {};
    (function () {
      var r = H("div", { class: "row" }, eq); H("span", { class: "name" }, r, "The vote at the marked point");
      var q = H("div", { class: "eqn", role: "img", "aria-label": "Vote share equals the number of trees voting for class 1 divided by the number of trees" }, r);
      E.yes = eqBox(q, "c-coral", "trees voting " + d.cn[1]); op(q, "÷"); E.all = eqBox(q, "", "trees"); op(q, "="); E.share = eqBox(q, "c-teal", "vote share");
      E.call = H("span", { class: "note", style: "margin:0" }, r, "");
    })();
    foot(el, opts);

    function cellShare(kk) {
      var z = []; for (var jj = 0; jj < ny; jj++) { var rz = []; for (var ii = 0; ii < nx; ii++) { var s = 0; for (var t = 0; t < kk; t++) s += cellVotes[t][jj * nx + ii]; rz.push(s / kk); } z.push(rz); }
      return z;
    }
    function drawThumbs() {
      var P = Kit.palette();
      cvs.forEach(function (cv, t) {
        var g = cv.getContext("2d"), img = g.createImageData(nx, ny), c1 = rgbOf(P.coral), c0 = rgbOf(P.navy), bg = rgbOf(P.bg);
        for (var jj = 0; jj < ny; jj++) for (var ii = 0; ii < nx; ii++) {
          var v = cellVotes[t][jj * nx + ii], c = v ? c1 : c0, p = ((ny - 1 - jj) * nx + ii) * 4;
          img.data[p] = Math.round(bg[0] * 0.5 + c[0] * 0.5); img.data[p + 1] = Math.round(bg[1] * 0.5 + c[1] * 0.5); img.data[p + 2] = Math.round(bg[2] * 0.5 + c[2] * 0.5); img.data[p + 3] = 255;
        }
        g.putImageData(img, 0, 0);
      });
    }
    function draw() {
      var z = cellShare(k);
      Kit.plot(pdiv, function (P) {
        var pts = pointTraces(d, P, showHeld, { ids: opts.ids, idLabel: opts.idLabel });
        return [{ type: "heatmap", x: gx, y: gy, z: z, zmin: 0, zmax: 1, colorscale: heatScale(P), showscale: false, zsmooth: false, hovertemplate: d.fn[0] + " %{x:.0f}, " + d.fn[1] + " %{y:.0f}<br>vote share for " + d.cn[1] + " %{z:.2f}<extra></extra>" },
          { type: "contour", x: gx, y: gy, z: z, showscale: false, hoverinfo: "skip", contours: { start: 0.5, end: 0.5, size: 1, coloring: "none" }, line: { color: P.ink, width: 2.2 } }].concat(pts).concat([
          { type: "scatter", mode: "markers", x: [pick[0]], y: [pick[1]], hoverinfo: "skip", marker: { symbol: "circle-open", size: 17, color: P.ink, line: { color: P.ink, width: 3 } } }]);
      }, function () {
        return { margin: { l: 54, r: 12, t: 10, b: 46 }, dragmode: false, hovermode: "closest", xaxis: { title: { text: d.fl[0] }, range: d.ranges[0], fixedrange: true, zeroline: false }, yaxis: { title: { text: d.fl[1] }, range: d.ranges[1], fixedrange: true, zeroline: false } };
      });
      chart.draw({ series: [{ y: accH, color: "coral", label: "forest", width: 2.6 }, { y: accH.map(function () { return singleMean; }), color: "muted", dash: "5 4", label: "one tree", width: 1.8, dy: 12 }], x0: 1, marker: k - 1, xLabel: "trees voting", yFmt: d3.format(".0%"), height: 190 });
      RO.k.innerHTML = "Trees: <b>" + k + "</b>"; RO.held.innerHTML = "Forest, held-out accuracy: <b>" + pc(accH[k - 1]) + "</b>"; RO.single.innerHTML = "A single tree on average: <b>" + pc(singleMean) + "</b>";
      RO.seen.innerHTML = "Tree 1 saw <b>" + seen[0] + "</b> different " + d.nouns + " of " + d.train.length;
      vote();
    }
    function vote() {
      var x = pick, yes = 0, h = "";
      votes.innerHTML = "";
      for (var t = 0; t < B; t++) {
        var v = core.forestPredict(trees[t], x); if (t < k) yes += v;
        var sq = H("i", { class: v ? "y" : "", title: "tree " + (t + 1) + ": " + d.cn[v] }, votes); if (t >= k) sq.style.opacity = "0.2";
      }
      vh.textContent = "Votes of the " + B + " trees at " + trim(x[0], d.digits[0]) + " " + d.units[0] + " and " + trim(x[1], d.digits[1]) + " " + d.units[1] + " (filled square: " + d.cn[1] + ", hollow: " + d.cn[0] + ", faded: not voting yet)";
      E.yes.textContent = String(yes); E.all.textContent = String(k); E.share.textContent = f2(yes / k);
      E.call.textContent = "More than half say " + d.cn[1] + "? " + (yes * 2 > k ? "Yes, so the forest calls " + d.cn[1] + "." : "No, so the forest calls " + d.cn[0] + ".");
    }
    pdiv.addEventListener("click", function (e) {
      var fl = pdiv._fullLayout; if (!fl || !fl._size) return;
      var r = pdiv.getBoundingClientRect(), s = fl._size, px = e.clientX - r.left, py = e.clientY - r.top;
      if (px < s.l || px > s.l + s.w || py < s.t || py > s.t + s.h) return;
      var xr = fl.xaxis.range, yr = fl.yaxis.range;
      pick = [xr[0] + (px - s.l) / s.w * (xr[1] - xr[0]), yr[1] - (py - s.t) / s.h * (yr[1] - yr[0])];
      status.textContent = "Marked point: " + trim(pick[0], d.digits[0]) + " " + d.units[0] + ", " + trim(pick[1], d.digits[1]) + " " + d.units[1] + ".";
      draw();
    });
    Kit.onTheme(drawThumbs);
    drawThumbs(); draw();
    return { setTrees: function (v) { k = v; sk.set(v); draw(); }, accuracy: function () { return { held: accH, single: single }; } };
  };

  /* ======================================================================
     mountImportance: four importance measures side by side, and a live shuffle test
     ====================================================================== */
  api.mountImportance = function (el, opts) {
    injectCss();
    var M = opts.model, F = M.features, names = opts.featureLabels || F, nF = F.length, imp = M.importance, hot = opts.hot == null ? 0 : opts.hot;
    var heldRows = M.rows.filter(function (r) { return r.held; }), sel = hot, rng = Kit.rng(opts.seed || 4127), lastRun = null;
    var measures = [
      { id: "count", name: "Split count", note: "How many times the trees ask about it.", get: function (f) { return imp[F[f]].count; }, fmt: function (v) { return String(v); } },
      { id: "gain", name: "Gain", note: "Average improvement in the training score per question about it.", get: function (f) { return imp[F[f]].gain; }, fmt: function (v) { return v.toFixed(2); } },
      { id: "shuffle", name: "Shuffle test", note: "Held-out accuracy lost when its column is shuffled, in points.", get: function (f) { return 100 * imp[F[f]].shuffle; }, fmt: function (v) { return (v < 0 ? "−" : "") + Math.abs(v).toFixed(1); } },
      { id: "shap", name: "SHAP", note: "Average size of its share of the score on held-out examples.", get: function (f) { return imp[F[f]].shap; }, fmt: function (v) { return v.toFixed(2); } }
    ];
    measures.forEach(function (m) {
      m.vals = F.map(function (_, f) { return m.get(f); });
      var order = m.vals.map(function (v, f) { return f; }).sort(function (a, b) { return m.vals[b] - m.vals[a]; });
      m.rank = []; order.forEach(function (f, r) { m.rank[f] = r + 1; });
    });
    el.classList.add("bl"); el.innerHTML = "";
    var imps = H("div", { class: "bl-imp" }, el), svgs = [];
    measures.forEach(function (m) { var c = H("div", {}, imps); H("h4", {}, c, m.name); H("p", {}, c, m.note); svgs.push(Kit.el("svg", { role: "img", "aria-label": m.name + " of the inputs" }, c)); });
    var status = H("p", { class: "status", "aria-live": "polite" }, el, "");
    var tbl = H("div", {}, el);
    var rowS = H("div", { class: "bl-row", style: "margin-top:14px" }, el);
    H("span", { class: "label" }, rowS, "Shuffle test: pick an input");
    var chip = Kit.chips(rowS, names, sel, function (i) { sel = i; lastRun = null; drawAll(); });
    var rowB = H("div", { class: "bl-row" }, el);
    Kit.button(rowB, "Shuffle it once", function () { lastRun = runShuffles(1); drawShuffle(); });
    Kit.button(rowB, "Run 50 shuffles", function () { lastRun = runShuffles(50); drawShuffle(); });
    var sbox = H("div", {}, el), ssvg = Kit.el("svg", { role: "img", "aria-label": "Accuracy lost in the shuffles of the chosen input" }, sbox);
    var eq = H("div", { class: "bl-eq" }, el), E = {};
    (function () {
      var r = H("div", { class: "row" }, eq); E.name = H("span", { class: "name" }, r, "");
      var q = H("div", { class: "eqn", role: "img", "aria-label": "Importance of the input equals accuracy as it is minus accuracy with the input shuffled" }, r);
      E.drop = eqBox(q, "c-coral", "points lost"); op(q, "="); E.a0 = eqBox(q, "", "accuracy as it is"); op(q, "−"); E.a1 = eqBox(q, "c-teal", "with the input shuffled");
    })();
    foot(el, opts);

    var xs = heldRows.map(function (r) { return r.x; }), ys = heldRows.map(function (r) { return r.y; });
    function accOf(X) { var ok = 0; for (var i = 0; i < X.length; i++) if ((core.predictMargin(M, X[i]) > 0 ? 1 : 0) === ys[i]) ok++; return ok / X.length; }
    var base = accOf(xs);
    function runShuffles(n) {
      var drops = [];
      for (var s = 0; s < n; s++) {
        var col = core.permute(xs.map(function (x) { return x[sel]; }), rng), X2 = xs.map(function (x, i) { var c = x.slice(); c[sel] = col[i]; return c; });
        drops.push(100 * (base - accOf(X2)));
      }
      var mean = drops.reduce(function (a, b) { return a + b; }, 0) / n, sd = Math.sqrt(drops.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / n);
      return { drops: drops, mean: mean, sd: sd, f: sel };
    }
    function drawBars() {
      var P = Kit.palette();
      svgs.forEach(function (svg, mi) {
        var m = measures[mi], W = Kit.width(svg.parentNode), rowH = 30, lab = 78, Hh = nF * rowH + 8, s = d3.select(svg);
        s.attr("viewBox", "0 0 " + W + " " + Hh).attr("width", W).selectAll("*").remove();
        var lo = Math.min(0, d3.min(m.vals)), hi = d3.max(m.vals), x = d3.scaleLinear().domain([lo, hi]).range([lab, W - 44]);
        s.append("line").attr("x1", x(0)).attr("x2", x(0)).attr("y1", 2).attr("y2", Hh - 2).attr("stroke", P.muted);
        F.forEach(function (_, f) {
          var y0 = 4 + f * rowH, v = m.vals[f], on = f === sel, col = on ? P.coral : P.navy;
          var g = s.append("g").style("cursor", "pointer").on("click", function () { sel = f; lastRun = null; drawAll(); });
          g.append("rect").attr("x", 0).attr("y", y0 - 2).attr("width", W).attr("height", rowH - 2).attr("fill", on ? P.mark : "transparent");
          g.append("text").attr("x", 4).attr("y", y0 + 15).attr("font-size", 12.5).attr("fill", on ? P.ink : P.ink2).attr("font-weight", on ? 600 : 400).text(names[f]);
          g.append("rect").attr("x", Math.min(x(0), x(v))).attr("y", y0 + 3).attr("width", Math.max(1, Math.abs(x(v) - x(0)))).attr("height", 16).attr("fill", v < 0 ? "none" : col).attr("stroke", col).attr("stroke-width", v < 0 ? 2 : 0).attr("rx", 2);
          g.append("text").attr("x", Math.max(x(0), x(v)) + 5).attr("y", y0 + 16).attr("font-size", 12).attr("fill", P.ink2).attr("font-weight", on ? 600 : 400).text(m.fmt(v) + "  #" + m.rank[f]);
          g.append("title").text(names[f] + ": " + m.fmt(v) + ", rank " + m.rank[f] + " of " + nF);
        });
      });
    }
    function drawTable() {
      var h = "<table class=\"bl-t\"><thead><tr><th>input</th>" + measures.map(function (m) { return "<th>" + m.name.toLowerCase() + "</th>"; }).join("") + "</tr></thead><tbody>";
      F.forEach(function (_, f) { h += "<tr" + (f === sel ? " class=\"on\"" : "") + "><td>" + names[f] + "</td>" + measures.map(function (m) { return "<td>" + m.fmt(m.vals[f]) + " (#" + m.rank[f] + ")</td>"; }).join("") + "</tr>"; });
      tbl.innerHTML = h + "</tbody></table>";
    }
    function drawShuffle() {
      var P = Kit.palette(), W = Kit.width(sbox), Hh = 96, m = { l: 12, r: 14, t: 18, b: 30 }, s = d3.select(ssvg);
      s.attr("viewBox", "0 0 " + W + " " + Hh).attr("width", W).selectAll("*").remove();
      var ext = [-12, 25]; if (lastRun) { ext = [Math.min(-6, d3.min(lastRun.drops) - 2), Math.max(12, d3.max(lastRun.drops) + 2)]; }
      var x = d3.scaleLinear().domain(ext).range([m.l, W - m.r]);
      s.append("g").attr("transform", "translate(0," + (Hh - m.b) + ")").call(d3.axisBottom(x).ticks(8).tickSize(3)).call(styleAxis(P));
      s.append("text").attr("x", (m.l + W - m.r) / 2).attr("y", Hh - 2).attr("text-anchor", "middle").attr("font-size", 12.5).attr("fill", P.ink2).text("held-out accuracy lost when " + names[sel] + " is shuffled, in points");
      s.append("line").attr("x1", x(0)).attr("x2", x(0)).attr("y1", m.t - 6).attr("y2", Hh - m.b).attr("stroke", P.muted);
      if (lastRun) {
        var rr = Kit.rng(7);
        lastRun.drops.forEach(function (v) { s.append("circle").attr("cx", x(v)).attr("cy", 28 + rr() * 26).attr("r", 4).attr("fill", P.coral).attr("opacity", 0.6); });
        s.append("line").attr("x1", x(lastRun.mean)).attr("x2", x(lastRun.mean)).attr("y1", m.t).attr("y2", Hh - m.b).attr("stroke", P.ink).attr("stroke-width", 2.5);
        s.append("text").attr("x", x(lastRun.mean) + 5).attr("y", m.t + 3).attr("font-size", 12).attr("fill", P.ink).text("mean " + Kit.fmt(lastRun.mean, 1));
        E.name.textContent = lastRun.drops.length === 1 ? "One shuffle of " + names[sel] + " among the " + heldRows.length + " held-out examples" : lastRun.drops.length + " shuffles of " + names[sel] + ": the mean (spread " + Kit.fmt(lastRun.sd, 1) + " points)";
        E.drop.textContent = Kit.fmt(lastRun.mean, 1); E.a0.textContent = pc(base); E.a1.textContent = pc(base - lastRun.mean / 100);
      } else {
        s.append("text").attr("x", W / 2).attr("y", 40).attr("text-anchor", "middle").attr("font-size", 13).attr("fill", P.muted).text("Press a button to shuffle the column of " + names[sel]);
        E.name.textContent = "The shuffle test for " + names[sel]; E.drop.textContent = "–"; E.a0.textContent = pc(base); E.a1.textContent = "–";
      }
    }
    function drawAll() {
      chip.forEach(function (b, i) { b.setAttribute("aria-pressed", String(i === sel)); });
      drawBars(); drawTable(); drawShuffle();
      var ln = measures.map(function (m) { return (m.id === "shap" ? "SHAP" : m.name.toLowerCase()) + " #" + m.rank[sel]; }).join(", ");
      status.textContent = names[sel] + ": " + imp[F[sel]].count + " questions about it, " + ln + ".";
    }
    Kit.onTheme(drawAll); window.addEventListener("resize", Kit.debounce(drawAll));
    drawAll();
    return { select: function (f) { sel = f; lastRun = null; drawAll(); }, measures: measures, base: base };
  };

  /* ======================================================================
     mountWaterfall: SHAP shares for one example, one order, and all orders
     ====================================================================== */
  api.mountWaterfall = function (el, opts) {
    injectCss();
    var M = opts.model, F = M.features, d = F.length, names = opts.featureLabels || F, units = opts.units || F.map(function () { return ""; }), digs = opts.digits || F.map(function () { return 1; });
    var cn = opts.classNames || ["no", "yes"], noun = opts.noun || "case", rng = Kit.rng(opts.seed || 4127);
    var byId = {}; M.rows.forEach(function (r) { byId[r.id] = r; });
    var picks = (opts.picks || []).map(function (p) { return { name: p.name, row: byId[p.id] }; });
    // a confident wrong call among the held-out rows
    var wrong = null;
    M.rows.forEach(function (r) { if (r.held && (r.margin > 0 ? 1 : 0) !== r.y && (!wrong || Math.abs(r.margin) > Math.abs(wrong.margin))) wrong = r; });
    if (wrong) picks.push({ name: "A wrong call", row: wrong });
    var heldRows = M.rows.filter(function (r) { return r.held; });
    var cur = picks[0].row, x = cur.x.slice(), S = null, view = "average", order = null, orders = core.orders(d), allSteps = null, selF = 0, edited = false;
    var ranges = F.map(function (_, f) { var v = M.rows.map(function (r) { return r.x[f]; }).sort(function (a, b) { return a - b; }); return [v[Math.floor(v.length * 0.03)], v[Math.floor(v.length * 0.97)]]; });
    el.classList.add("bl"); el.innerHTML = "";
    var row1 = H("div", { class: "bl-row" }, el); H("span", { class: "label" }, row1, "Explain");
    var pchips = Kit.chips(row1, picks.map(function (p) { return p.name; }), 0, function (i) { choose(picks[i].row); });
    Kit.button(row1, "A random held-out " + noun, function () { choose(heldRows[Math.floor(rng() * heldRows.length)]); pchips.forEach(function (b) { b.setAttribute("aria-pressed", "false"); }); });
    var row2 = H("div", { class: "bl-row" }, el); H("span", { class: "label" }, row2, "View");
    var vchips = Kit.chips(row2, ["Average over all " + orders.length + " orders", "One order"], 0, function (i) { view = i === 0 ? "average" : "order"; if (i === 1 && !order) order = orders[Math.floor(rng() * orders.length)]; draw(); });
    var bNew = Kit.button(row2, "Another order", function () { order = orders[Math.floor(rng() * orders.length)]; if (view !== "order") { view = "order"; vchips[0].setAttribute("aria-pressed", "false"); vchips[1].setAttribute("aria-pressed", "true"); } draw(); });
    var ordBox = H("div", { class: "bl-order" }, el);
    var status = H("p", { class: "status", "aria-live": "polite" }, el, "");
    var grid = H("div", { class: "bl-grid" }, el), left = H("div", {}, grid), right = H("div", {}, grid);
    var wbox = H("div", {}, left), wsvg = Kit.el("svg", { role: "img", "aria-label": opts.aria || "A waterfall from the average score to this example's score, one step per input" }, wbox);
    var sh = H("p", { class: "bl-h4" }, right, ""), sbox = H("div", {}, right), ssvg = Kit.el("svg", { role: "img", "aria-label": "The step of one input in all the orders in which the inputs could be revealed" }, sbox);
    var sctrl = H("div", { class: "controls", style: "margin-top:12px" }, el), sliders = [];
    var eq = H("div", { class: "bl-eq" }, el), E = { phi: [] };
    (function () {
      var r = H("div", { class: "row" }, eq); H("span", { class: "name" }, r, "The score is the average plus the shares of the inputs");
      var q = H("div", { class: "eqn", role: "img", "aria-label": "The score equals the average score plus the SHAP shares of the inputs" }, r);
      E.score = eqBox(q, "c-teal", "score"); op(q, "="); E.base = eqBox(q, "", "average score");
      F.forEach(function (_, f) { op(q, "+"); E.phi.push(eqBox(q, "", names[f])); });
      var r2 = H("div", { class: "row" }, eq); var q2 = H("div", { class: "eqn", role: "img", "aria-label": "The chance equals the sigmoid of the score" }, r2);
      E.chance = eqBox(q2, "c-coral", "chance of " + cn[1]); op(q2, "="); E.sig = H("span", { class: "op" }, q2, "σ(score)"); op(q2, "="); E.sigv = eqBox(q2, "", "");
      E.avgp = H("span", { class: "note", style: "margin:0" }, r2, "");
    })();
    foot(el, opts);
    F.forEach(function (_, f) {
      var lo = Math.min(ranges[f][0], x[f]), hi = Math.max(ranges[f][1], x[f]);
      var sl = Kit.slider(sctrl, { label: names[f] + (units[f] ? ", " + units[f] : ""), min: lo, max: hi, step: "any", value: x[f], digits: digs[f] }, function (v) { x[f] = v; edited = true; recompute(); draw(); });
      sliders.push(sl);
    });
    var rbox = H("div", { class: "bl-row" }, el); Kit.button(rbox, "Put the measurements back", function () { x = cur.x.slice(); edited = false; fitSliders(); recompute(); draw(); });
    H("span", { class: "label" }, rbox, "The inputs move on their own here, so you can build a " + noun + " that could not exist.");

    function fitSliders() { sliders.forEach(function (sl, f) { sl.input.min = Math.min(ranges[f][0], x[f]); sl.input.max = Math.max(ranges[f][1], x[f]); sl.set(x[f]); }); }
    function choose(r) { cur = r; x = r.x.slice(); edited = false; fitSliders(); recompute(); draw(); }
    function recompute() {
      S = core.shap(M, x); allSteps = null;
      selF = S.shap.map(Math.abs).indexOf(Math.max.apply(null, S.shap.map(Math.abs)));
    }
    function stepsOfAll() {
      if (allSteps) return allSteps;
      allSteps = F.map(function () { return []; });
      orders.forEach(function (o) { core.orderSteps(S.v, o).forEach(function (st) { allSteps[st.f].push(st.d); }); });
      return allSteps;
    }
    function val(f) { return trim(x[f], digs[f]) + (units[f] ? " " + units[f] : ""); }
    function draw() {
      var P = Kit.palette(), W = Kit.width(wbox), rowH = 34, top = 52, rows = [];
      // rows of the waterfall
      var steps, cumStart = S.base;
      if (view === "average") {
        var idx = F.map(function (_, f) { return f; }).sort(function (a, b) { return Math.abs(S.shap[b]) - Math.abs(S.shap[a]); });
        steps = idx.map(function (f) { return { f: f, d: S.shap[f] }; });
      } else {
        steps = core.orderSteps(S.v, order);
      }
      var cum = S.base, path = [S.base];
      steps.forEach(function (st) { st.from = cum; cum += st.d; st.to = cum; path.push(cum); });
      var lo = Math.min.apply(null, path.concat([S.base])), hi = Math.max.apply(null, path.concat([S.base]));
      var pad = Math.max(0.6, (hi - lo) * 0.12), lab = Math.min(170, W * 0.42);
      var xsc = d3.scaleLinear().domain([lo - pad, hi + pad]).range([lab, W - 30]);
      var Hh = top + (steps.length + 2) * rowH + 8, s = d3.select(wsvg);
      s.attr("viewBox", "0 0 " + W + " " + Hh).attr("width", W).selectAll("*").remove();
      // top axis in score, with chance labels
      var ticks = d3.range(Math.ceil((lo - pad) / 2) * 2, hi + pad + 0.01, 2);
      s.append("g").attr("transform", "translate(0," + (top - 14) + ")").call(d3.axisTop(xsc).tickValues(ticks).tickSize(3)).call(styleAxis(P));
      ticks.forEach(function (t) { s.append("text").attr("x", xsc(t)).attr("y", 10).attr("text-anchor", "middle").attr("font-size", 10.5).attr("fill", P.muted).text(Math.round(100 * sigmoid(t)) + "%"); });
      s.append("text").attr("x", 2).attr("y", 10).attr("font-size", 10.5).attr("fill", P.muted).text("chance of " + cn[1]);
      s.append("text").attr("x", 2).attr("y", top - 16).attr("font-size", 10.5).attr("fill", P.muted).text("score");
      s.append("line").attr("x1", xsc(0)).attr("x2", xsc(0)).attr("y1", top - 12).attr("y2", Hh - 6).attr("stroke", P.rule).attr("stroke-dasharray", "3 3");
      function rowAt(i) { return top + i * rowH; }
      // start row
      s.append("text").attr("x", 4).attr("y", rowAt(0) + 18).attr("font-size", 13).attr("fill", P.ink).attr("font-weight", 600).text("average score");
      s.append("circle").attr("cx", xsc(S.base)).attr("cy", rowAt(0) + 14).attr("r", 6).attr("fill", P.ink);
      s.append("text").attr("x", xsc(S.base) + 10).attr("y", rowAt(0) + 18).attr("font-size", 12).attr("fill", P.ink2).text(f2(S.base) + " (" + Math.round(100 * sigmoid(S.base)) + "%)");
      steps.forEach(function (st, i) {
        var y0 = rowAt(i + 1), pos = st.d >= 0, col = pos ? P.coral : P.navy, f = st.f, on = f === selF;
        var g = s.append("g").style("cursor", "pointer").on("click", function () { selF = f; draw(); });
        if (on) g.append("rect").attr("x", 0).attr("y", y0).attr("width", W).attr("height", rowH - 2).attr("fill", P.mark);
        g.append("text").attr("x", 4).attr("y", y0 + 14).attr("font-size", 12.5).attr("fill", P.ink).attr("font-weight", 600).text(names[f]);
        g.append("text").attr("x", 4).attr("y", y0 + 28).attr("font-size", 11).attr("fill", P.muted).text("= " + val(f));
        var xa = xsc(Math.min(st.from, st.to)), xb = xsc(Math.max(st.from, st.to));
        g.append("rect").attr("x", xa).attr("y", y0 + 6).attr("width", Math.max(2, xb - xa)).attr("height", 18).attr("rx", 2).attr("fill", col).attr("opacity", 0.9);
        g.append("line").attr("x1", xsc(st.from)).attr("x2", xsc(st.from)).attr("y1", y0 - 4).attr("y2", y0 + 6).attr("stroke", P.muted);
        var lx = pos ? xb + 5 : xa - 5, anchor = pos ? "start" : "end";
        g.append("text").attr("x", lx).attr("y", y0 + 19).attr("text-anchor", anchor).attr("font-size", 12).attr("fill", P.ink2).attr("font-weight", 600).text((pos ? "+" : "−") + Math.abs(st.d).toFixed(2));
        if (view === "order") g.append("path").attr("d", d3.symbol().type(d3.symbolDiamond).size(70)()).attr("transform", "translate(" + xsc(st.from + S.shap[f]) + "," + (y0 + 15) + ")").attr("fill", "none").attr("stroke", P.ink).attr("stroke-width", 1.6);
        g.append("title").text(names[f] + ": " + (pos ? "+" : "−") + Math.abs(st.d).toFixed(3));
      });
      var yEnd = rowAt(steps.length + 1);
      s.append("line").attr("x1", xsc(S.margin)).attr("x2", xsc(S.margin)).attr("y1", rowAt(1)).attr("y2", yEnd + 6).attr("stroke", P.teal).attr("stroke-width", 1.5).attr("stroke-dasharray", "4 3");
      s.append("text").attr("x", 4).attr("y", yEnd + 18).attr("font-size", 13).attr("fill", P.ink).attr("font-weight", 600).text("this " + noun + "'s score");
      s.append("circle").attr("cx", xsc(S.margin)).attr("cy", yEnd + 14).attr("r", 6.5).attr("fill", P.teal);
      s.append("text").attr("x", xsc(S.margin) + (S.margin > (lo + hi) / 2 ? -10 : 10)).attr("y", yEnd + 18).attr("text-anchor", S.margin > (lo + hi) / 2 ? "end" : "start").attr("font-size", 12).attr("fill", P.ink2).text(f2(S.margin) + " (" + Math.round(100 * sigmoid(S.margin)) + "%)");
      // order chips
      ordBox.innerHTML = "";
      if (view === "order") { H("span", {}, ordBox, "Order of reveal:"); order.forEach(function (f, i) { H("span", { class: "chip" }, ordBox, (i + 1) + ". " + names[f]); }); H("span", {}, ordBox, " The diamond marks where the step would end if it had its average size."); }
      else { H("span", {}, ordBox, "A bar is the average step over all " + orders.length + " orders, largest first. Coral pushes the score toward " + cn[1] + ", navy toward " + cn[0] + ". Click a row to see its step in all of them."); }
      // strip of one input over all orders
      var st = stepsOfAll()[selF], Hs = 160, ms = { l: 12, r: 14, t: 14, b: 32 }, W2 = Kit.width(sbox), s2 = d3.select(ssvg);
      s2.attr("viewBox", "0 0 " + W2 + " " + Hs).attr("width", W2).selectAll("*").remove();
      var mn = d3.min(st), mx = d3.max(st), x2 = d3.scaleLinear().domain([Math.min(mn, S.shap[selF]) - 0.3, Math.max(mx, S.shap[selF]) + 0.3]).range([ms.l, W2 - ms.r]);
      s2.append("g").attr("transform", "translate(0," + (Hs - ms.b) + ")").call(d3.axisBottom(x2).ticks(6).tickSize(3)).call(styleAxis(P));
      s2.append("text").attr("x", (ms.l + W2 - ms.r) / 2).attr("y", Hs - 2).attr("text-anchor", "middle").attr("font-size", 12).attr("fill", P.ink2).text("step added by " + names[selF] + ", in score units");
      var r2 = Kit.rng(11);
      st.forEach(function (v) { s2.append("circle").attr("cx", x2(v)).attr("cy", ms.t + 6 + r2() * (Hs - ms.t - ms.b - 18)).attr("r", 2.6).attr("fill", P.sand).attr("opacity", 0.55); });
      s2.append("line").attr("x1", x2(0)).attr("x2", x2(0)).attr("y1", ms.t).attr("y2", Hs - ms.b).attr("stroke", P.muted).attr("stroke-dasharray", "3 3");
      s2.append("line").attr("x1", x2(S.shap[selF])).attr("x2", x2(S.shap[selF])).attr("y1", ms.t).attr("y2", Hs - ms.b).attr("stroke", S.shap[selF] >= 0 ? P.coral : P.navy).attr("stroke-width", 3);
      s2.append("text").attr("x", x2(S.shap[selF]) + (S.shap[selF] > (mn + mx) / 2 ? -6 : 6)).attr("y", ms.t + 8).attr("text-anchor", S.shap[selF] > (mn + mx) / 2 ? "end" : "start").attr("font-size", 12).attr("fill", P.ink).attr("font-weight", 600).text("average " + Kit.fmt(S.shap[selF], 2));
      sh.textContent = names[selF] + ": its step in all " + orders.length + " orders (dots). Their average is its SHAP value.";
      // equations
      E.score.textContent = f2(S.margin); E.base.textContent = f2(S.base);
      F.forEach(function (_, f) { var b = E.phi[f], v = S.shap[f]; b.textContent = (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(2); b.parentNode.className = "t " + (v >= 0 ? "c-coral" : "c-navy"); });
      E.sigv.textContent = pc(sigmoid(S.margin), 0); E.avgp.textContent = "The average score " + f2(S.base) + " is a chance of " + pc(sigmoid(S.base), 0) + ".";
      var truth = cur.y ? cn[1] : cn[0], call = S.margin > 0 ? cn[1] : cn[0];
      status.textContent = (edited ? "Edited " + noun + ". " : "") + "The model gives a score of " + f2(S.margin) + ", a " + pc(sigmoid(S.margin), 0) + " chance of " + cn[1] + ", so it calls " + call + (edited ? "." : "; the table says " + truth + ".");
    }
    Kit.onTheme(draw); window.addEventListener("resize", Kit.debounce(draw));
    recompute(); draw();
    return { choose: choose, shap: function () { return S; }, setView: function (v) { view = v; if (v === "order" && !order) order = orders[0]; draw(); } };
  };
  return api;
})();
if (typeof module !== "undefined" && module.exports) module.exports = BoostLab;
