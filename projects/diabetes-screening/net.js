// Forward pass of the deployed fastai model, run in the browser.
// model.json holds the weights of Deployment/model.pkl with the batch norms folded into the
// neighbouring layers: inputs -> [age embedding, pregnancy embedding, scaled measurements]
// -> 200 units (ReLU) -> 100 units (ReLU) -> one number -> squashed into the range 0 to 1.2.
var DiabetesNet = (function () {
  "use strict";
  function run(M, input) {
    var x = [], k, j, i;
    for (k = 0; k < M.cat.length; k++) {
      var e = M.emb[k], idx = M.classes[M.cat[k]].indexOf(input[M.cat[k]]) + 1;  // 0 = a value not seen in training
      for (j = 0; j < e.dim; j++) x.push(e.w[idx * e.dim + j]);
    }
    for (j = 0; j < M.cont.length; j++) x.push(input[M.cont[j]] * M.a[j] + M.b[j]);
    var h1 = layer(M.W1.w, null, x, M.W1.rows), h2 = layer(M.W2.w, M.W2.b, h1, M.W2.rows);
    var y = M.W3.b;
    for (i = 0; i < h2.length; i++) y += M.W3.w[i] * h2[i];
    var lo = M.range[0], hi = M.range[1];
    return { score: lo + (hi - lo) / (1 + Math.exp(-y)), x: x, h1: h1, h2: h2, logit: y, seen: seen(M, input) };
  }
  function layer(w, b, x, rows) {
    var n = x.length, out = new Array(rows);
    for (var r = 0; r < rows; r++) {
      var s = b ? b[r] : 0, o = r * n;
      for (var c = 0; c < n; c++) s += w[o + c] * x[c];
      out[r] = s > 0 ? s : 0;
    }
    return out;
  }
  function seen(M, input) {
    var s = {};
    M.cat.forEach(function (c) { s[c] = M.classes[c].indexOf(input[c]) >= 0; });
    return s;
  }
  return { run: run };
})();
