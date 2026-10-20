// プレイ記録からの指標計算・スコア・上級者比 (rating: 上級者の目安 = 100%)
import { expertRef } from './reference.js';
const DEG = Math.PI / 180;
const wrap = (d) => ((d % 360) + 540) % 360 - 180;
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
const median = (a) => {
  if (!a.length) return NaN;
  const b = [...a].sort((x, y) => x - y);
  return b[Math.floor(b.length / 2)];
};
const sd = (a) => {
  const m = mean(a);
  return Math.sqrt(mean(a.map((v) => (v - m) ** 2)));
};
// 照準 (cx,cy) から見た目標 (x,y) の平面近似ベクトル (度)
function vec(cx, cy, x, y) {
  return [wrap(x - cx) * Math.cos(((cy + y) / 2) * DEG), y - cy];
}

export const RANKS = [
  { min: 0, name: 'ブロンズ', color: '#c27a4a' },
  { min: 30, name: 'シルバー', color: '#b8c4d4' },
  { min: 45, name: 'ゴールド', color: '#ffcc33' },
  { min: 60, name: 'プラチナ', color: '#4fe0d0' },
  { min: 72, name: 'ダイヤモンド', color: '#6fa8ff' },
  { min: 84, name: 'マスター', color: '#c77dff' },
  { min: 95, name: 'グランドマスター', color: '#ff4d6d' },
];
export function rankOf(rating) {
  let r = RANKS[0];
  for (const x of RANKS) if (rating >= x.min) r = x;
  return r;
}

// 照準速度 (度/秒, 平滑化済み)
function speeds(S, i0, i1) {
  const raw = [];
  for (let i = i0; i <= i1; i++) {
    if (i === 0) { raw.push(0); continue; }
    const dt = S.t[i] - S.t[i - 1] || 1 / 144;
    const [dx, dy] = vec(S.cx[i - 1], S.cy[i - 1], S.cx[i], S.cy[i]);
    raw.push(Math.hypot(dx, dy) / dt);
  }
  return raw.map((_, k) => {
    let s = 0, n = 0;
    for (let j = Math.max(0, k - 2); j <= Math.min(raw.length - 1, k + 2); j++) { s += raw[j]; n++; }
    return s / n;
  });
}
function indexAt(S, t) {
  let lo = 0, hi = S.t.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (S.t[mid] <= t) lo = mid; else hi = mid - 1;
  }
  return lo;
}
const targetIn = (S, i, id) => (S.tg[i] || []).find((g) => g[0] === id);

// ---------- クリック系: 目標ごとの試行解析 ----------
// 照準 (cx,cy) を向いたカメラの画面内に (x,y) が映っているか
function onScreen(cx, cy, x, y, view) {
  const a = -cx * DEG, p = cy * DEG, ta = -x * DEG, tp = y * DEG;
  const d = [-Math.sin(ta) * Math.cos(tp), Math.sin(tp), -Math.cos(ta) * Math.cos(tp)];
  const f = [-Math.sin(a) * Math.cos(p), Math.sin(p), -Math.cos(a) * Math.cos(p)];
  const r = [Math.cos(a), 0, -Math.sin(a)];
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const z = d[0] * f[0] + d[1] * f[1] + d[2] * f[2];
  if (z <= 0) return false;
  const sx = (d[0] * r[0] + d[1] * r[1] + d[2] * r[2]) / z;
  const sy = (d[0] * u[0] + d[1] * u[1] + d[2] * u[2]) / z;
  return Math.abs(sx) <= view.tx && Math.abs(sy) <= view.ty;
}

function analyzeClickTrials(rec, sc) {
  const S = rec.samples, ev = rec.events;
  const st = rec.settings || {};
  const ty = Math.tan(((st.vfov || 70.5) / 2) * DEG);
  const view = { ty, tx: ty * (st.aspect || 16 / 9) };
  const spawns = new Map(ev.filter((e) => e.type === 'spawn').map((e) => [e.id, e]));
  const trials = [];
  let prevKill = 0;
  for (const k of ev.filter((e) => e.type === 'kill')) {
    const sp = spawns.get(k.id);
    if (!sp) continue;
    const start = sc.spawnDelay ? sp.t : Math.max(sp.t, prevKill);
    prevKill = k.t;
    const is = Math.min(indexAt(S, start) + 1, S.t.length - 1);
    const i1 = indexAt(S, k.t);
    if (i1 - is < 2) continue;
    // 画面外に出た目標は、画面内に入った瞬間から照準の計測を始める (それまでの視点移動は索敵として除外)
    let i0 = is;
    while (i0 < i1) {
      const g = targetIn(S, i0, k.id);
      if (!g || onScreen(S.cx[i0], S.cy[i0], g[1], g[2], view)) break;
      i0++;
    }
    const searchTime = S.t[i0] - S.t[is] > 0.02 ? S.t[i0] - start : 0;
    const aimStart = searchTime ? S.t[i0] : start;
    if (i1 - i0 < 2) continue;
    const g0 = targetIn(S, i0, k.id) || [k.id, sp.x, sp.y, sp.r];
    const r = g0[3];
    const c0 = [S.cx[i0], S.cy[i0]];
    const v0 = vec(c0[0], c0[1], g0[1], g0[2]);
    const D0 = Math.hypot(...v0);
    const MT = k.t - aimStart;
    const misses = ev.filter((e) => e.type === 'shot' && !e.hit && e.t >= start && e.t <= k.t).length;
    const tr = { start, MT, totalMT: k.t - start, searchTime, D0, r, ID: Math.log2(D0 / (2 * r) + 1), misses, dir: null, valid: D0 > r * 2.5 };
    tr.dir = Math.abs(v0[0]) >= Math.abs(v0[1]) ? (v0[0] > 0 ? 'right' : 'left') : (v0[1] > 0 ? 'up' : 'down');
    tr.vertShare = Math.abs(v0[1]) / (D0 || 1);
    if (tr.valid) {
      const sp_ = speeds(S, i0, i1);
      let ip = 0;
      sp_.forEach((v, j) => { if (v > sp_[ip]) ip = j; });
      const peak = sp_[ip];
      tr.peak = peak;
      const onIdx = sp_.findIndex((v) => v > Math.max(15, 0.1 * peak));
      // 索敵中から動いているので、索敵ありの試行では動き出しを測らない
      tr.onset = onIdx >= 0 && !searchTime ? S.t[i0 + onIdx] - start : NaN;
      let pe = sp_.length - 1;
      for (let j = ip + 1; j < sp_.length - 1; j++) {
        if (sp_[j] < 0.22 * peak || (sp_[j] < 0.6 * peak && sp_[j + 1] > sp_[j])) { pe = j; break; }
      }
      const ia = i0 + pe;
      const ga = targetIn(S, ia, k.id) || g0;
      const T = vec(c0[0], c0[1], ga[1], ga[2]);
      const P = vec(c0[0], c0[1], S.cx[ia], S.cy[ia]);
      const dT = Math.hypot(...T) || 1;
      const u = [T[0] / dT, T[1] / dT];
      const along = P[0] * u[0] + P[1] * u[1];
      const perp = -P[0] * u[1] + P[1] * u[0];
      tr.err = along - dT;
      tr.perp = perp;
      // 一振り目の振れ幅の比 (1 = ちょうど目標の距離) と、目標の方向からの回転 (度, 反時計回りが正)
      tr.gain = along / dT;
      tr.angle = (Math.atan2(perp, along) * 180) / Math.PI;
      tr.ux = u[0];
      tr.primaryTime = S.t[ia] - aimStart;
      // 撃破までに目標の奥の縁を越えたことがあれば「行き過ぎ」
      let maxPast = -Infinity;
      for (let i = i0; i <= i1; i++) {
        const gi = targetIn(S, i, k.id) || g0;
        const Ti = vec(c0[0], c0[1], gi[1], gi[2]);
        const ti = Math.hypot(...Ti) || 1;
        const Pi = vec(c0[0], c0[1], S.cx[i], S.cy[i]);
        maxPast = Math.max(maxPast, (Pi[0] * Ti[0] + Pi[1] * Ti[1]) / ti - ti);
      }
      tr.maxPast = maxPast;
      tr.outcome = maxPast > r ? 'over' : tr.err < -r ? 'under' : 'on';
      // サブムーブメント数 (ヒステリシス付きのピーク数)
      let up = false, segs = 0;
      for (const v of sp_) {
        if (!up && v > 0.18 * peak && v > 15) { up = true; segs++; }
        else if (up && v < 0.08 * peak) up = false;
      }
      tr.corrections = Math.max(0, segs - 1);
      // 軌跡 (目標方向を +x, 距離 1 に正規化)
      const path = [];
      const stepN = Math.max(1, Math.floor((i1 - i0) / 50));
      for (let i = i0; i <= i1; i += stepN) {
        const gi = targetIn(S, i, k.id) || g0;
        const Ti = vec(c0[0], c0[1], gi[1], gi[2]);
        const ti = Math.hypot(...Ti) || 1;
        const ui = [Ti[0] / ti, Ti[1] / ti];
        const Pi = vec(c0[0], c0[1], S.cx[i], S.cy[i]);
        path.push([(Pi[0] * ui[0] + Pi[1] * ui[1]) / ti, (-Pi[0] * ui[1] + Pi[1] * ui[0]) / ti]);
      }
      tr.path = path;
    }
    trials.push(tr);
  }
  return trials;
}

// 一振り目の精度 (視点とマウスの対応の正確さ) と、マウスの傾きの推定
// - 振れ幅の比: 一振り目でどこまで届いたか (目標の距離 = 1)。平均とばらつき (変動係数)、距離別
// - 傾き: マウスが傾いていると、どの向きに振っても一振り目が同じ回転方向にずれる。
//   横向きの試行では「右へ振ると上、左へ振ると下」のように左右で逆向きの上下ずれになる。
//   左右とも同じ向き (どちらも上など) に流れるのは傾きではなく、腕の弧などによる流れ
function primaryLink(trials) {
  const t = trials.filter((x) => x.D0 > 6 && isFinite(x.gain) && x.gain > 0.2 && x.gain < 2);
  if (t.length < 8) return { gainMean: NaN, gainCV: NaN, gainNear: NaN, gainFar: NaN, tiltDeg: NaN, arcDrift: NaN, tiltN: 0 };
  const g = t.map((x) => x.gain);
  const near = t.filter((x) => x.D0 < 20).map((x) => x.gain);
  const far = t.filter((x) => x.D0 >= 40).map((x) => x.gain);
  // 目標の方向からの回転 (反時計回りが正) を、外れ値を除いた平均で見る
  const tmean = (a) => {
    const b = [...a].sort((x, y) => x - y);
    const k = Math.floor(b.length * 0.15);
    return mean(b.slice(k, b.length - k));
  };
  const horiz = t.filter((x) => Math.abs(x.ux) > 0.9);
  const tiltDeg = t.length >= 10 ? tmean(t.map((x) => x.angle)) : NaN;
  // 横向きの試行で、左右に関係なく同じ向きに流れる量 (上が正, 距離に対する割合)
  const arcDrift = horiz.length >= 6 ? tmean(horiz.map((x) => (x.perp / x.D0) * Math.sign(x.ux))) : NaN;
  return {
    gainMean: mean(g), gainCV: sd(g) / mean(g),
    gainNear: near.length >= 3 ? mean(near) : NaN, gainFar: far.length >= 3 ? mean(far) : NaN,
    tiltDeg, arcDrift, tiltN: t.length,
    tiltAbs: Math.abs(tiltDeg), arcAbs: Math.abs(arcDrift),
  };
}

// トラッキング中の傾きの影響: 目で補正し続けるので速度には残らず、
// 「右へ追うときは上、左へ追うときは下」のような、向きによる上下の位置のずれとして現れる (度, 右で上が正)
function trackTilt(S, sc) {
  if (!sc.move || !['strafe', 'adad', 'detect'].includes(sc.move.kind) || sc.field.pitch > 6) return NaN;
  const R = [], L = [];
  for (let i = 1; i < S.t.length; i++) {
    const tg = S.tg[i];
    if (!tg || !tg.length) continue;
    const j = indexAt(S, S.t[i] - 0.04);
    const dt = S.t[i] - S.t[j];
    if (dt <= 0) continue;
    const vx = (wrap(S.cx[i] - S.cx[j]) * Math.cos(S.cy[i] * DEG)) / dt;
    if (Math.abs(vx) < 5) continue;
    const g = tg[0];
    if (Math.abs(wrap(S.cx[i] - g[1])) > g[3] * 3) continue;
    (vx > 0 ? R : L).push(S.cy[i] - g[2]);
  }
  return R.length > 100 && L.length > 100 ? (median(R) - median(L)) / 2 : NaN;
}

function linfit(xs, ys) {
  const mx = mean(xs), my = mean(ys);
  let sxy = 0, sxx = 0;
  xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) ** 2; });
  const b = sxx ? sxy / sxx : 0;
  return { a: my - b * mx, b };
}

function clickMetrics(rec, sc) {
  const ev = rec.events;
  const shots = ev.filter((e) => e.type === 'shot' && !e.empty);
  const hits = shots.filter((e) => e.hit).length;
  const trials = analyzeClickTrials(rec, sc);
  const v = trials.filter((t) => t.valid && t.outcome);
  const m = {
    kills: ev.filter((e) => e.type === 'kill').length,
    shots: shots.length, hits, accuracy: shots.length ? hits / shots.length : 0,
    falseStarts: ev.filter((e) => e.type === 'shot' && e.empty).length,
    expired: ev.filter((e) => e.type === 'expire').length,
    avgMT: mean(trials.map((t) => t.totalMT)), medMT: median(trials.map((t) => t.totalMT)),
    aimMT: mean(trials.map((t) => t.MT)),
    searchRate: trials.length ? trials.filter((t) => t.searchTime > 0).length / trials.length : 0,
    searchTime: mean(trials.filter((t) => t.searchTime > 0).map((t) => t.searchTime)),
    cvMT: sd(trials.map((t) => t.MT)) / mean(trials.map((t) => t.MT)),
    onset: median(v.map((t) => t.onset).filter((x) => !isNaN(x))),
    overRate: v.length ? v.filter((t) => t.outcome === 'over').length / v.length : NaN,
    underRate: v.length ? v.filter((t) => t.outcome === 'under').length / v.length : NaN,
    onRate: v.length ? v.filter((t) => t.outcome === 'on').length / v.length : NaN,
    corrections: mean(v.map((t) => t.corrections)),
    perpErr: mean(v.map((t) => Math.abs(t.perp) / t.D0)),
    ...primaryLink(v),
    throughput: mean(trials.filter((t) => t.valid).map((t) => t.ID / t.MT)),
    nTrials: trials.length,
  };
  // フィッツの法則で距離・方向の影響を除いた残差から、相対的に苦手な距離帯・方向を探す
  const fv = trials.filter((t) => t.valid);
  if (fv.length >= 8) {
    const fit = linfit(fv.map((t) => t.ID), fv.map((t) => t.MT));
    m.fitts = fit;
    const resid = (arr) => (arr.length >= 3 ? mean(arr.map((t) => t.MT / Math.max(0.05, fit.a + fit.b * t.ID))) : NaN);
    m.byDist = {
      near: resid(fv.filter((t) => t.D0 < 12)),
      mid: resid(fv.filter((t) => t.D0 >= 12 && t.D0 < 40)),
      far: resid(fv.filter((t) => t.D0 >= 40)),
    };
    m.byDir = {};
    for (const d of ['left', 'right', 'up', 'down']) m.byDir[d] = resid(fv.filter((t) => t.dir === d));
    m.vertResid = resid(fv.filter((t) => t.vertShare > 0.5));
    m.horzResid = resid(fv.filter((t) => t.vertShare < 0.3));
  }
  // 前半と後半の比較 (集中・疲労)
  const half = rec.duration / 2;
  const k1 = ev.filter((e) => e.type === 'kill' && e.t < half).length;
  const k2 = ev.filter((e) => e.type === 'kill' && e.t >= half).length;
  m.fade = k1 ? (k2 - k1) / k1 : 0;
  if (sc.spawnDelay) {
    const rts = trials.map((t) => t.totalMT);
    m.rt = median(rts);
    m.bestRT = Math.min(...rts);
  }
  return { m, trials };
}

// ---------- トラッキング系 ----------
// 追従の遅れの内訳
// - 切り返し直後 0.4 秒を除いた「一定の動き」の区間で、照準が目標の何 ms 前の位置を追っているか (遅れ時間)
// - 目標の後ろで外れていた時間のうち、切り返し直後が占める割合
function lagBreakdown(S, reversals) {
  const n = S.t.length;
  const nearest = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    const tg = S.tg[i];
    if (!tg || !tg.length) continue;
    let best = null, bd = Infinity;
    for (const g of tg) {
      const d = Math.hypot(...vec(S.cx[i], S.cy[i], g[1], g[2])) / g[3];
      if (d < bd) { bd = d; best = g; }
    }
    nearest[i] = best;
  }
  let ri = 0;
  const afterRev = (t) => {
    while (ri < reversals.length - 1 && reversals[ri + 1] <= t) ri++;
    return reversals.length && reversals[ri] <= t && t - reversals[ri] < 0.4;
  };
  const steady = [];
  let behindSteady = 0, behindRev = 0;
  for (let i = 1; i < n; i++) {
    const g = nearest[i];
    const pg = g && targetIn(S, i - 1, g[0]);
    const dt = S.t[i] - S.t[i - 1];
    if (!pg || dt <= 0) continue;
    const tv = [wrap(g[1] - pg[1]) / dt, (g[2] - pg[2]) / dt];
    const tsp = Math.hypot(...tv);
    if (tsp < 4) continue;
    const e = vec(S.cx[i], S.cy[i], g[1], g[2]);
    const behind = Math.hypot(...e) > g[3] && (e[0] * tv[0] + e[1] * tv[1]) > 0;
    if (afterRev(S.t[i])) { if (behind) behindRev++; continue; }
    if (behind) behindSteady++;
    steady.push(i);
  }
  // 照準(t) と 目標(t-τ) のずれが最小になる τ を探す
  let bestTau = NaN, bestErr = Infinity;
  if (steady.length > 120) {
    const idx = steady.filter((_, k) => k % 2 === 0);
    for (let tau = 0; tau <= 0.4; tau += 0.01) {
      let sum = 0, cnt = 0;
      for (const i of idx) {
        const j = indexAt(S, S.t[i] - tau);
        const g = targetIn(S, j, nearest[i][0]);
        if (!g) continue;
        sum += Math.hypot(...vec(S.cx[i], S.cy[i], g[1], g[2]));
        cnt++;
      }
      if (cnt > idx.length * 0.6 && sum / cnt < bestErr) { bestErr = sum / cnt; bestTau = tau; }
    }
  }
  return {
    lagMs: bestTau,
    behindAfterRevShare: behindSteady + behindRev >= 60 ? behindRev / (behindSteady + behindRev) : NaN,
  };
}

// 切り返しへの反応の内訳
// 気づく (照準が減速し始める) → 反対へ動き出す → 行き過ぎずに合わせる、に分けて測る
// あわせて、目標が向きを変えていないのに照準が反転した回数 (先読みの疑い) を数える
function reversalBreakdown(S, revs, duration) {
  const n = S.t.length;
  const cvx = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const j = indexAt(S, S.t[i] - 0.04);
    const dt = S.t[i] - S.t[j];
    if (dt > 0) cvx[i] = (wrap(S.cx[i] - S.cx[j]) * Math.cos(S.cy[i] * DEG)) / dt;
  }
  const decel = [], turn = [], trans = [], gapShort = [], gapLong = [];
  let over = 0, overN = 0;
  revs.forEach((r, k) => {
    const gap = k ? r.t - revs[k - 1].t : Infinity;
    const pre = [];
    for (let i = r.i - 1; i >= 0 && S.t[i] > r.t - 0.15; i--) pre.push(-r.sign * cvx[i]);
    const v0 = mean(pre);
    if (!(v0 > 5)) return;
    let dl = NaN, tl = NaN, overshot = false;
    const nextT = k + 1 < revs.length ? revs[k + 1].t : Infinity; // 次の切り返しまでで区切る
    for (let i = r.i; i < n && S.t[i] < Math.min(r.t + 0.8, nextT); i++) {
      const dt = S.t[i] - r.t;
      if (isNaN(dl) && -r.sign * cvx[i] < 0.5 * v0) dl = dt;
      if (isNaN(tl) && r.sign * cvx[i] > 6) tl = dt;
      if (!isNaN(tl) && dt < tl + 0.5) {
        const g = targetIn(S, i, r.id);
        if (g && wrap(S.cx[i] - g[1]) * r.sign > g[3]) overshot = true;
      }
    }
    if (!isNaN(dl)) decel.push(dl);
    if (!isNaN(tl)) {
      turn.push(tl);
      if (!isNaN(dl)) trans.push(Math.max(0, tl - dl));
      (gap < 0.45 ? gapShort : gapLong).push(tl);
      overN++;
      if (overshot) over++;
    }
  });
  // 先読みの疑い: 目標に付いていた照準が、目標は向きを変えていないのに反転した
  let antic = 0;
  const k = 15;
  for (let i = k; i < n - k; i++) {
    const a = cvx[i - k], b = cvx[i + k];
    if (Math.sign(a) === Math.sign(b) || Math.sign(cvx[i]) === Math.sign(cvx[i - 1])) continue;
    const tg = S.tg[i];
    if (!tg || !tg.length) continue;
    const g = tg.reduce((p, q) => (Math.abs(wrap(q[1] - S.cx[i])) < Math.abs(wrap(p[1] - S.cx[i])) ? q : p));
    const pg = targetIn(S, i - k, g[0]);
    if (!pg) continue;
    const tvx = wrap(g[1] - pg[1]) / (S.t[i] - S.t[i - k]);
    if (Math.abs(tvx) < 6 || Math.abs(a) < Math.max(8, 0.4 * Math.abs(tvx)) || Math.abs(b) < Math.max(8, 0.4 * Math.abs(tvx))) continue;
    if (Math.sign(a) !== Math.sign(tvx)) continue; // 目標と同じ向きに動いていた照準が反転した
    // 直前 0.35 秒以内の切り返しへの普通の反応は除く
    if (revs.some((r) => r.id === g[0] && r.t > S.t[i] - 0.35 && r.t < S.t[i] + 0.03)) continue;
    if (wrap(S.cx[i] - g[1]) * Math.sign(tvx) > g[3] * 0.5) continue; // 追い越しからの戻りは除く
    if (Math.abs(wrap(S.cx[i] - g[1])) > g[3] * 2) continue;
    antic++;
    i += k;
  }
  const ok = revs.length >= 5;
  return {
    decelLat: ok ? median(decel) : NaN,
    transLat: ok ? median(trans) : NaN,
    revOvershoot: ok && overN >= 5 ? over / overN : NaN,
    rapidRatio: gapShort.length >= 4 && gapLong.length >= 4 ? median(gapShort) / median(gapLong) : NaN,
    anticipPerMin: ok ? antic / (duration / 60) : NaN,
  };
}

// 切り返し検知テスト
function detectMetrics(rec) {
  const cues = rec.events.filter((e) => e.type === 'cue');
  const presses = rec.events.filter((e) => e.type === 'press').map((e) => ({ t: e.t, used: false }));
  const rev = [], fl = [];
  let missRev = 0, missFlash = 0;
  const trials = [];
  cues.forEach((c, k) => {
    const next = cues.slice(k + 1).find((x) => !x.edge);
    const until = Math.min(c.t + 1.0, next ? next.t : Infinity);
    const p = presses.find((x) => !x.used && x.t >= c.t + 0.08 && x.t <= until);
    if (p) p.used = true;
    if (c.edge) return;
    if (!p) { if (c.kind === 'flash') missFlash++; else missRev++; return; }
    const rt = p.t - c.t;
    (c.kind === 'flash' ? fl : rev).push(rt);
    trials.push({ MT: rt, totalMT: rt, outcome: c.kind });
  });
  const rtReverse = median(rev), rtFlash = median(fl);
  return {
    m: {
      rtReverse, rtFlash, motionCost: rtReverse - rtFlash, nReverse: rev.length, nFlash: fl.length,
      missRev, missFlash, falseClicks: presses.filter((p) => !p.used).length, kills: rev.length + fl.length,
    },
    trials,
  };
}

function trackMetrics(rec, sc) {
  const S = rec.samples;
  let tot = 0, on = 0, onFire = 0, fire = 0;
  let behind = 0, ahead = 0, alongSum = 0, alongN = 0;
  let ex = 0, ey = 0, eN = 0, relV = 0, tV = 0, rvN = 0;
  const errSeries = [];
  const reversals = [];
  const revInfo = [];
  let prevVx = null, prevId = null;
  let pendingRev = null;
  const lat = [];
  for (let i = 1; i < S.t.length; i++) {
    const dt = S.t[i] - S.t[i - 1];
    const tg = S.tg[i];
    if (!tg || !tg.length || dt <= 0) continue;
    const cx = S.cx[i], cy = S.cy[i];
    let best = null, bd = Infinity;
    for (const g of tg) {
      const d = Math.hypot(...vec(cx, cy, g[1], g[2])) / g[3];
      if (d < bd) { bd = d; best = g; }
    }
    const e = vec(cx, cy, best[1], best[2]);
    const d = Math.hypot(...e);
    const isOn = d <= best[3];
    tot += dt;
    if (isOn) on += dt;
    if (S.f[i]) { fire += dt; if (isOn) onFire += dt; }
    if (i % 3 === 0) errSeries.push([S.t[i], d / best[3]]);
    const pg = targetIn(S, i - 1, best[0]);
    if (!pg) { prevVx = null; continue; }
    const tv = [wrap(best[1] - pg[1]) / dt, (best[2] - pg[2]) / dt];
    const cv = vec(S.cx[i - 1], S.cy[i - 1], cx, cy).map((v) => v / dt);
    const tsp = Math.hypot(...tv);
    if (d < best[3] * 3) {
      ex += Math.abs(e[0]); ey += Math.abs(e[1]); eN++;
      relV += Math.hypot(cv[0] - tv[0], cv[1] - tv[1]); tV += tsp; rvN++;
    }
    if (tsp > 4 && !isOn && d < best[3] * 4) {
      const along = (e[0] * tv[0] + e[1] * tv[1]) / tsp;
      if (along > 0) behind++; else ahead++;
      alongSum += along / best[3]; alongN++;
    }
    // 切り返し (水平速度の符号反転) への追従遅れ
    if (prevId === best[0] && prevVx !== null && Math.abs(prevVx) > 4 && Math.abs(tv[0]) > 4 && Math.sign(prevVx) !== Math.sign(tv[0])) {
      pendingRev = { t: S.t[i], sign: Math.sign(tv[0]) };
      reversals.push(S.t[i]);
      revInfo.push({ t: S.t[i], i, sign: Math.sign(tv[0]), id: best[0] });
    }
    if (pendingRev) {
      if (Math.sign(cv[0]) === pendingRev.sign && Math.abs(cv[0]) > 6) { lat.push(S.t[i] - pendingRev.t); pendingRev = null; }
      else if (S.t[i] - pendingRev.t > 0.6) pendingRev = null;
    }
    prevVx = tv[0]; prevId = best[0];
  }
  const kills = rec.events.filter((e) => e.type === 'kill').length;
  const half = rec.duration / 2;
  const segOn = (a, b) => {
    let t = 0, o = 0;
    for (let i = 1; i < S.t.length; i++) {
      if (S.t[i] < a || S.t[i] >= b) continue;
      const tg = S.tg[i];
      if (!tg || !tg.length) continue;
      const dt = S.t[i] - S.t[i - 1];
      t += dt;
      if (tg.some((g) => Math.hypot(...vec(S.cx[i], S.cy[i], g[1], g[2])) <= g[3])) o += dt;
    }
    return t ? o / t : 0;
  };
  const h1 = segOn(0, half), h2 = segOn(half, rec.duration);
  return {
    m: {
      onRatio: tot ? on / tot : 0, fireOnRatio: tot ? onFire / tot : 0, fireRatio: tot ? fire / tot : 0,
      behindRate: behind + ahead >= 60 ? behind / (behind + ahead) : NaN,
      lagNorm: alongN ? alongSum / alongN : 0,
      vertErrShare: eN ? ey / (ex + ey) : NaN,
      jitter: rvN && tV ? relV / tV : NaN,
      reversalLatency: median(lat), reversals: reversals.length,
      ...lagBreakdown(S, reversals),
      ...reversalBreakdown(S, revInfo, rec.duration),
      tiltOffset: trackTilt(S, sc),
      tiltAbs: NaN,
      kills, fade: h1 ? (h2 - h1) / h1 : 0,
    },
    errSeries,
  };
}

// ---------- スコアと上級者比 ----------
// スコアはゲームとしての得点。上級者比 (res.rating) は、各シナリオの主な指標が
// 「上級者の目安」(reference.js で共通の前提値から計算) の何 % かで決める。
// 時間の指標は 目安 ÷ 自分、割合の指標は 自分 ÷ 目安 なので、どのシナリオでも
// 「目安より 2 割遅い・少ない」がおおむね同じ上級者比になる。
const accMult = (acc) => 0.4 + 0.6 * acc * acc;
const speedBonus = (mts) => mts.reduce((s, mt) => s + 60 * Math.max(0, 1 - mt / 1.2), 0);
function clickScore(kills, mts, acc) {
  return Math.round((kills * 100 + speedBonus(mts)) * accMult(acc));
}

// 記録された指標から上級者比を計算する (過去の記録の再計算にも使う)
export function computeRating(sc, m, duration) {
  const ref = expertRef(sc);
  const pos = (x) => (x > 0 && isFinite(x) ? x : 0);
  let r;
  if (sc.type === 'detect') {
    const t = 0.7 * pos(ref.rt / m.rtReverse) + 0.3 * pos(ref.flashRt / m.rtFlash);
    const n = (m.nReverse || 0) + (m.nFlash || 0) + (m.missRev || 0) + (m.missFlash || 0);
    r = t * Math.max(0, 1 - (n ? ((m.falseClicks || 0) + (m.missRev || 0) + (m.missFlash || 0)) / n : 0));
  } else if (sc.type === 'track') {
    r = pos(m.fireOnRatio / ref.ratio);
    if (ref.killsPerMin) r = 0.5 * r + 0.5 * pos(m.kills / ((ref.killsPerMin * duration) / 60));
  } else if (sc.spawnDelay) {
    const n = (m.kills || 0) + (m.expired || 0);
    r = pos(ref.rt / m.rt) * Math.max(0, 1 - (n ? ((m.falseStarts || 0) + (m.expired || 0)) / n : 0));
  } else {
    const expected = duration / ref.mt;
    r = pos(m.kills / expected) * (accMult(m.accuracy || 0) / accMult(ref.acc));
  }
  return Math.max(0, Math.round(r * 1000) / 10);
}

// 自分が移動するシナリオの指標
function moveMetrics(rec, sc) {
  const S = rec.samples, ps = S.ps || [], pc = S.pc || [];
  if (!ps.length) return {};
  const m = { movingRatio: ps.filter((v) => v >= 0.5).length / ps.length };
  if (sc.type === 'click') {
    const shots = rec.events.filter((e) => e.type === 'shot' && !e.empty && e.spd != null);
    m.movingShotRate = shots.length ? shots.filter((e) => e.spd > 0.3).length / shots.length : NaN;
    // 止まってから撃つまで: 撃った時点から遡り、速さが 30% を超えていた最後の時刻との差
    const waits = [];
    for (const e of shots.filter((x) => x.spd <= 0.3)) {
      let i = indexAt(S, e.t);
      while (i > 0 && ps[i] <= 0.3 && S.t[i] > e.t - 2) i--;
      if (ps[i] > 0.3) waits.push(e.t - S.t[i]);
    }
    m.stopToShot = median(waits);
    // 止まり方: 速さが 80% 以上から 30% 以下に落ちるまでの時間と、その間に逆方向のキーを押したか
    const stops = [], counters = [];
    for (let i = 1; i < ps.length; i++) {
      if (ps[i - 1] >= 0.8 && ps[i] < 0.8) {
        let j = i, used = false;
        while (j < ps.length && ps[j] > 0.3 && ps[j] <= ps[j - 1] + 0.02 && S.t[j] - S.t[i] < 0.6) { if (pc[j]) used = true; j++; }
        if (j < ps.length && ps[j] <= 0.3) { stops.push(S.t[j] - S.t[i]); counters.push(used ? 1 : 0); }
      }
    }
    m.stopTime = median(stops);
    m.counterRate = counters.length >= 4 ? mean(counters) : NaN;
    m.stops = counters.length;
  } else {
    // 自分が動いているときと止まっているときの、目標に乗っている割合
    let onM = 0, nM = 0, onS = 0, nS = 0, dmg = 0, nAll = 0;
    for (let i = 0; i < ps.length; i++) {
      const tg = S.tg[i];
      if (!tg || !tg.length) continue;
      const on = tg.some((g) => Math.hypot(...vec(S.cx[i], S.cy[i], g[1], g[2])) <= g[3]);
      nAll++;
      if (on && S.f[i] && ps[i] >= 0.5) dmg++;
      if (ps[i] >= 0.5) { nM++; if (on) onM++; } else if (ps[i] < 0.2) { nS++; if (on) onS++; }
    }
    m.onMoving = nM > 100 ? onM / nM : NaN;
    m.onStill = nS > 100 ? onS / nS : NaN;
    // 「移動中だけダメージ」のシナリオでは、移動中に当てていた時間だけを命中時間とする
    if (sc.player.requireMoving && nAll) m.fireOnRatio = dmg / nAll;
  }
  return m;
}

export function analyze(rec, sc) {
  const res = { scenarioId: sc.id, category: sc.category, type: sc.type };
  const ref = expertRef(sc);
  res.ref = ref;
  if (sc.type === 'detect') {
    const { m, trials } = detectMetrics(rec);
    res.metrics = m;
    res.trials = trials;
    res.paths = [];
    const pts = Math.round(trials.reduce((s, t) => s + Math.max(0, 800 - t.MT * 1000), 0));
    res.score = Math.max(0, pts - m.falseClicks * 100 - (m.missRev + m.missFlash) * 50);
    res.breakdown = [
      { label: '検知点', expr: `${trials.length} 回 × (800 − 反応ms)`, val: pts },
      ...(m.falseClicks ? [{ label: 'フライング', expr: `${m.falseClicks} × −100`, val: -m.falseClicks * 100 }] : []),
      ...(m.missRev + m.missFlash ? [{ label: '見逃し', expr: `${m.missRev + m.missFlash} × −50`, val: -(m.missRev + m.missFlash) * 50 }] : []),
    ];
    res.gaps = [
      { label: '切り返しの検知', you: m.rtReverse, ref: ref.rt, unit: 'ms', better: 'lower' },
      { label: '光の検知', you: m.rtFlash, ref: ref.flashRt, unit: 'ms', better: 'lower' },
    ];
  } else if (sc.type === 'track') {
    const { m, errSeries } = trackMetrics(rec, sc);
    if (sc.player) Object.assign(m, moveMetrics(rec, sc));
    res.metrics = m;
    res.errSeries = errSeries;
    const hasKills = sc.hpTime && isFinite(sc.hpTime);
    const onPts = Math.round(m.fireOnRatio * 10000);
    res.score = onPts + (hasKills ? m.kills * 150 : 0);
    res.breakdown = [
      { label: '命中時間', expr: `${(m.fireOnRatio * 100).toFixed(1)}% × 100`, val: onPts },
      ...(hasKills ? [{ label: '撃破', expr: `${m.kills} × 150`, val: m.kills * 150 }] : []),
    ];
    res.gaps = [
      { label: '射撃中の命中時間', you: m.fireOnRatio, ref: ref.ratio, unit: '%', better: 'higher' },
      ...(hasKills ? [{ label: '撃破数', you: m.kills, ref: Math.round((ref.killsPerMin * rec.duration) / 60), unit: '体', better: 'higher' }] : []),
    ];
  } else {
    const { m, trials } = clickMetrics(rec, sc);
    res.metrics = m;
    res.trials = trials.map(({ path, ...t }) => t);
    res.paths = trials.filter((t) => t.path).slice(-40).map((t) => ({ p: t.path, o: t.outcome }));
    if (sc.spawnDelay) {
      const pts = Math.round(trials.reduce((s, t) => s + Math.max(0, 700 - t.totalMT * 1000), 0));
      res.score = Math.max(0, pts - m.falseStarts * 100 - m.expired * 50);
      res.breakdown = [
        { label: '反応点', expr: `${trials.length} 体 × (700 − 撃破ms)`, val: pts },
        ...(m.falseStarts ? [{ label: 'フライング', expr: `${m.falseStarts} × −100`, val: -m.falseStarts * 100 }] : []),
        ...(m.expired ? [{ label: '見逃し', expr: `${m.expired} × −50`, val: -m.expired * 50 }] : []),
      ];
      res.gaps = [
        { label: '撃破まで (中央値)', you: m.rt, ref: ref.rt, unit: 'ms', better: 'lower' },
        { label: 'フライング', you: m.falseStarts, ref: 0, unit: '回', better: 'lower' },
      ];
    } else {
      const mts = trials.map((t) => t.totalMT);
      res.score = clickScore(m.kills, mts, m.accuracy);
      res.breakdown = [
        { label: '撃破', expr: `${m.kills} × 100`, val: m.kills * 100 },
        { label: '速さボーナス', expr: '1.2 秒より速い分', val: Math.round(speedBonus(mts)) },
        { label: '命中補正', expr: `命中率 ${Math.round(m.accuracy * 100)}%`, mult: Math.round(accMult(m.accuracy) * 100) / 100 },
      ];
      res.gaps = [
        { label: '1 体あたりの時間', you: m.avgMT, ref: ref.mt, unit: 'ms', better: 'lower' },
        { label: '命中率', you: m.accuracy, ref: ref.acc, unit: '%', better: 'higher' },
      ];
    }
  }
  if (sc.player && sc.type !== 'track') Object.assign(res.metrics, moveMetrics(rec, sc));
  res.rating = computeRating(sc, res.metrics, rec.duration);
  res.rank = rankOf(res.rating).name;
  return res;
}
