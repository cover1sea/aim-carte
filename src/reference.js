// 上級者の目安を、全シナリオ共通の前提値から計算する
// シナリオごとに目安を手で決めると甘さ・厳しさがばらばらになるため、
// クリック系はフィッツの法則、トラッキング系は「切り返しへの反応の遅れ」と「定常の追従誤差」のモデルで求める。
// 前提値はいずれも推定で、実測による較正はしていない。

export const EXPERT = {
  // 照準移動のスループット (bits/s) と反応 (s)。tp 8・rt 0.2 で、経験のある FPS プレイヤーの計測
  // (Boudaoud et al., 2022: 7〜25° の目標で 1 体 0.4〜0.8 秒) とおおむね合う。
  // 上級者はその経験者が上級者比 70% 前後 (ダイヤモンド付近) になる水準と置く
  // (以前の 2 割増しの設定では、経験者がマスターになり甘すぎた)
  tp: 13,
  rt: 0.17,
  switchRt: 0.05, // 見えている次の目標へ移るときの判断 (s)
  sysLat: 0.03, // マウス・表示などの機器の遅延 (s)。計測値に含まれる分
  acc: 0.92, // 命中率
  revRt: 0.15, // 切り返しに手が反応するまで (s)。目の追従は約 90〜130ms (Soechting et al., 2005) に手の遅れを加えた推定
  catchUp: 3, // 切り返し後に追いつくときの照準の速さ (目標の速さの何倍)
  sigma0: 0.12, // 定常の追従誤差の基本量 (度)
  sigmaV: 0.015, // 目標の速さ 1 度/秒あたりの追従誤差の増分 (度)
  anticipRt: 0.03, // 一定のリズムで切り返す (予測できる) 目標への反応の遅れ (s)
  turnRate: 1.2, // 曲線的に動く目標の向きの変わる速さ (rad/s, 平均的な値)
  flashRt: 0.17, // 光 (色の変化) への反応 (s)。出現への反応 rt と同じ値
  motionExtra: 0.04, // 動きの変化に気づくのにかかる上乗せ (s)
  stopTime: 0.12, // 移動から止まって撃てる状態になるまで (s, 推定)
  playerSpeed: 5.4, // 自分の移動速度 (m/s)
  playerReversals: 1, // 自由に動くときの自分の切り返し (回/秒, 推定)
  movingShare: 0.9, // 「移動中だけダメージ」のシナリオで移動している割合 (推定)
};

// 再現性のため固定の乱数でサンプルする
function lcg(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const radiusOf = (sc) => (Array.isArray(sc.radius) ? (sc.radius[0] + sc.radius[1]) / 2 : sc.radius);

// 目標どうし・照準からの平均の難易度 (ID)
function meanID(sc, extra = 0) {
  const rnd = lcg(12345);
  const W = 2 * radiusOf(sc);
  const f = sc.field;
  const ids = [];
  for (let k = 0; k < 4000; k++) {
    let D;
    if (sc.spawn.relative) {
      D = sc.spawn.minDist + rnd() * (sc.spawn.maxDist - sc.spawn.minDist);
    } else {
      // 倒した目標の位置から、残りの目標のうち一番近いものへ移る
      const p = [(rnd() * 2 - 1) * f.yaw, (rnd() * 2 - 1) * f.pitch];
      D = Infinity;
      for (let j = 0; j < Math.max(1, sc.targets - 1); j++) {
        const q = [(rnd() * 2 - 1) * f.yaw, (rnd() * 2 - 1) * f.pitch];
        D = Math.min(D, Math.hypot(p[0] - q[0], p[1] - q[1]));
      }
      D = Math.max(D, W * 2);
    }
    ids.push(Math.log2((D + extra) / W + 1));
  }
  return mean(ids);
}

function movingSpeed(mv) {
  if (!mv || mv.kind === 'none') return 0;
  return mv.kind === 'mixed' ? mv.speed * 0.75 : mv.speed; // mixed は 4 回に 3 回が動く
}

// 切り返し 1 回あたりに目標から外れる時間
function offPerReversal(v, r, E = EXPERT) {
  if (v <= 0) return 0;
  const g = 2 * v * E.revRt; // 反応するまでに開く距離
  const before = Math.max(0, E.revRt - r / (2 * v));
  const after = Math.max(0, (g - r) / ((E.catchUp - 1) * v));
  return before + after;
}

// 1 秒あたりの切り返し回数
function reversalRate(sc) {
  const mv = sc.move;
  const avgInt = mv.changeMin != null ? (mv.changeMin + mv.changeMax) / 2 : 1;
  // 出現範囲の端での折り返しは予測できるので、ここでは数えない (edgeRate で別に扱う)
  if (mv.kind === 'adad') return 1 / avgInt;
  if (mv.kind === 'strafe') return 0.6 / avgInt;
  return 0;
}
function edgeRate(sc) {
  const mv = sc.move;
  if (mv.kind !== 'adad' && mv.kind !== 'strafe') return 0;
  return (mv.speed / (2 * sc.field.yaw)) * (mv.kind === 'adad' ? 0.2 : 1);
}

// 定常の追従で目標に乗っている割合 (照準のずれを 2 次元の正規分布とみなす)
function steadyOn(sc, E = EXPERT) {
  const v = sc.move.speed, r = radiusOf(sc);
  let s = E.sigma0 + E.sigmaV * v;
  if (sc.move.kind === 'smooth') {
    const curv = 0.5 * v * E.turnRate * E.revRt * E.revRt; // 曲がりに遅れて付いていく分のずれ
    s = Math.hypot(s, curv);
  }
  return 1 - Math.exp(-(r * r) / (2 * s * s));
}

// シナリオの上級者の目安と、その計算の内訳
export function expertRef(sc, E = EXPERT) {
  const ms = (x) => `${Math.round(x * 1000)}ms`;
  if (sc.type === 'detect') {
    const flash = E.flashRt + E.sysLat;
    const rev = flash + E.motionExtra;
    return { rt: rev, flashRt: flash,
      summary: `切り返しの検知 ${ms(rev)}・光の検知 ${ms(flash)}`,
      formula: `光: 反応 ${ms(E.flashRt)} + 機器の遅延 ${ms(E.sysLat)}。切り返し: 光 + 動きの変化に気づく上乗せ ${ms(E.motionExtra)}` };
  }
  if (sc.type === 'click') {
    const v = movingSpeed(sc.move);
    const id = meanID(sc, v * 0.15);
    let a = (sc.spawnDelay || sc.spawn.relative || sc.targets === 1 ? E.rt : E.switchRt) + E.sysLat;
    const stop = sc.player && sc.player.moveInaccuracy ? E.stopTime : 0; // 止まってから撃つ分
    a += stop;
    const mt = a + id / E.tp;
    if (sc.spawnDelay) {
      return { rt: mt, summary: `出現から撃破まで ${ms(mt)}`,
        formula: `反応 ${ms(a - E.sysLat)} + 機器の遅延 ${ms(E.sysLat)} + 平均難易度 ${id.toFixed(2)} bits ÷ ${E.tp} bits/s` };
    }
    return { mt, acc: E.acc, summary: `1 体 ${ms(mt)}・命中率 ${Math.round(E.acc * 100)}%`,
      formula: `${a - E.sysLat - stop > 0.1 ? '反応' : '次の目標を選ぶ判断'} ${ms(a - E.sysLat - stop)}${stop ? ` + 止まる ${ms(stop)}` : ''} + 機器の遅延 ${ms(E.sysLat)} + 平均難易度 ${id.toFixed(2)} bits ÷ ${E.tp} bits/s${v ? ` (動く目標は照準を動かす間の移動分 ${(v * 0.15).toFixed(1)}° を距離に加算)` : ''}` };
  }
  // トラッキング
  const v = sc.move.speed, r = radiusOf(sc);
  const on = steadyOn(sc, E);
  const R = reversalRate(sc);
  // 一定のリズムで切り返す目標は先読みできるので、反応の遅れをほぼ 0 とみなす
  const off = sc.move.fixed ? offPerReversal(v, r, { ...E, revRt: E.anticipRt }) : offPerReversal(v, r, E);
  let loss = R * off + edgeRate(sc) * offPerReversal(v, r, { ...E, revRt: E.anticipRt });
  let moveNote = '';
  if (sc.player) {
    // 自分の移動 (5.4m/s、20m 先の目標) で目標が見かけ上 約 15°/秒 で流れ、自分の切り返しのたびに外れる
    const vp = (E.playerSpeed / 20) * (180 / Math.PI);
    const Rp = sc.player.mode === 'auto' ? 1 / ((sc.player.changeMin + sc.player.changeMax) / 2) : E.playerReversals;
    // 自分で動くときは、自分の切り返しを事前に分かっているので、予測できる切り返しとして扱う
    const offP = offPerReversal(vp, r, sc.player.mode === 'auto' ? E : { ...E, revRt: E.anticipRt });
    loss += Rp * offP;
    moveNote = ` − 自分の切り返し ${Rp.toFixed(2)} 回/秒 × ${ms(offP)}/回`;
  }
  loss = Math.min(0.9, loss);
  let ratio = on * (1 - loss) * (sc.player && sc.player.requireMoving ? E.movingShare : 1);
  let kills = 0, sw = 0;
  if (sc.hpTime && isFinite(sc.hpTime)) {
    sw = E.switchRt + E.sysLat + meanID(sc, v * 0.15) / E.tp; // 次の目標へ移る時間
    const cycle = sc.hpTime / ratio + sw;
    kills = 60 / cycle; // 1 分あたり
    ratio = sc.hpTime / cycle;
  }
  return {
    ratio, killsPerMin: kills,
    summary: `射撃中の命中時間 ${Math.round(ratio * 100)}%${kills ? `・撃破 ${kills.toFixed(0)} 体/分` : ''}`,
    formula: `定常の追従で乗っている割合 ${Math.round(on * 100)}% × (1 − 切り返し ${R.toFixed(2)} 回/秒 × 外れる時間 ${ms(off)}/回${moveNote})` +
      (sc.player && sc.player.requireMoving ? ` × 移動している割合 ${Math.round(E.movingShare * 100)}%` : '') +
      (kills ? `。目標を倒すと次へ移るのに ${ms(sw)}` : ''),
  };
}
