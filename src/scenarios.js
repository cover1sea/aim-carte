// シナリオ定義。角度はすべて「度」。
// type: click (クリックで倒す) / track (長押しで当て続ける)
// spawn.relative: 照準から minDist〜maxDist 離れた位置に出す (フリック計測向き)
// field: 出現範囲 (照準の正面を中心に ±yaw, ±pitch)
// move.kind: none / strafe / adad / smooth / mixed
import { loadCustomScenarios } from './storage.js';

export const CATEGORIES = {
  flick: { name: 'フリック', color: '#ff5d73', desc: '離れた静止目標へ一発で合わせる' },
  precision: { name: 'マイクロ精度', color: '#ffb84d', desc: '小さな目標への微調整' },
  switching: { name: 'ターゲット切替', color: '#b07cff', desc: '複数目標を素早く撃ち分ける' },
  tracking: { name: 'トラッキング', color: '#3fd0ff', desc: '動く目標に照準を当て続ける' },
  reactive: { name: 'リアクティブ', color: '#2ee6a6', desc: '切り返しへの追従' },
  reaction: { name: '反応速度', color: '#ffe14d', desc: '出現した瞬間に撃つ' },
  mixed: { name: '総合', color: '#ffffff', desc: '複数要素の組み合わせ' },
};

export const BASE_SCENARIOS = [
  {
    id: 'flick_static', name: 'スタティック・フリック', category: 'flick', type: 'click',
    desc: '照準から 15〜60° 離れた静止目標を 1 体ずつ撃つ。一発目の動きの正確さを測る基本シナリオ。',
    targets: 1, radius: 1.4, hp: 1, field: { yaw: 70, pitch: 28 },
    spawn: { relative: true, minDist: 15, maxDist: 60 }, move: { kind: 'none' },
  },
  {
    id: 'flick_wide', name: 'ワイドアングル・フリック', category: 'flick', type: 'click',
    desc: '50〜110° の大きな振り向き。腕を使った大きな移動と、止める動作を鍛える。',
    targets: 1, radius: 2.0, hp: 1, field: { yaw: 120, pitch: 25 },
    spawn: { relative: true, minDist: 50, maxDist: 110 }, move: { kind: 'none' },
  },
  {
    id: 'micro_precision', name: 'マイクロ・プレシジョン', category: 'precision', type: 'click',
    desc: '照準のすぐ近く (3〜12°) に小さな目標。指先の微調整と、撃つ前に止める精度。',
    targets: 1, radius: 0.55, hp: 1, field: { yaw: 25, pitch: 15 },
    spawn: { relative: true, minDist: 3, maxDist: 12 }, move: { kind: 'none' },
  },
  {
    id: 'switching_grid', name: 'グリッド・スイッチ', category: 'switching', type: 'click',
    desc: '常に 3 体の静止目標。倒したら次へ素早く切り替える。目標の選び方と切替の速さ。',
    targets: 3, radius: 1.5, hp: 1, field: { yaw: 32, pitch: 16 },
    spawn: { relative: false }, move: { kind: 'none' },
  },
  {
    id: 'switching_moving', name: 'ムービング・スイッチ', category: 'switching', type: 'click',
    desc: '左右に動く 3 体を撃ち分ける。動く目標へのフリックと切替。',
    targets: 3, radius: 1.5, hp: 1, field: { yaw: 40, pitch: 14 },
    spawn: { relative: false }, move: { kind: 'strafe', speed: 18, changeMin: 0.6, changeMax: 1.6 },
  },
  {
    id: 'line_horizontal', name: '水平ライン・フリック', category: 'flick', type: 'click', noProfile: true,
    desc: '目標は常に照準と同じ高さで、左右にだけ出る。照準の高さを変えずに真横へ振る。一振り目の上下のずれから、マウスが傾いて動いていないかを測る。',
    targets: 1, radius: 1.2, hp: 1, field: { yaw: 90, pitch: 30 },
    spawn: { relative: true, minDist: 20, maxDist: 80, axis: 'h' }, move: { kind: 'none' },
  },
  {
    id: 'line_vertical', name: '垂直ライン・フリック', category: 'flick', type: 'click', noProfile: true,
    desc: '目標は常に照準の真上か真下に出る。左右にぶれずに縦へ振る。縦の動きの安定と、マウスの傾きを測る。',
    targets: 1, radius: 1.2, hp: 1, field: { yaw: 60, pitch: 40 },
    spawn: { relative: true, minDist: 10, maxDist: 35, axis: 'v' }, move: { kind: 'none' },
  },
  {
    id: 'track_horizontal', name: 'ライン・トラッキング', category: 'tracking', type: 'track', noProfile: true,
    desc: '目標が真横にだけ動く。上下にぶれずに追う。照準の上下の動きから、マウスの傾きを測る。',
    targets: 1, radius: 1.4, hpTime: Infinity, field: { yaw: 45, pitch: 0 },
    spawn: { relative: false }, move: { kind: 'strafe', speed: 30, changeMin: 0.8, changeMax: 1.8 },
  },
  {
    id: 'counter_strafe', name: 'ストップ&ショット (移動撃ち)', category: 'flick', type: 'click', noProfile: true,
    desc: 'A・D で動き、止まってから撃つ。最高速度の 30% を超える速さで撃つと弾がぶれる。目標を倒したら、1.5m 以上動くまで次の目標は出ない。VALORANT・CS 向け。',
    targets: 1, radius: 1.0, hp: 1, field: { yaw: 30, pitch: 8 },
    spawn: { relative: true, minDist: 5, maxDist: 25 }, move: { kind: 'none' },
    player: { mode: 'free', moveInaccuracy: true, requireMove: 1.5 },
  },
  {
    id: 'move_track_auto', name: 'ストレイフ補正トラッキング', category: 'tracking', type: 'track', noProfile: true,
    desc: '自分のキャラクターが自動で左右に動き回る (ADAD)。目標も左右に動く。自分の移動で目標が画面上を流れる分を、照準で打ち消し続ける。OW・Apex 向け。',
    targets: 1, radius: 1.6, hpTime: Infinity, field: { yaw: 35, pitch: 6 },
    spawn: { relative: false }, move: { kind: 'strafe', speed: 18, changeMin: 0.6, changeMax: 1.6 },
    player: { mode: 'auto', changeMin: 0.3, changeMax: 0.9 },
  },
  {
    id: 'move_track_free', name: '移動撃ちトラッキング', category: 'tracking', type: 'track', noProfile: true,
    desc: 'A・D (と W・S) で自分も動きながら追う。移動中 (最高速度の 50% 以上) のときだけダメージになる。OW・Apex 向け。',
    targets: 1, radius: 1.6, hpTime: Infinity, field: { yaw: 35, pitch: 6 },
    spawn: { relative: false }, move: { kind: 'strafe', speed: 18, changeMin: 0.6, changeMax: 1.6 },
    player: { mode: 'free', requireMoving: true },
  },
  {
    id: 'track_smooth', name: 'スムーズ・トラッキング', category: 'tracking', type: 'track',
    desc: '曲線的に動く目標を左クリック長押しで追い続ける。滑らかさと予測。',
    targets: 1, radius: 1.6, hpTime: Infinity, field: { yaw: 40, pitch: 16 },
    spawn: { relative: false }, move: { kind: 'smooth', speed: 26 },
  },
  {
    id: 'track_precise', name: 'プレシジョン・トラッキング', category: 'tracking', type: 'track',
    desc: '小さくゆっくり動く目標。手のブレを抑えた精密な追従。',
    targets: 1, radius: 0.8, hpTime: Infinity, field: { yaw: 25, pitch: 12 },
    spawn: { relative: false }, move: { kind: 'smooth', speed: 12 },
  },
  {
    id: 'track_reactive', name: 'リアクティブ・トラッキング (ADAD)', category: 'reactive', type: 'track',
    desc: '不規則に左右へ切り返す目標。切り返しを見てから素早く追従する力。',
    targets: 1, radius: 1.6, hpTime: Infinity, field: { yaw: 35, pitch: 8 },
    spawn: { relative: false }, move: { kind: 'adad', speed: 32, changeMin: 0.22, changeMax: 0.8 },
  },
  {
    id: 'track_switch', name: 'トラッキング・スイッチ', category: 'reactive', type: 'track',
    desc: '3 体の動く目標。0.8 秒当て続けると倒せる。追従と切替の組み合わせ。',
    targets: 3, radius: 1.5, hpTime: 0.8, field: { yaw: 40, pitch: 15 },
    spawn: { relative: false }, move: { kind: 'strafe', speed: 20, changeMin: 0.4, changeMax: 1.4 },
  },
  {
    id: 'reversal_detect', name: '切り返し検知テスト', category: 'reactive', type: 'detect', noProfile: true,
    desc: '左右に動く目標が、切り返した瞬間と光った瞬間にクリックする (照準は動かさなくてよい)。目で気づく速さだけを測り、「動きの変化」と「色の変化」の差から、動きの知覚に時間がかかっているかを調べる。',
    targets: 1, radius: 1.8, field: { yaw: 35, pitch: 4 }, spawn: { relative: false },
    move: { kind: 'detect', speed: 18 }, cueEvery: [0.7, 1.8], flashRate: 0.3, defaultDuration: 45,
  },
  {
    id: 'reaction', name: 'リアクションテスト', category: 'reaction', type: 'click',
    desc: 'ランダムな間隔で目標が出現。出た瞬間に撃つ。早撃ち (フライング) は減点。',
    targets: 1, radius: 2.2, hp: 1, field: { yaw: 14, pitch: 8 },
    spawn: { relative: true, minDist: 3, maxDist: 12 }, spawnDelay: [0.8, 2.4], lifetime: 1.5,
    move: { kind: 'none' }, defaultDuration: 40,
  },
  {
    id: 'combat_mix', name: 'コンバット・ミックス', category: 'mixed', type: 'click',
    desc: '大きさ・動き (静止/横移動/ADAD)・距離がばらばらの目標が 2 体ずつ。実戦に近い総合練習。',
    targets: 2, radius: [0.9, 2.0], hp: 1, field: { yaw: 60, pitch: 20 },
    spawn: { relative: false }, move: { kind: 'mixed', speed: 22, changeMin: 0.3, changeMax: 1.2 },
  },
];

// 総合ベンチマーク: 主要 6 要素を各 30 秒
export const BENCHMARK = ['flick_static', 'micro_precision', 'switching_grid', 'track_smooth', 'track_reactive', 'reaction'];

export function allScenarios() { return [...BASE_SCENARIOS, ...loadCustomScenarios()]; }
export function getScenario(id) { return allScenarios().find((s) => s.id === id); }
