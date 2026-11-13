/* パワーエレクトロニクスの回路シミュレーター：共通の部品（計算エンジン・回路図の部品・グラフ・クリックで測る UI）
 * 各ページ（buck.html, boost.html, …）が <script src="common.js"> で読み込む。ファイルを直接開いても動く（相対パス）。
 * ==SIM-BEGIN== 〜 ==SIM-END== の間はブラウザに依存しない計算部分（node で検算するときに切り出す）。 */

// ==SIM-BEGIN==
/**
 * 区分線形の回路（コイルの電流 i とコンデンサの電圧 v の 2 変数、理想スイッチ・理想ダイオード）の過渡解析。
 * t = 0 で i = i0, v = v0（ふつうは 0）、スイッチは t = 0 でオン、周期 T・オンの割合 D。
 * M = {
 *   T, D, R, C,          周期・デューティ比・負荷・出力のコンデンサ（C > 0）
 *   fx(g, i, v) → [di/dt, dv/dt]   スイッチ g（1 オン / 0 オフ）で電流が流れているときの式
 *   sigma                いちばん遅い減衰の速さ [1/s]（計算する長さの見積もり用）
 *   Vs                   電圧の目安（収束の判定用）
 *   splits?(pn, g)       区間の途中で必ず点を置く時刻（区間の始まりからの時間、昇順）
 *   extra?: {names, f(t, g, end)} 点ごとに足す量（例：フォワードの励磁電流）。end は区間の終わりの点か
 * }
 * 電流が 0 で、fx(g, 0, v) の di/dt が 0 以下なら「止まっている」（ダイオードもスイッチも逆には流さない）：
 *   i = 0 のまま、v は R C で減衰（dv/dt = −v/(RC)）。di/dt が正になったら流れ始める（時刻は二分法）。
 * 戻り値: t, g（ゲート）, m（0 オフで流れる / 1 オンで流れる / 2 止まっている）, i, v, ex（extra の列）,
 *         perAvg（周期ごとの v の平均）, T, periods, capped（打ち切ったか）
 * 計算は 4 次のルンゲ・クッタ法（1 周期を 80〜400 分割、最後の 12 周期は 400 分割）。i が 0 を横切る時刻は二分法。
 * ただし刻み h は、回路のいちばん速い変化の速さ ρ（fx の係数の固有値の大きさと 1/(RC) の大きい方）に対して
 * h·ρ ≤ 1 になるまで細かくする（f_sw が低く L・C・R が小さい極端な組み合わせで、ルンゲ・クッタ法が発散しないように）。
 * それでも値が有限でなくなったり異常に大きくなったら unstable = true を返す（表に「計算が不安定」と出す）。
 */
function simPWL(M, periods) {
  const T = M.T, D = M.D, RC = M.R * M.C;
  const ton = D * T, toff = T - ton;
  if (!periods) {
    // 1 回目：見積もった長さで計算（収束していなければ長くする）。2 回目：v の周期平均が最終値の 0.2 % に入る時刻の 1.5 倍 + 6 周期
    let est = Math.max(12, Math.ceil(9 / (M.sigma * T)) + 6), s0, conv = false;
    for (let pass = 0; pass < 4; pass++) {
      s0 = simPWL(M, est);
      const A = s0.perAvg, n = A.length, fin = A[n - 1], sc = Math.max(Math.abs(fin), 1e-3 * M.Vs);
      conv = Math.abs(fin - A[Math.floor(n * 0.75)]) <= 1e-3 * sc;
      if (s0.capped || conv) break;
      est = s0.periods * 2;
    }
    // 計算の量の上限で打ち切っても、最後の 1/4 で周期平均が 0.1 % 以内に落ち着いていれば打ち切り扱いにしない
    if (s0.capped && conv) s0.capped = false;
    const A = s0.perAvg, fin = A[A.length - 1], tol = Math.max(2e-3 * Math.abs(fin), 1e-5 * M.Vs);
    let ks = 0;
    for (let k = 0; k < A.length; k++) if (Math.abs(A[k] - fin) > tol) ks = k + 1;
    const s = simPWL(M, Math.min(s0.periods, Math.max(12, Math.ceil(1.5 * ks) + 6)));
    s.capped = s0.capped;
    s.unstable = s.unstable || s0.unstable;
    return s;
  }
  periods = Math.max(12, periods);
  const fx = M.fx;
  // 刻みの上限：いちばん速い変化の速さ ρ に対して h·ρ ≤ 1（ふつうの値では 1 周期 80〜400 分割で足りて、これは効かない）
  const rate = (g) => {
    const f0 = fx(g, 0, 0), fi = fx(g, 1, 0), fv = fx(g, 0, 1);
    const a = fi[0] - f0[0], b = fv[0] - f0[0], c = fi[1] - f0[1], d = fv[1] - f0[1];
    const tr = a + d, det = a * d - b * c, disc = tr * tr - 4 * det;
    const r = disc >= 0 ? (Math.abs(tr) + Math.sqrt(disc)) / 2 : Math.sqrt(det);
    return Math.max(isFinite(r) ? r : 0, RC > 0 ? 1 / RC : 0);
  };
  const nMinOn = Math.ceil(ton * rate(1)), nMinOff = Math.ceil(toff * rate(0));
  const perMin = Math.max(80, nMinOn + nMinOff);
  const budget = 2.4e6;
  let capped = false;
  if (periods * perMin > budget) { periods = Math.max(12, Math.floor(budget / perMin)); capped = true; }
  const HI = Math.min(12, periods);
  const MS = Math.max(80, Math.min(400, Math.floor(budget / periods))), MHI = 400;
  const stride = Math.max(1, Math.ceil(((periods - HI) * Math.max(MS, nMinOn + nMinOff)) / 200000));
  let i = M.i0 || 0, v = M.v0 || 0;
  const tA = [], gA = [], mA = [], iA = [], vA = [];
  const exN = M.extra ? M.extra.names : [], exA = exN.map(() => []);
  // end: 区間の終わりの点か（extra が区間の境目で左右どちらの値を使うかの区別）
  const push = (t, g, m, end) => {
    tA.push(t); gA.push(g); mA.push(m); iA.push(i); vA.push(v);
    if (exN.length) { const e = M.extra.f(t, g, !!end); for (let q = 0; q < exN.length; q++) exA[q].push(e[q]); }
  };
  const rk4 = (ii, vv, g, h) => {
    const k1 = fx(g, ii, vv);
    const k2 = fx(g, ii + h / 2 * k1[0], vv + h / 2 * k1[1]);
    const k3 = fx(g, ii + h / 2 * k2[0], vv + h / 2 * k2[1]);
    const k4 = fx(g, ii + h * k3[0], vv + h * k3[1]);
    return [ii + h / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]), vv + h / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1])];
  };
  const drive0 = (g, vv) => fx(g, 0, vv)[0];
  const isBlocked = (g) => i <= 0 && drive0(g, v) <= 0;
  let acc = 0;
  const segment = (t0, dur, g, n, st) => {
    const h = dur / n;
    let blocked = isBlocked(g);
    push(t0, g, blocked ? 2 : g);
    for (let k = 0; k < n; k++) {
      const tt = t0 + k * h, v0 = v;
      if (blocked) {
        const vEnd = v * Math.exp(-h / RC);
        if (drive0(g, vEnd) > 0) {
          // 区間の途中で流れ始める
          let lo = 0, hi = h;
          for (let it = 0; it < 60; it++) { const m = (lo + hi) / 2; if (drive0(g, v * Math.exp(-m / RC)) > 0) hi = m; else lo = m; }
          v *= Math.exp(-hi / RC); i = 0;
          push(tt + hi, g, 2);
          blocked = false;
          push(tt + hi, g, g);
          const r = rk4(i, v, g, h - hi);
          i = Math.max(0, r[0]); v = r[1];
        } else { v = vEnd; i = 0; }
      } else {
        const r = rk4(i, v, g, h);
        if (r[0] < 0) {
          let lo = 0, hi = h;
          for (let it = 0; it < 60; it++) { const m = (lo + hi) / 2; if (rk4(i, v, g, m)[0] > 0) lo = m; else hi = m; }
          const r1 = rk4(i, v, g, lo);
          i = 0; v = r1[1];
          push(tt + lo, g, g);
          blocked = isBlocked(g);
          if (blocked) {
            push(tt + lo, g, 2);
            v *= Math.exp(-(h - lo) / RC);
          } else {
            const r2 = rk4(i, v, g, h - lo);
            i = Math.max(0, r2[0]); v = r2[1];
          }
        } else { i = r[0]; v = r[1]; }
      }
      acc += (v0 + v) / 2 * h;
      if ((k + 1) % st === 0 || k === n - 1) push(tt + h, g, blocked ? 2 : g, k === n - 1);
    }
  };
  const piece = (pn, t0, dur, g, n, st) => {
    const sp = M.splits ? M.splits(pn, g).filter(s => s > 1e-9 * dur && s < dur * (1 - 1e-9)) : [];
    if (!sp.length) return segment(t0, dur, g, n, st);
    const b = [0, ...sp, dur];
    for (let q = 0; q + 1 < b.length; q++) segment(t0 + b[q], b[q + 1] - b[q], g, Math.max(2, Math.round(n * (b[q + 1] - b[q]) / dur)), st);
  };
  const perAvg = new Float64Array(periods);
  for (let pn = 0; pn < periods; pn++) {
    const hiRes = pn >= periods - HI;
    const m = hiRes ? MHI : MS, st = hiRes ? 1 : stride;
    acc = 0;
    const t0 = pn * T;
    piece(pn, t0, ton, 1, Math.max(8, Math.round(m * D), nMinOn), st);
    piece(pn, t0 + ton, toff, 0, Math.max(8, Math.round(m * (1 - D)), nMinOff), st);
    perAvg[pn] = acc / T;
  }
  // 発散の検出（値が有限でない・電圧の目安の 1000 倍を超える）
  let unstable = false;
  const big = 1e3 * Math.max(Math.abs(M.Vs || 0), 1e-9);
  for (let k = 0; k < vA.length; k++) if (!isFinite(vA[k]) || !isFinite(iA[k]) || Math.abs(vA[k]) > big) { unstable = true; break; }
  const ex = {};
  exN.forEach((nm, q) => { ex[nm] = Float64Array.from(exA[q]); });
  return {
    t: Float64Array.from(tA), g: Uint8Array.from(gA), m: Uint8Array.from(mA),
    i: Float64Array.from(iA), v: Float64Array.from(vA), ex, perAvg, T, periods, capped, unstable,
  };
}

/** 平均化モデル（L di/dt = … − a v、C dv/dt = b i − v/R）のいちばん遅い減衰の速さ。Le = L / (a b) */
function slowRate(Le, C, R) {
  const a = 1 / (R * C), b = 1 / (Le * C), disc = a * a - 4 * b;
  return disc >= 0 ? (a - Math.sqrt(disc)) / 2 : a / 2;
}

/** 最後の 1 周期の平均・最大・最小（f(S, k) の台形積分） */
function lastStats(S, f) {
  const n = S.t.length, t0 = S.t[n - 1] - S.T;
  let k0 = 0;
  while (k0 < n && S.t[k0] < t0 - 1e-12 * S.T) k0++;
  let s = 0, mx = -Infinity, mn = Infinity, prev = f(S, k0);
  for (let k = k0; k < n; k++) {
    const y = f(S, k);
    if (k > k0) s += (y + prev) / 2 * (S.t[k] - S.t[k - 1]);
    prev = y;
    if (y > mx) mx = y; if (y < mn) mn = y;
  }
  return {avg: s / (S.t[n - 1] - S.t[k0]), max: mx, min: mn, pp: mx - mn, k0};
}

/** 定常状態に入った時刻・定常に達したか・最後の周期で電流が止まった区間があるか（不連続） */
function settleInfo(S, scale) {
  const P = S.perAvg, np = P.length, fin = P[np - 1];
  let ks = -1;
  const tol = Math.max(0.02 * Math.abs(fin), 1e-4 * scale);
  for (let k = 0; k < np; k++) if (Math.abs(P[k] - fin) > tol) ks = k;
  const n = S.t.length, t0 = S.t[n - 1] - S.T;
  let dcm = false;
  if (S.m) for (let k = n - 1; k >= 0 && S.t[k] >= t0 - 1e-12 * S.T; k--) if (S.m[k] === 2) { dcm = true; break; }
  return {
    settle: (ks + 1) * S.T, dcm,
    steady: !S.capped && np > 1 && Math.abs(P[np - 1] - P[np - 2]) <= 2e-3 * Math.max(Math.abs(fin), 1e-6 * scale),
  };
}

/**
 * 交流の回路（第13回など）の過渡解析：状態変数がいくつでもよく、素子のオン・オフを「イベント」で切り替える。
 * M = {
 *   T, periods        「周期」の長さと、計算する周期の数（t = 0 から periods·T まで）
 *   h                 刻みの最大
 *   x0: [...], s0     状態変数（コイルの電流・コンデンサの電圧）の初期値と、離散状態（どの素子がオンか、を整数で）
 *   f(t, x, s) → dx/dt（配列）
 *   breaks?(t0, t1)   [t0, t1) の中で onBreak を呼ぶ時刻（昇順）。ゲート信号・PWM の切り替わりなど
 *   onBreak?(t, x, s) → 新しい s（x を直接書き換えてもよい）
 *   guards?(t, x, s)  → 数の配列。どれかが「正 → 0 以下」に変わった瞬間（二分法で求める）に onGuard を呼ぶ
 *                       （サイリスタの電流が 0 になる、ダイオードの電圧が順方向になる、など）
 *   onGuard?(t, x, s, idx) → 新しい s（idx は 0 以下になったものの番号の配列）
 * }
 * 計算は 4 次のルンゲ・クッタ法。イベントの瞬間は前と後の 2 点を記録する（波形の縦の線になる）。
 * 戻り値: t, x（状態変数ごとの Float64Array の配列）, s（Int32Array）, T, periods
 */
function simEv(M) {
  const T = M.T, nP = M.periods, n = M.x0.length;
  const tA = [], sA = [], xA = M.x0.map(() => []);
  let t = 0, x = M.x0.slice(), s = M.s0;
  const rec = () => { tA.push(t); sA.push(s); for (let j = 0; j < n; j++) xA[j].push(x[j]); };
  const add = (a, b, c) => a.map((v, j) => v + c * b[j]);
  const rk4 = (t0, x0, h) => {
    if (!n) return [];
    const k1 = M.f(t0, x0, s), k2 = M.f(t0 + h / 2, add(x0, k1, h / 2), s);
    const k3 = M.f(t0 + h / 2, add(x0, k2, h / 2), s), k4 = M.f(t0 + h, add(x0, k3, h), s);
    return x0.map((v, j) => v + h / 6 * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]));
  };
  const G = M.guards || (() => []);
  const crossed = (g0, g1) => { const r = []; for (let q = 0; q < g0.length; q++) if (g0[q] > 0 && g1[q] <= 0) r.push(q); return r; };
  rec();
  for (let pn = 0; pn < nP; pn++) {
    const tB = (pn + 1) * T;
    const bk = M.breaks ? M.breaks(pn * T, tB).filter(b => b >= pn * T && b < tB) : [];
    bk.push(tB);
    for (let bi = 0; bi < bk.length; bi++) {
      const tb = bk[bi];
      let guardN = 0;
      while (t < tb - 1e-12 * T) {
        const h = Math.min(M.h, tb - t);
        const g0 = G(t, x, s), x1 = rk4(t, x, h), g1 = G(t + h, x1, s);
        const cr = crossed(g0, g1);
        if (cr.length && guardN < 1000) {
          guardN++;
          let lo = 0, hi = h;
          for (let it = 0; it < 56; it++) {
            const m = (lo + hi) / 2;
            if (crossed(g0, G(t + m, rk4(t, x, m), s)).length) hi = m; else lo = m;
          }
          const xh = rk4(t, x, hi), idx = crossed(g0, G(t + hi, xh, s));
          t += hi; x = xh;
          rec();
          s = M.onGuard(t, x, s, idx.length ? idx : cr);
          rec();
        } else { t += h; x = x1; rec(); }
      }
      t = tb;
      if (bi < bk.length - 1) { const s0 = s; s = M.onBreak(t, x, s); if (s !== s0) rec(); }
    }
    t = tB;
  }
  return {t: Float64Array.from(tA), x: xA.map(a => Float64Array.from(a)), s: Int32Array.from(sA), T, periods: nP,
    unstable: x.some(q => !isFinite(q))};
}

/** 最後の span 秒（ふつうは 1 周期）で、f(S, k) の平均・2 乗平均の平方根（実効値）・基本波（周波数 f0）の振幅と位相 */
function acStats(S, f, span, f0) {
  const n = S.t.length, tEnd = S.t[n - 1], t0 = tEnd - span;
  let k0 = 0;
  while (k0 < n && S.t[k0] < t0 - 1e-12 * span) k0++;
  let s1 = 0, s2 = 0, a = 0, b = 0, mx = -Infinity, mn = Infinity;
  const w = 2 * Math.PI * (f0 || 0);
  for (let k = k0 + 1; k < n; k++) {
    const dt = S.t[k] - S.t[k - 1];
    if (dt <= 0) continue;
    const y0 = f(S, k - 1), y1 = f(S, k), tm = (S.t[k] + S.t[k - 1]) / 2, ym = (y0 + y1) / 2;
    s1 += ym * dt; s2 += (y0 * y0 + y0 * y1 + y1 * y1) / 3 * dt;
    if (w) { a += ym * Math.cos(w * tm) * dt; b += ym * Math.sin(w * tm) * dt; }
  }
  for (let k = k0; k < n; k++) { const y = f(S, k); if (y > mx) mx = y; if (y < mn) mn = y; }
  const L = tEnd - S.t[k0];
  // 基本波：y ≈ c1 sin(ωt + ph)。 a = ∫y cos, b = ∫y sin → c1 = 2√(a²+b²)/L
  return {avg: s1 / L, rms: Math.sqrt(Math.max(0, s2 / L)), max: mx, min: mn, k0,
    c1: 2 * Math.hypot(a, b) / L, ph: Math.atan2(a, b)};
}
// ==SIM-END==

// ===================================================================================
// ここから下はブラウザ用
// ===================================================================================
if (typeof document !== 'undefined' && !/github\.io$/.test(location.hostname)) {
  const addBanner = () => {
    const b = document.createElement('div');
    b.textContent = '確認用（Mac mini の作業中の版）。学生に見えるのは git push した後です';
    b.style.cssText = 'background:#fff3cd;color:#664d03;border-bottom:1px solid #e0c36a;padding:6px 12px;font-size:14px;text-align:center';
    document.body.prepend(b);
  };
  if (document.body) addBanner(); else document.addEventListener('DOMContentLoaded', addBanner);
}

const COL = {ink: '#1f2a37', sub: '#5b6b7b', blue: '#2563eb', orange: '#e08a1e', green: '#2e9e5b', teal: '#0d9488',
  violet: '#7c3aed', fuchsia: '#c026d3', path: '#64748b', iin: '#1e40af', isw: '#a21caf', ir: '#b45309', red: '#e23b3b',
  core: '#475569', ink2: '#334155'};
const SERIF = "'Times New Roman', 'Hiragino Mincho ProN', serif";

const sig2 = (x) => { const e = Math.floor(Math.log10(x)); const m = Math.round(x / 10 ** (e - 1)); return m * 10 ** (e - 1); };
function fmtSI(x, unit, sig = 3) {
  if (!isFinite(x)) return '—';
  const ax = Math.abs(x);
  // 丸め誤差として 0 と表示する境目：F・H・s（pF・ns 未満もありうる量）は 1e-15、電圧・電流・電力などは 1e-9
  if (ax < (/^(F|H|s)$/.test(unit) ? 1e-15 : 1e-9)) return "0 " + unit;
  const pf = [[1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'μ'], [1e-9, 'n'], [1e-12, 'p'], [1e-15, 'f']];
  let sc = pf[pf.length - 1];
  for (const q of pf) if (ax >= q[0] * 0.99995) { sc = q; break; }
  const v = x / sc[0];
  const d = Math.max(0, sig - 1 - Math.floor(Math.log10(Math.abs(v) * 1.00001)));
  return v.toFixed(d) + ' ' + sc[1] + unit;
}
const symH = (b, s, up) => `<span class="sym">${b}${s ? `<sub${up ? ' style="font-style:normal"' : ''}>${s}</sub>` : ''}</span>`;
/** 表の「差」の列 */
/** 表の「差」の列（%）。式の値が 0（|b| < 1e-15）や、どちらかが有限でないときは「—」 */
const pctDiff = (a, b) => {
  if (!isFinite(a) || !isFinite(b) || Math.abs(b) < 1e-15) return '—';
  const e = (a - b) / b * 100;
  if (!isFinite(e)) return '—';
  return (Math.abs(e) < 0.05 ? '0.0' : e.toFixed(1)) + ' %';
};
/**
 * 一致 / ずれる。|a − b| ≤ tol·|b| か、|a − b| ≤ 絶対の許容 なら一致。
 * 絶対の許容：ref（基準の大きさ、例：電源の電圧）を渡せば tol·|ref|。渡さなければ、式の値がほぼ 0（|b| < 1e-12）
 * のときだけ 1e-6（0 同士を一致にする。出力ゼロのときの計算の丸め誤差を含む）、それ以外は 0（今までどおり）。
 */
const okMark = (a, b, tol, ref) => {
  const d = Math.abs(a - b);
  const abs = ref != null ? tol * Math.abs(ref) : (Math.abs(b) < 1e-12 ? 1e-6 : 0);
  return d <= tol * Math.abs(b) || d <= abs ? '<span class="ok">一致</span>' : '<span class="ng">ずれる</span>';
};
/** 数値を小数 d 桁で（有限でなければ「—」）。各ページの toFixed の代わりに使える */
const fmtNum = (x, d = 3) => isFinite(x) ? x.toFixed(d) : '—';
/** 表・注記の文字のうち、NaN・Infinity・桁が多すぎる % を「—」にする（どのページの表にも効く最後の安全網） */
function sanitizeNums(root) {
  if (!root) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const re = /[−-]?\bNaN\b(?:\s*%)?|[−-]?\bInfinity\b(?:\s*%)?|[−-]?\d{10,}(?:\.\d+)?\s*%/g;
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    let t = n.nodeValue;
    if (re.test(t)) { re.lastIndex = 0; t = t.replace(re, '—'); }
    if (/—\s+—/.test(t)) t = t.replace(/—(\s+—)+/g, '—');   // 「—」が二重になったら一つに
    if (t !== n.nodeValue) n.nodeValue = t;
  }
}

// ===================================================================================
// 回路図の部品（SVG）。座標はページごとの viewBox の単位
// ===================================================================================
function SchemKit(svg) {
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, parent = svg, text) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    parent.appendChild(e);
    return e;
  };
  const gPath = el('g', {});
  const gWire = el('g', {stroke: COL.ink, 'stroke-width': 3.2, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round'});
  const gHover = el('g', {fill: 'none', 'stroke-linecap': 'round', 'pointer-events': 'none'});
  const gMark = el('g', {});
  const gHit = el('g', {});
  const W = (pts, parent = gWire, attrs = {}) => el('polyline', Object.assign({points: pts.map(p => p.join(',')).join(' ')}, attrs), parent);
  const K = {el, W, gPath, gWire, gHover, gMark, gHit, svg};
  /** 電池（縦、上が＋）。中心 (x, y) */
  K.battery = (x, y) => {
    el('line', {x1: x - 26, y1: y - 9, x2: x + 26, y2: y - 9}, gWire);
    el('line', {x1: x - 13, y1: y + 9, x2: x + 13, y2: y + 9, 'stroke-width': 6}, gWire);
  };
  /** 接地（(x, y) から下に 16 の線と 3 本の横線） */
  K.ground = (x, y) => {
    W([[x, y], [x, y + 16]]);
    el('line', {x1: x - 16, y1: y + 16, x2: x + 16, y2: y + 16}, gWire);
    el('line', {x1: x - 10, y1: y + 22, x2: x + 10, y2: y + 22}, gWire);
    el('line', {x1: x - 4, y1: y + 28, x2: x + 4, y2: y + 28}, gWire);
  };
  /** スイッチ：a（支点）→ b（接点）。lift: 開いたとき刃が持ち上がる向き（+1 / −1、a→b を見て左手側が +1） */
  K.switch = (a, b, lift = 1) => {
    el('circle', {cx: a[0], cy: a[1], r: 5, fill: '#fff'}, gWire);
    el('circle', {cx: b[0], cy: b[1], r: 5, fill: '#fff'}, gWire);
    const blade = el('line', {x1: a[0], y1: a[1], x2: b[0], y2: b[1]}, gWire);
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy), ang0 = Math.atan2(dy, dx);
    return {set(closed) {
      const ang = ang0 - (closed ? 0 : lift * 30 * Math.PI / 180);
      blade.setAttribute('x2', a[0] + len * Math.cos(ang)); blade.setAttribute('y2', a[1] + len * Math.sin(ang));
    }};
  };
  /** ダイオード：アノード a → カソード k（a と k の間に三角とバー、大きさ sz） */
  K.diode = (a, k, sz = 18) => {
    const dx = k[0] - a[0], dy = k[1] - a[1], len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
    const cx = (a[0] + k[0]) / 2, cy = (a[1] + k[1]) / 2;
    const b0 = [cx - ux * sz, cy - uy * sz], tip = [cx + ux * sz, cy + uy * sz];
    W([a, b0]); W([tip, k]);
    el('polygon', {points: `${b0[0] + nx * sz},${b0[1] + ny * sz} ${b0[0] - nx * sz},${b0[1] - ny * sz} ${tip[0]},${tip[1]}`, fill: '#fff'}, gWire);
    el('line', {x1: tip[0] + nx * sz, y1: tip[1] + ny * sz, x2: tip[0] - nx * sz, y2: tip[1] - ny * sz}, gWire);
  };
  /** コイル：(x1, y1) → (x2, y2) の直線上に n 個の半円。side: 膨らむ向き（+1 / −1） */
  K.coil = (p1, p2, n = 4, side = 1, w) => {
    const dx = p2[0] - p1[0], dy = p2[1] - p1[1], len = Math.hypot(dx, dy), r = len / n / 2;
    let d = `M${p1[0]} ${p1[1]}`;
    for (let k = 0; k < n; k++) d += ` a${r} ${r} 0 0 ${side > 0 ? 1 : 0} ${dx / n} ${dy / n}`;
    const e = el('path', {d}, gWire);
    if (w) e.setAttribute('stroke-width', w);
    return e;
  };
  /** コンデンサ（縦向き、極板は横）。中心 (x, y)、極板の間 gap、幅 w。parent を指定できる */
  K.cap = (x, y, parent = gWire, w = 60, gap = 20) => {
    el('line', {x1: x - w / 2, y1: y - gap / 2, x2: x + w / 2, y2: y - gap / 2}, parent);
    el('line', {x1: x - w / 2, y1: y + gap / 2, x2: x + w / 2, y2: y + gap / 2}, parent);
  };
  /** 抵抗（JIS の箱、縦）。中心 (x, y)、長さ 90 */
  K.res = (x, y, len = 90) => el('rect', {x: x - 13, y: y - len / 2, width: 26, height: len, fill: '#fff'}, gWire);
  /** 接続点 */
  K.dot = (x, y, parent = gWire) => el('circle', {cx: x, cy: y, r: 5.5, fill: COL.ink, stroke: 'none'}, parent);
  /** 変圧器の極性の印（○） */
  K.pol = (x, y) => el('circle', {cx: x, cy: y, r: 6, fill: '#fff', stroke: COL.ink, 'stroke-width': 2.4}, gWire);
  /** 線の飛び越し（横の線を縦の線がまたぐ所の半円）。(x, y) が交点、横の線の上に半円 */
  K.hop = (x, y, r = 10) => {
    el('line', {x1: x - r - 2, y1: y, x2: x + r + 2, y2: y, stroke: '#fff', 'stroke-width': 7}, gWire);
    el('path', {d: `M${x - r} ${y} A${r} ${r} 0 0 1 ${x + r} ${y}`}, gWire);
  };
  /** 素子の名前（斜体のセリフ） */
  K.name = (x, y, t, a = 'middle', size = 34, sub) => {
    const e = el('text', {x, y, 'text-anchor': a, 'font-size': size, 'font-family': SERIF, 'font-style': 'italic', fill: COL.ink, stroke: 'none'}, gWire);
    el('tspan', {}, e, t);
    if (sub) el('tspan', {'font-size': size * 0.62, dy: 7, 'font-style': 'normal'}, e, sub);
    return e;
  };
  /** 説明の文字（ゴシック） */
  K.text = (x, y, t, color = COL.sub, size = 18, a = 'middle') => el('text', {x, y, 'text-anchor': a, 'font-size': size, fill: color, stroke: 'none'}, gWire, t);
  /** 破線の枠 */
  K.box = (x, y, w, h, color) => el('rect', {x, y, width: w, height: h, rx: 6, stroke: color, 'stroke-width': 1.6, 'stroke-dasharray': '6 5', fill: 'none'}, gWire);
  /** 横向きの抵抗。中心 (x, y)、長さ len */
  K.resH = (x, y, len = 90) => el('rect', {x: x - len / 2, y: y - 13, width: len, height: 26, fill: '#fff'}, gWire);
  /** 交流電源（○ の中に ～）。中心 (x, y)、半径 r */
  K.acsrc = (x, y, r = 26) => {
    el('circle', {cx: x, cy: y, r, fill: '#fff'}, gWire);
    const a = r * 0.55, b = r * 0.32;
    el('path', {d: `M${x - a} ${y} C${x - a / 2} ${y - 2 * b} ${x} ${y - 2 * b} ${x} ${y} S${x + a / 2} ${y + 2 * b} ${x + a} ${y}`}, gWire);
  };
  /** サイリスタ：アノード a → カソード k。gate: ゲートの線が出る向き（a→k を見て +1 左手 / −1 右手）。
   *  戻り値の set(on) で、オンの間は三角を塗る */
  K.thyristor = (a, k, sz = 18, gate = 1) => {
    const dx = k[0] - a[0], dy = k[1] - a[1], len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len, nx = -uy * gate, ny = ux * gate;
    const cx = (a[0] + k[0]) / 2, cy = (a[1] + k[1]) / 2;
    const b0 = [cx - ux * sz, cy - uy * sz], tip = [cx + ux * sz, cy + uy * sz];
    W([a, b0]); W([tip, k]);
    const tri = el('polygon', {points: `${b0[0] + nx * sz},${b0[1] + ny * sz} ${b0[0] - nx * sz},${b0[1] - ny * sz} ${tip[0]},${tip[1]}`, fill: '#fff'}, gWire);
    el('line', {x1: tip[0] + nx * sz, y1: tip[1] + ny * sz, x2: tip[0] - nx * sz, y2: tip[1] - ny * sz}, gWire);
    // ゲート：カソードの横線の端から斜めに
    const g0 = [tip[0] + nx * sz * 0.55, tip[1] + ny * sz * 0.55], g1 = [g0[0] + nx * sz * 0.7 + ux * sz * 0.7, g0[1] + ny * sz * 0.7 + uy * sz * 0.7];
    W([g0, g1]);
    return {set(on) { tri.setAttribute('fill', on ? '#f0abfc' : '#fff'); }, gate: g1};
  };
  return K;
}

// ===================================================================================
// アプリ本体
// cfg = {
//   pdef: [{k, b, s, up, min, max, step?, log, unit, def, fmt?}], presets: [{name, v}],
//   simulate(P) → S（S.t, S.T, S.p.D が必要）, metrics(S) → MET,
//   probes: {key: {b, s, up, color, q: 'V'|'I', what, f(S, k)}}, defaultProbes: [...],
//   build(K) → {nodeW: {n: [pts…]}, hits: [[hitKey, [x, y, w, h]]], arrows: {probeKey: [a, b, side]},
//              nodeTag: {n: [x, y, lx, ly]}, loops: {name: pts}, sw: {name: switchObj}}
//   state(S, k, MET) → {sw: {name: closed}, loops: [[name, frac]], html}
//   metricsHtml(S, MET) → {rows, sub}
//   refLines: [{keys: [...], val(S), label}]（グラフの破線）
//   extraParams?(paramsEl, P, schedule)（チェックボックスなど）, onRun?(S), extraButtons?: [{key, label}]
// }
// ===================================================================================
function SimApp(cfg) {
  'use strict';
  const PDEF = cfg.pdef, PROBE = cfg.probes;
  const P = {}; PDEF.forEach(d => P[d.k] = d.def);
  const probes = new Set(cfg.defaultProbes);
  let emode = 'i';

  // ---------------- パラメータ ----------------
  const paramsEl = document.getElementById('params');
  const sliders = {};
  const fmtVal = (d) => {
    const x = P[d.k];
    if (d.fmt) return d.fmt(x);
    if (d.k === 'D') return String(Math.round(x * 1e4) / 1e4);
    return fmtSI(x, d.unit, x >= 100 * 10 ** Math.floor(Math.log10(x) - 2) ? 3 : 2).replace(/\.0+ /, ' ');
  };
  PDEF.forEach(d => {
    if (d.before) d.before(paramsEl);
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `<span class="nm" title="${d.title || ''}">${d.html || (d.b + (d.s ? `<sub${d.up ? '' : ' style="font-style:italic"'}>${d.s}</sub>` : ''))}</span>
      <input type="range" min="0" max="1000" step="1" aria-label="${d.title || d.k}"><span class="val"></span>`;
    paramsEl.appendChild(row);
    const inp = row.querySelector('input'), val = row.querySelector('.val');
    const toX = (v) => d.log ? 1000 * Math.log(v / d.min) / Math.log(d.max / d.min) : 1000 * (v - d.min) / (d.max - d.min);
    const fromX = (x) => {
      if (d.log) return sig2(d.min * (d.max / d.min) ** (x / 1000));
      const v = d.min + (d.max - d.min) * x / 1000;
      return Math.round(v / d.step) * d.step;
    };
    const show = () => { val.textContent = fmtVal(d); };
    inp.addEventListener('input', () => { P[d.k] = +fromX(+inp.value).toPrecision(6); show(); schedule(); });
    sliders[d.k] = {set: () => { inp.value = toX(P[d.k]); show(); }, row, inp};
    sliders[d.k].set();
  });
  const app = {P, sliders, probes, schedule: () => schedule()};
  if (cfg.extraParams) cfg.extraParams(paramsEl, app);
  const pr = document.createElement('div');
  pr.className = 'presets';
  pr.innerHTML = '<span class="small" style="width:100%">例：</span>';
  cfg.presets.forEach(ps => {
    const b = document.createElement('button');
    b.textContent = ps.name;
    b.onclick = () => { Object.assign(P, ps.v); if (ps.apply) ps.apply(app); PDEF.forEach(d => sliders[d.k].set()); schedule(); };
    pr.appendChild(b);
  });
  paramsEl.appendChild(pr);

  // ---------------- 回路図 ----------------
  const svg = document.getElementById('sch');
  const K = SchemKit(svg);
  const {el, W, gHover, gMark, gHit, gPath} = K;
  const G = cfg.build(K, app);
  const NODE_W = G.nodeW, ARROW = G.arrows, NODE_TAG = G.nodeTag, LOOPS = G.loops;
  const hits = [];
  const addHit = (key, shape) => { shape.dataset.key = key; shape.classList.add('hv'); if (key[0] !== 'n') shape.classList.add('cur'); hits.push(shape); return shape; };
  for (const n in NODE_W) NODE_W[n].forEach(p => addHit('n:' + n, W(p, gHit, {class: 'hitw'})));
  const hitEl = {};
  G.hits.forEach(([key, r]) => { hitEl[key] = addHit(key, el('rect', {x: r[0], y: r[1], width: r[2], height: r[3], class: 'hit'}, gHit)); });
  app.hitEl = hitEl;

  function drawArrow(a, b, color, parent, w = 3) {
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len, hd = 13;
    el('line', {x1: a[0], y1: a[1], x2: b[0] - ux * hd * 0.8, y2: b[1] - uy * hd * 0.8, stroke: color, 'stroke-width': w, 'stroke-linecap': 'round'}, parent);
    el('polygon', {points: `${b[0]},${b[1]} ${b[0] - ux * hd - uy * hd * 0.45},${b[1] - uy * hd + ux * hd * 0.45} ${b[0] - ux * hd + uy * hd * 0.45},${b[1] - uy * hd - ux * hd * 0.45}`, fill: color}, parent);
  }
  function symSvg(x, y, pd, anchor, parent, size = 24) {
    const t = el('text', {x, y, 'text-anchor': anchor, 'font-size': size, 'font-family': SERIF, fill: pd.color, stroke: '#fff', 'stroke-width': 5, 'paint-order': 'stroke', 'stroke-linejoin': 'round'}, parent);
    const gnd = /^GND/.test(pd.b);
    const b = el('tspan', {'font-style': gnd ? 'normal' : 'italic'}, t, pd.b);
    if (gnd) b.setAttribute('font-size', size * 0.7);
    if (pd.s) el('tspan', {'font-size': size * 0.66, dy: 6, 'font-style': pd.up ? 'normal' : 'italic'}, t, pd.s);
    return t;
  }
  function renderMarks() {
    gMark.innerHTML = '';
    for (const key of probes) {
      const pd = PROBE[key];
      if (key[0] === 'n') {
        const tag = NODE_TAG[key.slice(2)];
        if (!tag) continue;
        el('circle', {cx: tag[0], cy: tag[1], r: 7, fill: pd.color, stroke: '#fff', 'stroke-width': 2}, gMark);
        symSvg(tag[0] + tag[2], tag[1] + tag[3], pd, tag[4] || 'middle', gMark, 30);
      } else if (ARROW[key]) {
        const [a, b, side] = ARROW[key];
        drawArrow(a, b, pd.color, gMark, key[0] === 'v' ? 2.5 : 3.5);
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        const off = {L: [-10, 10, 'end'], R: [10, 10, 'start'], T: [0, -12, 'middle'], B: [0, 34, 'middle']}[side];
        symSvg(mx + off[0], my + off[1], pd, off[2], gMark, 30);
      }
    }
  }

  // 電流の経路（灰色の輪と、流れる向きに動く矢じり）。同時に複数の輪を出せる
  const loopEls = {};
  for (const name in LOOPS) {
    const g = el('g', {style: 'display:none'}, gPath);
    el('polygon', {points: LOOPS[name].map(p => p.join(',')).join(' '), fill: 'none', stroke: COL.path, 'stroke-width': 7, 'stroke-opacity': 0.28, 'stroke-linejoin': 'round'}, g);
    const chev = el('g', {fill: 'none', stroke: COL.path, 'stroke-width': 3.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-opacity': 0.85}, g);
    const pts = LOOPS[name].concat([LOOPS[name][0]]);
    const segs = [];
    let tot = 0;
    for (let k = 0; k + 1 < pts.length; k++) { const l = Math.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]); segs.push([pts[k], pts[k + 1], l, tot]); tot += l; }
    loopEls[name] = {g, chev, segs, tot, phase: 0, frac: 0, on: false};
  }
  let activeLoops = [];
  function drawChevrons(L) {
    L.chev.innerHTML = '';
    const sp = 80, n = Math.max(3, Math.round(L.tot / sp)), st = L.tot / n;
    for (let j = 0; j < n; j++) {
      const s = ((L.phase % st) + st) % st + j * st;
      const sg = L.segs.find(q => s >= q[3] && s < q[3] + q[2]) || L.segs[L.segs.length - 1];
      const u = (s - sg[3]) / sg[2], x = sg[0][0] + (sg[1][0] - sg[0][0]) * u, y = sg[0][1] + (sg[1][1] - sg[0][1]) * u;
      const dx = (sg[1][0] - sg[0][0]) / sg[2], dy = (sg[1][1] - sg[0][1]) / sg[2], a = 9;
      el('polyline', {points: `${x - dx * a - dy * a},${y - dy * a + dx * a} ${x},${y} ${x - dx * a + dy * a},${y - dy * a - dx * a}`}, L.chev);
    }
  }
  function setLoops(list) {
    const names = new Set(list.map(q => q[0]));
    for (const name in loopEls) {
      const L = loopEls[name], on = names.has(name);
      if (on !== L.on) { L.g.style.display = on ? '' : 'none'; L.on = on; }
    }
    list.forEach(([name, frac]) => { loopEls[name].frac = frac; });
    activeLoops = list.map(q => loopEls[q[0]]);
  }

  // ---------------- シミュレーション ----------------
  let S = null, MET = null, tCur = 0, playing = false;
  let tmr = null;
  function schedule() { clearTimeout(tmr); tmr = setTimeout(run, 40); }
  function run() {
    S = cfg.simulate(P, app);
    MET = cfg.metrics(S);
    if (cfg.onRun) cfg.onRun(S, app);
    for (const key of [...probes]) if (!PROBE[key] || (PROBE[key].hidden && PROBE[key].hidden(S))) probes.delete(key);
    renderMarks();
    const mh = cfg.metricsHtml(S, MET);
    let rows = mh.rows;
    // 計算が発散した（極端な値の組み合わせ）：表の判定を消して、上に赤字で知らせる
    if (S.unstable) rows = '<tr><td colspan="5"><span class="ng">計算が不安定になりました（値の組み合わせが極端です）</span>。下の値は参考になりません。</td></tr>' + String(rows).replace(/<span class="(ok|ng)">(一致|ずれる)<\/span>/g, '');
    const mEl = document.getElementById('metrics'), sEl = document.getElementById('msub');
    mEl.innerHTML = rows;
    sEl.innerHTML = mh.sub;
    sanitizeNums(mEl); sanitizeNums(sEl);
    updateScrollHint();
    setWindow(winMode, true);
  }
  // スマホで比較表が横にはみ出すとき、表の上に「横にスクロールできます」を出す
  const mTbl = document.getElementById('metrics'), mWrap = mTbl && mTbl.parentElement;
  let mHint = null;
  if (mWrap) {
    mHint = document.createElement('div');
    mHint.className = 'scroll-hint';
    mHint.textContent = '← 表は横にスクロールできます →';
    mWrap.parentElement.insertBefore(mHint, mWrap);
    mWrap.classList.add('mwrap');
    mWrap.addEventListener('scroll', () => mWrap.classList.toggle('scrolled-end', mWrap.scrollLeft + mWrap.clientWidth >= mWrap.scrollWidth - 4), {passive: true});
  }
  function updateScrollHint() {
    if (!mHint) return;
    const over = mWrap.scrollWidth > mWrap.clientWidth + 4;
    mHint.style.display = over ? '' : 'none';
    mWrap.classList.toggle('overflowing', over);
  }
  app.run = run;

  // ---------------- 時間の窓 ----------------
  let winMode = cfg.initWin || 'all', t0w = 0, t1w = 1;
  const tEnd = () => S.t[S.t.length - 1];
  function setWindow(m, keepRel) {
    const rel = (tCur - t0w) / (t1w - t0w);
    winMode = m;
    const nP = +document.getElementById('nP').value;
    if (m === 'all') { t0w = 0; t1w = tEnd(); }
    else if (m === 'first') { t0w = 0; t1w = Math.min(tEnd(), nP * S.T); }
    else { t0w = tEnd() - nP * S.T; t1w = tEnd(); }
    tCur = keepRel && isFinite(rel) ? t0w + Math.min(Math.max(rel, 0), 1) * (t1w - t0w) : t0w;
    document.querySelectorAll('#win button').forEach(b => b.classList.toggle('on', b.dataset.w === m));
    document.getElementById('nper').style.visibility = m === 'all' ? 'hidden' : 'visible';
    plotDirty = true;
    update();
  }
  document.querySelectorAll('#win button').forEach(b => b.onclick = () => setWindow(b.dataset.w, false));
  document.getElementById('nP').onchange = () => setWindow(winMode, false);
  document.getElementById('lay').onchange = () => { plotDirty = true; update(); };
  document.querySelectorAll('#emode button').forEach(b => b.onclick = () => {
    emode = b.dataset.m;
    document.querySelectorAll('#emode button').forEach(q => q.classList.toggle('on', q === b));
  });

  const lowerIdx = (t) => {
    const a = S.t; let lo = 0, hi = a.length - 1;
    if (t <= a[0]) return 0;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (a[m] <= t) lo = m; else hi = m - 1; }
    return lo;
  };
  const valAt = (key, t) => {
    const k = lowerIdx(t), pd = PROBE[key];
    if (k >= S.t.length - 1 || S.t[k + 1] === S.t[k]) return pd.f(S, k);
    const u = (t - S.t[k]) / (S.t[k + 1] - S.t[k]);
    return pd.f(S, k) * (1 - u) + pd.f(S, k + 1) * u;
  };

  // ---------------- グラフ（canvas） ----------------
  const cv = document.getElementById('plot'), ctx = cv.getContext('2d');
  const off = document.createElement('canvas'), octx = off.getContext('2d');
  let plotDirty = true, layout = null;
  const ML = 62, MR = 12;
  function niceStep(range, n) { const raw = range / n, p = 10 ** Math.floor(Math.log10(raw)), m = raw / p; return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p; }
  // 時間の単位：窓の幅 span で決め、表示する時刻の大きさ tMax がその単位で 1000 以上になるなら一つ大きい単位に
  // （例：L = 10 H で 10 s 計算したときに「10035 ms」と 5 桁にならないように）
  function tUnit(span, tMax = 0) {
    let u = span < 2e-3 ? [1e-6, 'μs'] : span < 2 ? [1e-3, 'ms'] : [1, 's'];
    while (u[0] < 1 && Math.abs(tMax) / u[0] >= 1000) u = u[0] === 1e-6 ? [1e-3, 'ms'] : [1, 's'];
    return u;
  }
  function drawSym(c, x, y, pd, size) {
    c.save();
    c.fillStyle = pd.color;
    const gnd = /^GND/.test(pd.b);
    const fb = `${gnd ? '' : 'italic '}${size}px ${SERIF}`, fs = `${pd.up ? '' : 'italic '}${Math.round(size * 0.66)}px ${SERIF}`;
    c.font = fb; const wb = c.measureText(pd.b).width;
    c.font = fs; const ws = pd.s ? c.measureText(pd.s).width : 0;
    c.strokeStyle = '#fff'; c.lineWidth = 4; c.lineJoin = 'round';
    c.font = fb; c.strokeText(pd.b, x, y); c.fillText(pd.b, x, y);
    if (pd.s) { c.font = fs; c.strokeText(pd.s, x + wb + 1, y + size * 0.25); c.fillText(pd.s, x + wb + 1, y + size * 0.25); }
    c.restore();
    return wb + ws + 1;
  }
  function symWidth(c, pd, size) {
    c.save();
    const gnd = /^GND/.test(pd.b);
    c.font = `${gnd ? '' : 'italic '}${size}px ${SERIF}`; const wb = c.measureText(pd.b).width;
    c.font = `${pd.up ? '' : 'italic '}${Math.round(size * 0.66)}px ${SERIF}`; const ws = pd.s ? c.measureText(pd.s).width : 0;
    c.restore();
    return wb + ws + 1;
  }
  function computeLayout() {
    const w = cv.parentElement.clientWidth - 12;
    const phone = w < 560;
    const keys = [...probes].filter(k => !/^n:gnd/.test(k));
    const panes = [{kind: 'gate', h: cfg.gatePane ? cfg.gatePane.h : 22}];
    const ph = phone ? 120 : 150;
    if (document.getElementById('lay').value === 'vi') {
      const vk = keys.filter(k => PROBE[k].q === 'V'), ik = keys.filter(k => PROBE[k].q === 'I');
      if (vk.length) panes.push({kind: 'V', keys: vk, h: ph, unit: 'V', title: '電圧・電位'});
      if (ik.length) panes.push({kind: 'I', keys: ik, h: ph, unit: 'A', title: '電流'});
    } else keys.forEach(k => panes.push({kind: PROBE[k].q, keys: [k], h: phone ? 78 : 92, unit: PROBE[k].q === 'V' ? 'V' : 'A'}));
    let y = 6;
    panes.forEach(p => { p.y = y; y += p.h + 8; });
    return {w, h: y + 26, panes, pw: w - ML - MR};
  }
  function renderPlot() {
    layout = computeLayout();
    const dpr = window.devicePixelRatio || 1, {w, h} = layout;
    for (const c of [cv, off]) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    cv.style.height = h + 'px';
    const c = octx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    c.fillStyle = '#fff'; c.fillRect(0, 0, w, h);
    const span = t1w - t0w, [tu, tun] = tUnit(span, t1w);
    const X_ = (t) => ML + (t - t0w) / span * layout.pw;
    const i0 = Math.max(0, lowerIdx(t0w)), i1 = Math.min(S.t.length - 1, lowerIdx(t1w) + 1);
    const nPerWin = span / S.T, Dg = cfg.gatePane ? 0 : S.p.D;
    const ts = niceStep(span / tu, w < 560 ? 4 : 7) * tu;
    c.font = '11px Menlo, monospace'; c.textAlign = 'center'; c.fillStyle = COL.sub;
    const axisLabel = `t [${tun}]`, axisLeft = w - 2 - c.measureText(axisLabel).width - 8;   // 軸の名前の左端（目盛りの数字と重ねない）
    for (let t = Math.ceil(t0w / ts - 1e-9) * ts; t <= t1w + 1e-12; t += ts) {
      const x = X_(t);
      c.strokeStyle = '#eef1f4'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(x, 6); c.lineTo(x, h - 24); c.stroke();
      const lbl = +(t / tu).toPrecision(6) + '';
      if (x + c.measureText(lbl).width / 2 < axisLeft) c.fillText(lbl, x, h - 10);
    }
    c.textAlign = 'right'; c.fillText(axisLabel, w - 2, h - 10);
    const refs = cfg.refLines || [];
    for (const pn of layout.panes) {
      const y0 = pn.y, ph = pn.h;
      if (pn.kind === 'gate' && cfg.gatePane) { cfg.gatePane.draw(c, S, {X_, t0w, t1w, y0, ph, ML, pw: layout.pw, i0, i1}); continue; }
      if (pn.kind === 'gate') {
        c.fillStyle = '#fbeefc'; c.fillRect(ML, y0, layout.pw, ph);
        c.fillStyle = COL.fuchsia;
        if (nPerWin < 400) {
          for (let n = Math.floor(t0w / S.T); n * S.T < t1w; n++) {
            const a = Math.max(t0w, n * S.T), b = Math.min(t1w, n * S.T + Dg * S.T);
            if (b > a) c.fillRect(X_(a), y0 + 3, Math.max(0.6, X_(b) - X_(a)), ph - 6);
          }
        } else { c.globalAlpha = Dg; c.fillRect(ML, y0 + 3, layout.pw, ph - 6); c.globalAlpha = 1; }
        c.font = '12px sans-serif'; c.textAlign = 'right'; c.fillStyle = COL.fuchsia;
        c.fillText('スイッチ', ML - 6, y0 + 15);
        continue;
      }
      let mn = 0, mx = 0;
      for (const key of pn.keys) {
        const pd = PROBE[key];
        for (let k = i0; k <= i1; k++) { const v = pd.f(S, k); if (v < mn) mn = v; if (v > mx) mx = v; }
      }
      const myRefs = refs.filter(r => r.keys.some(k => pn.keys.includes(k)));
      myRefs.forEach(r => { const v = r.val(S); if (isFinite(v)) { mx = Math.max(mx, v); mn = Math.min(mn, v); } });
      if (mx - mn < 1e-12) { mx = mn + 1e-3; }
      // 定常の窓で、平均の近くだけ動く量（vC など）はそのままだと平らに見えるので、0 を含めない
      if (winMode !== 'all' && pn.keys.length === 1) {
        const pd = PROBE[pn.keys[0]];
        let a = Infinity, b = -Infinity;
        for (let k = i0; k <= i1; k++) { const v = pd.f(S, k); a = Math.min(a, v); b = Math.max(b, v); }
        const big = Math.max(Math.abs(a), Math.abs(b));
        if (b - a > 1e-12 && a * b > 0 && (b - a) < 0.2 * big) { mn = a; mx = b; }
      }
      const pad = (mx - mn) * 0.1; mn -= pad; mx += pad;
      const Y_ = (v) => y0 + ph - (v - mn) / (mx - mn) * ph;
      pn.Y = Y_;
      c.strokeStyle = '#d5dbe2'; c.lineWidth = 1; c.strokeRect(ML + 0.5, y0 + 0.5, layout.pw - 1, ph - 1);
      const st = niceStep(mx - mn, ph < 100 ? 2 : 4);
      c.font = '11px Menlo, monospace'; c.textAlign = 'right'; c.fillStyle = COL.sub;
      for (let v = Math.ceil(mn / st) * st; v <= mx + 1e-12; v += st) {
        const y = Y_(v);
        c.strokeStyle = Math.abs(v) < st * 1e-6 ? '#b8c2cc' : '#eef1f4';
        c.beginPath(); c.moveTo(ML, y); c.lineTo(ML + layout.pw, y); c.stroke();
        c.fillText(fmtSI(Math.abs(v) < st * 1e-6 ? 0 : v, pn.unit, 3).replace(/\.0+ /, ' ').replace(/(\.\d*?)0+ /, '$1 ').replace(/\. /, ' '), ML - 5, y + 4);
      }
      if (nPerWin < 60 && !cfg.gatePane) {
        c.fillStyle = 'rgba(192,38,211,0.05)';
        for (let n = Math.floor(t0w / S.T); n * S.T < t1w; n++) {
          const a = Math.max(t0w, n * S.T), b = Math.min(t1w, n * S.T + Dg * S.T);
          if (b > a) c.fillRect(X_(a), y0 + 1, X_(b) - X_(a), ph - 2);
        }
      }
      // 授業の式の値の破線（札は波形の後に描く）
      const refLabels = [];
      myRefs.forEach(r => {
        const v = r.val(S);
        if (!isFinite(v)) return;
        const y = Y_(v), col = r.color || COL.orange;
        c.save(); c.setLineDash([6, 5]); c.strokeStyle = col; c.lineWidth = 1.4;
        c.beginPath(); c.moveTo(ML, y); c.lineTo(ML + layout.pw, y); c.stroke(); c.restore();
        refLabels.push({label: r.label, y, col});
      });
      c.save();
      c.beginPath(); c.rect(ML, y0, layout.pw, ph); c.clip();
      pn.keys.forEach((key, idx) => {
        const pd = PROBE[key];
        c.strokeStyle = pd.color; c.lineWidth = Math.min(5, 2 + 1.5 * (pn.keys.length - 1 - idx)); c.lineJoin = 'round';
        c.beginPath();
        if (i1 - i0 > layout.pw * 3) {
          let col = -1, cmn = 0, cmx = 0, first = 0, last = 0, started = false;
          const flush = () => {
            const x = ML + col + 0.5;
            if (!started) { c.moveTo(x, Y_(first)); started = true; } else c.lineTo(x, Y_(first));
            c.lineTo(x, Y_(cmn)); c.lineTo(x, Y_(cmx)); c.lineTo(x, Y_(last));
          };
          for (let k = i0; k <= i1; k++) {
            const cc = Math.floor((S.t[k] - t0w) / span * layout.pw), v = pd.f(S, k);
            if (cc !== col) { if (col >= 0 || started) flush(); col = cc; cmn = cmx = first = last = v; }
            else { if (v < cmn) cmn = v; if (v > cmx) cmx = v; last = v; }
          }
          flush();
        } else {
          for (let k = i0; k <= i1; k++) { const x = X_(S.t[k]), y = Y_(pd.f(S, k)); if (k === i0) c.moveTo(x, y); else c.lineTo(x, y); }
        }
        c.stroke();
      });
      c.restore();
      for (const r of refLabels) {
        c.font = `italic 13px ${SERIF}`; c.textAlign = 'right';
        const rw = c.measureText(r.label).width, ry = Math.max(y0 + 16, r.y - 4);
        c.fillStyle = 'rgba(255,255,255,0.88)'; c.fillRect(ML + layout.pw - 8 - rw, ry - 13, rw + 8, 17);
        c.fillStyle = r.col; c.fillText(r.label, ML + layout.pw - 4, ry);
      }
      // 段の名前と記号：波形の上に白い下地を敷いてから描く（線と重なって読めなくならないように）
      let lw = 0;
      if (pn.title) { c.font = '12px sans-serif'; lw += c.measureText(pn.title).width + 10; }
      for (const key of pn.keys) lw += symWidth(c, PROBE[key], 17) + 12;
      c.fillStyle = 'rgba(255,255,255,0.85)'; c.fillRect(ML + 3, y0 + 2, lw + 4, 22);
      let lx = ML + 8;
      if (pn.title) { c.font = '12px sans-serif'; c.fillStyle = COL.sub; c.textAlign = 'left'; c.strokeStyle = '#fff'; c.lineWidth = 4; c.lineJoin = 'round'; c.strokeText(pn.title, lx, y0 + 16); c.fillText(pn.title, lx, y0 + 16); lx += c.measureText(pn.title).width + 10; }
      c.textAlign = 'left';
      for (const key of pn.keys) lx += drawSym(c, lx, y0 + 18, PROBE[key], 17) + 12;
    }
    plotDirty = false;
  }
  function drawCursor() {
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(off, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const x = ML + (tCur - t0w) / (t1w - t0w) * layout.pw;
    ctx.strokeStyle = 'rgba(31,42,55,0.55)'; ctx.lineWidth = 1.2; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(x, 4); ctx.lineTo(x, layout.h - 22); ctx.stroke(); ctx.setLineDash([]);
    for (const pn of layout.panes) {
      if (!pn.keys) continue;
      for (const key of pn.keys) {
        const v = valAt(key, tCur), y = pn.Y(v);
        ctx.fillStyle = PROBE[key].color; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x, y, 4.2, 0, 7); ctx.fill(); ctx.stroke();
      }
    }
  }

  // ---------------- 凡例 ----------------
  const legend = document.getElementById('legend');
  function renderLegend() {
    legend.innerHTML = '';
    for (const key of probes) {
      if (/^n:gnd/.test(key)) continue;
      const pd = PROBE[key];
      const chip = document.createElement('span');
      chip.className = 'chip'; chip.style.borderColor = pd.color;
      chip.title = pd.what;
      chip.innerHTML = `<span class="sym" style="color:${pd.color}">${pd.b}${pd.s ? `<sub${pd.up ? ' style="font-style:normal"' : ''}>${pd.s}</sub>` : ''}</span><span class="v" data-k="${key}"></span><button aria-label="消す">×</button>`;
      chip.querySelector('button').onclick = () => toggleProbe(key);
      legend.appendChild(chip);
    }
    if (!legend.children.length) legend.innerHTML = '<span class="chip-hint">回路図の線や素子をクリックすると、ここに波形が増えます。</span>';
    (cfg.extraButtons || []).forEach(xb => {
      const b = document.createElement('button');
      b.className = 'xbtn' + (probes.has(xb.key) ? ' on' : '');
      b.innerHTML = (probes.has(xb.key) ? '✓ ' : '＋ ') + xb.label; b.title = probes.has(xb.key) ? 'クリックでグラフから消す' : 'クリックでグラフに出す';
      b.onclick = () => toggleProbe(xb.key);
      legend.appendChild(b);
    });
  }
  function updateLegendVals() {
    legend.querySelectorAll('.v').forEach(s => { s.textContent = '= ' + fmtSI(valAt(s.dataset.k, tCur), PROBE[s.dataset.k].q === 'V' ? 'V' : 'A', 3); });
  }
  const stateEl = document.getElementById('state');
  function updateSchematic() {
    const st = cfg.state(S, lowerIdx(tCur), MET, app);
    for (const name in st.sw || {}) G.sw[name].set(st.sw[name]);
    setLoops(st.loops || []);
    stateEl.innerHTML = st.html;
  }

  // ---------------- 毎フレーム ----------------
  const tcEl = document.getElementById('tc'), scrub = document.getElementById('scrub');
  function update() {
    if (!S) return;
    if (plotDirty) { renderPlot(); renderLegend(); }
    drawCursor();
    updateSchematic();
    updateLegendVals();
    const [tu, tun] = tUnit(t1w - t0w, t1w);
    tcEl.textContent = `t = ${(tCur / tu).toFixed(tCur / tu < 10 ? 3 : 2)} ${tun}`;
    scrub.value = Math.round((tCur - t0w) / (t1w - t0w) * 10000);
    if (tipKey) showTip(tipKey);
  }
  let lastTs = 0;
  function frame(ts) {
    const dt = Math.min(0.1, (ts - lastTs) / 1000 || 0);
    lastTs = ts;
    if (S) {
      const sp = +document.getElementById('speed').value;
      if (playing) {
        const span = t1w - t0w;
        const dur = winMode === 'all' ? 12 : 2.5 * span / S.T;
        tCur += span / dur * sp * dt;
        if (tCur > t1w) tCur = t0w;
        update();
      }
      for (const L of activeLoops) {
        L.phase += dt * (L.frac > 1e-6 ? 40 + 110 * Math.min(1, L.frac) : 0) * (playing ? 1 : 0.6);
        drawChevrons(L);
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  const playBtn = document.getElementById('play');
  const setPlay = (on) => { playing = on; playBtn.textContent = on ? '❚❚ 一時停止' : '▶ 再生'; };
  playBtn.onclick = () => setPlay(!playing);
  scrub.addEventListener('input', () => { setPlay(false); tCur = t0w + (+scrub.value / 10000) * (t1w - t0w); update(); });
  const seek = (e) => {
    const r = cv.getBoundingClientRect();
    const u = (e.clientX - r.left - ML) / layout.pw;
    tCur = t0w + Math.min(1, Math.max(0, u)) * (t1w - t0w);
    update();
  };
  let dragging = false;
  cv.addEventListener('pointerdown', (e) => { dragging = true; setPlay(false); cv.setPointerCapture(e.pointerId); seek(e); });
  cv.addEventListener('pointermove', (e) => { if (dragging) seek(e); });
  cv.addEventListener('pointerup', () => { dragging = false; });
  window.addEventListener('resize', () => { plotDirty = true; update(); updateScrollHint(); });

  // ---------------- クリックで測る ----------------
  function probeKeyOf(hk, alt) {
    if (hk[0] === 'n') return hk;
    const m = (alt ? (emode === 'i' ? 'v' : 'i') : emode);
    const k = m + ':' + hk.slice(2);
    if (PROBE[k]) return k;
    return (m === 'i' ? 'v:' : 'i:') + hk.slice(2); // 片方しかない素子（変圧器の鉄心など）
  }
  // 同じ名前・同じ色で、中身（波形）も同じ量がもう表示されているか（直列の素子の電流など）。あればその key
  function sameShown(key) {
    const pd = PROBE[key];
    if (!pd || !S) return null;
    for (const k of probes) {
      if (k === key) continue;
      const q = PROBE[k];
      if (!q || q.b !== pd.b || (q.s || '') !== (pd.s || '') || q.color !== pd.color || q.q !== pd.q) continue;
      const n = S.t.length, step = Math.max(1, Math.floor(n / 400));
      let mx = 0, df = 0;
      for (let j = 0; j < n; j += step) { const a = pd.f(S, j), b = q.f(S, j); mx = Math.max(mx, Math.abs(a), Math.abs(b)); df = Math.max(df, Math.abs(a - b)); }
      if (df <= 1e-9 * Math.max(mx, 1e-12)) return k;
    }
    return null;
  }
  function flashChip(key) {
    const s = legend.querySelector(`.v[data-k="${key}"]`), chip = s && s.closest('.chip');
    if (!chip) return;
    chip.classList.remove('flash'); void chip.offsetWidth; chip.classList.add('flash');
    let note = legend.querySelector('.dup-note');
    if (!note) { note = document.createElement('span'); note.className = 'chip-hint dup-note'; legend.appendChild(note); }
    note.textContent = '同じ波形がもう表示されています';
    clearTimeout(flashChip.tm);
    flashChip.tm = setTimeout(() => { if (note.parentElement) note.remove(); chip.classList.remove('flash'); }, 1800);
  }
  function toggleProbe(key) {
    if (/^n:gnd/.test(key)) return;
    if (probes.has(key)) probes.delete(key);
    else {
      const dup = sameShown(key);
      if (dup) { flashChip(dup); return; }
      probes.add(key);
    }
    renderMarks(); plotDirty = true; update();
  }
  app.toggleProbe = toggleProbe;
  const tip = document.getElementById('tip');
  let tipKey = null, tipXY = [0, 0];
  function showTip(key) {
    const pd = PROBE[key];
    const v = valAt(key, tCur);
    const [tu, tun] = tUnit(t1w - t0w, t1w);
    const on = probes.has(key);
    const gnd = /^n:gnd/.test(key);
    const both = key[0] !== 'n' && PROBE['i:' + key.slice(2)] && PROBE['v:' + key.slice(2)];
    const act = gnd ? (pd.base || 'すべての電位の基準') : (on ? 'クリックでグラフから消す' : sameShown(key) ? '同じ波形がグラフに表示中' : 'クリックでグラフに出す');
    tip.innerHTML = `${pd.what}<br>${symH(pd.b, pd.s, pd.up)} = <span class="val">${fmtSI(v, pd.q === 'V' ? 'V' : 'A', 4)}</span>（t = ${(tCur / tu).toFixed(3)} ${tun}）<br><span class="hint">${act}${both ? '／Alt（option）を押しながらで' + (key[0] === 'i' ? '両端の電圧' : '電流') : ''}</span>`;
    tip.style.display = 'block';
    const r = tip.getBoundingClientRect();
    let x = tipXY[0] + 14, y = tipXY[1] + 16;
    if (x + r.width > innerWidth - 8) x = innerWidth - r.width - 8;
    if (y + r.height > innerHeight - 8) y = tipXY[1] - r.height - 12;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  }
  function hoverOn(hk, alt) {
    gHover.innerHTML = '';
    if (!hk) return;
    if (hk[0] === 'n') {
      const n = hk.slice(2), pd = PROBE[hk];
      NODE_W[n].forEach((p, idx) => { if (cfg.hideWire && cfg.hideWire(n, idx, app)) return; W(p, gHover, {stroke: pd.color, 'stroke-width': 7, 'stroke-opacity': 0.45}); });
    } else {
      const r = hits.find(h => h.dataset.key === hk), col = PROBE[probeKeyOf(hk, alt)].color;
      el('rect', {x: r.getAttribute('x'), y: r.getAttribute('y'), width: r.getAttribute('width'), height: r.getAttribute('height'), rx: 8, fill: col, 'fill-opacity': 0.1, stroke: col, 'stroke-opacity': 0.5}, gHover);
    }
  }
  hits.forEach(h => {
    h.addEventListener('pointerenter', (e) => { tipKey = probeKeyOf(h.dataset.key, e.altKey); tipXY = [e.clientX, e.clientY]; hoverOn(h.dataset.key, e.altKey); showTip(tipKey); });
    h.addEventListener('pointermove', (e) => { tipKey = probeKeyOf(h.dataset.key, e.altKey); tipXY = [e.clientX, e.clientY]; showTip(tipKey); });
    h.addEventListener('pointerleave', () => { tipKey = null; tip.style.display = 'none'; gHover.innerHTML = ''; });
    h.addEventListener('click', (e) => { const k = probeKeyOf(h.dataset.key, e.altKey); toggleProbe(k); tipKey = k; tipXY = [e.clientX, e.clientY]; showTip(k); });
  });
  const curSvg = (s) => `url("data:image/svg+xml,${encodeURIComponent(s)}")`;
  const probeCur = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"><path d="M3 25 L10 13" stroke="#1f2a37" stroke-width="2.5"/><path d="M9 15 L19 3 L25 9 L13 19 Z" fill="#e23b3b" stroke="#1f2a37" stroke-width="1.5"/></svg>`;
  const clampCur = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"><path d="M14 4 A10 10 0 1 0 24 14" fill="none" stroke="#1f2a37" stroke-width="3"/><path d="M24 14 L20 9 M24 14 L27 9" stroke="#1f2a37" stroke-width="2"/><path d="M2 14 H26" stroke="#e23b3b" stroke-width="2" stroke-dasharray="3 2"/></svg>`;
  svg.style.setProperty('--probe-cursor', `${curSvg(probeCur)} 3 25, crosshair`);
  svg.style.setProperty('--clamp-cursor', `${curSvg(clampCur)} 14 14, pointer`);

  run();
  return app;
}

/**
 * グラフのいちばん上の段（ゲート信号・どの素子がオンか）を、行ごとの帯で描く。SimApp の cfg.gatePane に渡す。
 * rows = [{label, color, on(S, k) → bool}]、marks?(S, t0, t1) → [[t, row]]（ゲートパルスの位置に縦の線）
 */
function gateRowsPane(rows, marks) {
  const RH = 15;
  return {
    h: rows.length * RH + 6,
    draw(c, S, g) {
      const {X_, t0w, t1w, y0, ML, pw, i0, i1} = g;
      c.fillStyle = '#f7f8fa'; c.fillRect(ML, y0, pw, rows.length * RH + 6);
      rows.forEach((r, q) => {
        const y = y0 + 3 + q * RH;
        c.fillStyle = r.color;
        let start = null;
        for (let k = i0; k <= i1; k++) {
          const on = r.on(S, k);
          if (on && start === null) start = Math.max(t0w, S.t[k]);
          if ((!on || k === i1) && start !== null) {
            const e = Math.min(t1w, S.t[k]);
            if (e > start) c.fillRect(X_(start), y + 2, Math.max(0.8, X_(e) - X_(start)), RH - 4);
            start = null;
          }
        }
        c.font = '11px sans-serif'; c.textAlign = 'right'; c.fillStyle = r.color;
        c.fillText(r.label, ML - 5, y + RH - 4);
      });
      if (marks) {
        c.lineWidth = 1.6;
        for (const [t, q] of marks(S, t0w, t1w)) {
          const x = X_(t), y = y0 + 3 + q * RH;
          c.strokeStyle = COL.ink; c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + RH); c.stroke();
        }
      }
    },
  };
}
