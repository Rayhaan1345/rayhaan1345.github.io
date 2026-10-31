// The rebuilt XGBoost model, run in the browser: prediction and exact SHAP values (TreeSHAP).
// xgb.json holds 100 trees of depth 3. At a node, an input below the threshold goes left.
// The SHAP code follows the path algorithm of Lundberg et al. (2018) and is checked against
// XGBoost's own pred_contribs output.
var DiabetesXGB = (function () {
  "use strict";
  var f32 = Math.fround;
  function leaf(T, x) {
    var n = 0;
    while (T.l[n] >= 0) n = f32(x[T.f[n]]) < f32(T.t[n]) ? T.l[n] : T.r[n];
    return T.v[n];
  }
  function predict(M, x) {
    var s = M.base;
    for (var i = 0; i < M.trees.length; i++) s += leaf(M.trees[i], x);
    return s;
  }

  // phi[j] is the share of the score given to input j; phi[last] is the average score.
  function shap(M, x) {
    var phi = new Array(M.features.length + 1).fill(0);
    phi[phi.length - 1] = M.base;
    M.trees.forEach(function (T) {
      phi[phi.length - 1] += expected(T, 0);
      recurse(T, x, phi, 0, 0, [], [], [], [], 1, 1, -1);
    });
    return phi;
  }
  function expected(T, n) {
    if (T.l[n] < 0) return T.v[n];
    return (T.c[T.l[n]] * expected(T, T.l[n]) + T.c[T.r[n]] * expected(T, T.r[n])) / T.c[n];
  }
  function recurse(T, x, phi, n, d, F, Z, O, P, pz, po, pf) {
    F = F.slice(); Z = Z.slice(); O = O.slice(); P = P.slice();
    extend(F, Z, O, P, d, pz, po, pf);
    var i;
    if (T.l[n] < 0) {
      for (i = 1; i <= d; i++) phi[F[i]] += unwoundSum(Z, O, P, d, i) * (O[i] - Z[i]) * T.v[n];
      return;
    }
    var f = T.f[n], hot = f32(x[f]) < f32(T.t[n]) ? T.l[n] : T.r[n], cold = hot === T.l[n] ? T.r[n] : T.l[n];
    var iz = 1, io = 1;
    for (i = 1; i <= d; i++) if (F[i] === f) break;
    if (i <= d) { iz = Z[i]; io = O[i]; unwind(F, Z, O, P, d, i); d--; }
    recurse(T, x, phi, hot, d + 1, F, Z, O, P, iz * T.c[hot] / T.c[n], io, f);
    recurse(T, x, phi, cold, d + 1, F, Z, O, P, iz * T.c[cold] / T.c[n], 0, f);
  }
  function extend(F, Z, O, P, d, pz, po, pf) {
    F[d] = pf; Z[d] = pz; O[d] = po; P[d] = d === 0 ? 1 : 0;
    for (var i = d - 1; i >= 0; i--) {
      P[i + 1] += po * P[i] * (i + 1) / (d + 1);
      P[i] = pz * P[i] * (d - i) / (d + 1);
    }
  }
  function unwind(F, Z, O, P, d, k) {
    var o = O[k], z = Z[k], next = P[d], i, t;
    for (i = d - 1; i >= 0; i--) {
      if (o !== 0) { t = P[i]; P[i] = next * (d + 1) / ((i + 1) * o); next = t - P[i] * z * (d - i) / (d + 1); }
      else P[i] = P[i] * (d + 1) / (z * (d - i));
    }
    for (i = k; i < d; i++) { F[i] = F[i + 1]; Z[i] = Z[i + 1]; O[i] = O[i + 1]; }
  }
  function unwoundSum(Z, O, P, d, k) {
    var o = O[k], z = Z[k], next = P[d], total = 0, i, t;
    for (i = d - 1; i >= 0; i--) {
      if (o !== 0) { t = next * (d + 1) / ((i + 1) * o); total += t; next = P[i] - t * z * (d - i) / (d + 1); }
      else total += (P[i] / z) / ((d - i) / (d + 1));
    }
    return total;
  }
  return { predict: predict, shap: shap };
})();
