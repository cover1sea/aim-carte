// 理論に沿ったトレーニングメニュー
// 構成: ウォームアップ → 集中練習 (1 つの意識だけ) → ミックス練習 → 確認
// 意識すること (cue) は、体の動きより「目標や照準の動き」に注意を向ける外的焦点の言い方で書く (Wulf, 2013)
// cue ごとに根拠 (feedback.js の REFERENCES のキー) を持たせる。'rule' は出典で確かめていない本アプリの経験則
import { BASE_SCENARIOS, getScenario } from './scenarios.js';
import { generateScenario } from './feedback.js';

export const PHASES = {
  warmup: { name: 'ウォームアップ', color: '#3fd0ff',
    why: '簡単な課題で目と手を慣らします。ここでは成績を気にしません。競技エイムのコミュニティでは、練習の最初に簡単なシナリオで 5〜10 分ほど慣らすことが広く勧められています (研究で効果が確かめられた手順ではありません)。' },
  focus: { name: '集中練習', color: '#ff5d73',
    why: '苦手な要素だけを繰り返し、意識することを 1 つに絞ります。明確な目標と、結果をすぐ確かめることが上達の条件です (意図的練習: Ericsson et al., 1993)。' },
  mixed: { name: 'ミックス練習', color: '#b07cff',
    why: '要素が混ざった課題で、集中練習の意識を実戦に近い形で使います。課題を混ぜると練習中の成績は下がりやすいですが、身につきやすく実戦にも移りやすくなります (文脈干渉効果: Shea & Morgan, 1979)。' },
  check: { name: '確認', color: '#2ee6a6',
    why: '最初と同じ課題で今日の変化を確かめます。ただし練習直後の成績と本当の上達は別もので、上達は翌日以降の成績に表れます (Schmidt & Bjork, 1992)。' },
};

const c = (text, src) => ({ text, src });

// シナリオごとの基本の意識
export const SCENARIO_CUES = {
  flick_static: c('目標に近づくにつれて減速し、照準が目標の上で止まってから撃つ', ['aimlabsSmooth']),
  flick_wide: c('一回の振りで目標のすぐ手前まで運び、最後に小さく一度だけ合わせる', ['meyer', 'aimlabsBasics']),
  micro_precision: c('照準が目標の上で止まったのを見てから撃つ', ['fitts']),
  switching_grid: c('1 体を確実に倒してから次へ。最初は正確さ、慣れたら速さを上げる', ['aimlabsSwitch', 'voltaic']),
  switching_moving: c('照準が届くころに目標がどこにいるかを見越して振る', ['aimlabsSwitch']),
  track_smooth: c('照準を目標の上に乗せ、目標と同じ速さで運び続ける', ['aimlabsSmooth', 'voltaic']),
  track_precise: c('目標の速さに合わせて滑らかに動かす。外れても急に引き戻さない', ['aimlabsControl', 'voltaic']),
  track_reactive: c('先読みせず、目標の実際の動きに合わせる。切り返しは見てから追う', ['aimlabsReactive', 'voltaic']),
  track_switch: c('倒したら、照準が届くころの次の目標の位置へ振る', ['aimlabsSwitch']),
  reaction: c('出る位置やタイミングを予想せず、見えてから撃つ', ['rt']),
  line_horizontal: c('照準の高さを変えずに、センサーが真横に動くように振る', ['sensorTilt']),
  line_vertical: c('左右にぶれずに、センサーが真上・真下に動くように振る', ['sensorTilt']),
  track_horizontal: c('上下にぶれず、センサーを真横に滑らせて追う', ['sensorTilt']),
  counter_strafe: c('動く → 止まる → 撃つ。止まる前から照準を目標へ寄せておく', ['valMove', 'rule']),
  move_track_auto: c('自分が動く分だけ目標は反対へ流れる。その分を照準で打ち消す', ['owRelative', 'rule']),
  move_track_free: c('A・D を押し続け、自分の移動で流れる分を照準で打ち消しながら追う', ['owRelative', 'rule']),
  reversal_detect: c('マウスは動かさず目標そのものを見て、切り返した瞬間・光った瞬間にクリックする', ['rule']),
  combat_mix: c('目標ごとに「止めて撃つ」か「追い続ける」かを見分ける', ['rule']),
};

const g = (metric, op, value, label) => ({ metric, op, value, label });

// 弱点ごとの集中練習: 生成シナリオの種類・意識・目標
export const WEAK_DRILLS = {
  overshoot: { gen: 'overshoot', cue: c('目標に近づくにつれて減速し、少し手前で止めてから小さく詰める', ['elliott', 'aimlabsSmooth']), goal: g('overRate', '<=', 0.3, '行き過ぎ率 30% 以下') },
  undershoot: { gen: 'undershoot', cue: c('一回目の振りで目標のすぐ手前まで届かせ、そこから一度だけ小さく合わせる', ['meyer']), goal: g('corrections', '<=', 1.0, '修正回数 1.0 回/体 以下') },
  accuracy: { gen: 'accuracy', cue: c('照準が目標の上で止まったのを見てから撃つ', ['fitts', 'aimlabsSwitch']), goal: g('accuracy', '>=', 0.88, '命中率 88% 以上') },
  slow: { gen: 'speed', cue: c('命中率を大きく落とさない範囲で、少しずつテンポを上げる', ['aimlabsSwitch', 'fitts']), goal: g('accuracy', '>=', 0.82, '命中率 82% 以上を保ってテンポを上げる') },
  onset: { gen: 'onset', cue: c('目標が見えたらすぐ動き出す。最初の動きは大まかでよい', ['rule']), goal: g('onset', '<=', 0.28, '動き出し 280ms 以内') },
  far: { gen: 'far', cue: c('大きく振って目標の手前まで運び、最後の数度だけ細かく合わせる', ['meyer', 'rule']), goal: g('corrections', '<=', 1.0, '修正回数 1.0 回/体 以下') },
  near: { gen: 'near', cue: c('マウスを強く握らず、照準を小さく押し出すように合わせる', ['aimlabsSmooth', 'rule']), goal: g('accuracy', '>=', 0.85, '命中率 85% 以上') },
  curve: { base: 'flick_static', cue: c('照準から目標へまっすぐな線を引くように振る', ['exputer']), goal: g('perpErr', '<=', 0.1, '軌道の横ずれ 10% 以下') },
  vertical: { gen: 'vertical', cue: c('上下の目標でも、左右と同じように振って止める', ['voltaic', 'rule']), goal: g('overRate', '<=', 0.35, '行き過ぎ率 35% 以下') },
  lag: { gen: 'lag', cue: c('速さはそのままで一度だけ前へ詰めて目標に重ね、そのまま同じ速さで運ぶ', ['orban', 'aimlabsControl']), goal: g('lagMs', '<=', 0.06, '一定の動きでの遅れ 60ms 以内') },
  lead: { gen: 'lead', cue: c('先読みしすぎず、目標の実際の位置に照準を合わせる', ['aimlabsReactive', 'aimlabsTrackOW']), goal: g('behindRate', '>=', 0.4, '追い越しの割合 60% 以下') },
  reversal: { gen: 'reversal', cue: c('先読みせず、切り返しを見てから追う。急停止せず、減速してから反対へ加速する', ['aimlabsReactive', 'aimlabsSmooth']), goal: g('reversalLatency', '<=', 0.22, '切り返し反応 220ms 以内') },
  jitter: { gen: 'jitter', cue: c('握る力を見直し、一定の速さで滑らせる。外れても急に引き戻さない', ['aimlabsSmooth', 'aimlabsControl']), goal: g('jitter', '<=', 0.7, 'ブレ指数 0.70 以下') },
  vtrack: { gen: 'vertical_track', cue: c('目標の高さの変化にも照準を合わせ続ける', ['voltaic']), goal: g('vertErrShare', '<=', 0.45, '縦ずれの割合 45% 以下') },
  reaction: { gen: 'onset', cue: c('出る位置やタイミングを予想せず、見えてから振って撃つ', ['rt']), goal: g('onset', '<=', 0.28, '動き出し 280ms 以内') },
  falsestart: { base: 'reaction', cue: c('目標が見えてから撃つ。タイミングを予想しない', ['rt']), goal: g('falseStarts', '<=', 1, 'フライング 1 回以下') },
  revDetect: { gen: 'adad_slow', cue: c('照準ではなく目標そのものを見て、切り返しを見てから追う', ['yang2025', 'aimlabsReactive']), goal: g('decelLat', '<=', 0.2, '切り返しに気づくまで 200ms 以内') },
  revTurn: { gen: 'adad_rhythm', cue: c('止まり切らず、減速したらそのまま反対へ加速する', ['aimlabsSmooth']), goal: g('transLat', '<=', 0.12, '気づいて反対へ 120ms 以内') },
  revOvershoot: { gen: 'adad_slow', cue: c('切り返したら、目標と同じ速さまでで止める。一気に振らない', ['aimlabsSmooth']), goal: g('revOvershoot', '<=', 0.3, '切り返し後の行き過ぎ 30% 以下') },
  revRapid: { gen: 'adad_fast', cue: c('短い切り返しでは大きく追わず、中心付近で小さく往復する', ['rule']), goal: g('reversalLatency', '<=', 0.25, '切り返し反応 250ms 以内') },
  anticipate: { gen: 'adad_slow', cue: c('目標が向きを変えるまで今の動きを続ける。読みで切り返さない', ['aimlabsReactive', 'aimlabsControl']), goal: g('anticipPerMin', '<=', 4, '先読みの反転 4 回/分 以下') },
  motionPerception: { base: 'reversal_detect', cue: c('目標の輪郭そのものを見て、動きが止まりかけた瞬間を捉える', ['yang2025', 'rule']), goal: g('rtReverse', '<=', 0.35, '切り返しの検知 350ms 以内') },
  generalReaction: { base: 'reversal_detect', cue: c('合図を見たら迷わずクリックする', ['rt']), goal: g('rtFlash', '<=', 0.32, '光の検知 320ms 以内') },
  gainVar: { base: 'flick_static', cue: c('一振り目だけに集中し、毎回同じ感覚で目標のすぐ手前まで届かせる', ['meyer', 'rule']), goal: g('gainCV', '<=', 0.2, '一振り目のばらつき 0.20 以下') },
  gainRange: { gen: 'far', cue: c('遠い目標は思い切って大きく、近い目標は小さく振る', ['rule']), goal: g('gainCV', '<=', 0.2, '一振り目のばらつき 0.20 以下') },
  mouseTilt: { base: 'line_horizontal', cue: c('照準の高さを変えずに、センサーが真横に動くように振る', ['sensorTilt']), goal: g('tiltAbs', '<=', 1.5, 'マウスの傾き 1.5° 以内') },
  arcDrift: { base: 'line_horizontal', cue: c('マウス本体の軌道は弧でもよいので、センサーが真横に動くことだけを意識する', ['sensorTilt']), goal: g('arcAbs', '<=', 0.04, '上下の流れ 4% 以内') },
  moveShoot: { gen: 'moveStop', cue: c('撃つ前に止まる。動いている間に照準を目標へ寄せておく', ['valMove', 'rule']), goal: g('movingShotRate', '<=', 0.1, '動きながら撃つ割合 10% 以下') },
  stopShot: { gen: 'moveStop', cue: c('止まる前から照準を合わせ始め、止まった瞬間に撃つ', ['rule']), goal: g('stopToShot', '<=', 0.2, '止まってから撃つまで 200ms 以内') },
  noCounter: { base: 'counter_strafe', cue: c('止まるときは、逆方向のキーを一瞬だけ押す', ['valMove']), goal: g('counterRate', '>=', 0.6, 'カウンターストレイフ 60% 以上') },
  moveTrack: { gen: 'moveTrack', cue: c('自分が動く分だけ目標は反対へ流れる。その分を照準で打ち消す', ['owRelative', 'rule']), goal: g('onMoving', '>=', 0.5, '移動中の命中 50% 以上') },
  consistency: { base: 'flick_static', cue: c('毎回「見る→振る→止める→撃つ」を同じ手順で行う', ['rule']), goal: g('cvMT', '<=', 0.5, '時間のばらつき 0.50 以下') },
};
// 弱点の表示名 (feedback.js の key)
const WEAK_NAMES = {
  overshoot: '行き過ぎ', undershoot: '一次移動の不足', accuracy: '撃ち急ぎ', slow: '慎重すぎ', onset: '動き出しの遅さ',
  far: '大きな角度', near: '近距離の微調整', curve: '軌道の曲がり', vertical: '縦方向', lag: '一定の動きでの遅れ', lead: '追い越し',
  moveShoot: '動きながら撃つ', stopShot: '止まってから撃つまで', noCounter: 'カウンターストレイフ', moveTrack: '移動中の追従', notMoving: '移動の少なさ',
  gainVar: '一振り目のばらつき', gainRange: '距離に応じた振れ幅', mouseTilt: 'マウスの傾き', arcDrift: '横振りの上下の流れ',
  reversal: '切り返しへの反応', revDetect: '切り返しへの気づき', revTurn: '切り返しの動作', revOvershoot: '切り返し後の行き過ぎ',
  revRapid: '短い切り返し', anticipate: '先読み', motionPerception: '動きの知覚', generalReaction: '反応の速さ', jitter: '照準のブレ', vtrack: '縦の追従', reaction: '反応', falsestart: 'フライング', consistency: 'ムラ',
};
export const weakName = (k) => WEAK_NAMES[k] || (k.startsWith('dir_') ? '苦手な方向' : k);

export function checkGoal(goal, res) {
  if (!goal) return null;
  if (goal.metric === 'rating') return { ok: res.rating >= goal.value, value: res.rating };
  const v = res.metrics[goal.metric];
  if (v == null || Number.isNaN(v)) return { ok: null, value: v };
  return { ok: goal.op === '<=' ? v <= goal.value : v >= goal.value, value: v };
}

// cue を省略するとシナリオの基本の意識を使う
function step(scOrId, dur, phase, cue, goal) {
  const sc = typeof scOrId === 'string' ? getScenario(scOrId) : scOrId;
  const q = cue || SCENARIO_CUES[sc.id] || c('', []);
  return { sc, dur, phase, cue: q.text, cueSrc: q.src, goal: goal || null };
}

// 弱点から集中練習のシナリオを作る (履歴を散らかさないよう id は固定)
function drillStep(key, rating, dur) {
  let d = WEAK_DRILLS[key];
  if (!d && key.startsWith('dir_')) d = { gen: key, cue: c('苦手な方向も、得意な方向と同じように振って止める', ['rule']), goal: g('overRate', '<=', 0.35, '行き過ぎ率 35% 以下') };
  if (!d) return null;
  let sc;
  if (d.gen) {
    sc = generateScenario(d.gen, null, rating);
    if (!sc) return null;
    sc.id = 'menu_' + d.gen;
    sc.generated = true;
  } else sc = getScenario(d.base);
  return step(sc, dur, 'focus', d.cue, d.goal);
}

// 直近の記録から弱点を集計
export function recentWeakness(sessions) {
  const recent = sessions.slice(-30);
  const count = {};
  recent.forEach((s, i) => {
    const w = 1 + i / recent.length; // 新しいほど重く
    (s.weakKeys || []).forEach((k, j) => { if (WEAK_DRILLS[k] || k.startsWith('dir_')) count[k] = (count[k] || 0) + w / (j + 1); });
  });
  return Object.entries(count).sort((a, b) => b[1] - a[1]).map(([k]) => k);
}

function recentAvg(sessions, id) {
  const ss = sessions.filter((s) => s.scenarioId === id).slice(-5);
  return ss.length ? ss.reduce((a, s) => a + s.rating, 0) / ss.length : null;
}
const checkGoalFor = (sessions, id) => {
  const avg = recentAvg(sessions, id);
  return avg != null ? g('rating', '>=', Math.round(avg), `上級者比 ${Math.floor(avg)}% (直近平均) 以上`) : null;
};

const WARM_TRACK = c('握る力を抜き、照準を目標の上に乗せて同じ速さで運ぶ', ['aimlabsSmooth']);
const WARM_FLICK = c('速さは気にせず、照準が目標の上で止まってから撃つ', ['aimlabsSwitch']);

export function buildMenus(sessions, profile) {
  const menus = [];
  const weak = recentWeakness(sessions);
  const axes = Object.entries(profile).filter(([, v]) => v != null).sort((a, b) => a[1] - b[1]);
  const weakestCat = axes.length ? axes[0][0] : null;
  const ratingOf = (cat) => (profile[cat] != null ? profile[cat] : 50);

  // 1. おまかせ (弱点から自動作成)
  if (weak.length && weakestCat) {
    const base = BASE_SCENARIOS.find((s) => s.category === weakestCat);
    const steps = [step('track_smooth', 45, 'warmup', WARM_TRACK), step('flick_static', 45, 'warmup', WARM_FLICK)];
    const r = ratingOf(weakestCat);
    const d1 = drillStep(weak[0], r, 60);
    if (d1) steps.push(d1, { ...d1, note: '2 セット目: 1 セット目の結果を見て、同じ意識をもう一度' });
    const d2 = weak[1] && drillStep(weak[1], r, 60);
    if (d2) steps.push(d2);
    steps.push(step('combat_mix', 60, 'mixed'));
    steps.push(step(base.id, 60, 'check', null, checkGoalFor(sessions, base.id)));
    menus.push({
      id: 'auto', name: 'おまかせメニュー', tag: 'おすすめ', auto: true,
      desc: `最近の記録から、特に「${weakName(weak[0])}」${d2 ? `と「${weakName(weak[1])}」` : ''}を重点的に練習します。`,
      steps,
    });
  }

  menus.push({
    id: 'balance', name: '基礎バランス', desc: '全要素を 1 本ずつ。毎日の基本メニュー。', steps: [
      step('track_smooth', 45, 'warmup', WARM_TRACK),
      step('flick_static', 60, 'focus', null, g('accuracy', '>=', 0.85, '命中率 85% 以上')),
      step('micro_precision', 60, 'focus', null, g('accuracy', '>=', 0.85, '命中率 85% 以上')),
      step('switching_grid', 60, 'focus', null, g('accuracy', '>=', 0.85, '命中率 85% 以上')),
      step('track_smooth', 60, 'focus', null, g('jitter', '<=', 0.8, 'ブレ指数 0.80 以下')),
      step('track_reactive', 60, 'focus', null, g('reversalLatency', '<=', 0.25, '切り返し反応 250ms 以内')),
      step('combat_mix', 60, 'mixed'),
    ],
  });

  const precise = generateScenario('overshoot', null, ratingOf('flick')); precise.id = 'menu_overshoot';
  menus.push({
    id: 'flick', name: 'フリック強化', desc: '「正確に止める → テンポを上げる」の順で、速さと正確さを両立させる (正確さを先に作る順番は Aim Labs の解説と同じ)。', steps: [
      step('track_smooth', 45, 'warmup', WARM_TRACK),
      step(precise, 60, 'focus', WEAK_DRILLS.overshoot.cue, g('accuracy', '>=', 0.9, '命中率 90% 以上')),
      step('flick_static', 60, 'focus', c('止める意識を保ったまま、テンポだけ上げる', ['aimlabsSwitch']), g('accuracy', '>=', 0.85, '命中率 85% 以上')),
      step('flick_wide', 60, 'focus', null, g('corrections', '<=', 1.2, '修正回数 1.2 回/体 以下')),
      step('micro_precision', 60, 'focus', null, g('accuracy', '>=', 0.85, '命中率 85% 以上')),
      step('combat_mix', 60, 'mixed'),
      step('flick_static', 60, 'check', null, checkGoalFor(sessions, 'flick_static')),
    ],
  });

  const smooth = generateScenario('jitter', null, ratingOf('tracking')); smooth.id = 'menu_jitter';
  menus.push({
    id: 'tracking', name: 'トラッキング強化', desc: '遅い目標で滑らかさを作ってから、速さと切り返しへ広げる (Voltaic のルーティンと同じ順番)。', steps: [
      step(smooth, 45, 'warmup', WEAK_DRILLS.jitter.cue),
      step('track_precise', 60, 'focus', null, g('jitter', '<=', 0.8, 'ブレ指数 0.80 以下')),
      step('track_smooth', 60, 'focus', null, g('onRatio', '>=', 0.6, 'オンターゲット率 60% 以上')),
      step('track_reactive', 60, 'focus', null, g('reversalLatency', '<=', 0.24, '切り返し反応 240ms 以内')),
      step('track_reactive', 60, 'focus', c('1 セット目の結果を見て、先読みせず切り返しを見てから追うことだけに集中する', ['aimlabsReactive']), g('reversalLatency', '<=', 0.24, '切り返し反応 240ms 以内')),
      step('track_switch', 60, 'mixed'),
      step('track_smooth', 60, 'check', null, checkGoalFor(sessions, 'track_smooth')),
    ],
  });

  const rr = ratingOf('reactive');
  const gen = (k) => { const s = generateScenario(k, null, rr); s.id = 'menu_' + k; s.generated = true; return s; };
  menus.push({
    id: 'reactive', name: 'リアクティブ強化', desc: '切り返しへの反応を「目で気づく」「反対へ動き出す」「行き過ぎない」に分けて練習する。最初の検知テストで、目と手のどちらが原因かを確かめる。', steps: [
      step('track_smooth', 45, 'warmup', WARM_TRACK),
      step('reversal_detect', 45, 'focus', null, g('rtReverse', '<=', 0.35, '切り返しの検知 350ms 以内')),
      step(gen('adad_rhythm'), 60, 'focus', WEAK_DRILLS.revTurn.cue, WEAK_DRILLS.revTurn.goal),
      step(gen('adad_slow'), 60, 'focus', WEAK_DRILLS.revDetect.cue, WEAK_DRILLS.revDetect.goal),
      step('track_reactive', 60, 'focus', null, g('reversalLatency', '<=', 0.25, '切り返し反応 250ms 以内')),
      step('track_reactive', 60, 'focus', c('1 セット目の結果を見て、切り返しの瞬間だけに集中する', ['aimlabsReactive']), g('reversalLatency', '<=', 0.25, '切り返し反応 250ms 以内')),
      step('track_switch', 60, 'mixed'),
      step('track_reactive', 60, 'check', null, checkGoalFor(sessions, 'track_reactive')),
    ],
  });

  menus.push({
    id: 'warmup', name: '試合前ウォームアップ', desc: '約 4 分。試合の前に目と手を起こす。成績は気にしない。', steps: [
      step('track_smooth', 45, 'warmup', WARM_TRACK),
      step('flick_static', 45, 'warmup', WARM_FLICK),
      step('switching_grid', 45, 'warmup'),
      step('track_reactive', 45, 'warmup'),
      step('reaction', 30, 'warmup'),
    ],
  });
  for (const m of menus) m.total = m.steps.reduce((a, s) => a + s.dur, 0);
  return menus;
}

// 単発プレイの前に出す「意識すること」: 弱点に関係するものを優先
// リアクティブ系のシナリオでは、予測を勧める助言 (lag) は出さない
export function cueFor(sc, sessions) {
  if (sc.type === 'detect') return { base: SCENARIO_CUES[sc.id] || null, weak: null };
  const weak = recentWeakness(sessions.filter((s) => s.category === sc.category))
    .filter((k) => !(sc.category === 'reactive' && k === 'lag'));
  const d = weak.length && WEAK_DRILLS[weak[0]];
  return { base: SCENARIO_CUES[sc.id] || null, weak: d ? { name: weakName(weak[0]), ...d.cue } : null };
}
