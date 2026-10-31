// Diabetes screening project page: data distributions, the TDSP stages, the model's score map
// and what moves the score. model-grid.json holds the dataset histograms and the deployed model's
// outputs on input grids, computed by running Deployment/model.pkl from the repository.
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var FEATS = [
    ["Glucose", "glucose", "Plasma glucose two hours into an oral glucose tolerance test, in mg/dL."],
    ["BMI", "BMI", "Body mass index: weight in kilograms divided by the square of height in metres."],
    ["Age", "age", "Age in years."],
    ["DiabetesPedigreeFunction", "family history", "A score for diabetes among relatives, built for this dataset."],
    ["BloodPressure", "blood pressure", "Diastolic blood pressure, in mm Hg."],
    ["Insulin", "insulin", "Serum insulin two hours into the test, in μU/mL."],
    ["SkinThickness", "skin fold", "Triceps skinfold thickness, in mm."],
    ["Pregnancies", "pregnancies", "Number of pregnancies."]
  ];
  var LABEL = {};
  FEATS.forEach(function (f) { LABEL[f[0]] = f[1]; });
  // F-scores of the XGBoost model in the 2024 report (how often its trees split on an input).
  var XGB = [["Glucose", 213], ["BMI", 190], ["Age", 123], ["DiabetesPedigreeFunction", 61], ["BloodPressure", 52], ["Insulin", 51], ["Pregnancies", 7], ["SkinThickness", 3]];
  var STAGES = [
    ["Business understanding", "Planning", "The charter states the aim: flag people in the prediabetic range early, while changes to diet and exercise can still turn it around. The requirements ask for an answer within two seconds, and the risk list adds a clear note that the app does not replace a doctor."],
    ["Data acquisition and understanding", "Data%20Acquisition%20and%20Understanding", "I loaded the dataset from Kaggle, checked its nine columns and plotted the distribution of the measurements. The data folder keeps the CSV and a short guide to the columns."],
    ["Modelling", "Modelling", "I compared a fastai neural network for tabular data with XGBoost models. The report favours XGBoost, while the repository exports the fastai network, which the app runs. I used fastai's learning-rate finder, tried several learning rates and epoch counts, and looked at feature importance and at accuracy across age groups. The folder keeps the notebook and the exported model."],
    ["Deployment", "Deployment", "The fastai model runs in a Streamlit app. Sliders set the inputs, and a button returns the score. The folder keeps the app, its requirements and the steps to run it locally."],
    ["Customer acceptance", "Customer%20Acceptance", "A feedback form collects comments from users, and example inputs with their responses are documented as a demonstration."]
  ];
  var REPO = "https://github.com/Rayhaan1345/Diabetes-Predictor-Model/tree/main/";
  var STAGE_LINES = [["Business", "understanding"], ["Data acquisition", "and understanding"], ["Modelling"], ["Deployment"], ["Customer", "acceptance"]];
  // Sliders for the in-page model: [input, label, unit, min, max, step, app default].
  var TRY = [
    ["Glucose", "Glucose", "mg/dL", 0, 199, 1, 100],
    ["BMI", "BMI", "", 0, 67, 0.1, 33],
    ["Insulin", "Insulin", "μU/mL", 0, 846, 1, 122],
    ["BloodPressure", "Blood pressure", "mm Hg", 0, 122, 1, 80],
    ["SkinThickness", "Skin fold", "mm", 0, 99, 1, 35],
    ["DiabetesPedigreeFunction", "Family-history score", "", 0.078, 2.42, 0.001, 0.627],
    ["Pregnancies", "Pregnancies", "", 0, 17, 1, 0],
    ["Age", "Age", "years", 21, 81, 1, 50]
  ];

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
  function fmtNum(v) { return Math.abs(v) >= 10 || v === Math.round(v) ? String(Math.round(v)) : v.toFixed(v < 1 ? 2 : 1); }
  // Score colour: teal for low, sand in the middle, coral for high.
  function scoreColor(v) {
    var stops = [[0, [31, 138, 120]], [0.6, [217, 194, 122]], [1.2, [194, 86, 58]]];
    v = Math.max(0, Math.min(1.2, v));
    for (var i = 1; i < stops.length; i++) {
      if (v <= stops[i][0]) {
        var a = stops[i - 1], b = stops[i], t = (v - a[0]) / (b[0] - a[0]);
        return "rgb(" + a[1].map(function (c, k) { return Math.round(c + (b[1][k] - c) * t); }).join(",") + ")";
      }
    }
    return "rgb(194,86,58)";
  }

  // ---------- the TDSP stages (no data needed) ----------

  (function tdsp() {
    var svg = $("td-svg");
    if (!svg) return;
    var box = $("td-text"), link = $("td-link"), prev = $("td-prev"), next = $("td-next");
    var step = 0, W = 0, nodes = [];
    function build() {
      clear(svg);
      W = width(svg);
      var narrow = W < 600, n = STAGES.length, H = narrow ? 50 : 96;
      var x0 = 30, x1 = W - 30, cy = 28;
      el("line", { x1: x0, x2: x1, y1: cy, y2: cy, style: "stroke:var(--rule)", "stroke-width": 3 }, svg);
      var prog = el("line", { x1: x0, x2: x0, y1: cy, y2: cy, style: "stroke:var(--teal)", "stroke-width": 3 }, svg);
      nodes = STAGES.map(function (s, i) {
        var x = x0 + (x1 - x0) * i / (n - 1);
        var g = el("g", { tabindex: 0, role: "button", "aria-label": s[0], style: "cursor:pointer" }, svg);
        var c = el("circle", { cx: x, cy: cy, r: 13, style: "fill:var(--bg);stroke:var(--rule)", "stroke-width": 2 }, g);
        var t = text(g, x, cy + 5, String(i + 1), { "text-anchor": "middle", "font-size": 13, "font-weight": 600, style: "fill:var(--ink-2)" });
        // On narrow screens the stage names are left to the text below the line.
        var lines = narrow ? [] : STAGE_LINES[i];
        var lx = i === 0 ? x - 13 : i === n - 1 ? x + 13 : x;
        var lab = text(g, lx, cy + 36, "", { "text-anchor": i === 0 ? "start" : i === n - 1 ? "end" : "middle", "font-size": 13, style: "fill:var(--ink-2)" });
        lines.forEach(function (w, k) {
          var ts = document.createElementNS(NS, "tspan");
          ts.setAttribute("x", lx); ts.setAttribute("dy", k ? 16 : 0); ts.textContent = w;
          lab.appendChild(ts);
        });
        g.addEventListener("click", function () { go(i); });
        g.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(i); } });
        return { c: c, t: t, lab: lab, x: x };
      });
      svg.setAttribute("viewBox", "0 0 " + W + " " + H);
      paint(prog);
      build.prog = prog;
    }
    function paint(prog) {
      var target = nodes[step].x, from = Number(prog.getAttribute("x2"));
      tween(450, function (e) { prog.setAttribute("x2", (from + (target - from) * e).toFixed(1)); });
      nodes.forEach(function (nd, i) {
        nd.c.setAttribute("style", i <= step ? "fill:var(--teal);stroke:var(--teal)" : "fill:var(--bg);stroke:var(--rule)");
        nd.t.setAttribute("style", i <= step ? "fill:#fff" : "fill:var(--ink-2)");
        nd.lab.setAttribute("style", i === step ? "fill:var(--ink);font-weight:600" : "fill:var(--muted)");
      });
      box.innerHTML = "";
      var h = document.createElement("h3"); h.textContent = (step + 1) + ". " + STAGES[step][0]; box.appendChild(h);
      var p = document.createElement("p"); p.style.margin = "0"; p.textContent = STAGES[step][2]; box.appendChild(p);
      link.href = REPO + STAGES[step][1];
      link.textContent = "open the " + decodeURIComponent(STAGES[step][1]) + " folder ↗";
      prev.disabled = step === 0; next.disabled = step === STAGES.length - 1;
    }
    function go(i) { step = i; paint(build.prog); }
    prev.addEventListener("click", function () { if (step > 0) go(step - 1); });
    next.addEventListener("click", function () { if (step < STAGES.length - 1) go(step + 1); });
    build();
    window.addEventListener("resize", debounce(function () { if (width(svg) !== W) build(); }));
  })();

  // ---------- the model, running in the page ----------

  var modelP = fetch("model.json").then(function (r) { return r.json(); });
  modelP.then(tryModel).catch(function () {
    var n = $("tr-note");
    if (n) n.textContent = "The model could not be loaded. The Streamlit app linked above runs the same model.";
  });

  function tryModel(M) {
    var form = $("tr-form"), svgN = $("tr-net"), svgG = $("tr-gauge");
    if (!form || typeof DiabetesNet === "undefined") return;
    var scoreEl = $("tr-score"), note = $("tr-note"), inputs = {}, outs = {}, R = null, NG = null, GG = null, W = 0;
    TRY.forEach(function (t) {
      var lab = document.createElement("label"), name = document.createElement("span");
      name.textContent = t[1];
      if (t[2]) { var u = document.createElement("span"); u.className = "unit"; u.textContent = " " + t[2]; name.appendChild(u); }
      var o = document.createElement("output"), inp = document.createElement("input");
      inp.type = "range"; inp.name = t[0]; inp.min = t[3]; inp.max = t[4]; inp.step = t[5]; inp.value = t[6];
      lab.appendChild(name); lab.appendChild(o); lab.appendChild(inp); form.appendChild(lab);
      inputs[t[0]] = inp; outs[t[0]] = o;
      inp.addEventListener("input", update);
    });
    $("tr-reset").addEventListener("click", function () { TRY.forEach(function (t) { inputs[t[0]].value = t[6]; }); update(); });

    function values() {
      var v = {};
      TRY.forEach(function (t) {
        var x = Number(inputs[t[0]].value);
        v[t[0]] = t[5] === 1 ? Math.round(x) : x;
        outs[t[0]].textContent = t[5] < 0.01 ? x.toFixed(3) : t[5] < 1 ? x.toFixed(1) : String(Math.round(x));
      });
      return v;
    }
    function and(list) { return list.length < 2 ? list[0] : list.slice(0, -1).join(", ") + " and " + list[list.length - 1]; }

    function buildGauge() {
      clear(svgG);
      var GW = width(svgG), x0 = 6, x1 = GW - 6, y = 16, X = function (v) { return x0 + (x1 - x0) * v / 1.2; };
      for (var k = 0; k < 60; k++) el("rect", { x: X(1.2 * k / 60), y: y, width: (x1 - x0) / 60 + 0.5, height: 12, style: "fill:" + scoreColor(1.2 * (k + 0.5) / 60) }, svgG);
      [0, 0.5, 1, 1.2].forEach(function (v) {
        el("line", { x1: X(v), x2: X(v), y1: y + 12, y2: y + 17, style: "stroke:var(--muted)" }, svgG);
        text(svgG, X(v), y + 30, String(v), { "text-anchor": v === 0 ? "start" : v === 1.2 ? "end" : "middle", "font-size": 12, style: "fill:var(--muted)" });
      });
      text(svgG, X(0), y + 46, "0 = no diabetes", { "font-size": 12.5, style: "fill:var(--ink-2)" });
      text(svgG, X(1), y + 46, "1 = diabetes", { "text-anchor": "middle", "font-size": 12.5, style: "fill:var(--ink-2)" });
      var m = el("g", {}, svgG);
      el("path", { d: "M-6 " + (y - 12) + " L6 " + (y - 12) + " L0 " + (y - 3) + " Z", style: "fill:var(--ink)" }, m);
      el("line", { x1: 0, x2: 0, y1: y - 3, y2: y + 14, style: "stroke:var(--ink)", "stroke-width": 2 }, m);
      svgG.setAttribute("viewBox", "0 0 " + GW + " " + (y + 52));
      GG = { m: m, X: X };
    }

    function buildNet() {
      clear(svgN);
      W = width(svgN);
      var narrow = W < 460, cols = narrow ? 25 : 50, gap = 2, cell = (W - gap * (cols - 1)) / cols;
      var gg = 10, ic = Math.min(cell * 1.7, (W - 2 * gg - 26 * gap) / 29), y = 14;
      NG = { inp: [], h1: [], h2: [], narrow: narrow };
      NG.l0 = text(svgN, 0, y, "Inputs: 29 numbers", { "font-size": 13.5, style: "fill:var(--ink-2)" });
      y += 8;
      var groups = [[0, 15, "age"], [15, 23, narrow ? "preg." : "pregnancies"], [23, 29, narrow ? "meas." : "measurements"]], x = 0;
      groups.forEach(function (g, gi) {
        var gx = x;
        for (var i = g[0]; i < g[1]; i++) { NG.inp.push(el("rect", { x: x.toFixed(2), y: y, width: ic.toFixed(2), height: ic.toFixed(2), rx: 1.5, "class": "u" }, svgN)); x += ic + gap; }
        text(svgN, gi === 2 ? x - gap : gx, y + ic + 14, g[2], { "text-anchor": gi === 2 ? "end" : "start", "font-size": 12, style: "fill:var(--muted)" });
        x += gg - gap;
      });
      y += ic + 22;
      function grid(n, arr, label) {
        y += 18;
        var lab = text(svgN, 0, y, label, { "font-size": 13.5, style: "fill:var(--ink-2)" });
        y += 8;
        for (var i = 0; i < n; i++) arr.push(el("rect", { x: ((i % cols) * (cell + gap)).toFixed(2), y: (y + Math.floor(i / cols) * (cell + gap)).toFixed(2), width: cell.toFixed(2), height: cell.toFixed(2), rx: 1.5, "class": "u" }, svgN));
        y += Math.ceil(n / cols) * (cell + gap);
        return lab;
      }
      NG.l1 = grid(200, NG.h1, "Layer 1");
      NG.l2 = grid(100, NG.h2, "Layer 2");
      y += 20;
      NG.l3 = text(svgN, 0, y, "", { "font-size": 13.5, style: "fill:var(--ink-2)" });
      svgN.setAttribute("viewBox", "0 0 " + W + " " + (y + 6));
    }

    function paintGauge() { GG.m.setAttribute("transform", "translate(" + GG.X(Math.max(0, Math.min(1.2, R.score))).toFixed(1) + " 0)"); }
    function paintNet() {
      // Inputs are shaded within their group (age, pregnancies, measurements), since the groups differ in scale.
      [[0, 15], [15, 23], [23, 29]].forEach(function (g) {
        var part = R.x.slice(g[0], g[1]), sx = Math.max.apply(null, part.map(Math.abs)) || 1;
        part.forEach(function (v, i) {
          NG.inp[g[0] + i].setAttribute("style", "fill:var(--" + (v >= 0 ? "teal" : "coral") + ");fill-opacity:" + (0.08 + 0.9 * Math.abs(v) / sx).toFixed(2));
        });
      });
      [[R.h1, NG.h1, NG.l1, "Layer 1: 200 units, "], [R.h2, NG.h2, NG.l2, "Layer 2: 100 units, "]].forEach(function (L) {
        var mx = Math.max.apply(null, L[0]) || 1, on = 0;
        L[0].forEach(function (a, i) {
          if (a > 0) on++;
          L[1][i].setAttribute("style", a > 0 ? "fill:var(--teal);fill-opacity:" + (0.15 + 0.85 * a / mx).toFixed(2) : "fill:var(--ink);fill-opacity:0.08");
        });
        L[2].textContent = L[3] + on + " active";
      });
      NG.l3.textContent = "Output: " + R.score.toFixed(3) + (NG.narrow ? "" : ", from layer 2 combined into one number and squeezed into 0 to 1.2");
    }

    function update() {
      var v = values();
      R = DiabetesNet.run(M, v);
      scoreEl.textContent = R.score.toFixed(3);
      paintGauge(); paintNet();
      var msgs = [];
      if (!R.seen.Age) msgs.push("The training data has no woman aged " + v.Age + ", so the model uses its shared numbers for an unknown age.");
      if (!R.seen.Pregnancies) msgs.push("The training data has no woman with " + v.Pregnancies + " pregnancies, so the model treats this count as unknown.");
      var zeros = ["Glucose", "BloodPressure", "SkinThickness", "Insulin", "BMI"].filter(function (k) { return v[k] === 0; }).map(function (k) { return LABEL[k]; });
      if (zeros.length) msgs.push("In the training data, a 0 for " + and(zeros) + " meant the value was never measured.");
      note.textContent = msgs.length ? msgs.join(" ")
        : "The app's default inputs give 0.356. Training pushed the score toward 1 for women with diabetes and toward 0 for women without, so it is a score and not a probability. It is a student project and not a medical tool.";
    }

    buildGauge(); buildNet(); update();
    window.addEventListener("resize", debounce(function () { if (width(svgN) !== W) { buildGauge(); buildNet(); paintGauge(); paintNet(); } }));
  }

  // ---------- data-driven parts ----------

  var gridP = fetch("model-grid.json").then(function (r) { return r.json(); });
  gridP.then(function (D) { histogram(D); drivers(D); });
  Promise.all([gridP, modelP]).then(function (a) { scoreMap(a[0], a[1]); });

  function histogram(D) {
    var svg = $("hs-svg");
    if (!svg) return;
    var note = $("hs-note"), pick = 0, W = 0;
    chips($("hs-feats"), FEATS.map(function (f) { return f[1]; }), pick, function (i) { pick = i; draw(); });
    function draw() {
      clear(svg);
      W = width(svg);
      var key = FEATS[pick][0], h = D.hist[key], nb = h.no.length;
      var m = { l: 40, r: 8, t: 14, b: 40 }, H = W < 560 ? 230 : 260;
      var tot = h.no.map(function (v, i) { return v + h.yes[i]; }), max = Math.max.apply(null, tot) * 1.08;
      var bw = (W - m.l - m.r) / nb, Y = function (v) { return m.t + (H - m.t - m.b) * (1 - v / max); };
      var step = Math.pow(10, Math.floor(Math.log10(max / 3))), tick = [1, 2, 5, 10].map(function (k) { return k * step; }).filter(function (k) { return max / k <= 5; })[0];
      for (var v = 0; v <= max; v += tick) {
        el("line", { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), style: "stroke:var(--rule)" }, svg);
        text(svg, m.l - 8, Y(v) + 4, String(v), { "text-anchor": "end", "font-size": 12, style: "fill:var(--muted)" });
      }
      var bars = [];
      for (var i = 0; i < nb; i++) {
        var x = m.l + i * bw + 1;
        var rn = el("rect", { x: x, y: Y(0), width: Math.max(1, bw - 2), height: 0, style: "fill:var(--navy)" }, svg);
        var ry = el("rect", { x: x, y: Y(0), width: Math.max(1, bw - 2), height: 0, style: "fill:var(--coral)" }, svg);
        var tip = el("title", {}, ry);
        tip.textContent = fmtNum(h.edges[i]) + " to " + fmtNum(h.edges[i + 1]) + ": " + h.no[i] + " without diabetes, " + h.yes[i] + " with";
        el("title", {}, rn).textContent = tip.textContent;
        bars.push([rn, ry, h.no[i], h.yes[i]]);
      }
      [0, Math.floor(nb / 2), nb].forEach(function (k) {
        text(svg, m.l + k * bw, H - m.b + 18, fmtNum(h.edges[k]), { "text-anchor": k === 0 ? "start" : k === nb ? "end" : "middle", "font-size": 12, style: "fill:var(--muted)" });
      });
      text(svg, (m.l + W - m.r) / 2, H - 6, FEATS[pick][1] + " (number of women per bar on the left)", { "text-anchor": "middle", "font-size": 13, style: "fill:var(--ink-2)" });
      el("rect", { x: W - m.r - 190, y: 4, width: 12, height: 12, style: "fill:var(--navy)" }, svg);
      text(svg, W - m.r - 172, 14, "no diabetes", { "font-size": 12.5, style: "fill:var(--ink-2)" });
      el("rect", { x: W - m.r - 92, y: 4, width: 12, height: 12, style: "fill:var(--coral)" }, svg);
      text(svg, W - m.r - 74, 14, "diabetes", { "font-size": 12.5, style: "fill:var(--ink-2)" });
      svg.setAttribute("viewBox", "0 0 " + W + " " + H);
      tween(500, function (e) {
        bars.forEach(function (b) {
          var yn = Y(b[2] * e), yy = Y((b[2] + b[3]) * e);
          b[0].setAttribute("y", yn.toFixed(1)); b[0].setAttribute("height", Math.max(0, Y(0) - yn).toFixed(1));
          b[1].setAttribute("y", yy.toFixed(1)); b[1].setAttribute("height", Math.max(0, yn - yy).toFixed(1));
        });
      });
      var s = FEATS[pick][2] + " Median " + fmtNum(h.median_no) + " without diabetes and " + fmtNum(h.median_yes) + " with diabetes.";
      if (key === "Pregnancies") s += " " + h.zeros + " women had no pregnancies.";
      else if (h.zeros > 0) s += " " + h.zeros + " women have a 0 here, which marks a value that was never measured.";
      note.textContent = s;
    }
    draw();
    window.addEventListener("resize", debounce(function () { if (width(svg) !== W) draw(); }));
  }

  // The map is computed in the page by the model, with the inputs other than glucose and BMI at the app's defaults.
  function scoreMap(D, M) {
    var svg = $("mp-svg");
    if (!svg || typeof DiabetesNet === "undefined") return;
    var AGES = [25, 35, 50, 65], PREG = [0, 3, 8], cache = {};
    var note = $("mp-note"), ai = 2, pi = 0, W = 0;
    chips($("mp-ages"), AGES.map(String), ai, function (i) { ai = i; draw(); });
    chips($("mp-preg"), PREG.map(String), pi, function (i) { pi = i; draw(); });
    function grid(age, preg) {
      var k = age + "_" + preg;
      if (!cache[k]) {
        cache[k] = [];
        D.B.forEach(function (b) {
          D.G.forEach(function (g) {
            var v = {};
            for (var f in D.default) v[f] = D.default[f];
            v.Glucose = g; v.BMI = b; v.Age = age; v.Pregnancies = preg;
            cache[k].push(Math.round(1000 * DiabetesNet.run(M, v).score));
          });
        });
      }
      return cache[k];
    }
    function draw() {
      clear(svg);
      W = width(svg);
      var G = D.G, B = D.B, vals = grid(AGES[ai], PREG[pi]);
      var narrow = W < 560, m = { l: 46, r: narrow ? 8 : 90, t: 10, b: 44 };
      var pw = W - m.l - m.r, ph = Math.min(narrow ? 260 : 330, pw * 0.75), H = m.t + ph + m.b + (narrow ? 40 : 0);
      var cw = pw / G.length, ch = ph / B.length;
      var X = function (g) { return m.l + (g - G[0] + 2.5) / (G[G.length - 1] - G[0] + 5) * pw; };
      var Y = function (b) { return m.t + ph - (b - B[0] + 0.75) / (B[B.length - 1] - B[0] + 1.5) * ph; };
      var cells = el("g", {}, svg);
      B.forEach(function (b, bi) {
        G.forEach(function (g, gi) {
          var v = vals[bi * G.length + gi] / 1000;
          var r = el("rect", { x: (m.l + gi * cw).toFixed(2), y: (m.t + ph - (bi + 1) * ch).toFixed(2), width: (cw + 0.6).toFixed(2), height: (ch + 0.6).toFixed(2), style: "fill:" + scoreColor(v) }, cells);
          r.dataset.v = v; r.dataset.g = g; r.dataset.b = b;
        });
      });
      [60, 100, 140, 180].forEach(function (g) {
        el("line", { x1: X(g), x2: X(g), y1: m.t + ph, y2: m.t + ph + 5, style: "stroke:var(--muted)" }, svg);
        text(svg, X(g), m.t + ph + 18, String(g), { "text-anchor": "middle", "font-size": 12, style: "fill:var(--muted)" });
      });
      [20, 30, 40, 50, 60].forEach(function (b) {
        el("line", { x1: m.l - 5, x2: m.l, y1: Y(b), y2: Y(b), style: "stroke:var(--muted)" }, svg);
        text(svg, m.l - 8, Y(b) + 4, String(b), { "text-anchor": "end", "font-size": 12, style: "fill:var(--muted)" });
      });
      text(svg, m.l + pw / 2, m.t + ph + 36, "glucose, mg/dL", { "text-anchor": "middle", "font-size": 13, style: "fill:var(--ink-2)" });
      text(svg, 12, m.t + ph / 2, "BMI", { "text-anchor": "middle", "font-size": 13, transform: "rotate(-90 12 " + (m.t + ph / 2) + ")", style: "fill:var(--ink-2)" });
      el("circle", { cx: X(100), cy: Y(33), r: 6, fill: "none", style: "stroke:#fff", "stroke-width": 2.2 }, svg);
      el("circle", { cx: X(100), cy: Y(33), r: 8, fill: "none", style: "stroke:#000;stroke-opacity:0.35", "stroke-width": 1 }, svg);
      var hov = el("rect", { width: cw, height: ch, fill: "none", style: "stroke:#fff;stroke-opacity:0", "stroke-width": 2 }, svg);
      // colour legend
      var lx, ly, lw, lh, vertical = !narrow;
      if (vertical) { lx = W - m.r + 26; ly = m.t; lw = 14; lh = ph; } else { lx = m.l; ly = m.t + ph + 50; lw = pw; lh = 12; }
      for (var k = 0; k < 60; k++) {
        var v = 1.2 * k / 59;
        if (vertical) el("rect", { x: lx, y: ly + lh - (k + 1) * lh / 60, width: lw, height: lh / 60 + 0.5, style: "fill:" + scoreColor(v) }, svg);
        else el("rect", { x: lx + k * lw / 60, y: ly, width: lw / 60 + 0.5, height: lh, style: "fill:" + scoreColor(v) }, svg);
      }
      [0, 0.6, 1.2].forEach(function (v) {
        if (vertical) text(svg, lx + lw + 6, ly + lh - lh * v / 1.2 + 4, v.toFixed(1), { "font-size": 12, style: "fill:var(--muted)" });
        else text(svg, lx + lw * v / 1.2, ly + lh + 14, v.toFixed(1), { "text-anchor": v === 0 ? "start" : v === 1.2 ? "end" : "middle", "font-size": 12, style: "fill:var(--muted)" });
      });
      if (vertical) text(svg, lx - 4, ly - 2 + lh + 30, "score", { "font-size": 12.5, style: "fill:var(--ink-2)" });
      if (!vertical) H += 26;
      svg.setAttribute("viewBox", "0 0 " + W + " " + H);
      function show(r) {
        hov.setAttribute("x", r.getAttribute("x")); hov.setAttribute("y", r.getAttribute("y")); hov.style.strokeOpacity = "0.9";
        note.textContent = "Glucose " + r.dataset.g + ", BMI " + r.dataset.b + ", age " + AGES[ai] + ", " + PREG[pi] + " pregnancies: score " + Number(r.dataset.v).toFixed(2) + ".";
      }
      cells.addEventListener("mousemove", function (e) { if (e.target.dataset && e.target.dataset.v) show(e.target); });
      cells.addEventListener("click", function (e) { if (e.target.dataset && e.target.dataset.v) show(e.target); });
      cells.addEventListener("mouseleave", function () { hov.style.strokeOpacity = "0"; });
      var def = vals[B.indexOf(33) * G.length + G.indexOf(100)];
      note.textContent = "Age " + AGES[ai] + ", " + PREG[pi] + " pregnancies. At the ring (glucose 100, BMI 33) the score is " + (def / 1000).toFixed(3) + ". Hover or tap the map to read a score.";
    }
    draw();
    window.addEventListener("resize", debounce(function () { if (width(svg) !== W) draw(); }));
  }

  function drivers(D) {
    var svg = $("dv-svg");
    if (!svg) return;
    var note = $("dv-note"), mode = "dep", W = 0;
    var btns = [].slice.call(document.querySelectorAll("#drv [data-drv]"));
    btns.forEach(function (b) { b.addEventListener("click", function () { press(btns, b); mode = b.dataset.drv; draw(); }); });
    function draw() {
      clear(svg);
      W = width(svg);
      var rows;
      if (mode === "dep") {
        rows = Object.keys(D.curves).map(function (k) {
          var y = D.curves[k].y, lo = Math.min.apply(null, y), hi = Math.max.apply(null, y);
          return [k, (hi - lo) / 1000, D.curves[k]];
        }).sort(function (a, b) { return b[1] - a[1]; });
      } else rows = XGB.map(function (r) { return [r[0], r[1], null]; });
      var narrow = W < 560, lab = narrow ? 104 : 140, spark = mode === "dep" ? (narrow ? 70 : 120) : 0, rh = 34;
      var max = Math.max.apply(null, rows.map(function (r) { return r[1]; })) * 1.05;
      var bx = lab, bw = W - lab - spark - 64 - (spark ? 16 : 0), H = rows.length * rh + 26;
      var parts = rows.map(function (r, i) {
        var y = 4 + i * rh;
        text(svg, lab - 10, y + 17, LABEL[r[0]], { "text-anchor": "end", "font-size": 14, style: "fill:var(--ink)" });
        var bar = el("rect", { x: bx, y: y + 6, width: 0, height: 16, rx: 3, style: "fill:var(--" + (i < 3 ? "teal" : "navy") + ")" }, svg);
        var t = text(svg, bx + bw * r[1] / max + 8, y + 19, mode === "dep" ? "±" + (r[1] / 2).toFixed(2) + " (range " + r[1].toFixed(2) + ")" : String(r[1]), { "font-size": 12.5, style: "fill:var(--ink-2);opacity:0" });
        if (mode === "dep") t.textContent = r[1].toFixed(2);
        if (r[2]) {
          var sx = W - spark, ys = r[2].y, lo = 0, hi = 1200;
          var pts = ys.map(function (v, j) { return (sx + spark * j / (ys.length - 1)).toFixed(1) + "," + (y + 26 - 22 * (v - lo) / (hi - lo)).toFixed(1); }).join(" ");
          el("rect", { x: sx, y: y + 3, width: spark, height: 24, rx: 2, style: "fill:var(--bg);stroke:var(--rule)" }, svg);
          el("polyline", { points: pts, fill: "none", style: "stroke:var(--coral)", "stroke-width": 1.6 }, svg);
        }
        return { bar: bar, t: t, v: r[1] };
      });
      text(svg, bx, H - 4, mode === "dep" ? "how far the score moves across the input's range" : "XGBoost F-score: number of splits on the input", { "font-size": 12.5, style: "fill:var(--muted)" });
      if (spark) text(svg, W - spark, H - 4, "score curve", { "font-size": 12.5, style: "fill:var(--muted)" });
      svg.setAttribute("viewBox", "0 0 " + W + " " + H);
      tween(650, function (e) {
        parts.forEach(function (p) {
          p.bar.setAttribute("width", (bw * p.v / max * e).toFixed(1));
          if (e >= 1) p.t.style.opacity = "1";
        });
      });
      note.textContent = mode === "dep"
        ? "A curve shows the score as one input runs across its range, with the others at the app's defaults (vertical scale 0 to 1.2). Age and pregnancies use only the values seen in training."
        : "From the report's XGBoost model, which the app does not use. Glucose, BMI and age lead.";
    }
    draw();
    window.addEventListener("resize", debounce(function () { if (width(svg) !== W) draw(); }));
  }
})();
