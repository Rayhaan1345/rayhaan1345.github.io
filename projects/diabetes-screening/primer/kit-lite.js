// Kit-lite: the helpers of the How AI Learns primer kit (mailab.in/primer/assets/kit.js), cut down for the diabetes primer.
// Exposes one global, Kit. Changes from the original: no theme-toggle click handler (site.js owns that button),
// theme callbacks fire from a MutationObserver on <html data-theme> and from prefers-color-scheme, and the
// code-block, maths and chapter-navigation helpers are left out.
// Figures use Plotly (data plots, 3D) and D3 (diagrams). Both read colours from the CSS tokens,
// so they follow light and dark mode; register a redraw with Kit.onTheme.
var Kit = (function () {
  "use strict";
  var SVGNS = "http://www.w3.org/2000/svg";
  var reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  var themeFns = [];

  function $(id) { return document.getElementById(id); }
  function el(name, attrs, parent) {
    var n = document.createElementNS(SVGNS, name);
    for (var k in attrs || {}) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function html(tag, attrs, parent, text) {
    var n = document.createElement(tag);
    for (var k in attrs || {}) { if (k === "class") n.className = attrs[k]; else n.setAttribute(k, attrs[k]); }
    if (text != null) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }
  function setText(id, v) { var n = $(id); if (n) n.textContent = v; }
  // Numbers for display: a real minus sign, fixed decimals, no "-0.00".
  function fmt(v, d) {
    if (d == null) d = 2;
    var s = Math.abs(v).toFixed(d);
    if (Number(s) === 0) return (0).toFixed(d);
    return (v < 0 ? "−" : "") + s;
  }
  function pct(v, d) { return (100 * v).toFixed(d == null ? 1 : d) + "%"; }
  function width(node) { return Math.max(280, Math.round(node.getBoundingClientRect().width || node.parentNode.clientWidth)); }
  function debounce(fn, ms) { var t = 0; return function () { clearTimeout(t); t = setTimeout(fn, ms || 150); }; }

  // Colours from the CSS tokens of the current theme.
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue("--" + name).trim(); }
  function palette() {
    var p = {};
    ["bg", "paper", "ink", "ink-2", "muted", "rule", "link", "link-hover", "teal", "navy", "sand", "coral", "mark"].forEach(function (k) { p[k.replace("-", "")] = css(k); });
    p.series = [p.navy, p.coral, p.teal, p.sand, p.ink2];
    return p;
  }
  function onTheme(fn) { themeFns.push(fn); }
  function fireTheme() { themeFns.forEach(function (fn) { try { fn(palette()); } catch (e) { console.error(e); } }); }

  // Plotly with the primer's look. Call again with new data to update; it redraws on theme change.
  var plots = [];
  function plotLayout(layout, P) {
    var base = {
      paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)",
      font: { family: "Spectral, Georgia, serif", size: 14, color: P.ink2 },
      margin: { l: 52, r: 16, t: 16, b: 46 },
      colorway: P.series, hoverlabel: { font: { family: "Spectral, Georgia, serif" } },
      legend: { orientation: "h", y: -0.2, font: { size: 13 } }, showlegend: false
    };
    function axis(a) {
      return Object.assign({ gridcolor: P.rule, zerolinecolor: P.rule, linecolor: P.muted, tickcolor: P.muted, tickfont: { color: P.muted }, title: { font: { color: P.ink2 } } }, a || {});
    }
    var out = Object.assign(base, layout || {});
    out.xaxis = axis(layout && layout.xaxis); out.yaxis = axis(layout && layout.yaxis);
    if (layout && layout.scene) {
      var s = layout.scene;
      out.scene = Object.assign({}, s, { xaxis: axis3(s.xaxis, P), yaxis: axis3(s.yaxis, P), zaxis: axis3(s.zaxis, P), bgcolor: "rgba(0,0,0,0)" });
    }
    return out;
  }
  function axis3(a, P) { return Object.assign({ gridcolor: P.rule, zerolinecolor: P.muted, color: P.ink2, backgroundcolor: "rgba(0,0,0,0)", showbackground: false }, a || {}); }
  function plot(div, traces, layout, config) {
    if (typeof div === "string") div = $(div);
    if (typeof Plotly === "undefined") { div.textContent = "This figure needs Plotly, which did not load."; return; }
    var rec = plots.filter(function (r) { return r.div === div; })[0];
    if (!rec) { rec = { div: div }; plots.push(rec); }
    rec.traces = traces; rec.layout = layout; rec.config = config;
    var P = palette();
    var t = typeof traces === "function" ? traces(P) : traces;
    var l = typeof layout === "function" ? layout(P) : layout;
    return Plotly.react(div, t, plotLayout(l, P), Object.assign({ displayModeBar: false, responsive: true }, config || {}));
  }
  onTheme(function () { plots.forEach(function (r) { plot(r.div, r.traces, r.layout, r.config); }); });

  // Controls. slider(container, {label, min, max, step, value, digits}, onInput) returns {get, set, input}.
  function slider(container, s, onInput) {
    var lab = html("label", {}, container), name = html("span", {}, lab, s.label), out = html("output", {}, lab);
    var inp = html("input", { type: "range", min: s.min, max: s.max, step: s.step, value: s.value }, lab);
    var digits = s.digits != null ? s.digits : (s.step < 1 ? (String(s.step).split(".")[1] || "").length : 0);
    function show() { out.textContent = s.show ? s.show(Number(inp.value)) : fmt(Number(inp.value), digits); }
    inp.addEventListener("input", function () { show(); if (onInput) onInput(Number(inp.value)); });
    show();
    return { input: inp, get: function () { return Number(inp.value); }, set: function (v) { inp.value = v; show(); }, label: name };
  }
  // chips(container, labels, initial, onPick): a row of toggle buttons in a pill group.
  function chips(container, labels, initial, onPick) {
    var g = html("div", { class: "group", role: "group" }, container);
    var bs = labels.map(function (l, i) {
      var b = html("button", { type: "button", "aria-pressed": String(i === initial) }, g, l);
      b.addEventListener("click", function () { bs.forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); }); onPick(i); });
      return b;
    });
    return bs;
  }
  function select(container, label, options, value, onChange) {
    var lab = html("label", {}, container), name = html("span", {}, lab, label), sel = html("select", {}, lab);
    options.forEach(function (o) { var op = html("option", { value: o.value }, sel, o.label); if (o.value === value) op.selected = true; });
    sel.addEventListener("change", function () { onChange(sel.value); });
    return sel;
  }
  function button(container, label, onClick) { var b = html("button", { type: "button", class: "btn" }, container, label); b.addEventListener("click", onClick); return b; }

  // Animation. Animations the reader starts always play. Ones that start by themselves
  // (on load or on scroll) are skipped when the reader asks for reduced motion: pass {auto: true}.
  function animate(ms, fn, opts) {
    var auto = opts && opts.auto, raf = 0, t0 = 0, stopped = false;
    if (auto && reduce) { fn(1); return function () {}; }
    raf = requestAnimationFrame(function f(ts) {
      if (stopped) return;
      if (!t0) t0 = ts;
      var p = Math.min(1, (ts - t0) / ms);
      fn(p);
      if (p < 1) raf = requestAnimationFrame(f);
    });
    return function () { stopped = true; cancelAnimationFrame(raf); };
  }
  function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  // Run fn once when node is at least `threshold` visible.
  function onVisible(node, fn, threshold) {
    if (!("IntersectionObserver" in window)) { fn(); return; }
    new IntersectionObserver(function (es, io) { if (es[0].isIntersecting) { io.disconnect(); fn(); } }, { threshold: threshold || 0.3 }).observe(node);
  }

  // Seeded random numbers, so figures look the same on every visit.
  function rng(seed) {
    var a = seed >>> 0;
    return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function gauss(r) { var u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function data(path) { return fetch(path).then(function (r) { if (!r.ok) throw new Error(path + " " + r.status); return r.json(); }); }

  // Multiple-choice check: quiz(container, [{q, o: [options], a: index, why}]).
  function quiz(container, Q) {
    if (typeof container === "string") container = $(container);
    Q.forEach(function (item, i) {
      var fs = html("fieldset", {}, container), lg = html("legend", {}, fs, (i + 1) + ". " + item.q), labs = [];
      var fb = html("p", { class: "fb", "aria-live": "polite" }, null);
      item.o.forEach(function (o, j) {
        var lab = html("label", {}, fs), inp = html("input", { type: "radio", name: (container.id || "q") + "-" + i, value: j }, lab);
        lab.appendChild(document.createTextNode(" " + o));
        inp.addEventListener("change", function () {
          labs.forEach(function (l, m) { l.classList.toggle("ok", m === item.a); l.classList.toggle("no", m === j && j !== item.a); });
          fb.innerHTML = "";
          html("b", {}, fb, j === item.a ? "Right. " : "Not quite. ");
          fb.appendChild(document.createTextNode(item.why));
        });
        labs.push(lab);
      });
      fs.appendChild(fb);
    });
    container.classList.add("quiz");
  }

  // Theme changes. The site's own script (site.js) owns the #theme-toggle button and sets data-theme on <html>,
  // so this file adds no click handler. It watches the data-theme attribute and the system colour scheme,
  // and calls the callbacks registered with onTheme when the theme in force changes.
  function currentTheme() {
    var t = document.documentElement.dataset.theme;
    if (t) return t;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  (function watchTheme() {
    var last = currentTheme();
    function changed() { var t = currentTheme(); if (t === last) return; last = t; fireTheme(); }
    if (window.MutationObserver) new MutationObserver(changed).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    if (window.matchMedia) {
      var mq = window.matchMedia("(prefers-color-scheme: dark)");
      (mq.addEventListener ? mq.addEventListener.bind(mq, "change") : mq.addListener.bind(mq))(changed);
    }
  })();

  return {
    reduce: reduce, $: $, el: el, html: html, setText: setText, fmt: fmt, pct: pct, width: width, debounce: debounce,
    css: css, palette: palette, onTheme: onTheme, plot: plot,
    slider: slider, chips: chips, select: select, button: button,
    animate: animate, ease: ease, onVisible: onVisible, rng: rng, gauss: gauss, data: data, quiz: quiz
  };
})();
