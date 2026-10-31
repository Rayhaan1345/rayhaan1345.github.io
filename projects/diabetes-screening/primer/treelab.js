/* TreeLab: decision-tree figures for two numeric features and a yes/no label (and one numeric target).
 * Copied from mailab.in/primer/a5-decision-trees/treelab.js for the diabetes primer. Local change, marked LOCAL below:
 * option `mark` ({x: [v1, v2], label, name}) draws one starred, labelled point on the plots of mountGrow and mountDepth.
 *
 *
 * Needs: Kit (primer/assets/kit.js), Plotly (any bundle with scatter), D3 v7. Free of chapter text:
 * every phrase that names the data comes from the options below.
 * The pure logic (core) also runs in Node: require("./treelab.js").core
 *
 * Common options (all mount functions)
 *   rows         array of objects, one per example
 *   features     [key1, key2]            numeric columns used for the two axes
 *   featureLabels [text1, text2]         axis titles, units included, e.g. "length, cm"
 *   featureNames [short1, short2]        names used inside questions, e.g. ["length", "depth"]
 *   units        [u1, u2]                unit text after a threshold, e.g. ["cm", "m"]
 *   label        key of a 0/1 column, or a function (row) => 0 or 1
 *   classNames   [name for 0, name for 1], e.g. ["other shark", "spadenose"]
 *   noun, nouns  "shark", "sharks" (default "case", "cases")
 *   heldOut      function (row) => true for held-out rows (default: none, so only training accuracy is shown)
 *   ranges       [[x0, x1], [y0, y1]]    plot ranges; rows outside are counted in a note
 *   ids, idLabel key that names a row in tooltips, and the word printed before it, e.g. "record_id" and "Tag" (optional)
 *   footnote     text shown under the figure (optional)
 *   mark         LOCAL: {x: [v1, v2], label: "A", name: "Woman A"}, one starred point on the scatter of mountGrow and mountDepth (optional)
 *   onChange     function (info) called after every change (optional)
 *   digits       [d1, d2]                decimals shown for thresholds (default 1)
 *   stepFor      [s1, s2]                slider step for thresholds (default 0.05)
 *   text         object that overrides any UI phrase (see TEXT below)
 *
 * Example with the Pima data (REPO/primer/data/clinic/pima.json has X, y and test; zeros in Glucose and BMI mean not measured):
 *   var rows = P.X.map(function (x, i) { return { Glucose: x[1], BMI: x[5], y: P.y[i], test: P.test[i] }; }).filter(function (r) { return r.Glucose > 0 && r.BMI > 0; });
 *   TreeLab.mountGrow(el, { rows: rows, features: ["Glucose", "BMI"], featureLabels: ["glucose", "BMI"], featureNames: ["glucose", "BMI"], label: "y",
 *     classNames: ["no diabetes", "diabetes"], noun: "woman", nouns: "women", heldOut: function (r) { return r.test === 1; }, ranges: [[40, 205], [15, 70]], digits: [0, 1], stepFor: [0.5, 0.1] });
 *
 * TreeLab.mountGrow(el, opts)        grow a tree by hand, hover a leaf or a box to link them, Gini boxes, greedy scan
 *     extra: maxDepth (default 5), startFeature (0), onChange(info)
 * TreeLab.mountRead(el, opts)        follow one example down a tree; drag the ringed point
 *     extra: tree: {depth, minLeaf} grown greedily on training rows (default depth 2), picks: [{name, x: [v1, v2]}]
 * TreeLab.mountDepth(el, opts)       depth and smallest-leaf sliders, training and held-out accuracy, other random splits
 *     extra: maxDepth (default 12), splits (20), seed (4127), heldFrac (0.3)
 * TreeLab.mountGini(el, opts)        one-dimensional strip of examples, a divider to drag, Gini boxes and the Gini curve
 *     extra: values: [numbers], labels: [0/1...], featureLabel
 * TreeLab.mountRegression(el, opts)  a regression tree as a step function: target is a numeric column
 *     extra: x (key), y (key), xLabel, yLabel, yUnit, law: function (x) => y or null, xMax, maxDepth (default 8)
 */
var TreeLab = (function () {
  "use strict";

  /* ======================================================================
     Core: pure functions, no DOM
     ====================================================================== */
  var core = {};

  function gini(n0, n1) {
    var n = n0 + n1;
    if (n === 0) return 0;
    var p0 = n0 / n, p1 = n1 / n;
    return 1 - p0 * p0 - p1 * p1;
  }
  core.gini = gini;

  // Columns of numbers from rows.
  core.columns = function (rows, features) {
    return features.map(function (f) { return rows.map(function (r) { return +r[f]; }); });
  };
  core.labels = function (rows, label) {
    return rows.map(function (r) { return +(typeof label === "function" ? label(r) : r[label]) ? 1 : 0; });
  };

  // All candidate thresholds of one column over the rows in idx. A threshold lies halfway between two
  // neighbouring different values; "left" means value <= threshold. Returns arrays t, score, nl, and the
  // index of the lowest score (first one wins a tie). score = weighted Gini after the split.
  core.classCurve = function (col, y, idx, minLeaf) {
    minLeaf = minLeaf || 1;
    var order = idx.slice().sort(function (a, b) { return col[a] - col[b] || a - b; });
    var n = order.length, tot1 = 0, i;
    for (i = 0; i < n; i++) tot1 += y[order[i]];
    var tot0 = n - tot1, l0 = 0, l1 = 0, out = { t: [], score: [], nl: [], l1: [], best: -1 };
    for (i = 0; i < n - 1; i++) {
      if (y[order[i]]) l1++; else l0++;
      var v = col[order[i]], w = col[order[i + 1]];
      if (v === w) continue;
      var nl = i + 1, nr = n - nl;
      if (nl < minLeaf || nr < minLeaf) continue;
      var s = (nl * gini(l0, l1) + nr * gini(tot0 - l0, tot1 - l1)) / n;
      out.t.push(Math.round(((v + w) / 2) * 1e6) / 1e6); out.score.push(s); out.nl.push(nl); out.l1.push(l1);
      if (out.best < 0 || s < out.score[out.best] - 1e-12) out.best = out.t.length - 1;
    }
    return out;
  };

  // Counts on both sides of a threshold.
  core.counts = function (col, y, idx, t) {
    var l0 = 0, l1 = 0, r0 = 0, r1 = 0;
    for (var k = 0; k < idx.length; k++) {
      var i = idx[k];
      if (col[i] <= t) { if (y[i]) l1++; else l0++; } else { if (y[i]) r1++; else r0++; }
    }
    return { l0: l0, l1: l1, r0: r0, r1: r1 };
  };

  // Best split over all features for the rows in idx. Returns null when none improves on the node.
  core.bestSplit = function (cols, y, idx, minLeaf) {
    var n1 = 0, k;
    for (k = 0; k < idx.length; k++) n1 += y[idx[k]];
    var before = gini(idx.length - n1, n1), best = null;
    for (var f = 0; f < cols.length; f++) {
      var c = core.classCurve(cols[f], y, idx, minLeaf);
      if (c.best < 0) continue;
      var s = c.score[c.best];
      if (!best || s < best.score - 1e-12) best = { f: f, t: c.t[c.best], score: s, before: before, gain: before - s };
    }
    return best;
  };

  // A tree is {nodes: [...]}. A node: id, depth, parent, idx (training rows), n0, n1, f (-1 for a leaf), t, l, r, box.
  core.newTree = function (y, trainIdx, ranges) {
    var t = { nodes: [], y: y, ranges: ranges };
    t.nodes.push(mkNode(t, 0, -1, trainIdx, [ranges[0][0], ranges[0][1], ranges[1][0], ranges[1][1]]));
    return t;
  };
  function mkNode(tree, depth, parent, idx, box) {
    var n1 = 0;
    for (var k = 0; k < idx.length; k++) n1 += tree.y[idx[k]];
    return { id: tree.nodes.length, depth: depth, parent: parent, idx: idx, n0: idx.length - n1, n1: n1, f: -1, t: 0, l: -1, r: -1, box: box };
  }
  core.split = function (tree, cols, id, f, t) {
    var nd = tree.nodes[id], L = [], R = [];
    nd.idx.forEach(function (i) { (cols[f][i] <= t ? L : R).push(i); });
    var bl = nd.box.slice(), br = nd.box.slice();
    if (f === 0) { bl[1] = Math.min(bl[1], t); br[0] = Math.max(br[0], t); } else { bl[3] = Math.min(bl[3], t); br[2] = Math.max(br[2], t); }
    nd.f = f; nd.t = t;
    nd.l = tree.nodes.length; tree.nodes.push(mkNode(tree, nd.depth + 1, id, L, bl));
    nd.r = tree.nodes.length; tree.nodes.push(mkNode(tree, nd.depth + 1, id, R, br));
    return { l: nd.l, r: nd.r };
  };
  core.undo = function (tree) {
    if (tree.nodes.length < 3) return false;
    var r = tree.nodes.pop(), l = tree.nodes.pop(), p = tree.nodes[l.parent];
    p.f = -1; p.l = -1; p.r = -1;
    return p.id;
  };
  core.leaves = function (tree) { return tree.nodes.filter(function (n) { return n.f < 0; }); };
  core.leafOf = function (tree, x, maxDepth) {
    var nd = tree.nodes[0];
    while (nd.f >= 0 && (maxDepth == null || nd.depth < maxDepth)) nd = tree.nodes[x[nd.f] <= nd.t ? nd.l : nd.r];
    return nd;
  };
  core.call = function (nd) { return nd.n1 > nd.n0 ? 1 : 0; };
  core.path = function (tree, x) {
    var nd = tree.nodes[0], p = [0];
    while (nd.f >= 0) { nd = tree.nodes[x[nd.f] <= nd.t ? nd.l : nd.r]; p.push(nd.id); }
    return p;
  };
  // Accuracy on rows given by index list (X is an array of [x1, x2]).
  core.accuracy = function (tree, X, y, idx, maxDepth) {
    if (!idx.length) return NaN;
    var ok = 0;
    for (var k = 0; k < idx.length; k++) { var i = idx[k]; if (core.call(core.leafOf(tree, X[i], maxDepth)) === y[i]) ok++; }
    return ok / idx.length;
  };
  // Weighted Gini of the leaves (what greedy growing lowers).
  core.impurity = function (tree) {
    var n = tree.nodes[0].idx.length, s = 0;
    core.leaves(tree).forEach(function (l) { s += (l.n0 + l.n1) / n * gini(l.n0, l.n1); });
    return s;
  };
  // Grow the node and its children greedily (depth first). Stops at maxDepth, at minLeaf, or when no split lowers Gini by minGain.
  core.grow = function (tree, cols, id, o) {
    var nd = tree.nodes[id];
    if (nd.depth >= o.maxDepth || nd.n0 === 0 || nd.n1 === 0 || nd.idx.length < 2 * (o.minLeaf || 1)) return;
    var b = core.bestSplit(cols, tree.y, nd.idx, o.minLeaf || 1);
    if (!b || b.gain <= (o.minGain || 1e-9)) return;
    var kids = core.split(tree, cols, id, b.f, b.t);
    core.grow(tree, cols, kids.l, o); core.grow(tree, cols, kids.r, o);
  };
  // Best-first growth: always split the leaf with the largest weighted drop in Gini, until the tree has `leaves` leaves.
  core.growLeaves = function (tree, cols, leaves, minLeaf) {
    var n = tree.nodes[0].idx.length;
    while (core.leaves(tree).length < leaves) {
      var best = null;
      core.leaves(tree).forEach(function (l) {
        if (l.n0 === 0 || l.n1 === 0) return;
        var b = core.bestSplit(cols, tree.y, l.idx, minLeaf || 1);
        if (b && b.gain > 1e-9) { var w = b.gain * l.idx.length / n; if (!best || w > best.w + 1e-12) best = { id: l.id, b: b, w: w }; }
      });
      if (!best) break;
      core.split(tree, cols, best.id, best.b.f, best.b.t);
    }
  };

  // ---- regression: squared error ----
  // Candidate thresholds of one column for a numeric target. score = total squared error after the split.
  core.regCurve = function (col, y, idx, minLeaf) {
    minLeaf = minLeaf || 1;
    var order = idx.slice().sort(function (a, b) { return col[a] - col[b] || a - b; });
    var n = order.length, S = 0, Q = 0, i;
    for (i = 0; i < n; i++) { S += y[order[i]]; Q += y[order[i]] * y[order[i]]; }
    var ls = 0, lq = 0, out = { t: [], score: [], nl: [], best: -1 };
    for (i = 0; i < n - 1; i++) {
      var yy = y[order[i]]; ls += yy; lq += yy * yy;
      var v = col[order[i]], w = col[order[i + 1]];
      if (v === w) continue;
      var nl = i + 1, nr = n - nl;
      if (nl < minLeaf || nr < minLeaf) continue;
      var rs = S - ls, rq = Q - lq;
      var s = (lq - ls * ls / nl) + (rq - rs * rs / nr);
      out.t.push(Math.round(((v + w) / 2) * 1e6) / 1e6); out.score.push(s); out.nl.push(nl);
      if (out.best < 0 || s < out.score[out.best] - 1e-12) out.best = out.t.length - 1;
    }
    return out;
  };
  core.sse = function (y, idx) {
    var s = 0, q = 0;
    idx.forEach(function (i) { s += y[i]; q += y[i] * y[i]; });
    return q - (idx.length ? s * s / idx.length : 0);
  };
  // A regression tree on one column: nodes with lo, hi (interval), mean, n, sse, f (-1 leaf), t, l, r.
  core.growReg = function (col, y, idx, maxDepth, minLeaf, lo, hi) {
    var nodes = [];
    function mk(ix, depth, a, b) {
      var s = 0; ix.forEach(function (i) { s += y[i]; });
      var nd = { id: nodes.length, depth: depth, idx: ix, n: ix.length, mean: ix.length ? s / ix.length : 0, sse: core.sse(y, ix), lo: a, hi: b, f: -1, t: 0, l: -1, r: -1 };
      nodes.push(nd); return nd;
    }
    function rec(nd) {
      if (nd.depth >= maxDepth || nd.n < 2 * minLeaf) return;
      var c = core.regCurve(col, y, nd.idx, minLeaf);
      if (c.best < 0 || nd.sse - c.score[c.best] <= 1e-12) return;
      var t = c.t[c.best], L = [], R = [];
      nd.idx.forEach(function (i) { (col[i] <= t ? L : R).push(i); });
      nd.f = 0; nd.t = t;
      var a = mk(L, nd.depth + 1, nd.lo, t), b = mk(R, nd.depth + 1, t, nd.hi);
      nd.l = a.id; nd.r = b.id; rec(a); rec(b);
    }
    rec(mk(idx, 0, lo, hi));
    return { nodes: nodes };
  };
  core.predictReg = function (tree, x, maxDepth) {
    var nd = tree.nodes[0];
    while (nd.f >= 0 && (maxDepth == null || nd.depth < maxDepth)) nd = tree.nodes[x <= nd.t ? nd.l : nd.r];
    return nd;
  };
  core.rmse = function (tree, col, y, idx) {
    if (!idx.length) return NaN;
    var s = 0;
    idx.forEach(function (i) { var e = core.predictReg(tree, col[i]).mean - y[i]; s += e * e; });
    return Math.sqrt(s / idx.length);
  };

  /* ======================================================================
     Small helpers for the views
     ====================================================================== */
  var counter = 0;
  function uid(p) { counter += 1; return (p || "tl") + counter; }
  function trim(v, d) {                       // a threshold as text, up to d decimals, trailing zeros dropped
    var s = (+v).toFixed(d == null ? 2 : d);
    if (s.indexOf(".") >= 0) s = s.replace(/0+$/, "").replace(/\.$/, "");
    return s.replace("-", "−");
  }
  function f2(v) { return Kit.fmt(v, 2); }
  function f3(v) { return Kit.fmt(v, 3); }
  function pc(v, d) { return isNaN(v) ? "n/a" : (100 * v).toFixed(d == null ? 1 : d) + "%"; }
  // Colour string to rgba.
  function rgba(c, a) {
    var m, r = 0, g = 0, b = 0;
    c = String(c).trim();
    if ((m = /^#([0-9a-f]{3})$/i.exec(c))) { r = parseInt(m[1][0] + m[1][0], 16); g = parseInt(m[1][1] + m[1][1], 16); b = parseInt(m[1][2] + m[1][2], 16); }
    else if ((m = /^#([0-9a-f]{6})/i.exec(c))) { r = parseInt(m[1].slice(0, 2), 16); g = parseInt(m[1].slice(2, 4), 16); b = parseInt(m[1].slice(4, 6), 16); }
    else if ((m = /rgba?\(([^)]+)\)/.exec(c))) { var q = m[1].split(","); r = +q[0]; g = +q[1]; b = +q[2]; }
    return "rgba(" + r + "," + g + "," + b + "," + a + ")";
  }
  function H(tag, attrs, parent, text) { return Kit.html(tag, attrs, parent, text); }
  function eqBox(parent, cls, valueId, caption) {      // one box of an equation row; returns the <b>
    var s = H("span", { class: "t" + (cls ? " " + cls : "") }, parent), b = H("b", {}, s, "");
    H("i", {}, s, caption || "");
    return b;
  }
  function op(parent, text) { return H("span", { class: "op" }, parent, text); }

  function foot(el, opts) { if (opts.footnote) H("p", { class: "note" }, el, opts.footnote); }

  var TEXT = {
    askAbout: "Ask about", threshold: "Threshold", splitHere: "Split here", choose: "Let the computer choose", undo: "Undo",
    reset: "Start again", showHeld: "show held-out", hideHeld: "hide held-out", yes: "yes", no: "no",
    rowBefore: "Before the split, in the chosen box", rowAfter: "After the split: the two sides, weighted by their size",
    pickBox: "Click a box on the plot or a node in the tree to choose which box to split."
  };
  function T(opts, key) { return (opts.text && opts.text[key] != null) ? opts.text[key] : TEXT[key]; }

  // Prepare data shared by all views.
  function prep(opts) {
    var d = { rows: opts.rows, features: opts.features };
    d.cols = core.columns(opts.rows, opts.features);
    d.X = opts.rows.map(function (r, i) { return [d.cols[0][i], d.cols[1][i]]; });
    d.y = core.labels(opts.rows, opts.label);
    d.held = opts.rows.map(function (r) { return opts.heldOut ? !!opts.heldOut(r) : false; });
    d.train = []; d.test = [];
    d.held.forEach(function (h, i) { (h ? d.test : d.train).push(i); });
    d.ranges = opts.ranges || [0, 1].map(function (f) {
      var lo = Math.min.apply(null, d.cols[f]), hi = Math.max.apply(null, d.cols[f]), pad = (hi - lo) * 0.04;
      return [lo - pad, hi + pad];
    });
    d.noun = opts.noun || "case"; d.nouns = opts.nouns || (d.noun + "s");
    d.cn = opts.classNames || ["no", "yes"];
    d.fl = opts.featureLabels || opts.features;
    d.fn = opts.featureNames || opts.features;
    d.units = opts.units || ["", ""];
    d.digits = opts.digits || [1, 1];
    d.step = opts.stepFor || [0.05, 0.05];
    d.outside = 0;
    d.rows.forEach(function (r, i) {
      if (d.cols[0][i] < d.ranges[0][0] || d.cols[0][i] > d.ranges[0][1] || d.cols[1][i] < d.ranges[1][0] || d.cols[1][i] > d.ranges[1][1]) d.outside++;
    });
    return d;
  }
  function question(d, f, t) { return d.fn[f] + " ≤ " + trim(t, 2) + (d.units[f] ? " " + d.units[f] : "") + "?"; }

  /* ======================================================================
     Views are added below by the second half of this file
     ====================================================================== */
  var api = { core: core, _h: { uid: uid, trim: trim, f2: f2, f3: f3, pc: pc, rgba: rgba, H: H, eqBox: eqBox, op: op, T: T, prep: prep, question: question, TEXT: TEXT } };
  /* ======================================================================
     Styles for the figures (added once)
     ====================================================================== */
  function injectCss() {
    if (document.getElementById("treelab-css")) return;
    var s = document.createElement("style");
    s.id = "treelab-css";
    s.textContent = [
      ".tl .tl-grid { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); gap: 14px 22px; align-items: start; }",
      ".tl .tl-wrap { position: relative; }",
      ".tl .tl-ovl { position: absolute; left: 0; top: 0; right: 0; bottom: 0; pointer-events: none; overflow: hidden; }",
      ".tl .tl-ovl > * { position: absolute; box-sizing: border-box; }",
      ".tl .tl-plot .nsewdrag, .tl .tl-plot .drag { touch-action: pan-y; }",
      ".tl .tl-yes { background: rgba(15,154,128,0.10); border: 1px solid rgba(15,154,128,0.45); }",
      ".tl .tl-no { background: rgba(168,149,124,0.14); border: 1px dashed rgba(168,149,124,0.8); }",
      ".tl .tl-hov { border: 2px dashed var(--ink); background: var(--mark); }",
      ".tl .tl-line { background: var(--ink); width: 2px; height: 2px; }",
      ".tl .tl-hit { pointer-events: auto; touch-action: none; background: transparent; }",
      ".tl .tl-knob { pointer-events: auto; touch-action: none; width: 22px; height: 22px; margin: -11px 0 0 -11px; border-radius: 50%; background: var(--bg); border: 3px solid var(--ink); cursor: grab; box-shadow: 0 1px 4px rgba(0,0,0,0.25); }",
      ".tl .tl-knob:focus-visible { outline: 3px solid var(--teal); outline-offset: 2px; }",
      ".tl .tl-pt { pointer-events: auto; touch-action: none; width: 26px; height: 26px; margin: -13px 0 0 -13px; border-radius: 50%; background: rgba(0,0,0,0); border: 3px solid var(--ink); cursor: grab; box-shadow: 0 0 0 2px var(--bg); }",
      ".tl .tl-pt::after { content: \"\"; position: absolute; left: 50%; top: 50%; width: 6px; height: 6px; margin: -3px 0 0 -3px; border-radius: 50%; background: var(--ink); }",
      ".tl .tl-pt:focus-visible { outline: 3px solid var(--teal); outline-offset: 2px; }",
      ".tl .tl-tree svg g.nd { cursor: pointer; }",
      ".tl .tl-tree svg g.nd:focus { outline: none; }",
      ".tl .tl-tree svg g.nd:focus-visible .ring { stroke: var(--ink); stroke-width: 3; }",
      ".tl .tl-eq { margin: 12px 0 0; }",
      ".tl .tl-eq .row { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; margin: 8px 0; }",
      ".tl .tl-eq .row > .name { flex: 0 0 100%; font-size: 14px; color: var(--muted); }",
      ".tl .tl-eq .eqn { margin: 0; }",
      ".tl .tl-curves { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 18px; margin: 10px 0 0; }",
      ".tl .tl-grid .tl-curves { grid-template-columns: minmax(0, 1fr); margin-top: 6px; }",
      ".tl .tl-curves h4 { margin: 0 0 2px; font-size: 14px; font-weight: 500; color: var(--muted); }",
      ".tl .tl-curves svg { height: auto; }",
      ".tl .tl-note { margin: 6px 0 0; font-size: 14px; color: var(--muted); }",
      ".tl .tl-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; margin: 0 0 10px; }",
      ".tl .tl-row .label { font-size: 14px; color: var(--muted); }",
      ".tl .tl-strip svg { height: auto; }",
      "@media (max-width: 760px) { .tl .tl-grid { grid-template-columns: minmax(0, 1fr); } .tl .tl-curves { grid-template-columns: minmax(0, 1fr); } }"
    ].join("\n");
    document.head.appendChild(s);
  }

  /* ======================================================================
     Scatter: a Plotly plot with leaf boxes behind the points and DOM overlays on top
     ====================================================================== */
  function makeScatter(host, d, o) {
    o = o || {};
    var S = { d: d, leaves: [], showHeld: false, moveFn: null, clickFn: null, dragFn: null, ptFn: null, cand: null, hov: null, pt: null };
    S.wrap = H("div", { class: "tl-wrap" }, host);
    S.div = H("div", { class: "plot tall tl-plot", role: "img", "aria-label": o.aria || "Scatter plot of the examples" }, S.wrap);
    S.ovl = H("div", { class: "tl-ovl" }, S.wrap);
    S.hovEl = H("div", { class: "tl-hov", style: "display:none" }, S.ovl);
    S.yesEl = H("div", { class: "tl-yes", style: "display:none" }, S.ovl);
    S.noEl = H("div", { class: "tl-no", style: "display:none" }, S.ovl);
    S.lineEl = H("div", { class: "tl-line", style: "display:none" }, S.ovl);
    S.hitEl = H("div", { class: "tl-hit", style: "display:none" }, S.ovl);
    S.knobEl = H("div", { class: "tl-knob", tabindex: "0", role: "slider", style: "display:none" }, S.ovl);
    S.ptEl = H("div", { class: "tl-pt", tabindex: "0", role: "slider", style: "display:none" }, S.ovl);

    var texts = d.rows.map(function (r, i) {
      var id = o.ids && r[o.ids] != null ? (o.idLabel || o.ids) + " " + r[o.ids] + ": " : "";
      return id + trim(d.cols[0][i], d.digits[0]) + " " + d.units[0] + ", " + trim(d.cols[1][i], d.digits[1]) + " " + d.units[1] + ", " + d.cn[d.y[i]];
    });
    function inside(i) { return d.cols[0][i] >= d.ranges[0][0] && d.cols[0][i] <= d.ranges[0][1] && d.cols[1][i] >= d.ranges[1][0] && d.cols[1][i] <= d.ranges[1][1]; }
    function pick(cls, held) {
      var ix = [];
      for (var i = 0; i < d.rows.length; i++) if (d.y[i] === cls && d.held[i] === held && inside(i)) ix.push(i);
      return ix;
    }
    var groups = [pick(0, false), pick(1, false), pick(0, true), pick(1, true)];

    function traces(P) {
      function tr(ix, symbol, color, held, name) {
        return {
          type: "scatter", mode: "markers", name: name,
          x: ix.map(function (i) { return d.cols[0][i]; }), y: ix.map(function (i) { return d.cols[1][i]; }),
          text: ix.map(function (i) { return texts[i]; }), hovertemplate: "%{text}<extra></extra>",
          visible: held ? S.showHeld : true,
          marker: held ? { symbol: symbol + "-open", size: 9, color: color, line: { color: color, width: 2 } }
                       : { symbol: symbol, size: symbol === "diamond" ? 8 : 7, color: color, opacity: 0.85, line: { color: P.bg, width: 0.6 } }
        };
      }
      var out = [tr(groups[0], "circle", P.navy, false, d.cn[0]), tr(groups[1], "diamond", P.coral, false, d.cn[1]),
              tr(groups[2], "circle", P.navy, true, d.cn[0] + " (held out)"), tr(groups[3], "diamond", P.coral, true, d.cn[1] + " (held out)")];
      if (o.mark) {   // LOCAL: one starred, labelled point (Woman A in the diabetes primer)
        out.push({ type: "scatter", mode: "markers+text", x: [o.mark.x[0]], y: [o.mark.x[1]], text: [o.mark.label || ""], textposition: "top right", textfont: { color: P.ink, size: 13 },
          hoverinfo: "skip", showlegend: false, marker: { symbol: "star", size: 16, color: P.teal, line: { color: P.ink, width: 1.6 } } });
      }
      return out;
    }
    function layout(P) {
      var shapes = [], notes = [], g = approx();
      S.leaves.forEach(function (lf) {
        var pur = Math.abs(lf.p1 - 0.5) * 2, col = lf.call ? P.coral : P.navy;
        shapes.push({
          type: "rect", xref: "x", yref: "y", x0: lf.box[0], x1: lf.box[1], y0: lf.box[2], y1: lf.box[3], layer: "below",
          fillcolor: rgba(col, lf.n ? 0.08 + 0.2 * pur : 0.04),
          line: { color: lf.selected ? P.teal : P.muted, width: lf.selected ? 3.5 : 1 }
        });
        var wpx = (lf.box[1] - lf.box[0]) / (d.ranges[0][1] - d.ranges[0][0]) * g.w, hpx = (lf.box[3] - lf.box[2]) / (d.ranges[1][1] - d.ranges[1][0]) * g.h;
        if (wpx > 26 && hpx > 20) {
          var txt = "<b>" + lf.label + "</b>" + (wpx > 92 && hpx > 38 && lf.sub ? "  " + lf.sub : "");
          notes.push({ x: lf.box[0], y: lf.box[3], xref: "x", yref: "y", xanchor: "left", yanchor: "top", xshift: 4, yshift: -3, text: txt, showarrow: false, font: { size: 12, color: P.ink2 } });
        }
      });
      return {
        margin: { l: 54, r: 12, t: 10, b: 46 }, dragmode: false, hovermode: "closest", shapes: shapes, annotations: notes,
        xaxis: { title: { text: d.fl[0] }, range: d.ranges[0], zeroline: false, fixedrange: true },
        yaxis: { title: { text: d.fl[1] }, range: d.ranges[1], zeroline: false, fixedrange: true }
      };
    }
    function approx() { var w = Math.max(240, S.div.clientWidth || 500), h = Math.max(240, S.div.clientHeight || 440); return { w: w - 66, h: h - 56 }; }

    S.geom = function () {
      var fl = S.div._fullLayout;
      if (!fl || !fl._size || !fl.xaxis || !fl.xaxis.range) return null;
      var s = fl._size;
      return { l: s.l, t: s.t, w: s.w, h: s.h, x0: fl.xaxis.range[0], x1: fl.xaxis.range[1], y0: fl.yaxis.range[0], y1: fl.yaxis.range[1] };
    };
    S.px = function (x, y) {
      var g = S.geom(); if (!g) return [0, 0];
      return [g.l + (x - g.x0) / (g.x1 - g.x0) * g.w, g.t + (g.y1 - y) / (g.y1 - g.y0) * g.h];
    };
    S.data = function (px, py) {
      var g = S.geom(); if (!g) return null;
      return [g.x0 + (px - g.l) / g.w * (g.x1 - g.x0), g.y1 - (py - g.t) / g.h * (g.y1 - g.y0), px >= g.l && px <= g.l + g.w && py >= g.t && py <= g.t + g.h];
    };
    function rect(el, box) {
      var a = S.px(box[0], box[3]), b = S.px(box[1], box[2]);
      el.style.left = a[0] + "px"; el.style.top = a[1] + "px"; el.style.width = Math.max(0, b[0] - a[0]) + "px"; el.style.height = Math.max(0, b[1] - a[1]) + "px";
    }
    // Place all overlays from their stored state.
    S.place = function () {
      if (!S.geom()) return;
      if (S.hov) { rect(S.hovEl, S.hov); S.hovEl.style.display = "block"; } else S.hovEl.style.display = "none";
      var c = S.cand;
      if (c) {
        var yb = c.box.slice(), nb = c.box.slice();
        if (c.f === 0) { yb[1] = c.t; nb[0] = c.t; } else { yb[3] = c.t; nb[2] = c.t; }
        rect(S.yesEl, yb); rect(S.noEl, nb);
        S.yesEl.style.display = S.noEl.style.display = "block";
        var p = c.f === 0 ? S.px(c.t, c.box[2]) : S.px(c.box[0], c.t), q = c.f === 0 ? S.px(c.t, c.box[3]) : S.px(c.box[1], c.t);
        var ln = S.lineEl, ht = S.hitEl, kn = S.knobEl;
        if (c.f === 0) {
          ln.style.left = (p[0] - 1) + "px"; ln.style.top = q[1] + "px"; ln.style.width = "2px"; ln.style.height = (p[1] - q[1]) + "px";
          ht.style.left = (p[0] - 10) + "px"; ht.style.top = q[1] + "px"; ht.style.width = "20px"; ht.style.height = (p[1] - q[1]) + "px"; ht.style.cursor = "ew-resize";
          kn.style.left = p[0] + "px"; kn.style.top = ((p[1] + q[1]) / 2) + "px";
        } else {
          ln.style.left = p[0] + "px"; ln.style.top = (p[1] - 1) + "px"; ln.style.width = (q[0] - p[0]) + "px"; ln.style.height = "2px";
          ht.style.left = p[0] + "px"; ht.style.top = (p[1] - 10) + "px"; ht.style.width = (q[0] - p[0]) + "px"; ht.style.height = "20px"; ht.style.cursor = "ns-resize";
          kn.style.left = ((p[0] + q[0]) / 2) + "px"; kn.style.top = p[1] + "px";
        }
        ln.style.display = ht.style.display = kn.style.display = "block";
        kn.setAttribute("aria-valuenow", String(c.t)); kn.setAttribute("aria-label", c.aria || "Threshold");
      } else {
        S.yesEl.style.display = S.noEl.style.display = S.lineEl.style.display = S.hitEl.style.display = S.knobEl.style.display = "none";
      }
      if (S.pt) { var a = S.px(S.pt[0], S.pt[1]); S.ptEl.style.left = a[0] + "px"; S.ptEl.style.top = a[1] + "px"; S.ptEl.style.display = "block"; } else S.ptEl.style.display = "none";
    };
    S.setHover = function (box) { S.hov = box; S.place(); };
    S.setCand = function (c) { S.cand = c; S.place(); };
    S.setPoint = function (p) { S.pt = p; S.place(); };
    S.draw = function () {
      var pr = Kit.plot(S.div, traces, layout);
      if (pr && pr.then) pr.then(function () {
        if (!S._bound && S.div.on) { S._bound = true; S.div.on("plotly_afterplot", function () { S.place(); }); }
        S.place();
      });
    };

    // Pointer: hover and click inside the plot area (does not block Plotly's own point hover).
    S.div.addEventListener("pointermove", function (e) {
      if (!S.moveFn) return;
      var r = S.div.getBoundingClientRect(), p = S.data(e.clientX - r.left, e.clientY - r.top);
      S.moveFn(p && p[2] ? p : null);
    });
    S.div.addEventListener("pointerleave", function () { if (S.moveFn) S.moveFn(null); });
    S.div.addEventListener("click", function (e) {
      if (!S.clickFn) return;
      var r = S.div.getBoundingClientRect(), p = S.data(e.clientX - r.left, e.clientY - r.top);
      if (p && p[2]) S.clickFn(p);
    });

    // Dragging helpers: one for the threshold, one for the ringed point.
    function dragger(el, fn) {
      el.addEventListener("pointerdown", function (e) {
        e.preventDefault(); el.setPointerCapture(e.pointerId);
        function move(ev) { var r = S.div.getBoundingClientRect(); fn(S.data(ev.clientX - r.left, ev.clientY - r.top), false); }
        function up(ev) { el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up); fn(null, true); }
        el.addEventListener("pointermove", move); el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
        move(e);
      });
    }
    dragger(S.knobEl, function (p, end) { if (p && S.dragFn) S.dragFn(p, end); });
    dragger(S.hitEl, function (p, end) { if (p && S.dragFn) S.dragFn(p, end); });
    dragger(S.ptEl, function (p, end) { if (p && S.ptFn) S.ptFn(p, end); });
    S.knobEl.addEventListener("keydown", function (e) { if (S.keyFn && S.keyFn(e)) e.preventDefault(); });
    S.ptEl.addEventListener("keydown", function (e) { if (S.ptKeyFn && S.ptKeyFn(e)) e.preventDefault(); });
    S.note = H("p", { class: "tl-note" }, host, d.outside ? d.outside + " of the " + d.rows.length + " " + d.nouns + " lie outside the edges of this plot, but the tree still uses them." : "");
    if (!d.outside) S.note.style.display = "none";
    return S;
  }

  /* ======================================================================
     Tree diagram (D3), drawn left to right
     ====================================================================== */
  function makeTree(host, d, o) {
    o = o || {};
    var T = { hoverFn: null, clickFn: null, state: { sel: -1, hov: -1, path: [] } };
    T.box = H("div", { class: "tl-tree" }, host);
    T.svg = Kit.el("svg", { role: "img", "aria-label": o.aria || "The decision tree drawn from left to right" }, T.box);
    T.draw = function (tree, nums) {
      T.tree = tree; T.nums = nums;
      var P = Kit.palette(), svg = d3.select(T.svg), W = Kit.width(T.box), rowH = 30, padL = 8, padT = 14;
      var lv = core.leaves(tree), maxD = 0;
      tree.nodes.forEach(function (n) { if (n.depth > maxD) maxD = n.depth; });
      var leafW = 96, colW = Math.max(52, Math.min(120, (W - leafW - padL - 4) / Math.max(1, maxD)));
      var H0 = Math.max(150, lv.length * rowH + padT * 2);
      svg.attr("viewBox", "0 0 " + W + " " + H0).attr("width", W).selectAll("*").remove();
      // positions: leaves by depth-first order, internal nodes at the middle of their children
      var yy = {}, k = 0;
      (function walk(id) {
        var n = tree.nodes[id];
        if (n.f < 0) { yy[id] = padT + (k + 0.5) * rowH; k++; return; }
        walk(n.l); walk(n.r); yy[id] = (yy[n.l] + yy[n.r]) / 2;
      })(0);
      function xx(id) { return padL + tree.nodes[id].depth * colW; }
      var st = T.state, onPath = {}; st.path.forEach(function (i) { onPath[i] = true; });
      // edges
      tree.nodes.forEach(function (n) {
        if (n.f < 0) return;
        [n.l, n.r].forEach(function (c, side) {
          var x0 = xx(n.id) + 5, x1 = xx(c), xm = (x0 + x1) / 2, hot = onPath[n.id] && onPath[c];
          svg.append("path").attr("d", "M" + x0 + "," + yy[n.id] + "H" + xm + "V" + yy[c] + "H" + x1).attr("fill", "none")
            .attr("stroke", hot ? P.coral : P.muted).attr("stroke-width", hot ? 3 : 1.4).attr("opacity", hot ? 1 : 0.8);
          svg.append("text").attr("x", xm + 3).attr("y", yy[c] - 3).attr("font-size", 10.5).attr("fill", P.muted).text(side === 0 ? T.yes : T.no);
        });
      });
      // nodes
      tree.nodes.forEach(function (n) {
        var g = svg.append("g").attr("class", "nd").attr("transform", "translate(" + xx(n.id) + "," + yy[n.id] + ")").attr("tabindex", 0).attr("role", "button");
        var isLeaf = n.f < 0, num = nums[n.id], hot = onPath[n.id], isSel = st.sel === n.id, isHov = st.hov === n.id;
        var label = isLeaf ? "Box " + num + ": " + (n.n0 + n.n1) + " " + d.nouns + ", " + n.n1 + " " + d.cn[1] : "Question: " + question(d, n.f, n.t);
        g.attr("aria-label", label);
        g.append("title").text(label);
        if (isLeaf) {
          var w = leafW - 4, bw = 44, p1 = (n.n0 + n.n1) ? n.n1 / (n.n0 + n.n1) : 0;
          g.append("rect").attr("class", "ring").attr("x", -2).attr("y", -12).attr("width", w + 2).attr("height", 24).attr("rx", 7).attr("fill", P.paper)
            .attr("stroke", isSel ? P.teal : (isHov || hot) ? P.coral : P.rule).attr("stroke-width", isSel ? 3 : (isHov || hot) ? 2.5 : 1.2);
          g.append("text").attr("x", 9).attr("y", 4.5).attr("text-anchor", "middle").attr("font-size", 12).attr("font-weight", 600).attr("fill", P.ink).text(num);
          g.append("rect").attr("x", 20).attr("y", -5).attr("width", bw).attr("height", 10).attr("rx", 2).attr("fill", P.navy).attr("opacity", 0.9);
          g.append("rect").attr("x", 20).attr("y", -5).attr("width", bw * p1).attr("height", 10).attr("rx", 2).attr("fill", P.coral);
          g.append("text").attr("x", 20 + bw + 5).attr("y", 4.5).attr("font-size", 11.5).attr("fill", P.ink2).text(n.n0 + n.n1);
        } else {
          g.append("circle").attr("class", "ring").attr("r", 6.5).attr("fill", P.paper).attr("stroke", (isHov || hot) ? P.coral : P.ink2).attr("stroke-width", (isHov || hot) ? 3 : 1.6);
          g.append("text").attr("x", 0).attr("y", -20).attr("text-anchor", "start").attr("font-size", 11.5).attr("fill", P.ink).attr("font-weight", 600).text(d.fn[n.f]);
          g.append("text").attr("x", 0).attr("y", -8).attr("text-anchor", "start").attr("font-size", 11).attr("fill", P.ink2).text("≤ " + trim(n.t, 2));
        }
        g.on("mouseenter focus", function () { if (T.hoverFn) T.hoverFn(n.id); }).on("mouseleave blur", function () { if (T.hoverFn) T.hoverFn(-1); })
          .on("click", function () { if (T.clickFn) T.clickFn(n.id); })
          .on("keydown", function (ev) { if ((ev.key === "Enter" || ev.key === " ") && T.clickFn) { ev.preventDefault(); T.clickFn(n.id); } });
      });
      // legend
      svg.append("text").attr("x", W - 2).attr("y", H0 - 3).attr("text-anchor", "end").attr("font-size", 10.5).attr("fill", P.muted).text("bar: coral = " + d.cn[1] + ", navy = " + d.cn[0]);
    };
    T.yes = "yes"; T.no = "no";
    return T;
  }

  /* ======================================================================
     Small chart of the weighted Gini (or squared error) against the threshold
     ====================================================================== */
  function makeCurve(host, o) {
    var C = { box: H("div", {}, host) };
    C.svg = Kit.el("svg", { role: "img", "aria-label": o.aria || "Impurity after the split for all thresholds" }, C.box);
    C.state = null;
    C.draw = function (s) {
      if (s) C.state = s; s = C.state; if (!s) return;
      var P = Kit.palette(), svg = d3.select(C.svg), W = Kit.width(C.box), Hh = 132, m = { l: 40, r: 10, t: 8, b: 26 };
      svg.attr("viewBox", "0 0 " + W + " " + Hh).attr("width", W).selectAll("*").remove();
      if (!s.curve || !s.curve.t.length) {
        svg.append("text").attr("x", W / 2).attr("y", Hh / 2).attr("text-anchor", "middle").attr("font-size", 13).attr("fill", P.muted).text(s.empty || "no split possible");
        return;
      }
      var xs = d3.scaleLinear().domain([s.lo, s.hi]).range([m.l, W - m.r]);
      var ymax = s.before * 1.05, ymin = Math.min(d3.min(s.curve.score), s.before) - 0.02 * s.before;
      var ys = d3.scaleLinear().domain([Math.max(0, ymin), ymax]).range([Hh - m.b, m.t]);
      svg.append("g").attr("transform", "translate(0," + (Hh - m.b) + ")").call(d3.axisBottom(xs).ticks(Math.max(3, Math.floor(W / 80))).tickSize(3)).call(styleAxis(P));
      svg.append("g").attr("transform", "translate(" + m.l + ",0)").call(d3.axisLeft(ys).ticks(3).tickSize(3).tickFormat(function (v) { return v.toFixed(2); })).call(styleAxis(P));
      svg.append("line").attr("x1", m.l).attr("x2", W - m.r).attr("y1", ys(s.before)).attr("y2", ys(s.before)).attr("stroke", P.muted).attr("stroke-dasharray", "4 3");
      svg.append("text").attr("x", W - m.r).attr("y", ys(s.before) - 3).attr("text-anchor", "end").attr("font-size", 10.5).attr("fill", P.muted).text(s.beforeLabel || "no split");
      var n = s.reveal == null ? s.curve.t.length : s.reveal, pts = [];
      for (var i = 0; i < n; i++) pts.push([xs(s.curve.t[i]), ys(s.curve.score[i])]);
      if (pts.length) svg.append("path").attr("d", d3.line()(pts)).attr("fill", "none").attr("stroke", s.active ? P.teal : P.ink2).attr("stroke-width", s.active ? 2.4 : 1.8);
      if (s.best >= 0 && n >= s.curve.t.length) {
        var bx = xs(s.curve.t[s.best]), by = ys(s.curve.score[s.best]);
        svg.append("path").attr("d", d3.symbol().type(d3.symbolStar).size(110)()).attr("transform", "translate(" + bx + "," + by + ")").attr("fill", P.coral);
      }
      if (s.cand != null) {
        var cx = xs(Math.max(s.lo, Math.min(s.hi, s.cand.t)));
        svg.append("line").attr("x1", cx).attr("x2", cx).attr("y1", m.t).attr("y2", Hh - m.b).attr("stroke", P.ink).attr("stroke-width", 1.2).attr("opacity", 0.55);
        svg.append("circle").attr("cx", cx).attr("cy", ys(s.cand.score)).attr("r", 5).attr("fill", P.bg).attr("stroke", P.ink).attr("stroke-width", 2.5);
      }
    };
    Kit.onTheme(function () { C.draw(); });
    return C;
  }
  function styleAxis(P) {
    return function (g) {
      g.select(".domain").attr("stroke", P.muted);
      g.selectAll("line").attr("stroke", P.muted);
      g.selectAll("text").attr("fill", P.muted).attr("font-size", 11);
    };
  }

  /* ======================================================================
     Shared by the grow and read views: leaf numbering and the leaf records the scatter needs
     ====================================================================== */
  function numberLeaves(tree) {
    var nums = {}, k = 0;
    (function walk(id) {
      var n = tree.nodes[id];
      if (n.f < 0) { k++; nums[id] = k; return; }
      walk(n.l); walk(n.r);
    })(0);
    return nums;
  }
  function leafRecords(tree, nums, selId, d) {
    return core.leaves(tree).map(function (n) {
      var tot = n.n0 + n.n1, p1 = tot ? n.n1 / tot : 0, call = core.call(n);
      return { box: n.box, call: call, p1: p1, n: tot, label: String(nums[n.id]), selected: n.id === selId,
               sub: tot ? Math.round(100 * (call ? p1 : 1 - p1)) + "% " + d.cn[call] : "" };
    });
  }
  function chipSet(parent, labels, initial, onPick) {
    var bs = Kit.chips(parent, labels, initial, onPick);
    return { buttons: bs, set: function (i) { bs.forEach(function (b, k) { b.setAttribute("aria-pressed", String(k === i)); }); } };
  }

  /* ======================================================================
     mountGrow: grow a tree by hand
     ====================================================================== */
  api.mountGrow = function (el, opts) {
    injectCss();
    var d = prep(opts), maxDepth = opts.maxDepth || 4, cols = d.cols, y = d.y;
    var tree = core.newTree(y, d.train, d.ranges), nums = numberLeaves(tree), sel = 0, hov = -1;
    var cand = { f: opts.startFeature || 0, t: 0 }, busy = null, scan = null;
    el.classList.add("tl");
    el.innerHTML = "";

    // controls
    var row1 = H("div", { class: "tl-row" }, el);
    H("span", { class: "label" }, row1, T(opts, "askAbout"));
    var chips = chipSet(row1, d.fn.map(function (n, i) { return n + (d.units[i] ? ", " + d.units[i] : ""); }), cand.f, function (i) { cancelScan(); cand.f = i; defaultCand(); refresh(); });
    var held = H("button", { type: "button", class: "btn", "aria-pressed": "false" }, row1, T(opts, "showHeld"));
    held.addEventListener("click", function () { S.showHeld = !S.showHeld; held.textContent = S.showHeld ? T(opts, "hideHeld") : T(opts, "showHeld"); S.draw(); });
    var ctrl = H("div", { class: "controls" }, el);
    var sl = Kit.slider(ctrl, { label: T(opts, "threshold"), min: 0, max: 1, step: 0.05, value: 0.5, show: function (v) { return trim(v, 2) + (d.units[cand.f] ? " " + d.units[cand.f] : ""); } }, function (v) { cancelScan(); cand.t = v; updateCand(); });
    var row2 = H("div", { class: "tl-row" }, el);
    var bSplit = Kit.button(row2, T(opts, "splitHere"), function () { cancelScan(); commit(); });
    var bAuto = Kit.button(row2, T(opts, "choose"), function () { runScan(); });
    var bUndo = Kit.button(row2, T(opts, "undo"), function () { cancelScan(); undo(); });
    var bReset = Kit.button(row2, T(opts, "reset"), function () { cancelScan(); reset(); });
    var status = H("p", { class: "status", "aria-live": "polite" }, el, T(opts, "pickBox"));

    // figure: scatter left, tree right
    var grid = H("div", { class: "tl-grid" }, el), left = H("div", {}, grid), right = H("div", {}, grid);
    var S = makeScatter(left, d, { aria: opts.aria, ids: opts.ids, idLabel: opts.idLabel, mark: opts.mark });
    var TR = makeTree(right, d, { aria: opts.treeAria });
    TR.yes = T(opts, "yes"); TR.no = T(opts, "no");

    // equations
    var E = giniEquation(el, opts, d);

    // score curves
    var cw = H("div", { class: "tl-curves" }, right), CV = [];
    [0, 1].forEach(function (f) {
      var box = H("div", {}, cw); H("h4", {}, box, "Impurity after the split, by " + d.fn[f] + " threshold");
      CV.push(makeCurve(box, { aria: "Weighted Gini impurity after a split on " + d.fn[f] + ", for all thresholds" }));
    });
    var ro = H("div", { class: "readout" }, el), R = {};
    ["leaves", "depth", "train", "held", "imp", "best"].forEach(function (k) { R[k] = H("span", {}, ro); });

    // ----- state helpers
    function node() { return tree.nodes[sel]; }
    function range(f) {
      var nd = node(), lo = Infinity, hi = -Infinity, a = d.ranges[f][0], b = d.ranges[f][1];
      nd.idx.forEach(function (i) { var v = cols[f][i]; if (v < a || v > b) return; if (v < lo) lo = v; if (v > hi) hi = v; });
      return [lo, hi];
    }
    function quantile(f, q) {
      var nd = node(), a = d.ranges[f][0], b = d.ranges[f][1], v = [];
      nd.idx.forEach(function (i) { var x = cols[f][i]; if (x >= a && x <= b) v.push(x); });
      v.sort(function (p, q2) { return p - q2; });
      return v.length ? v[Math.floor((v.length - 1) * q)] : 0;
    }
    function canSplit() { var nd = node(); return nd.f < 0 && nd.n0 > 0 && nd.n1 > 0 && nd.depth < maxDepth && nd.idx.length >= 2; }
    function snap(v, f) { var s = d.step[f]; return Math.round(v / s) * s; }
    function defaultCand() {
      var r = range(cand.f);
      if (!isFinite(r[0]) || r[0] === r[1]) { cand.t = isFinite(r[0]) ? r[0] : 0; configSlider(); return; }
      var st = d.step[cand.f];
      cand.t = snap(quantile(cand.f, 0.3), cand.f);
      if (cand.t <= r[0]) cand.t = r[0] + st;
      if (cand.t >= r[1]) cand.t = r[1] - st;
      configSlider();
    }
    function configSlider() {
      var r = range(cand.f), inp = sl.input, st = d.step[cand.f];
      if (!isFinite(r[0]) || r[0] === r[1]) { inp.disabled = true; return; }
      inp.disabled = !canSplit();
      inp.min = Math.ceil(r[0] / st - 1e-9) * st; inp.max = Math.floor(r[1] / st + 1e-9) * st; inp.step = st;
      sl.set(Math.min(+inp.max, Math.max(+inp.min, cand.t)));
    }
    function curveFor(f) {
      var c = core.classCurve(cols[f], y, node().idx, 1), r = range(f), out = { t: [], score: [], nl: [], best: -1, all: c };
      for (var i = 0; i < c.t.length; i++) if (c.t[i] >= r[0] && c.t[i] <= r[1]) {
        out.t.push(c.t[i]); out.score.push(c.score[i]); out.nl.push(c.nl[i]);
        if (out.best < 0 || c.score[i] < out.score[out.best] - 1e-12) out.best = out.t.length - 1;
      }
      return out;
    }
    function candScore(f, t) {
      var nd = node(), c = core.counts(cols[f], y, nd.idx, t), n = nd.idx.length;
      return { c: c, score: ((c.l0 + c.l1) * gini(c.l0, c.l1) + (c.r0 + c.r1) * gini(c.r0, c.r1)) / n };
    }

    // ----- drawing
    function updateCand() {
      var nd = node(), ok = canSplit();
      var r = range(cand.f);
      if (ok && isFinite(r[0]) && r[0] < r[1]) {
        cand.t = Math.min(r[1], Math.max(r[0], cand.t));
        S.setCand({ f: cand.f, t: cand.t, box: nd.box, aria: "Threshold for " + d.fn[cand.f] });
        S.knobEl.setAttribute("aria-valuemin", r[0]); S.knobEl.setAttribute("aria-valuemax", r[1]);
      } else S.setCand(null);
      if (sl.input.disabled !== !(ok && r[0] < r[1])) sl.input.disabled = !(ok && r[0] < r[1]);
      if (Math.abs(sl.get() - cand.t) > 1e-9) sl.set(cand.t);
      // equations and curves
      var tot = nd.n0 + nd.n1, gb = gini(nd.n0, nd.n1);
      if (ok && r[0] < r[1]) {
        var cs = candScore(cand.f, cand.t), bestAll = bestFor();
        E.set(nd, { l0: cs.c.l0, l1: cs.c.l1, r0: cs.c.r0, r1: cs.c.r1 });
        E.cmp.textContent = scan ? "" : bestAll ? "Best for this box: " + d.fn[bestAll.f] + " \u2264 " + trim(bestAll.t, 2) + " gives G after " + f3(bestAll.score) + " (a drop of " + f3(bestAll.gain) + ")." : "";
      } else {
        E.set(nd, null);
        E.cmp.textContent = tot && (nd.n0 === 0 || nd.n1 === 0) ? "This box is pure, so there is no split left to make." : (nd.depth >= maxDepth ? "This box is at the depth limit of " + maxDepth + "." : "");
      }
      [0, 1].forEach(function (f) { drawCurve(f); });
    }
    var bestCache = null;
    function bestFor() {
      if (bestCache && bestCache.id === sel && bestCache.n === tree.nodes.length) return bestCache.b;
      var b = core.bestSplit(cols, y, node().idx, 1);
      bestCache = { id: sel, n: tree.nodes.length, b: b }; return b;
    }
    function drawCurve(f) {
      var nd = node(), ok = canSplit(), r = range(f);
      if (!ok || !(r[0] < r[1])) { CV[f].draw({ curve: null, empty: "no split possible here" }); return; }
      var c = curveFor(f), act = cand.f === f, reveal = null;
      if (scan) { if (f > scan.f) reveal = 0; else if (f === scan.f && scan.reveal != null) reveal = scan.reveal; }
      var cs = candScore(f, act ? cand.t : (r[0] + r[1]) / 2);
      CV[f].draw({ curve: c, lo: r[0], hi: r[1], before: gini(nd.n0, nd.n1), best: c.best, reveal: reveal, active: act,
                   cand: act && !(scan && scan.f < f) ? { t: cand.t, score: cs.score } : null, beforeLabel: "no split" });
    }
    function refresh() {
      nums = numberLeaves(tree);
      S.leaves = leafRecords(tree, nums, sel, d);
      S.draw();
      TR.state.sel = sel; TR.state.hov = hov; TR.state.path = [];
      TR.draw(tree, nums);
      configSlider();
      updateCand();
      var lv = core.leaves(tree), dep = 0; tree.nodes.forEach(function (n) { if (n.depth > dep) dep = n.depth; });
      var ta = core.accuracy(tree, d.X, y, d.train), ha = d.test.length ? core.accuracy(tree, d.X, y, d.test) : NaN, imp = core.impurity(tree);
      R.leaves.innerHTML = "Boxes: <b>" + lv.length + "</b>"; R.depth.innerHTML = "Depth: <b>" + dep + "</b>";
      R.train.innerHTML = "Training accuracy: <b>" + pc(ta) + "</b>"; R.held.innerHTML = "Held-out accuracy: <b>" + pc(ha) + "</b>";
      R.imp.innerHTML = "Weighted Gini of the boxes: <b>" + f3(imp) + "</b>";
      var cmp = core.newTree(y, d.train, d.ranges); core.growLeaves(cmp, cols, lv.length, 1);
      R.best.innerHTML = "Computer's best with " + lv.length + " box" + (lv.length === 1 ? "" : "es") + ": <b>" + f3(core.impurity(cmp)) + "</b>";
      bSplit.disabled = !canSplit() || !(range(cand.f)[0] < range(cand.f)[1]);
      bAuto.disabled = !canSplit();
      bUndo.disabled = tree.nodes.length < 3;
      if (opts.onChange) opts.onChange({ tree: tree, leaves: lv.length, depth: dep, train: ta, held: ha, impurity: imp });
    }

    // ----- actions
    function commit() {
      if (!canSplit()) return;
      var r = range(cand.f); if (!(r[0] < r[1])) return;
      var f = cand.f, t = cand.t, before = sel, kids = core.split(tree, cols, sel, f, t);
      // keep the box that is still the most mixed
      var a = tree.nodes[kids.l], b = tree.nodes[kids.r];
      sel = gini(a.n0, a.n1) * a.idx.length >= gini(b.n0, b.n1) * b.idx.length ? a.id : b.id;
      if (tree.nodes[sel].n0 === 0 || tree.nodes[sel].n1 === 0) sel = (sel === a.id ? b.id : a.id);
      bestCache = null; defaultCand(); refresh();
      status.textContent = "Box split at " + question(d, f, t) + " Now choose the next box, or press Undo.";
    }
    function undo() {
      var p = core.undo(tree);
      if (p === false) return;
      sel = p; bestCache = null; defaultCand(); refresh(); status.textContent = "Last split undone.";
    }
    function reset() {
      tree = core.newTree(y, d.train, d.ranges); sel = 0; bestCache = null; cand.f = opts.startFeature || 0; chips.set(cand.f); defaultCand(); refresh();
      status.textContent = T(opts, "pickBox");
    }
    function select(id) {
      var n = tree.nodes[id];
      if (n.f >= 0) return;
      cancelScan(); sel = id; bestCache = null; defaultCand(); refresh();
      status.textContent = "Box " + nums[id] + " chosen: " + (n.n0 + n.n1) + " " + d.nouns + ". Drag the line, or let the computer choose.";
    }
    // scan animation: sweep both features, then settle on the best
    function cancelScan() { if (busy) { busy.stop(); busy = null; scan = null; bAuto.textContent = T(opts, "choose"); updateCand(); status.textContent = "Scan stopped. Drag the line, or press the button to scan again."; } }
    function runScan() {
      if (busy) { cancelScan(); return; }
      if (!canSplit()) return;
      var nd = node(), curves = [curveFor(0), curveFor(1)], stopped = false, stopAnim = null;
      bAuto.textContent = "Stop";
      busy = { stop: function () { stopped = true; if (stopAnim) stopAnim(); } };
      scan = { f: 0, reveal: 0 };
      function sweep(f, done) {
        var c = curves[f], m = c.t.length;
        scan.f = f; scan.reveal = 0;
        if (!m) { done(); return; }
        cand.f = f; chips.set(f); configSlider();
        status.textContent = "Scanning " + d.fn[f] + ": the computer tries " + m + " thresholds inside the plot and scores them one by one.";
        var ms = Math.max(1000, Math.min(2400, m * 10));
        stopAnim = Kit.animate(ms, function (p) {
          if (stopped) return;
          var i = Math.min(m - 1, Math.floor(Kit.ease(p) * m));
          cand.t = c.t[i]; scan.reveal = i + 1; updateCand();
          if (p >= 1) done();
        });
      }
      sweep(0, function () {
        if (stopped) return;
        sweep(1, function () {
          if (stopped) return;
          var b = core.bestSplit(cols, y, nd.idx, 1);
          if (!b) { busy = null; scan = null; bAuto.textContent = T(opts, "choose"); updateCand(); return; }
          scan = { f: 2, reveal: null };
          var r0 = range(b.f), startT = cand.f === b.f ? cand.t : (r0[0] + r0[1]) / 2;
          cand.f = b.f; chips.set(b.f); configSlider();
          stopAnim = Kit.animate(800, function (p) {
            if (stopped) return;
            cand.t = p >= 1 ? b.t : startT + (b.t - startT) * Kit.ease(p);
            updateCand();
            if (p >= 1) {
              busy = null; scan = null; bAuto.textContent = T(opts, "choose"); updateCand();
              status.textContent = "Best split for this box: " + question(d, b.f, b.t) + " Its weighted Gini is " + f3(b.score) + ". Press Split here to use it.";
            }
          });
        });
      });
    }

    // ----- linking
    function hoverNode(id) {
      hov = id; TR.state.hov = id; 
      TR.draw(tree, nums);
      if (id >= 0) { S.setHover(tree.nodes[id].box); var n = tree.nodes[id]; status.textContent = (n.f < 0 ? "Box " + nums[id] : "Question " + question(d, n.f, n.t).replace("?", "")) + ": " + (n.n0 + n.n1) + " " + d.nouns + ", " + n.n1 + " " + d.cn[1] + ", " + n.n0 + " " + d.cn[0] + "."; }
      else S.setHover(null);
    }
    TR.hoverFn = hoverNode; TR.clickFn = select;
    S.moveFn = function (p) {
      if (!p) { if (hov >= 0) hoverNode(-1); return; }
      var id = core.leafOf(tree, p.slice(0, 2)).id;
      if (id !== hov) hoverNode(id);
    };
    S.clickFn = function (p) {
      var id = core.leafOf(tree, p.slice(0, 2)).id;
      if (id !== sel) select(id);
    };
    S.dragFn = function (p, end) {
      cancelScan();
      var r = range(cand.f), v = snap(p[cand.f], cand.f);
      cand.t = Math.min(r[1], Math.max(r[0], v)); updateCand();
    };
    S.keyFn = function (e) {
      var dir = (cand.f === 0 ? { ArrowLeft: -1, ArrowRight: 1 } : { ArrowDown: -1, ArrowUp: 1 })[e.key];
      if (!dir) return false;
      cancelScan(); var r = range(cand.f);
      cand.t = Math.min(r[1], Math.max(r[0], snap(cand.t + dir * d.step[cand.f] * (e.shiftKey ? 10 : 2), cand.f))); updateCand(); return true;
    };
    Kit.onTheme(function () { TR.draw(tree, nums); });
    window.addEventListener("resize", Kit.debounce(function () { TR.draw(tree, nums); [0, 1].forEach(function (f) { CV[f].draw(); }); }));

    // first draw
    defaultCand(); refresh(); foot(el, opts);
    return { tree: function () { return tree; }, select: select, split: function (f, t) { cand.f = f; chips.set(f); cand.t = t; commit(); }, reset: reset, scan: runScan, state: function () { return { sel: sel, cand: cand, busy: !!busy }; } };
  };

  /* ======================================================================
     mountRead: follow one example down a tree
     ====================================================================== */
  api.mountRead = function (el, opts) {
    injectCss();
    var d = prep(opts), cols = d.cols, y = d.y, spec = opts.tree || { depth: 2, minLeaf: 1 };
    var tree = core.newTree(y, d.train, d.ranges);
    core.grow(tree, cols, 0, { maxDepth: spec.depth, minLeaf: spec.minLeaf || 1 });
    var nums = numberLeaves(tree), pt = null, picks = opts.picks || [];
    el.classList.add("tl"); el.innerHTML = "";
    var row = H("div", { class: "tl-row" }, el), chipObj = null;
    if (picks.length) {
      H("span", { class: "label" }, row, "Put the ring on");
      chipObj = chipSet(row, picks.map(function (p) { return p.name; }), -1, function (i) { setPt(picks[i].x.slice(), i); });
      chipObj.set(-1);
    }
    H("span", { class: "label" }, row, "or drag it over the plot");
    var status = H("p", { class: "status", "aria-live": "polite" }, el, "");
    var grid = H("div", { class: "tl-grid" }, el), left = H("div", {}, grid), right = H("div", {}, grid);
    var S = makeScatter(left, d, { aria: opts.aria, ids: opts.ids, idLabel: opts.idLabel });
    var TR = makeTree(right, d, { aria: opts.treeAria }); TR.yes = T(opts, "yes"); TR.no = T(opts, "no");
    var out = H("div", { class: "readout" }, el), RO = H("span", {}, out), RC = H("span", {}, out);
    function clamp(p) { return [Math.min(d.ranges[0][1], Math.max(d.ranges[0][0], p[0])), Math.min(d.ranges[1][1], Math.max(d.ranges[1][0], p[1]))]; }
    function setPt(p, pickIdx) {
      pt = clamp(p); S.setPoint(pt);
      if (chipObj && pickIdx == null) chipObj.set(-1);
      var path = core.path(tree, pt), leaf = tree.nodes[path[path.length - 1]], parts = [];
      for (var k = 0; k < path.length - 1; k++) {
        var n = tree.nodes[path[k]], yes = path[k + 1] === n.l;
        parts.push(question(d, n.f, n.t).replace("?", "") + " → " + (yes ? T(opts, "yes") : T(opts, "no")));
      }
      TR.state.path = path; TR.state.sel = leaf.id; TR.draw(tree, nums);
      S.setHover(leaf.box);
      var call = core.call(leaf), tot = leaf.n0 + leaf.n1, share = call ? leaf.n1 / tot : leaf.n0 / tot;
      RO.innerHTML = "Ring at <b>" + trim(pt[0], d.digits[0]) + " " + d.units[0] + "</b> and <b>" + trim(pt[1], d.digits[1]) + " " + d.units[1] + "</b>";
      RC.innerHTML = "Call: <b>" + d.cn[call] + "</b> (box " + nums[leaf.id] + ", " + Math.round(100 * share) + "% of its " + tot + " " + d.nouns + ")";
      status.textContent = parts.join(", then ") + ", so box " + nums[leaf.id] + ".";
      S.ptEl.setAttribute("aria-label", "Ring at " + trim(pt[0], d.digits[0]) + " " + d.units[0] + " and " + trim(pt[1], d.digits[1]) + " " + d.units[1] + ". " + d.cn[call] + ".");
    }
    S.leaves = leafRecords(tree, nums, -1, d); S.draw();
    TR.draw(tree, nums);
    S.ptFn = function (p) { if (p) setPt(p.slice(0, 2)); };
    S.clickFn = function (p) { setPt(p.slice(0, 2)); };
    S.ptKeyFn = function (e) {
      var dx = { ArrowLeft: -1, ArrowRight: 1 }[e.key] || 0, dy = { ArrowUp: 1, ArrowDown: -1 }[e.key] || 0;
      if (!dx && !dy) return false;
      var sx = (d.ranges[0][1] - d.ranges[0][0]) * 0.01 * (e.shiftKey ? 5 : 1), sy = (d.ranges[1][1] - d.ranges[1][0]) * 0.01 * (e.shiftKey ? 5 : 1);
      setPt([pt[0] + dx * sx, pt[1] + dy * sy]); return true;
    };
    S.moveFn = function (p) {
      if (!p) { S.setHover(pt ? tree.nodes[core.path(tree, pt).slice(-1)[0]].box : null); return; }
      S.setHover(core.leafOf(tree, p.slice(0, 2)).box);
    };
    TR.hoverFn = function (id) { S.setHover(id >= 0 ? tree.nodes[id].box : (pt ? tree.nodes[core.path(tree, pt).slice(-1)[0]].box : null)); };
    Kit.onTheme(function () { TR.draw(tree, nums); });
    window.addEventListener("resize", Kit.debounce(function () { TR.draw(tree, nums); }));
    var start = picks.length ? picks[0].x.slice() : [(d.ranges[0][0] + d.ranges[0][1]) / 2, (d.ranges[1][0] + d.ranges[1][1]) / 2];
    setPt(start, picks.length ? 0 : null); if (chipObj) chipObj.set(0); foot(el, opts);
    return { tree: tree, setPoint: setPt };
  };

  /* ======================================================================
     mountDepth: depth and smallest-leaf sliders, training and held-out accuracy
     ====================================================================== */
  api.mountDepth = function (el, opts) {
    injectCss();
    var d = prep(opts), cols = d.cols, y = d.y, maxD = opts.maxDepth || 12, nSplits = opts.splits == null ? 20 : opts.splits;
    el.classList.add("tl"); el.innerHTML = "";
    var ctrl = H("div", { class: "controls" }, el);
    var curDepth = opts.depth == null ? 2 : opts.depth, minLeaf = 1, tree = null, cache = {}, others = null, rr = Kit.rng(opts.seed || 4127);
    var sd = Kit.slider(ctrl, { label: "Depth limit", min: 0, max: maxD, step: 1, value: curDepth, digits: 0 }, function (v) { curDepth = v; draw(); });
    var sm = Kit.slider(ctrl, { label: "Smallest box allowed", min: 1, max: 40, step: 1, value: 1, digits: 0, show: function (v) { return v + " " + (v === 1 ? d.noun : d.nouns); } }, function (v) { minLeaf = v; rebuild(); });
    var play = H("div", { class: "tl-row" }, el);
    var bPlay = Kit.button(play, "Play: deepen one level at a time", function () { runPlay(); });
    var status = H("p", { class: "status", "aria-live": "polite" }, el, "");
    var grid = H("div", { class: "tl-grid" }, el), left = H("div", {}, grid), right = H("div", {}, grid);
    var S = makeScatter(left, d, { aria: opts.aria, ids: opts.ids, idLabel: opts.idLabel, mark: opts.mark });
    var CH = H("div", { class: "tl-curve" }, right), svg = Kit.el("svg", { role: "img", "aria-label": opts.curveAria || "Accuracy of the tree against its depth limit, on the training and the held-out examples" }, CH);
    var ro = H("div", { class: "readout" }, el), R = {};
    ["leaves", "train", "held", "gap"].forEach(function (k) { R[k] = H("span", {}, ro); });

    function accAt(tr, idxA, idxB, k) { return [core.accuracy(tr, d.X, y, idxA, k), idxB.length ? core.accuracy(tr, d.X, y, idxB, k) : NaN]; }
    function build(idxTrain, ml) {
      var t = core.newTree(y, idxTrain, d.ranges); core.grow(t, cols, 0, { maxDepth: maxD, minLeaf: ml }); return t;
    }
    function curvesMain() {
      var tr = [], he = [];
      for (var k = 0; k <= maxD; k++) { var a = accAt(tree, d.train, d.test, k); tr.push(a[0]); he.push(a[1]); }
      return { train: tr, held: he };
    }
    function randomSplits() {
      var all = d.rows.map(function (r, i) { return i; }), out = [];
      for (var s = 0; s < nSplits; s++) {
        var perm = all.slice();
        for (var i = perm.length - 1; i > 0; i--) { var j = Math.floor(rr() * (i + 1)), q = perm[i]; perm[i] = perm[j]; perm[j] = q; }
        var nh = Math.round(perm.length * (opts.heldFrac || 0.3)), hh = perm.slice(0, nh), tt = perm.slice(nh), tr2 = build(tt, minLeaf), cv = [];
        for (var k = 0; k <= maxD; k++) cv.push(core.accuracy(tr2, d.X, y, hh, k));
        out.push(cv);
      }
      return out;
    }
    var main = null, othersTimer = 0;
    function rebuild() {
      tree = build(d.train, minLeaf); main = curvesMain(); others = null; draw();
      clearTimeout(othersTimer);
      othersTimer = setTimeout(function () { if (nSplits) { others = randomSplits(); drawCurve(); } }, 30);
    }
    function frontier(k) {
      return tree.nodes.filter(function (n) { return n.depth === k || (n.f < 0 && n.depth < k); });
    }
    function draw() {
      var fr = frontier(curDepth), order = fr.slice().sort(function (a, b) { return a.box[0] - b.box[0] || b.box[3] - a.box[3]; }), nums = {};
      order.forEach(function (n, i) { nums[n.id] = i + 1; });
      S.leaves = fr.map(function (n) {
        var tot = n.n0 + n.n1, p1 = tot ? n.n1 / tot : 0, call = core.call(n);
        return { box: n.box, call: call, p1: p1, n: tot, label: fr.length <= 12 ? String(nums[n.id]) : "", selected: false, sub: fr.length <= 6 && tot ? Math.round(100 * (call ? p1 : 1 - p1)) + "% " + d.cn[call] : "" };
      });
      S.draw();
      var a = [main.train[curDepth], main.held[curDepth]];
      R.leaves.innerHTML = "Boxes: <b>" + fr.length + "</b>"; R.train.innerHTML = "Training accuracy: <b>" + pc(a[0]) + "</b>";
      R.held.innerHTML = "Held-out accuracy: <b>" + pc(a[1]) + "</b>"; R.gap.innerHTML = "Gap: <b>" + (isNaN(a[1]) ? "n/a" : Kit.fmt(100 * (a[0] - a[1]), 1) + " points") + "</b>";
      status.textContent = "Depth limit " + curDepth + ": " + fr.length + " boxes. Training " + pc(a[0]) + ", held-out " + pc(a[1]) + ".";
      drawCurve();
      if (opts.onChange) opts.onChange({ depth: curDepth, leaves: fr.length, train: a[0], held: a[1], minLeaf: minLeaf });
    }
    function drawCurve() {
      var P = Kit.palette(), W = Kit.width(CH), Hh = Math.max(280, Math.min(420, W * 0.8)), m = { l: 44, r: 10, t: 12, b: 38 };
      var s = d3.select(svg); s.attr("viewBox", "0 0 " + W + " " + Hh).attr("width", W).selectAll("*").remove();
      var lo = 1;
      main.train.concat(main.held).forEach(function (v) { if (!isNaN(v) && v < lo) lo = v; });
      if (others) others.forEach(function (c) { c.forEach(function (v) { if (v < lo) lo = v; }); });
      lo = Math.max(0, Math.floor((lo - 0.03) * 20) / 20);
      var xs = d3.scaleLinear().domain([0, maxD]).range([m.l, W - m.r - 62]), ys = d3.scaleLinear().domain([lo, 1]).range([Hh - m.b, m.t]);
      s.append("g").attr("transform", "translate(0," + (Hh - m.b) + ")").call(d3.axisBottom(xs).ticks(Math.min(maxD, 12)).tickFormat(d3.format("d")).tickSize(3)).call(styleAxis(P));
      s.append("g").attr("transform", "translate(" + m.l + ",0)").call(d3.axisLeft(ys).ticks(5).tickFormat(function (v) { return Math.round(v * 100) + "%"; }).tickSize(-(W - m.l - m.r - 62))).call(styleAxis(P)).call(function (g) { g.selectAll("line").attr("stroke", P.rule); });
      s.append("text").attr("x", (m.l + W - m.r - 62) / 2).attr("y", Hh - 4).attr("text-anchor", "middle").attr("font-size", 12.5).attr("fill", P.ink2).text("depth limit");
      var line = d3.line().defined(function (v) { return !isNaN(v[1]); }).x(function (v) { return xs(v[0]); }).y(function (v) { return ys(v[1]); });
      function pts(arr) { return arr.map(function (v, k) { return [k, v]; }); }
      if (others) {
        others.forEach(function (c) { s.append("path").attr("d", line(pts(c))).attr("fill", "none").attr("stroke", P.coral).attr("stroke-width", 1).attr("opacity", 0.22); });
        var avg = []; for (var k = 0; k <= maxD; k++) { var t = 0; others.forEach(function (c) { t += c[k]; }); avg.push(t / others.length); }
        s.append("path").attr("d", line(pts(avg))).attr("fill", "none").attr("stroke", P.coral).attr("stroke-width", 2).attr("stroke-dasharray", "5 4");
        s.append("text").attr("x", xs(maxD) + 5).attr("y", ys(avg[maxD]) + 20).attr("font-size", 11.5).attr("fill", P.coral).text("average of");
        s.append("text").attr("x", xs(maxD) + 5).attr("y", ys(avg[maxD]) + 32).attr("font-size", 11.5).attr("fill", P.coral).text(others.length + " other splits");
      }
      s.append("path").attr("d", line(pts(main.train))).attr("fill", "none").attr("stroke", P.navy).attr("stroke-width", 2.6);
      s.append("path").attr("d", line(pts(main.held))).attr("fill", "none").attr("stroke", P.coral).attr("stroke-width", 2.6);
      s.append("text").attr("x", xs(maxD) + 5).attr("y", ys(main.train[maxD]) + 4).attr("font-size", 12).attr("fill", P.navy).attr("font-weight", 600).text("training");
      s.append("text").attr("x", xs(maxD) + 5).attr("y", ys(main.held[maxD]) - 12).attr("font-size", 12).attr("fill", P.coral).attr("font-weight", 600).text("held-out");
      s.append("line").attr("x1", xs(curDepth)).attr("x2", xs(curDepth)).attr("y1", m.t).attr("y2", Hh - m.b).attr("stroke", P.ink).attr("stroke-width", 1.4).attr("opacity", 0.5);
      [[main.train[curDepth], P.navy], [main.held[curDepth], P.coral]].forEach(function (q) {
        if (!isNaN(q[0])) s.append("circle").attr("cx", xs(curDepth)).attr("cy", ys(q[0])).attr("r", 5.5).attr("fill", P.bg).attr("stroke", q[1]).attr("stroke-width", 3);
      });
      s.append("rect").attr("x", m.l).attr("y", m.t).attr("width", W - m.l - m.r - 62).attr("height", Hh - m.t - m.b).attr("fill", "transparent").style("cursor", "pointer")
        .on("click", function (ev) { var p = d3.pointer(ev, this); var k = Math.max(0, Math.min(maxD, Math.round(xs.invert(p[0])))); sd.set(k); curDepth = k; draw(); });
    }
    var playStop = null;
    function runPlay() {
      if (playStop) { playStop(); playStop = null; bPlay.textContent = "Play: deepen one level at a time"; return; }
      bPlay.textContent = "Stop"; var k = 0, tm = setInterval(function () {
        sd.set(k); curDepth = k; draw(); k++;
        if (k > maxD) { clearInterval(tm); playStop = null; bPlay.textContent = "Play: deepen one level at a time"; }
      }, 650);
      playStop = function () { clearInterval(tm); };
    }
    Kit.onTheme(drawCurve);
    window.addEventListener("resize", Kit.debounce(drawCurve));
    rebuild(); foot(el, opts);
    return { setDepth: function (k) { sd.set(k); curDepth = k; draw(); } };
  };

  /* ======================================================================
     Gini equation rows, shared by mountGrow and mountGini
     ====================================================================== */
  function giniEquation(parent, opts, d) {
    var eq = H("div", { class: "tl-eq" }, parent), E = {};
    var r1 = H("div", { class: "row" }, eq); H("span", { class: "name" }, r1, T(opts, "rowBefore"));
    var q = H("div", { class: "eqn", role: "img", "aria-label": "Gini impurity before the split equals one minus the squared shares of the two classes" }, r1);
    E.one = eqBox(q, "", "", "whole"); E.one.textContent = "1"; op(q, "−");
    E.p0 = eqBox(q, "c-navy", "", ""); op(q, "−"); E.p1 = eqBox(q, "c-coral", "", ""); op(q, "="); E.g0 = eqBox(q, "c-teal", "", "");
    var r2 = H("div", { class: "row" }, eq); H("span", { class: "name" }, r2, T(opts, "rowAfter"));
    var q2 = H("div", { class: "eqn", role: "img", "aria-label": "Gini impurity after the split equals the weighted sum of the two sides" }, r2);
    E.wl = eqBox(q2, "c-teal", "", ""); op(q2, "×"); E.gl = eqBox(q2, "c-teal", "", ""); op(q2, "+");
    E.wr = eqBox(q2, "c-sand", "", ""); op(q2, "×"); E.gr = eqBox(q2, "c-sand", "", ""); op(q2, "="); E.g1 = eqBox(q2, "c-teal", "", "");
    var r3 = H("div", { class: "row" }, eq);
    var q3 = H("div", { class: "eqn", role: "img", "aria-label": "The drop in Gini impurity equals before minus after" }, r3);
    E.drop = eqBox(q3, "c-coral", "", ""); op(q3, "="); E.b2 = eqBox(q3, "", "", ""); op(q3, "−"); E.a2 = eqBox(q3, "", "", "");
    E.cmp = H("p", { class: "note", style: "margin:0" }, r3, "");
    function cap(b, t) { b.nextSibling.textContent = t; }
    // nd: {n0, n1}; c: {l0, l1, r0, r1} or null
    E.set = function (nd, c, msg) {
      var tot = nd.n0 + nd.n1, gb = gini(nd.n0, nd.n1), s0 = nd.n0 / Math.max(1, tot), s1 = nd.n1 / Math.max(1, tot);
      E.p0.textContent = f3(s0 * s0); cap(E.p0, d.cn[0] + " share " + f2(s0) + ", squared");
      E.p1.textContent = f3(s1 * s1); cap(E.p1, d.cn[1] + " share " + f2(s1) + ", squared");
      E.g0.textContent = f3(gb); cap(E.g0, "G before, " + tot + " " + d.nouns);
      E.b2.textContent = f3(gb); cap(E.b2, "G before");
      if (c) {
        var nl = c.l0 + c.l1, nr = c.r0 + c.r1, ga = (nl * gini(c.l0, c.l1) + nr * gini(c.r0, c.r1)) / tot;
        E.wl.textContent = f2(nl / tot); cap(E.wl, "yes side: " + nl + " of " + tot);
        E.gl.textContent = f3(gini(c.l0, c.l1)); cap(E.gl, "G, yes side");
        E.wr.textContent = f2(nr / tot); cap(E.wr, "no side: " + nr + " of " + tot);
        E.gr.textContent = f3(gini(c.r0, c.r1)); cap(E.gr, "G, no side");
        E.g1.textContent = f3(ga); cap(E.g1, "G after");
        E.drop.textContent = f3(gb - ga); cap(E.drop, "drop in G");
        E.a2.textContent = f3(ga); cap(E.a2, "G after");
        return ga;
      }
      ["wl", "gl", "wr", "gr", "g1", "drop", "a2"].forEach(function (k) { E[k].textContent = "–"; cap(E[k], ""); });
      return null;
    };
    return E;
  }

  /* ======================================================================
     mountGini: a strip of examples, a divider, Gini boxes, and the Gini curve with the chord
     ====================================================================== */
  api.mountGini = function (el, opts) {
    injectCss();
    var cn = opts.classNames || ["no", "yes"], noun = opts.noun || "case", nouns = opts.nouns || noun + "s", unit = opts.unit || "";
    var d = { cn: cn, noun: noun, nouns: nouns };
    var ord = opts.values.map(function (v, i) { return i; }).sort(function (a, b) { return opts.values[a] - opts.values[b]; });
    var V = ord.map(function (i) { return opts.values[i]; }), Y = ord.map(function (i) { return opts.labels[i] ? 1 : 0; }), N = V.length;
    var k = opts.start == null ? Math.floor(N / 2) : opts.start;
    el.classList.add("tl"); el.innerHTML = "";
    var ctrl = H("div", { class: "controls" }, el);
    var sl = Kit.slider(ctrl, { label: "Examples on the yes side", min: 0, max: N, step: 1, value: k, digits: 0, show: function (v) { return v + " of " + N; } }, function (v) { k = v; draw(); });
    var grid = H("div", { class: "tl-grid" }, el), left = H("div", { class: "tl-strip" }, grid), right = H("div", {}, grid);
    var svg = Kit.el("svg", { role: "img", "aria-label": opts.aria || "A row of examples sorted by one measurement, with a divider that splits them into a yes side and a no side" }, left);
    var csvg = Kit.el("svg", { role: "img", "aria-label": "The Gini curve: impurity against the share of class 1, with the weighted average of the two sides on the chord" }, right);
    var E = giniEquation(el, opts, d), st = H("p", { class: "status", "aria-live": "polite" }, el, "");
    function tally(a, b) { var n1 = 0; for (var i = a; i < b; i++) n1 += Y[i]; return { n0: b - a - n1, n1: n1 }; }
    function draw() {
      var P = Kit.palette(), W = Kit.width(left), Hh = 190, m = { l: 14, r: 14, t: 40, b: 34 };
      var s = d3.select(svg); s.attr("viewBox", "0 0 " + W + " " + Hh).attr("width", W).selectAll("*").remove();
      var lo = V[0], hi = V[N - 1], pad = (hi - lo) * 0.04;
      var xs = d3.scaleLinear().domain([lo - pad, hi + pad]).range([m.l, W - m.r]);
      var cut = k <= 0 ? lo - pad : (k >= N ? hi + pad : (V[k - 1] + V[k]) / 2), cx = xs(cut);
      s.append("rect").attr("x", m.l).attr("y", m.t).attr("width", Math.max(0, cx - m.l)).attr("height", Hh - m.t - m.b).attr("fill", P.teal).attr("opacity", 0.1);
      s.append("rect").attr("x", cx).attr("y", m.t).attr("width", Math.max(0, W - m.r - cx)).attr("height", Hh - m.t - m.b).attr("fill", P.sand).attr("opacity", 0.14);
      s.append("g").attr("transform", "translate(0," + (Hh - m.b) + ")").call(d3.axisBottom(xs).ticks(Math.max(3, Math.floor(W / 90))).tickSize(3)).call(styleAxis(P));
      s.append("text").attr("x", (m.l + W - m.r) / 2).attr("y", Hh - 3).attr("text-anchor", "middle").attr("font-size", 12.5).attr("fill", P.ink2).text(opts.featureLabel || "");
      // dots in up to five rows so that close values do not overlap
      var rows = [0, -15, 15, -30, 30], placed = [], mid = m.t + (Hh - m.t - m.b) / 2;
      V.forEach(function (v, i) {
        var px = xs(v), r = 0;
        for (r = 0; r < rows.length; r++) { var clash = placed.some(function (q) { return q.r === r && Math.abs(q.x - px) < 15; }); if (!clash) break; }
        r = Math.min(r, rows.length - 1); placed.push({ x: px, r: r });
        var yy = mid + rows[r], g = s.append("g").attr("transform", "translate(" + px + "," + yy + ")");
        if (Y[i]) g.append("path").attr("d", d3.symbol().type(d3.symbolDiamond).size(130)()).attr("fill", P.coral).attr("stroke", P.bg).attr("stroke-width", 0.8);
        else g.append("circle").attr("r", 6).attr("fill", P.navy).attr("stroke", P.bg).attr("stroke-width", 0.8);
      });
      var A = tally(0, k), B = tally(k, N);
      s.append("text").attr("x", m.l + 2).attr("y", 15).attr("font-size", 12.5).attr("fill", P.ink).attr("font-weight", 600).text("yes side: " + k + " " + (k === 1 ? noun : nouns));
      s.append("text").attr("x", m.l + 2).attr("y", 30).attr("font-size", 11.5).attr("fill", P.ink2).text(A.n1 + " " + cn[1] + ", " + A.n0 + " " + cn[0]);
      s.append("text").attr("x", W - m.r - 2).attr("y", 15).attr("text-anchor", "end").attr("font-size", 12.5).attr("fill", P.ink).attr("font-weight", 600).text("no side: " + (N - k) + " " + (N - k === 1 ? noun : nouns));
      s.append("text").attr("x", W - m.r - 2).attr("y", 30).attr("text-anchor", "end").attr("font-size", 11.5).attr("fill", P.ink2).text(B.n1 + " " + cn[1] + ", " + B.n0 + " " + cn[0]);
      s.append("line").attr("x1", cx).attr("x2", cx).attr("y1", m.t - 2).attr("y2", Hh - m.b).attr("stroke", P.ink).attr("stroke-width", 2);
      var kn = s.append("circle").attr("cx", cx).attr("cy", Hh - m.b).attr("r", 10).attr("fill", P.bg).attr("stroke", P.ink).attr("stroke-width", 3).style("cursor", "ew-resize").style("touch-action", "none");
      s.append("rect").attr("x", m.l).attr("y", m.t).attr("width", W - m.l - m.r).attr("height", Hh - m.t - m.b + 12).attr("fill", "transparent").style("cursor", "ew-resize").style("touch-action", "none")
        .call(d3.drag().on("start drag", function (ev) {
          var v = xs.invert(ev.x), kk = 0; while (kk < N && V[kk] < v) kk++;
          if (kk !== k) { k = kk; sl.set(k); draw(); }
        }));
      // equations
      var tot = tally(0, N), c = { l0: A.n0, l1: A.n1, r0: B.n0, r1: B.n1 };
      var ga = (k === 0 || k === N) ? null : E.set(tot, c);
      if (ga === null) E.set(tot, null);
      E.cmp.textContent = k === 0 || k === N ? "All sharks are on one side, so no split has been made." : "";
      st.textContent = k === 0 || k === N ? "Move the divider to split the " + nouns + "." : "Dividing at " + trim(cut, 2) + (unit ? " " + unit : "") + " lowers the weighted Gini from " + f3(gini(tot.n0, tot.n1)) + " to " + f3(ga) + ".";
      drawParabola(tot, A, B);
    }
    function drawParabola(tot, A, B) {
      var P = Kit.palette(), W = Kit.width(right), Hh = 250, m = { l: 44, r: 12, t: 12, b: 38 };
      var s = d3.select(csvg); s.attr("viewBox", "0 0 " + W + " " + Hh).attr("width", W).selectAll("*").remove();
      var xs = d3.scaleLinear().domain([0, 1]).range([m.l, W - m.r]), ys = d3.scaleLinear().domain([0, 0.55]).range([Hh - m.b, m.t]);
      s.append("g").attr("transform", "translate(0," + (Hh - m.b) + ")").call(d3.axisBottom(xs).ticks(5).tickSize(3)).call(styleAxis(P));
      s.append("g").attr("transform", "translate(" + m.l + ",0)").call(d3.axisLeft(ys).ticks(5).tickSize(3)).call(styleAxis(P));
      s.append("text").attr("x", (m.l + W - m.r) / 2).attr("y", Hh - 3).attr("text-anchor", "middle").attr("font-size", 12.5).attr("fill", P.ink2).text("share that are " + cn[1] + ", p");
      s.append("text").attr("transform", "translate(12," + ((m.t + Hh - m.b) / 2) + ") rotate(-90)").attr("text-anchor", "middle").attr("font-size", 12.5).attr("fill", P.ink2).text("Gini impurity, G");
      var curve = []; for (var i = 0; i <= 60; i++) { var p = i / 60; curve.push([xs(p), ys(2 * p * (1 - p))]); }
      s.append("path").attr("d", d3.line()(curve)).attr("fill", "none").attr("stroke", P.ink2).attr("stroke-width", 2);
      var p0 = tot.n1 / (tot.n0 + tot.n1), n = tot.n0 + tot.n1, nl = A.n0 + A.n1, nr = B.n0 + B.n1;
      var pl = nl ? A.n1 / nl : 0, pr = nr ? B.n1 / nr : 0, gl = 2 * pl * (1 - pl), gr = 2 * pr * (1 - pr), g0 = 2 * p0 * (1 - p0), ga = (nl * gl + nr * gr) / n;
      if (nl && nr) {
        s.append("line").attr("x1", xs(pl)).attr("y1", ys(gl)).attr("x2", xs(pr)).attr("y2", ys(gr)).attr("stroke", P.muted).attr("stroke-width", 1.6).attr("stroke-dasharray", "5 4");
        s.append("line").attr("x1", xs(p0)).attr("x2", xs(p0)).attr("y1", ys(g0)).attr("y2", ys(ga)).attr("stroke", P.coral).attr("stroke-width", 4);
        s.append("text").attr("x", xs(p0) + 8).attr("y", ys((g0 + ga) / 2) + 4).attr("font-size", 12).attr("fill", P.coral).attr("font-weight", 600).text("drop " + f3(g0 - ga));
        s.append("circle").attr("cx", xs(p0)).attr("cy", ys(ga)).attr("r", 5).attr("fill", P.bg).attr("stroke", P.ink).attr("stroke-width", 2.4);
        s.append("text").attr("x", xs(p0) + 8).attr("y", ys(ga) + 15).attr("font-size", 11.5).attr("fill", P.ink2).text("after, G " + f3(ga));
        s.append("circle").attr("cx", xs(pl)).attr("cy", ys(gl)).attr("r", 6).attr("fill", P.teal);
        s.append("text").attr("x", xs(pl)).attr("y", ys(gl) - 9).attr("text-anchor", pl > 0.85 ? "end" : "middle").attr("font-size", 11.5).attr("fill", P.teal).attr("font-weight", 600).text("yes");
        s.append("circle").attr("cx", xs(pr)).attr("cy", ys(gr)).attr("r", 6).attr("fill", P.sand);
        s.append("text").attr("x", xs(pr)).attr("y", ys(gr) - 9).attr("text-anchor", pr < 0.15 ? "start" : "middle").attr("font-size", 11.5).attr("fill", P.sand).attr("font-weight", 600).text("no");
      }
      s.append("circle").attr("cx", xs(p0)).attr("cy", ys(g0)).attr("r", 6.5).attr("fill", P.ink);
      s.append("text").attr("x", xs(p0)).attr("y", ys(g0) - 10).attr("text-anchor", "middle").attr("font-size", 11.5).attr("fill", P.ink).attr("font-weight", 600).text("before");
    }
    Kit.onTheme(draw);
    window.addEventListener("resize", Kit.debounce(draw));
    draw(); foot(el, opts);
    return { setK: function (v) { k = v; sl.set(v); draw(); } };
  };

  /* ======================================================================
     mountRegression: a regression tree as a step function
     ====================================================================== */
  api.mountRegression = function (el, opts) {
    injectCss();
    var rows = opts.rows, X = rows.map(function (r) { return +r[opts.x]; }), Y = rows.map(function (r) { return +r[opts.y]; });
    var held = rows.map(function (r) { return opts.heldOut ? !!opts.heldOut(r) : false; }), train = [], test = [];
    held.forEach(function (h, i) { (h ? test : train).push(i); });
    var maxD = opts.maxDepth || 8, depth = opts.depth == null ? 2 : opts.depth, minLeaf = 1, showHeld = false, showLine = false, showLaw = false, probe = opts.probe || 45;
    var xLo = opts.xMin == null ? Math.floor(Math.min.apply(null, X) / 5) * 5 : opts.xMin, xHi = opts.xMax || Math.ceil(Math.max.apply(null, X) / 5) * 5, yU = opts.yUnit || "", xU = opts.xUnit || "";
    var noun = opts.noun || "case", nouns = opts.nouns || noun + "s";
    el.classList.add("tl"); el.innerHTML = "";
    var ctrl = H("div", { class: "controls" }, el);
    var sd = Kit.slider(ctrl, { label: "Depth limit", min: 0, max: maxD, step: 1, value: depth, digits: 0 }, function (v) { depth = v; draw(); });
    var sm = Kit.slider(ctrl, { label: "Smallest step allowed", min: 1, max: 30, step: 1, value: 1, digits: 0, show: function (v) { return v + " " + (v === 1 ? noun : nouns); } }, function (v) { minLeaf = v; rebuild(); draw(); });
    var sp = Kit.slider(ctrl, { label: "Ask the tree about " + (opts.xName || "x"), min: xLo, max: xHi, step: 0.5, value: probe, show: function (v) { return trim(v, 1) + (xU ? " " + xU : ""); } }, function (v) { probe = v; draw(); });
    var row = H("div", { class: "tl-row" }, el);
    var chipsEl = H("div", { class: "group", role: "group" }, row), tog = {};
    [["held", "held-out points"], ["line", "straight line"], ["law", opts.lawName || "the rule behind the data"]].forEach(function (p) {
      if (p[0] === "law" && !opts.law) return;
      var b = H("button", { type: "button", "aria-pressed": "false" }, chipsEl, p[1]); tog[p[0]] = b;
      b.addEventListener("click", function () {
        var on = b.getAttribute("aria-pressed") !== "true"; b.setAttribute("aria-pressed", String(on));
        if (p[0] === "held") showHeld = on; else if (p[0] === "line") showLine = on; else showLaw = on; draw();
      });
    });
    var wrap = H("div", { class: "card-plot" }, el), pdiv = H("div", { class: "plot tall", role: "img", "aria-label": opts.aria || "A regression tree drawn as a step function through the points" }, wrap);
    var E = {}, eq = H("div", { class: "tl-eq" }, el);
    (function () {
      var r1 = H("div", { class: "row" }, eq); H("span", { class: "name" }, r1, "The step under the ask line: its value is the average of the training values inside it");
      var q = H("div", { class: "eqn", role: "img", "aria-label": "Step value equals the sum of the values in the step divided by their number" }, r1);
      E.sum = eqBox(q, "c-navy", "", ""); op(q, "÷"); E.n = eqBox(q, "", "", ""); op(q, "="); E.mean = eqBox(q, "c-teal", "", "");
      var r2 = H("div", { class: "row" }, eq); H("span", { class: "name" }, r2, "How good is the first question: squared error of the two halves against the whole");
      var q2 = H("div", { class: "eqn", role: "img", "aria-label": "Drop in squared error equals the error before the first split minus the error after" }, r2);
      E.sse0 = eqBox(q2, "", "", ""); op(q2, "−"); E.sse1 = eqBox(q2, "c-teal", "", ""); op(q2, "="); E.drop = eqBox(q2, "c-coral", "", "");
      E.q = H("p", { class: "note", style: "margin:0" }, r2, "");
    })();
    var status = H("p", { class: "status", "aria-live": "polite" }, el, "");
    var ro = H("div", { class: "readout" }, el), R = {};
    ["leaves", "train", "held", "line", "mean"].forEach(function (k) { R[k] = H("span", {}, ro); });

    // reference fits
    var mx = 0, my = 0; train.forEach(function (i) { mx += X[i]; my += Y[i]; }); mx /= train.length; my /= train.length;
    var sxy = 0, sxx = 0; train.forEach(function (i) { sxy += (X[i] - mx) * (Y[i] - my); sxx += (X[i] - mx) * (X[i] - mx); });
    var slope = sxy / sxx, icpt = my - slope * mx;
    function rm(f, idx) { if (!idx.length) return NaN; var s = 0; idx.forEach(function (i) { var e = f(X[i]) - Y[i]; s += e * e; }); return Math.sqrt(s / idx.length); }
    var lineRmse = [rm(function (x) { return icpt + slope * x; }, train), rm(function (x) { return icpt + slope * x; }, test)];
    var meanRmse = [rm(function () { return my; }, train), rm(function () { return my; }, test)];

    var tree = null;
    function rebuild() { tree = core.growReg(X, Y, train, maxD, minLeaf, xLo, xHi); }
    function frontier(k) { return tree.nodes.filter(function (n) { return n.depth === k || (n.f < 0 && n.depth < k); }).sort(function (a, b) { return a.lo - b.lo; }); }
    function predictAt(x, k) { return core.predictReg(tree, x, k); }
    function rmseAt(idx, k) { if (!idx.length) return NaN; var s = 0; idx.forEach(function (i) { var e = predictAt(X[i], k).mean - Y[i]; s += e * e; }); return Math.sqrt(s / idx.length); }
    function draw() {
      var fr = frontier(depth), bx = [xLo], by = [];
      fr.forEach(function (n) { by.push(n.mean); if (n !== fr[fr.length - 1]) bx.push(n.hi); });
      bx.push(xHi); by.push(fr[fr.length - 1].mean);
      var law = [], lx = []; if (opts.law) for (var x = xLo; x <= xHi + 1e-9; x += (xHi - xLo) / 120) { lx.push(x); law.push(opts.law(x)); }
      var pn = predictAt(probe, depth), pm = pn.mean;
      var ymax = Math.max.apply(null, Y) * 1.12, yTop = opts.yMax || ymax;
      Kit.plot(pdiv, function (P) {
        var t = [
          { type: "scatter", mode: "markers", x: train.map(function (i) { return X[i]; }), y: train.map(function (i) { return Y[i]; }), marker: { color: P.navy, size: 6.5, opacity: 0.75, line: { color: P.bg, width: 0.5 } }, name: "training", hovertemplate: "%{x} " + xU + ", %{y:.3f} " + yU + "<extra>training</extra>" },
          { type: "scatter", mode: "markers", x: test.map(function (i) { return X[i]; }), y: test.map(function (i) { return Y[i]; }), visible: showHeld, marker: { symbol: "circle-open", color: P.navy, size: 8, line: { color: P.navy, width: 1.8 } }, name: "held out", hovertemplate: "%{x} " + xU + ", %{y:.3f} " + yU + "<extra>held out</extra>" },
          { type: "scatter", mode: "lines", x: bx, y: by, line: { color: P.teal, width: 3.2, shape: "hv" }, name: "tree", hoverinfo: "skip" },
          { type: "scatter", mode: "lines", x: lx, y: law, visible: showLaw, line: { color: P.ink2, width: 1.6, dash: "dash" }, hoverinfo: "skip" },
          { type: "scatter", mode: "lines", x: [xLo, xHi], y: [icpt + slope * xLo, icpt + slope * xHi], visible: showLine, line: { color: P.sand, width: 2.4 }, hoverinfo: "skip" },
          { type: "scatter", mode: "markers", x: [probe], y: [pm], marker: { color: P.teal, size: 12, line: { color: P.bg, width: 2 } }, hoverinfo: "skip" }
        ];
        return t;
      }, function (P) {
        var ann = [{ x: probe, y: pm, xref: "x", yref: "y", text: "tree says " + Kit.fmt(pm, 3) + " " + yU, showarrow: true, ax: probe > (xLo + xHi) * 0.6 ? -60 : 60, ay: -48, font: { size: 12.5, color: P.teal }, arrowcolor: P.teal, arrowwidth: 1.5, bgcolor: rgba(P.bg, 0.85), borderpad: 2 }];
        if (opts.law && showLaw) ann.push({ x: probe, y: opts.law(probe), xref: "x", yref: "y", text: "rule says " + Kit.fmt(opts.law(probe), 3) + " " + yU, showarrow: true, ax: probe > (xLo + xHi) * 0.6 ? -60 : 60, ay: 40, font: { size: 12, color: P.ink2 }, arrowcolor: P.ink2, arrowwidth: 1, bgcolor: rgba(P.bg, 0.85), borderpad: 2 });
        if (showLine) ann.push({ x: xHi, y: icpt + slope * xHi, xref: "x", yref: "y", text: "straight line", showarrow: false, xanchor: "right", yanchor: "bottom", font: { size: 12, color: P.sand } });
        return { margin: { l: 58, r: 14, t: 12, b: 46 }, dragmode: false, hovermode: "closest", annotations: ann,
          xaxis: { title: { text: opts.xLabel || "x" }, range: [xLo, xHi], fixedrange: true }, yaxis: { title: { text: opts.yLabel || "y" }, range: [0, yTop], fixedrange: true },
          shapes: [{ type: "line", x0: probe, x1: probe, y0: 0, y1: yTop, line: { color: P.muted, width: 1.4, dash: "dot" } }] };
      });
      var rt = rmseAt(train, depth), rh = rmseAt(test, depth);
      R.leaves.innerHTML = "Steps: <b>" + fr.length + "</b>"; R.train.innerHTML = "Training error (RMSE): <b>" + f3(rt) + " " + yU + "</b>";
      R.held.innerHTML = "Held-out error: <b>" + f3(rh) + " " + yU + "</b>"; R.line.innerHTML = "Straight line, training and held-out: <b>" + f3(lineRmse[0]) + " and " + f3(lineRmse[1]) + "</b>";
      R.mean.innerHTML = "Always the average: <b>" + f3(meanRmse[0]) + " and " + f3(meanRmse[1]) + "</b>";
      E.sum.textContent = f3(pn.mean * pn.n); E.sum.nextSibling.textContent = "sum of the " + pn.n + " training values";
      E.n.textContent = String(pn.n); E.n.nextSibling.textContent = nouns + " in this step";
      E.mean.textContent = f3(pn.mean) + " " + yU; E.mean.nextSibling.textContent = "the step's value";
      var root = tree.nodes[0];
      if (root.f >= 0) {
        var a = tree.nodes[root.l], b = tree.nodes[root.r];
        E.sse0.textContent = f3(root.sse); E.sse0.nextSibling.textContent = "squared error, whole";
        E.sse1.textContent = f3(a.sse + b.sse); E.sse1.nextSibling.textContent = "two halves added";
        E.drop.textContent = f3(root.sse - a.sse - b.sse); E.drop.nextSibling.textContent = "drop";
        E.q.textContent = "First question: " + (opts.xName || "x") + " ≤ " + trim(root.t, 2) + (xU ? " " + xU : "") + "?";
      }
      status.textContent = "Depth limit " + depth + ": " + fr.length + " steps. At " + trim(probe, 1) + " " + xU + " the tree says " + Kit.fmt(pm, 3) + " " + yU + (opts.law ? ", where the rule behind the data gives " + Kit.fmt(opts.law(probe), 3) + "." : ".");
      if (opts.onChange) opts.onChange({ depth: depth, leaves: fr.length, train: rt, held: rh, probe: pm });
    }
    rebuild(); draw(); foot(el, opts);
    return { setDepth: function (k) { depth = k; sd.set(k); draw(); }, tree: function () { return tree; } };
  };

  return api;
})();
if (typeof module !== "undefined" && module.exports) module.exports = TreeLab;
