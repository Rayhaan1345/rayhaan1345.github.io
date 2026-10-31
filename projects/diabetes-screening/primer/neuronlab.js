/* NeuronLab, copied unchanged from the chapter file mailab.in/primer/b1-one-neuron/b1-one-neuron.js for the diabetes primer.
   The chapter's own figure code (activation gallery, layer of neurons) is left out.

   NeuronLab: a reusable neuron playground. No text in this module belongs to a chapter.
   ======================================================================================
   Needs: Plotly 2.x (the cartesian bundle is enough) and the primer kit (assets/kit.js):
   Kit.plot, Kit.palette, Kit.slider, Kit.select, Kit.chips, Kit.button, Kit.html, Kit.fmt, Kit.onTheme.

   NeuronLab.mount(container, options) builds, inside the element `container`:
     - sliders for two inputs, two weights, a bias, and a menu of activation functions;
     - boxes with live values: z = w1 x1 + w2 x2 + b, then a = g(z);
     - the activation curve g(z) and its slope, with the current z marked;
     - a map of the output a over the plane of the two inputs, with the line z = 0, an arrow along
       the weights, and the current input marked. Click or drag on the map to move the input;
     - optional "fit" mode: labelled points on the map, a score, and Train / Step buttons that tune
       the dials with the learning rule that belongs to the chosen activation.
   It returns {set, get, redraw}.

   options (all optional except inputs):
     inputs      [{name, min, max, value, digits}, {...}]  two inputs; min and max set the map axes;
                 `digits` is the number of decimals shown (default 2)
     scale       {mean: [m1, m2], sd: [s1, s2]}  if given, the neuron works on (x - mean) / sd, and
                 the weights then act on those scaled values. The map axes are scaled values with
                 ticks written in the original units.
     weights     [w1, w2]  starting weights (default [1, 1])
     bias        starting bias (default 0)
     activation  none | step | sigmoid | tanh | relu | gelu   (default sigmoid)
     activations the list of names to put in the menu (default all six)
     wRange, bRange   slider limits for weights and bias (default 4 and 6)
     probe       [x1, x2] label of the marked input is `probeLabel`
     points      [{x: [x1, x2], y: 0 or 1}] labelled rows. Turns on fit mode.
     classNames  [name for y = 0, name for y = 1]   used in fit mode (default ["class 0", "class 1"])
     notes       {none: "...", step: "...", ...}  a sentence per activation, shown under the figure
     eta         learning rate for training (default 0.5)
     onChange    function(state) called after every change
   Learning rules in fit mode: step uses the perceptron rule; sigmoid uses gradient descent on
   log loss; the others use gradient descent on mean squared error. The label of class 1 is 1
   (and +1 for tanh, whose labels are -1 and +1); the call is "class 1" when the output is
   above the activation's cut (0.5, or 0 for tanh).
   NeuronLab.ACTS holds the six activations: {name, sym, f, d, cut, mid, yr}.
   NeuronLab.drawMap(canvas, fn, range, palette, opts) paints fn(u1, u2) as a small colour map. */
var NeuronLab = (function () {
  "use strict";

  // ---------- the six activations ----------
  function erf(x) {
    var s = x < 0 ? -1 : 1, t;
    x = Math.abs(x); t = 1 / (1 + 0.3275911 * x);
    return s * (1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x));
  }
  function Phi(z) { return 0.5 * (1 + erf(z / Math.SQRT2)); }
  function phi(z) { return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI); }
  function sig(z) { return z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z)); }
  var ACTS = {
    none: { key: "none", name: "none", sym: "z", f: function (z) { return z; }, d: function () { return 1; }, cut: 0.5, mid: 0, yr: [-6.5, 6.5] },
    step: { key: "step", name: "step", sym: "step", f: function (z) { return z >= 0 ? 1 : 0; }, d: function () { return 0; }, cut: 0.5, mid: 0.5, yr: [-0.15, 1.15] },
    sigmoid: { key: "sigmoid", name: "sigmoid", sym: "σ", f: sig, d: function (z) { var s = sig(z); return s * (1 - s); }, cut: 0.5, mid: 0.5, yr: [-0.1, 1.1] },
    tanh: { key: "tanh", name: "tanh", sym: "tanh", f: Math.tanh, d: function (z) { var t = Math.tanh(z); return 1 - t * t; }, cut: 0, mid: 0, yr: [-1.25, 1.25] },
    relu: { key: "relu", name: "ReLU", sym: "ReLU", f: function (z) { return z > 0 ? z : 0; }, d: function (z) { return z > 0 ? 1 : 0; }, cut: 0.5, mid: 0, yr: [-1, 6.5] },
    gelu: { key: "gelu", name: "GELU", sym: "GELU", f: function (z) { return z * Phi(z); }, d: function (z) { return Phi(z) + z * phi(z); }, cut: 0.5, mid: 0, yr: [-1, 6.5] }
  };
  var ORDER = ["none", "step", "sigmoid", "tanh", "relu", "gelu"];

  // ---------- small helpers ----------
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function lin(a, b, n) { var o = [], i; for (i = 0; i < n; i++) o.push(a + (b - a) * i / (n - 1)); return o; }
  function mixHex(a, b, t) {
    function p(h) { h = h.replace("#", ""); if (h.length === 3) h = h.replace(/(.)/g, "$1$1"); return [0, 2, 4].map(function (i) { return parseInt(h.substr(i, 2), 16); }); }
    var A = p(a), B = p(b);
    return "rgb(" + A.map(function (v, i) { return Math.round(v + (B[i] - v) * t); }).join(",") + ")";
  }
  function rgbOf(c) {
    if (c.charAt(0) === "#") { c = c.replace("#", ""); if (c.length === 3) c = c.replace(/(.)/g, "$1$1"); return [0, 2, 4].map(function (i) { return parseInt(c.substr(i, 2), 16); }); }
    var m = c.match(/[\d.]+/g) || [0, 0, 0]; return [Number(m[0]), Number(m[1]), Number(m[2])];
  }
  function niceTicks(lo, hi, n) {
    var raw = (hi - lo) / n, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p, step = (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p, out = [], v = Math.ceil(lo / step - 1e-9) * step;
    for (; v <= hi + 1e-9; v += step) out.push(Math.round(v / step) * step);
    return out;
  }
  // The colour of a value on the scale navy (low) - neutral - coral (high), neutral at `mid`, half-width R.
  function colorAt(P, v, mid, R) {
    var t = clamp((v - mid) / R, -1, 1), neutral = P.paper;
    return t < 0 ? mixHex(neutral, P.navy, -t * 0.92) : mixHex(neutral, P.coral, t * 0.92);
  }
  function drawMap(canvas, fn, range, P, o) {
    o = o || {};
    var n = o.n || 40, ctx = canvas.getContext("2d"), W = canvas.width, H = canvas.height, img = document.createElement("canvas"), ic, id, i, j, k = 0, c, v, mid = o.mid != null ? o.mid : 0, R = o.R || 1;
    img.width = n; img.height = n; ic = img.getContext("2d"); id = ic.createImageData(n, n);
    for (j = 0; j < n; j++) for (i = 0; i < n; i++) {
      v = fn(range[0] + (range[1] - range[0]) * (i + 0.5) / n, range[3] - (range[3] - range[2]) * (j + 0.5) / n);
      c = rgbOf(colorAt(P, v, mid, R)); k = 4 * (j * n + i);
      id.data[k] = c[0]; id.data[k + 1] = c[1]; id.data[k + 2] = c[2]; id.data[k + 3] = 255;
    }
    ic.putImageData(id, 0, 0);
    ctx.clearRect(0, 0, W, H); ctx.imageSmoothingEnabled = true; ctx.drawImage(img, 0, 0, W, H);
  }

  // ---------- styles for the module (scoped by the class nl) ----------
  var styled = false;
  function addStyle() {
    if (styled) return; styled = true;
    var s = document.createElement("style");
    s.textContent =
      ".nl .nl-gh{margin:10px 0 2px;font-family:'Spectral SC',Georgia,serif;font-size:13.5px;letter-spacing:.04em;color:var(--muted)}" +
      ".nl .controls{margin:2px 0 6px}" +
      ".nl .nl-plots{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.05fr);gap:10px 18px;align-items:start;margin-top:8px}" +
      ".nl .nl-plots .plot{min-height:390px}" +
      ".nl .nl-plots .nl-ph{margin:0 0 2px;font-size:14px;color:var(--ink-2)}" +
      ".nl .nl-plots .nl-ph b{color:var(--ink)}" +
      ".nl .nl-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;margin:10px 0 0}" +
      ".nl .nl-map{cursor:crosshair}" +
      "@media (max-width:760px){.nl .nl-plots{grid-template-columns:minmax(0,1fr)}}";
    document.head.appendChild(s);
  }

  // ---------- the playground ----------
  function mount(container, opt) {
    addStyle();
    opt = opt || {};
    var inp = opt.inputs, sc = opt.scale || null, fit = !!(opt.points && opt.points.length);
    var names = opt.activations || ORDER;
    var S = { w: (opt.weights || [1, 1]).slice(), b: opt.bias || 0, act: opt.activation || "sigmoid", x: [inp[0].value, inp[1].value], steps: 0, loss: null, running: false };
    if (opt.probe) S.x = opt.probe.slice();
    var mu = sc ? sc.mean : [0, 0], sd = sc ? sc.sd : [1, 1], start = { w: S.w.slice(), b: S.b };
    var urange = [0, 1].map(function (i) { var pad = 0.04 * (inp[i].max - inp[i].min); return [(inp[i].min - pad - mu[i]) / sd[i], (inp[i].max + pad - mu[i]) / sd[i]]; });
    var eta = opt.eta || 0.5, pts = fit ? opt.points.map(function (p) { return { u: [(p.x[0] - mu[0]) / sd[0], (p.x[1] - mu[1]) / sd[1]], y: p.y, x: p.x }; }) : [];
    var cls = opt.classNames || ["class 0", "class 1"], notes = opt.notes || {}, order = null, raf = 0, pending = false, lastPerc = 0;
    var lazy = 0;
    if (fit) { var ones = pts.filter(function (p) { return p.y === 1; }).length; lazy = Math.max(ones, pts.length - ones) / pts.length; }
    function rawToU(i, v) { return (v - mu[i]) / sd[i]; }
    function uToRaw(i, u) { return u * sd[i] + mu[i]; }
    function dg(i) { return inp[i].digits != null ? inp[i].digits : 2; }

    container.classList.add("nl");
    container.innerHTML = "";
    var H = Kit.html;
    var q = {};

    // controls
    H("p", { class: "nl-gh" }, container, "The input the neuron sees");
    var c1 = H("div", { class: "controls" }, container);
    var sx = [0, 1].map(function (i) {
      return Kit.slider(c1, { label: inp[i].name, min: inp[i].min, max: inp[i].max, step: (inp[i].max - inp[i].min) / 400, value: S.x[i], digits: dg(i) }, function (v) { S.x[i] = v; change(); });
    });
    H("p", { class: "nl-gh" }, container, "The dials: two weights and a bias");
    var c2 = H("div", { class: "controls" }, container), wr = opt.wRange || 4, br = opt.bRange || 6;
    var sw = [0, 1].map(function (i) {
      return Kit.slider(c2, { label: "weight w" + (i + 1), min: -wr, max: wr, step: 0.05, value: S.w[i], digits: 2 }, function (v) { S.w[i] = v; S.steps = 0; change(); });
    });
    var sb = Kit.slider(c2, { label: "bias b", min: -br, max: br, step: 0.05, value: S.b, digits: 2 }, function (v) { S.b = v; S.steps = 0; change(); });
    H("p", { class: "nl-gh" }, container, "The activation");
    var c3 = H("div", { class: "controls" }, container);
    var menu = Kit.select(c3, "activation g", names.map(function (k) { return { value: k, label: ACTS[k].name }; }), S.act, function (v) { S.act = v; S.steps = 0; stop(); change(); });
    var etaS = null;
    if (fit) etaS = Kit.slider(c3, { label: "learning rate η", min: 0.01, max: 2, step: 0.01, value: eta, digits: 2 }, function (v) { eta = v; });

    // equation boxes
    function tb(parent, cls2, label) { var t = H("span", { class: "t" + (cls2 ? " " + cls2 : "") }, parent), b = H("b", {}, t, "·"); H("i", {}, t, label); return b; }
    function op(parent, txt) { return H("span", { class: "op" }, parent, txt); }
    var e1 = H("div", { class: "eqn", "aria-live": "polite" }, container);
    e1.style.marginTop = "12px";
    q.w1 = tb(e1, "c-coral", "weight w₁"); op(e1, "×"); q.x1 = tb(e1, "c-navy", inp[0].name + (sc ? ", scaled" : ""));
    op(e1, "+"); q.w2 = tb(e1, "c-coral", "weight w₂"); op(e1, "×"); q.x2 = tb(e1, "c-navy", inp[1].name + (sc ? ", scaled" : ""));
    op(e1, "+"); q.b = tb(e1, "c-sand", "bias b"); op(e1, "="); q.z = tb(e1, "", "weighted sum z");
    var e2 = H("div", { class: "eqn", "aria-live": "polite" }, container);
    q.a = tb(e2, "c-teal", "output a"); op(e2, "="); q.g = tb(e2, "", "activation"); op(e2, "("); q.z2 = tb(e2, "", "z"); op(e2, ")");
    op(e2, "·"); q.sl = tb(e2, "", "slope g′(z)");

    // plots
    var pl = H("div", { class: "nl-plots" }, container), pa = H("div", {}, pl), pm = H("div", {}, pl);
    q.pha = H("p", { class: "nl-ph" }, pa); q.phm = H("p", { class: "nl-ph" }, pm);
    q.actPlot = H("div", { class: "plot", role: "img", "aria-label": "The activation curve with the current weighted sum marked" }, pa);
    q.mapPlot = H("div", { class: "plot nl-map", role: "img", "aria-label": "A map of the neuron's output over its two inputs, with the line where the weighted sum is zero" }, pm);

    // fit controls and readouts
    var bar = null;
    if (fit) {
      bar = H("div", { class: "nl-bar" }, container);
      q.train = Kit.button(bar, "Train", function () { if (S.running) stop(); else go(); });
      Kit.button(bar, "One step", function () { stop(); oneStep(); change(); });
      Kit.button(bar, "Reset the dials", function () { stop(); S.w = start.w.slice(); S.b = start.b; S.steps = 0; syncSliders(); change(); });
      Kit.button(bar, "Random start", function () {
        stop(); var r = Kit.rng(Math.floor(Math.random() * 1e6));
        S.w = [(r() * 2 - 1) * Math.min(2, wr), (r() * 2 - 1) * Math.min(2, wr)]; S.b = (r() * 2 - 1) * Math.min(2, br); S.steps = 0; syncSliders(); change();
      });
    }
    var ro = H("div", { class: "readout" }, container);
    q.ro = ro;
    q.status = H("p", { class: "status", "aria-live": "polite" }, container);

    function syncSliders() { sw[0].set(S.w[0]); sw[1].set(S.w[1]); sb.set(S.b); }
    function u() { return [rawToU(0, S.x[0]), rawToU(1, S.x[1])]; }
    function zOf(u1, u2) { return S.w[0] * u1 + S.w[1] * u2 + S.b; }

    // ---------- training ----------
    function labelOf(p) { return S.act === "tanh" ? (p.y ? 1 : -1) : p.y; }
    function evalAll() {
      var A = ACTS[S.act], right = 0, loss = 0, i, p, z, a, t, pred;
      for (i = 0; i < pts.length; i++) {
        p = pts[i]; z = zOf(p.u[0], p.u[1]); a = A.f(z); pred = S.act === "step" ? z >= 0 : a >= A.cut;
        if ((pred ? 1 : 0) === p.y) right++;
        p.wrong = (pred ? 1 : 0) !== p.y;
        if (S.act === "sigmoid") { a = clamp(a, 1e-12, 1 - 1e-12); loss -= p.y ? Math.log(a) : Math.log(1 - a); }
        else if (S.act === "step") loss += p.wrong ? 1 : 0;
        else { t = labelOf(p); loss += (a - t) * (a - t); }
      }
      return { right: right, loss: loss / (pts.length || 1) };
    }
    function oneStep() {
      var A = ACTS[S.act], n = pts.length, i, p, z, a, e, g1 = 0, g2 = 0, gb = 0;
      if (S.act === "step") {
        if (!order) { var r = Kit.rng(11); order = pts.map(function (_, k) { return k; }); for (i = order.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), tmp = order[i]; order[i] = order[j]; order[j] = tmp; } }
        for (i = 0; i < n; i++) {
          p = pts[order[i]]; z = zOf(p.u[0], p.u[1]); e = p.y - (z >= 0 ? 1 : 0);
          if (e) { S.w[0] += 0.1 * e * p.u[0]; S.w[1] += 0.1 * e * p.u[1]; S.b += 0.1 * e; }
        }
      } else {
        for (i = 0; i < n; i++) {
          p = pts[i]; z = zOf(p.u[0], p.u[1]); a = A.f(z);
          e = S.act === "sigmoid" ? a - p.y : 2 * (a - labelOf(p)) * A.d(z);
          g1 += e * p.u[0]; g2 += e * p.u[1]; gb += e;
        }
        S.w[0] -= eta * g1 / n; S.w[1] -= eta * g2 / n; S.b -= eta * gb / n;
        S.dead = (g1 === 0 && g2 === 0 && gb === 0);
      }
      S.w[0] = clamp(S.w[0], -wr, wr); S.w[1] = clamp(S.w[1], -wr, wr); S.b = clamp(S.b, -br, br);
      S.steps++; syncSliders();
    }
    function go() {
      S.running = true; q.train.textContent = "Pause";
      (function tick(ts) {
        if (!S.running) return;
        if (S.act === "step") { if (!lastPerc || ts - lastPerc > 140) { lastPerc = ts; oneStep(); change(); } }
        else { for (var k = 0; k < 6; k++) oneStep(); change(); }
        if (S.steps >= 8000) { stop(); return; }
        raf = requestAnimationFrame(tick);
      })(0);
    }
    function stop() { S.running = false; cancelAnimationFrame(raf); if (q.train) q.train.textContent = "Train"; }

    // ---------- drawing ----------
    function segment() {
      var w1 = S.w[0], w2 = S.w[1], b = S.b, r = [], x0 = urange[0][0], x1 = urange[0][1], y0 = urange[1][0], y1 = urange[1][1], t;
      if (Math.abs(w1) < 1e-9 && Math.abs(w2) < 1e-9) return null;
      if (Math.abs(w2) > 1e-9) { t = -(w1 * x0 + b) / w2; if (t >= y0 && t <= y1) r.push([x0, t]); t = -(w1 * x1 + b) / w2; if (t >= y0 && t <= y1) r.push([x1, t]); }
      if (Math.abs(w1) > 1e-9) { t = -(w2 * y0 + b) / w1; if (t >= x0 && t <= x1) r.push([t, y0]); t = -(w2 * y1 + b) / w1; if (t >= x0 && t <= x1) r.push([t, y1]); }
      if (r.length < 2) return null;
      var best = [r[0], r[1]], d = 0, i, j;
      for (i = 0; i < r.length; i++) for (j = i + 1; j < r.length; j++) { var dd = Math.hypot(r[i][0] - r[j][0], r[i][1] - r[j][1]); if (dd > d) { d = dd; best = [r[i], r[j]]; } }
      return best;
    }
    function ticks(i) {
      var raw = niceTicks(inp[i].min, inp[i].max, 5);
      return { tickmode: "array", tickvals: raw.map(function (v) { return rawToU(i, v); }), ticktext: raw.map(function (v) { return String(Math.round(v * 1000) / 1000); }) };
    }
    function mapTraces(P) {
      var A = ACTS[S.act], N = 61, xs = lin(urange[0][0], urange[0][1], N), ys = lin(urange[1][0], urange[1][1], N), z = [], i, j, row, zz, h = Math.max(1e-6, (Math.abs(S.w[0]) * (xs[1] - xs[0]) + Math.abs(S.w[1]) * (ys[1] - ys[0])) * 0.9);
      for (j = 0; j < N; j++) { row = []; for (i = 0; i < N; i++) { zz = zOf(xs[i], ys[j]); row.push(S.act === "step" ? clamp(0.5 + zz / (2 * h), 0, 1) : A.f(zz)); } z.push(row); }
      var mid = fit ? A.cut : A.mid, R = S.act === "none" ? 3 : S.act === "relu" || S.act === "gelu" ? 3 : S.act === "tanh" ? 1 : 0.5;
      if (fit && S.act === "none") R = 1; if (fit && (S.act === "relu" || S.act === "gelu")) R = 1.5;
      var size = S.act === "sigmoid" || S.act === "tanh" ? 0.1 : S.act === "step" ? 1 : 0.5, lo = mid - R, hi = mid + R;
      var cs = [[0, mixHex(P.paper, P.navy, 0.92)], [0.5, P.paper], [1, mixHex(P.paper, P.coral, 0.92)]];
      var tr = [{ type: "contour", x: xs, y: ys, z: z, zmin: lo, zmax: hi, colorscale: cs, showscale: false, showlegend: false, hoverinfo: "skip", contours: { coloring: "heatmap", showlines: S.act !== "step", start: lo, end: hi, size: size }, line: { color: P.muted, width: 0.6, smoothing: 0 }, ncontours: 20 }];
      var seg = segment(), pu = u();
      if (seg) tr.push({ type: "scatter", mode: "lines", x: [seg[0][0], seg[1][0]], y: [seg[0][1], seg[1][1]], line: { color: P.ink, width: 2.2, dash: "dash" }, showlegend: false, hoverinfo: "skip" });
      if (fit) {
        [0, 1].forEach(function (c) {
          var sel = pts.filter(function (p) { return p.y === c; });
          tr.push({ type: "scatter", mode: "markers", x: sel.map(function (p) { return p.u[0]; }), y: sel.map(function (p) { return p.u[1]; }), name: cls[c], showlegend: true, hoverinfo: "skip",
            marker: { symbol: c ? "diamond" : "circle", size: c ? 7 : 6, color: c ? P.coral : P.navy, opacity: 0.88, line: { color: P.paper, width: 0.8 } } });
        });
        var bad = pts.filter(function (p) { return p.wrong; });
        tr.push({ type: "scatter", mode: "markers", x: bad.map(function (p) { return p.u[0]; }), y: bad.map(function (p) { return p.u[1]; }), showlegend: false, hoverinfo: "skip", marker: { symbol: "circle-open", size: 13, color: P.ink, line: { color: P.ink, width: 1.6 } } });
      }
      tr.push({ type: "scatter", mode: "markers+text", x: [pu[0]], y: [pu[1]], showlegend: false, hoverinfo: "skip", text: [opt.probeLabel || ""], textposition: "top right", textfont: { color: P.ink, size: 13 },
        marker: { symbol: "star", size: 16, color: P.teal, line: { color: P.ink, width: 1.6 } } });
      return tr;
    }
    function mapLayout(P) {
      var pu = u(), ann = [], seg = segment(), span = urange[0][1] - urange[0][0], wl = Math.hypot(S.w[0], S.w[1]);
      if (wl > 1e-6) {
        var L = 0.2 * span, dx = S.w[0] / wl, dy = S.w[1] / wl, mg = 0.04 * span, ox = pu[0], oy = pu[1];
        // keep the arrow inside the map: shorten it, or start it from the middle of the map when the input sits at an edge
        var reach = function (px, py) {
          var t = L;
          if (dx > 1e-9) t = Math.min(t, (urange[0][1] - mg - px) / dx); else if (dx < -1e-9) t = Math.min(t, (urange[0][0] + mg - px) / dx);
          if (dy > 1e-9) t = Math.min(t, (urange[1][1] - mg - py) / dy); else if (dy < -1e-9) t = Math.min(t, (urange[1][0] + mg - py) / dy);
          return t;
        };
        L = reach(ox, oy);
        if (L < 0.1 * span) { ox = 0.5 * (urange[0][0] + urange[0][1]); oy = 0.5 * (urange[1][0] + urange[1][1]); L = Math.max(0.05 * span, reach(ox, oy)); }
        var tipx = ox + dx * L, tipy = oy + dy * L;
        ann.push({ x: tipx, y: tipy, ax: ox, ay: oy, xref: "x", yref: "y", axref: "x", ayref: "y", showarrow: true, arrowhead: 3, arrowsize: 1.1, arrowwidth: 2.4, arrowcolor: P.coral, text: "" });
        ann.push({ x: tipx, y: tipy, xref: "x", yref: "y", showarrow: false, text: "<b>w</b>", font: { color: P.coral, size: 14 }, xshift: 9, yshift: 9 });
      }
      if (seg) {
        var s2 = seg[0][1] >= seg[1][1] ? seg : [seg[1], seg[0]], lx = s2[0][0] * 0.88 + s2[1][0] * 0.12, ly = s2[0][1] * 0.88 + s2[1][1] * 0.12;
        ann.push({ x: lx, y: ly, xref: "x", yref: "y", showarrow: false, text: "z = 0", font: { color: P.ink, size: 13 }, bgcolor: P.paper, borderpad: 2, opacity: 0.95 });
      }
      return { margin: { l: 56, r: 10, t: fit ? 34 : 8, b: 46 }, dragmode: false, annotations: ann,
        xaxis: Object.assign({ range: urange[0], title: { text: inp[0].name }, constrain: "domain", zeroline: false, showgrid: false }, ticks(0)),
        yaxis: Object.assign({ range: urange[1], title: { text: inp[1].name }, scaleanchor: "x", zeroline: false, showgrid: false }, ticks(1)),
        showlegend: fit, legend: { orientation: "h", x: 0, y: 1.09, xanchor: "left", yanchor: "bottom", font: { size: 13 } } };
    }
    function actTraces(P) {
      var A = ACTS[S.act], zs = lin(-6, 6, 241), z = zOf(u()[0], u()[1]), zc = clamp(z, -6, 6), a = A.f(zc), sl = A.d(zc);
      return [
        { type: "scatter", mode: "lines", x: zs, y: zs.map(A.f), line: { color: P.navy, width: 3.2, shape: S.act === "step" ? "hv" : "linear" }, hoverinfo: "skip" },
        { type: "scatter", mode: "lines", x: zs, y: zs.map(A.d), line: { color: P.sand, width: 2.4, dash: "dash" }, hoverinfo: "skip" },
        { type: "scatter", mode: "lines", x: [zc, zc], y: [0, a], line: { color: P.muted, width: 1.4, dash: "dot" }, hoverinfo: "skip" },
        { type: "scatter", mode: "markers", x: [zc], y: [sl], marker: { size: 9, color: P.paper, line: { color: P.sand, width: 2.4 } }, hoverinfo: "skip" },
        { type: "scatter", mode: "markers", x: [zc], y: [a], marker: { size: 12, color: P.teal, line: { color: P.ink, width: 1.6 } }, hoverinfo: "skip" }];
    }
    function actLayout(P) {
      var A = ACTS[S.act], yl = A.yr, lx = S.act === "step" ? 3.2 : 4.4;
      var ann = [{ x: lx, y: A.f(lx), xref: "x", yref: "y", text: "<b>output a = " + A.sym + "(z)</b>", showarrow: false, font: { color: P.navy, size: 13 }, xanchor: "left", yanchor: S.act === "tanh" || S.act === "sigmoid" || S.act === "step" ? "bottom" : "top", xshift: -62, yshift: S.act === "tanh" || S.act === "sigmoid" || S.act === "step" ? 6 : -4 },
        { x: -5.8, y: S.act === "none" || S.act === "relu" || S.act === "gelu" ? 1 : A.d(-5.8) + 0.04 + (S.act === "step" ? 0.05 : 0), xref: "x", yref: "y", text: "slope g′(z)", showarrow: false, font: { color: P.sand, size: 13 }, xanchor: "left", yanchor: "bottom" }];
      return { margin: { l: 56, r: 12, t: fit ? 34 : 8, b: 46 }, dragmode: false, annotations: ann, xaxis: { range: [-6, 6], title: { text: "weighted sum z" }, zeroline: true }, yaxis: { range: yl, title: { text: "output a", standoff: 6 }, zeroline: true } };
    }
    function draw() {
      pending = false;
      var A = ACTS[S.act], pu = u(), z = zOf(pu[0], pu[1]), a = A.f(z), sl = A.d(z), ev = fit ? evalAll() : null;
      q.w1.textContent = Kit.fmt(S.w[0], 2); q.w2.textContent = Kit.fmt(S.w[1], 2); q.b.textContent = Kit.fmt(S.b, 2);
      q.x1.textContent = Kit.fmt(pu[0], 2); q.x2.textContent = Kit.fmt(pu[1], 2);
      q.z.textContent = Kit.fmt(z, 2); q.z2.textContent = Kit.fmt(z, 2); q.a.textContent = Kit.fmt(a, 3);
      q.g.textContent = A.sym === "z" ? "no g" : A.sym; q.sl.textContent = Kit.fmt(sl, 3);
      q.pha.innerHTML = "<b>Activation:</b> " + A.name + ". The marker shows where this input falls on the curve.";
      q.phm.innerHTML = "<b>Output over the plane of inputs.</b> Click or drag to move the input" + (opt.probeLabel ? " (" + opt.probeLabel + ")" : "") + ".";
      Kit.plot(q.actPlot, actTraces, actLayout);
      Kit.plot(q.mapPlot, mapTraces, mapLayout);
      var parts = ["<span>z = <b>" + Kit.fmt(z, 2) + "</b></span>", "<span>output a = <b>" + Kit.fmt(a, 3) + "</b></span>", "<span>slope g′(z) = <b>" + Kit.fmt(sl, 3) + "</b></span>"];
      var msg = notes[S.act] || "";
      if (Math.abs(z) > 6) msg += " The weighted sum z is " + Kit.fmt(z, 1) + ", off the edge of the curve.";
      if (fit) {
        var pr = S.act === "step" ? z >= 0 : a >= A.cut;
        parts = ["<span>Right: <b>" + ev.right + " of " + pts.length + " (" + Kit.pct(ev.right / pts.length, 1) + ")</b></span>", "<span>Always saying \"" + cls[pts.filter(function (p) { return p.y === 1; }).length * 2 >= pts.length ? 1 : 0] + "\": <b>" + Kit.pct(lazy, 1) + "</b></span>",
          "<span>" + (S.act === "sigmoid" ? "Log loss" : S.act === "step" ? "Mistakes" : "Mean squared error") + ": <b>" + (S.act === "step" ? Math.round(ev.loss * pts.length) : Kit.fmt(ev.loss, 3)) + "</b></span>", "<span>Steps: <b>" + S.steps + "</b></span>"].concat(parts.slice(0, 2));
        if (opt.probeLabel) msg += " " + opt.probeLabel + ": output " + Kit.fmt(a, 3) + ", so the call is \"" + cls[pr ? 1 : 0] + "\".";
        if (S.dead) msg += " All outputs are in the flat part of the activation, so the slope is 0 and the dials cannot move.";
      }
      q.ro.innerHTML = parts.join("");
      q.status.textContent = msg;
      if (opt.onChange) opt.onChange({ w: S.w.slice(), b: S.b, activation: S.act, x: S.x.slice(), z: z, a: a, right: ev && ev.right });
    }
    function change() { if (!pending) { pending = true; requestAnimationFrame(draw); } }

    // click and drag on the map moves the input
    var dragging = false;
    function place(ev) {
      var gd = q.mapPlot, fl = gd._fullLayout, box = gd.querySelector(".nsewdrag");
      if (!fl || !box) return;
      var bb = box.getBoundingClientRect(), ux = fl.xaxis.p2d(ev.clientX - bb.left), uy = fl.yaxis.p2d(ev.clientY - bb.top);
      S.x[0] = clamp(uToRaw(0, ux), inp[0].min, inp[0].max); S.x[1] = clamp(uToRaw(1, uy), inp[1].min, inp[1].max);
      sx[0].set(S.x[0]); sx[1].set(S.x[1]); change();
    }
    q.mapPlot.addEventListener("pointerdown", function (ev) {
      if (!ev.target.closest || !ev.target.closest(".nsewdrag")) return;
      dragging = true; place(ev);
      try { q.mapPlot.setPointerCapture(ev.pointerId); } catch (e) {}
    });
    q.mapPlot.addEventListener("pointermove", function (ev) { if (dragging && ev.pointerType !== "touch") place(ev); });
    q.mapPlot.addEventListener("pointerup", function () { dragging = false; });
    q.mapPlot.addEventListener("pointercancel", function () { dragging = false; });

    draw();
    window.addEventListener("resize", Kit.debounce(function () { if (window.Plotly) { Plotly.Plots.resize(q.actPlot); Plotly.Plots.resize(q.mapPlot); } }, 200));
    return {
      get: function () { return { w: S.w.slice(), b: S.b, activation: S.act, x: S.x.slice() }; },
      set: function (o) {
        stop();
        if (o.w) { S.w = o.w.slice(); } if (o.b != null) S.b = o.b; if (o.x) { S.x = o.x.slice(); sx[0].set(S.x[0]); sx[1].set(S.x[1]); }
        if (o.activation) { S.act = o.activation; menu.value = o.activation; }
        if (o.w || o.b != null) { start = { w: S.w.slice(), b: S.b }; S.steps = 0; syncSliders(); }
        change();
      },
      redraw: draw
    };
  }

  return { mount: mount, ACTS: ACTS, ORDER: ORDER, drawMap: drawMap, colorAt: colorAt, mixHex: mixHex, rgbOf: rgbOf, clamp: clamp, lin: lin };
})();
