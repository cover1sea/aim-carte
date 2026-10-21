import { Engine } from './engine.js';
import * as sfx from './audio.js';
import { loadSettings, saveSettings, GAMES, cm360, hfov169, vfovOf, convertSens } from './settings.js';
import { BASE_SCENARIOS, CATEGORIES, BENCHMARK, getScenario } from './scenarios.js';
import { analyze, rankOf, RANKS, computeRating } from './analysis.js';
import { expertRef, EXPERT } from './reference.js';
import { diagnose, generateScenario, recommendBuiltins, REFERENCES } from './feedback.js';
import {
  loadSessions, addSession, clearSessions, replaceSessions, loadCustomScenarios, saveCustomScenario, deleteCustomScenario,
  saveReplay, getReplay, listReplayIds,
} from './storage.js';
import { chart, destroyCharts, radarChart, drawPaths } from './charts.js';
import { buildMenus, checkGoal, cueFor, PHASES, weakName } from './training.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const view = $('#view');
const engine = new Engine($('#gl'), $('#overlay'));
let settings = loadSettings();
let course = null;
let currentView = 'home';

const pct = (v) => (isNaN(v) ? '—' : `${Math.round(v * 100)}%`);
const ms = (v) => (isNaN(v) ? '—' : `${Math.round(v * 1000)}`);
const fmtDate = (t) => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; };
// 上級者比 (%) の表示。rating は「上級者の目安 = 100」
// 切り捨てで表示し、ランクの境目 (例: 59.9%) を 60% と表示しないようにする
const ratio = (v, d = 0) => `${(Math.floor(v * 10 ** d + 1e-9) / 10 ** d).toFixed(d)}%`;
const badge = (rating, lg = false) => {
  const r = rankOf(rating);
  return `<span class="rank-badge ${lg ? 'lg' : ''}" style="color:${r.color}"><span class="gem"></span>${r.name}</span>`;
};

document.addEventListener('pointerdown', () => sfx.initAudio(settings.volume), { once: true });

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.h);
  toast.h = setTimeout(() => t.classList.remove('show'), 2200);
}

// ================= 共通 =================
function updateSensBadge() {
  const g = settings.game;
  $('#sensBadge').innerHTML = `${GAMES[g].name}<br><b>${settings.sens[g]}</b> @ ${settings.dpi}DPI ・ <b>${cm360(settings).toFixed(1)}</b> cm/360 ・ FOV <b>${hfov169(settings).toFixed(0)}</b>°`;
}
$('#sensBadge').onclick = () => setView('settings');

// フレームレート表示 (プレイ中・リプレイ中)
engine.onFps = (fps) => {
  const el = $('#fps');
  el.innerHTML = `<b>${fps}</b> FPS`;
  el.className = fps >= 120 ? 'good' : fps >= 60 ? '' : 'bad';
};
// 全画面の案内。F11 (ブラウザの全画面) は ESC で解除されないので一時停止と両立しやすい
const isMac = /Mac/.test(navigator.platform || navigator.userAgent);
const FS_KEY = isMac ? '<kbd>⌘</kbd> + <kbd>Ctrl</kbd> + <kbd>F</kbd>' : '<kbd>F11</kbd>';
function isFullscreen() {
  return !!document.fullscreenElement || (Math.abs(innerHeight - screen.height) <= 2 && Math.abs(innerWidth - screen.width) <= 2);
}
function fsHintHTML() {
  if (isFullscreen()) return '';
  return `<div class="fs-hint">⛶ 全画面でのプレイをおすすめします。画面の縦横比と視野 (FOV) がゲームと同じになり、まわりも気になりません。
    <div class="fs-keys">${FS_KEY} キーで全画面 <button class="btn small ghost" data-fs="1">全画面にする</button></div>
    <div class="dim small">ボタンの全画面は ESC で解除されます。キーで全画面にすると、ESC で一時停止しても全画面のままです。</div></div>`;
}
// 初めて開いたときだけ、全画面ボタンに吹き出しを出す (× で閉じると次回から出さない)
const TIP_KEY = 'at_fsTipSeen';
const tipSeen = () => { try { return localStorage.getItem(TIP_KEY) === '1'; } catch { return true; } };
function dismissTip() { try { localStorage.setItem(TIP_KEY, '1'); } catch { /* 保存できなくても閉じる */ } $('#fsTip').hidden = true; }
function updateFsUI() {
  const full = isFullscreen();
  const b = $('#fsChip');
  b.hidden = full;
  if (!full) b.innerHTML = `<span class="ico">⛶</span>全画面でプレイ ${FS_KEY}`;
  if (full && !$('#fsTip').hidden) dismissTip();
  const tip = $('#fsTip');
  tip.hidden = full || tipSeen();
  if (!tip.hidden && !tip.innerHTML) {
    tip.innerHTML = `<button class="fs-tip-x" title="閉じる">✕</button>
      <b>全画面でのプレイがおすすめです</b>
      画面の縦横比と視野 (FOV) が普段のゲームと同じになり、まわりも気になりません。<br>
      ${FS_KEY} キーで切り替えると、ESC で一時停止しても全画面のままです。`;
  }
  const slot = $('#fsSlot');
  if (slot) slot.innerHTML = fsHintHTML();
}
addEventListener('resize', updateFsUI);
document.addEventListener('fullscreenchange', updateFsUI);
document.addEventListener('click', (e) => {
  if (e.target.closest('.fs-tip-x')) { dismissTip(); return; }
  if (e.target.closest('[data-fs]')) {
    e.stopPropagation();
    document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => toast('全画面にできませんでした。キーで切り替えてください'));
  }
}, true);
const showFps = (on) => { $('#fps').hidden = !(on && settings.showFps); if (on) $('#fps').innerHTML = '<b>--</b> FPS'; };

function renderCrosshair(el, xh) {
  const c = xh.color, o = xh.outline ? 'box-shadow:0 0 0 1px #000;' : '';
  const L = (x, y, w, h) => `<i style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;background:${c};${o}"></i>`;
  const t = xh.thick, s = xh.size, gp = xh.gap;
  el.innerHTML = (s > 0 ? L(-t / 2, -gp - s, t, s) + L(-t / 2, gp, t, s) + L(-gp - s, -t / 2, s, t) + L(gp, -t / 2, s, t) : '') +
    (xh.dot ? L(-t / 2, -t / 2, t, t) : '');
}

let viewTimer = null;
function setView(name, ...args) {
  destroyCharts();
  clearInterval(viewTimer);
  currentView = name;
  $$('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.view === name));
  $('#app').scrollTop = 0;
  VIEWS[name](...args);
}
$$('#nav a').forEach((a) => (a.onclick = () => setView(a.dataset.view)));

function modal(html) {
  const m = $('#modal');
  m.innerHTML = `<div class="box panel">${html}</div>`;
  m.hidden = false;
  m.onclick = (e) => { if (e.target === m) closeModal(); };
  return m;
}
function closeModal() { $('#modal').hidden = true; }

// ================= スキル集計 =================
const AXES = ['flick', 'precision', 'switching', 'tracking', 'reactive', 'reaction'];
function skillProfile(sessions) {
  const out = {};
  for (const cat of AXES) {
    const ids = BASE_SCENARIOS.filter((s) => s.category === cat && !s.noProfile).map((s) => s.id);
    const vals = [];
    for (const id of ids) {
      const ss = sessions.filter((s) => s.scenarioId === id).slice(-10);
      if (ss.length) vals.push(Math.max(...ss.map((s) => s.rating)));
    }
    out[cat] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }
  return out;
}
function overallOf(p) {
  const v = Object.values(p).filter((x) => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
function dayStreak(sessions) {
  const days = new Set(sessions.map((s) => new Date(s.date).toDateString()));
  let n = 0;
  const d = new Date();
  if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1);
  while (days.has(d.toDateString())) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

// ================= ホーム =================
function scenarioCard(sc, sessions) {
  const ss = sessions.filter((s) => s.scenarioId === sc.id);
  const best = ss.length ? Math.max(...ss.map((s) => s.rating)) : null;
  const cat = CATEGORIES[sc.category];
  return `<div class="sc-card" data-id="${sc.id}" style="--cat:${cat.color}">
    ${sc.generated ? `<button class="del" data-del="${sc.id}" title="削除">✕</button>` : ''}
    <div class="cat">${cat.name.toUpperCase()}${sc.generated ? ' ・ 生成シナリオ' : ''}</div>
    <h3>${sc.name}</h3>
    <p>${sc.desc}</p>
    <div class="foot">${best != null ? badge(best) + `<span>ベスト ${ratio(best)}</span>` : '<span>未プレイ</span>'}<span class="spacer"></span><span>${ss.length} 回</span></div>
  </div>`;
}
function bindCards(root) {
  $$('.sc-card', root).forEach((c) => (c.onclick = (e) => {
    if (e.target.dataset.del) {
      e.stopPropagation();
      if (confirm('この生成シナリオを削除しますか？')) { deleteCustomScenario(e.target.dataset.del); setView(currentView); }
      return;
    }
    openPrep(getScenario(c.dataset.id));
  }));
}

function viewHome() {
  const sessions = loadSessions();
  const prof = skillProfile(sessions);
  const overall = overallOf(prof);
  const totalMin = sessions.reduce((a, s) => a + s.duration, 0) / 60;
  const streak = dayStreak(sessions);
  const custom = loadCustomScenarios();
  const byCat = {};
  for (const sc of BASE_SCENARIOS) (byCat[sc.category] ||= []).push(sc);
  view.innerHTML = `
    <div class="profile">
      <div class="panel">
        <div class="overall">
          <div>
            <div class="dim small">総合スキル (上級者比)</div>
            <div class="big-rating num">${overall != null ? ratio(overall) : '--'}</div>
          </div>
          <div>${overall != null ? badge(overall, true) : '<span class="dim">まずはベンチマークで計測しましょう</span>'}</div>
        </div>
        <div class="stat-tiles">
          <div class="tile"><div class="k">プレイ回数</div><div class="v num">${sessions.length}<small>回</small></div></div>
          <div class="tile"><div class="k">合計練習時間</div><div class="v num">${totalMin.toFixed(0)}<small>分</small></div></div>
          <div class="tile ${streak >= 3 ? 'good' : ''}"><div class="k">連続練習日数</div><div class="v num">${streak}<small>日</small></div></div>
          <div class="tile"><div class="k">自己ベスト更新</div><div class="v num">${sessions.filter((s) => s.pb).length}<small>回</small></div></div>
        </div>
        <p class="dim small" style="margin:14px 0 0">上級者比は、各シナリオの「上級者の目安」を 100% としたときの成績です。100% を超えることもあります。各要素の最近 10 回のベストを平均しています。</p>
      </div>
      <div class="panel"><h3>スキルレーダー</h3><div class="chart-wrap tall"><canvas id="radar"></canvas></div></div>
    </div>
    <div class="bench-cta">
      <div style="flex:1">
        <h3>総合ベンチマーク <span class="dim small">約 4 分</span></h3>
        <div class="dim">6 つの要素を 30 秒ずつ計測し、スキルの全体像と弱点をまとめて分析します。</div>
      </div>
      <button class="btn big" id="goBench">ベンチマーク開始</button>
    </div>
    <div class="bench-cta" style="border-color:#3fd0ff55;background:linear-gradient(110deg,#3fd0ff22,#b07cff1a 60%,transparent),var(--panel)">
      <div style="flex:1">
        <h3>トレーニングメニュー <span class="dim small">10〜20 分</span></h3>
        <div class="dim">ウォームアップ → 集中練習 → ミックス → 確認 の順で、各ステップの前に「意識すること」と目標を表示します。</div>
      </div>
      <button class="btn big blue" id="goTrain">メニューを選ぶ</button>
    </div>
    ${custom.length ? `<h2>あなた専用シナリオ <span class="tag">フィードバックから生成</span></h2><div class="cards" id="customCards">${custom.map((s) => scenarioCard(s, sessions)).join('')}</div>` : ''}
    ${Object.entries(byCat).map(([cat, list]) => `
      <h2><span style="color:${CATEGORIES[cat].color}">■</span>${CATEGORIES[cat].name} <span class="tag">${CATEGORIES[cat].desc}</span></h2>
      <div class="cards">${list.map((s) => scenarioCard(s, sessions)).join('')}</div>`).join('')}
  `;
  bindCards(view);
  $('#goBench').onclick = () => setView('benchmark');
  $('#goTrain').onclick = () => setView('training');
  radarChart($('#radar'), AXES.map((a) => CATEGORIES[a].name), [
    { label: '現在', data: AXES.map((a) => (prof[a] != null ? Math.min(110, prof[a]) : null)), color: '#00ff9c' },
  ]);
}

// ================= プレイ前 =================
function openPrep(sc) {
  if (!sc) return;
  const sessions = loadSessions().filter((s) => s.scenarioId === sc.id);
  const best = sessions.length ? Math.max(...sessions.map((s) => s.rating)) : null;
  const dur = sc.defaultDuration || settings.duration;
  const cue = cueFor(sc, loadSessions());
  const m = modal(`
    <div class="dim small" style="color:${CATEGORIES[sc.category].color}">${CATEGORIES[sc.category].name}</div>
    <h1>${sc.name}</h1>
    <p class="lead">${sc.desc}</p>
    ${sc.reason ? `<p class="small">目的: ${sc.reason}</p>` : ''}
    ${cueHTML(cue)}
    <dl class="kv">
      <dt>操作</dt><dd>${opText(sc)}</dd>
      <dt>目標サイズ</dt><dd>${Array.isArray(sc.radius) ? sc.radius.join('〜') : sc.radius}° (半径)</dd>
      <dt>上級者の目安</dt><dd>${expertRef(sc).summary} <span class="dim small">(上級者比 100%)</span>
        <div class="dim small">${expertRef(sc).formula} ・ <a href="#" id="howRef">計算の前提</a></div></dd>
      <dt>自己ベスト</dt><dd>${best != null ? `上級者比 ${ratio(best)} ${badge(best)}` : 'なし'}</dd>
      <dt>感度</dt><dd>${GAMES[settings.game].name} ${settings.sens[settings.game]} / ${cm360(settings).toFixed(1)} cm/360 / FOV ${hfov169(settings).toFixed(1)}°</dd>
    </dl>
    <div class="field" style="margin-top:16px"><label>プレイ時間</label>
      <select id="dur">${[30, 45, 60, 90, 120].map((d) => `<option value="${d}" ${d === dur ? 'selected' : ''}>${d} 秒</option>`).join('')}</select></div>
    <div class="row"><button class="btn big" id="go">スタート</button><button class="btn ghost" id="cancel">閉じる</button></div>
  `);
  $('#cancel', m).onclick = closeModal;
  $('#howRef', m).onclick = (e) => { e.preventDefault(); closeModal(); setView('theory'); setTimeout(() => $('#rankRef')?.scrollIntoView(), 50); };
  $('#go', m).onclick = () => {
    const d = +$('#dur', m).value;
    closeModal(); course = null;
    const q = cue.weak || cue.base;
    startGame(sc, d, q ? q.text : null);
  };
}
// 根拠のチップ。'rule' (本アプリの経験則) は灰色で区別する
function srcChips(keys) {
  return (keys || []).filter((k) => REFERENCES[k]).map((k) =>
    `<span class="ref-chip ${k === 'rule' ? 'rule' : ''}" title="${REFERENCES[k].note}">${REFERENCES[k].short}</span>`).join('');
}
function opText(sc) {
  const mv = !sc.player ? '' : sc.player.mode === 'auto' ? ' ・ キャラクターは自動で左右に動く' : ' ・ A・D (W・S) で移動';
  return (sc.type === 'track' ? '左クリック長押しで当て続ける'
    : sc.type === 'detect' ? '目標が切り返した瞬間・光った瞬間に左クリック (照準は動かさなくてよい)' : '左クリックで撃つ') + mv;
}
function cueHTML(cue) {
  const q = cue.weak || cue.base;
  if (!q) return '';
  return `<div class="cue-box"><div class="cue-label">🎯 このプレイで意識すること</div>
    <div class="cue-main">${q.text}</div><div class="cue-src">根拠: ${srcChips(q.src)}</div>
    ${cue.weak ? `<div class="dim small">最近の記録で「${cue.weak.name}」が目立つため、その改善を優先しています。</div>` : ''}</div>`;
}

// ================= ゲーム =================
let playing = null;
function showMsg(html, cls = '') {
  const g = $('#gameMsg');
  g.className = cls;
  g.innerHTML = html;
  g.hidden = !html;
}
function startGame(sc, duration, cue = null) {
  playing = { sc, duration, cue };
  $('#app').hidden = true;
  $('#hud').hidden = false;
  $('#crosshair').hidden = false;
  renderCrosshair($('#crosshair'), settings.crosshair);
  showFps(true);
  $('#moveHud').hidden = !sc.player;
  $('#miniMap').hidden = !sc.player;
  if (sc.player) $('#moveHud b').style.left = (sc.player.moveInaccuracy ? 30 : 50) + '%';
  $('#hudName').innerHTML = `${sc.name}${course ? `  —  ${course.label} ${course.i + 1}/${course.steps.length}` : ''}` +
    (cue ? `<div class="hud-cue">🎯 ${cue}</div>` : '');
  const track = sc.type === 'track';
  const detect = sc.type === 'detect';
  $('#hudALabel').textContent = track ? 'ON TARGET' : detect ? 'LAST RT' : 'ACC';
  $('#hudKLabel').textContent = detect ? 'DETECT' : 'KILLS';
  $('#hudTime').textContent = duration.toFixed(1);
  $('#hudKills').textContent = '0';
  $('#hudAcc').textContent = track ? '0%' : detect ? '—' : '100%';
  const ready = () => showMsg(`
    <h2>${sc.name}</h2>
    <div class="hint">${track ? '🖱 左クリック<b>長押し</b>で射撃' : detect ? '🖱 目標が<b>切り返した瞬間</b>・<b>光った瞬間</b>に左クリック' : '🖱 左クリックで射撃'} ・ ESC で一時停止</div>
    ${sc.player ? `<div class="hint">${sc.player.mode === 'auto' ? '🏃 キャラクターは自動で左右に動きます' : '⌨ <kbd>A</kbd> <kbd>D</kbd> (<kbd>W</kbd> <kbd>S</kbd>) で移動'}${sc.player.moveInaccuracy ? ' ・ 速さが 30% を超えると弾がぶれる' : ''}${sc.player.requireMoving ? ' ・ 移動中だけダメージ' : ''}</div>` : ''}
    ${cue ? `<div class="cue-box" style="max-width:560px"><div class="cue-label">🎯 意識すること</div><div class="cue-main">${cue}</div></div>` : ''}
    <div id="fsSlot">${fsHintHTML()}</div>
    <div style="font-size:22px;font-weight:700;margin-top:10px">クリックで開始</div>
    <button class="btn ghost small" id="quit">メニューに戻る</button>`);
  ready();
  engine.start(sc, {
    settings, duration,
    onHud: (h) => {
      if (sc.player) {
        drawMiniMap(h);
        const bar = $('#moveHud');
        bar.querySelector('i').style.width = Math.min(100, h.spd * 100) + '%';
        const ok = sc.player.moveInaccuracy ? h.spd <= 0.3 : h.spd >= 0.5;
        bar.className = ok ? 'ok' : '';
        bar.querySelector('span').textContent = sc.player.moveInaccuracy ? (ok ? '精度 OK' : '移動中: 弾がぶれる') : sc.player.requireMoving ? (ok ? '移動中: ダメージ有効' : '止まっている') : `速さ ${Math.round(h.spd * 100)}%`;
      }
      $('#hudTime').textContent = h.left.toFixed(1);
      $('#hudKills').textContent = h.kills;
      $('#hudAcc').textContent = track ? pct(h.on) : detect ? (h.lastRT ? `${Math.round(h.lastRT * 1000)}ms` : '—') : pct(h.acc);
    },
    onCountdown: (n) => (n > 0 ? showMsg(`<div class="count">${n}</div>`, 'count-only') : showMsg('')),
    onPause: () => showMsg(`<h2>一時停止</h2><div id="fsSlot">${fsHintHTML()}</div><div class="hint">クリックで再開</div>
      <div class="row" style="justify-content:center"><button class="btn small" id="retry">↻ リトライ</button><button class="btn ghost small" id="quit">中断してメニューへ</button></div>`),
    onEnd: (rec) => finishGame(sc, rec),
  });
}
$('#gameMsg').addEventListener('click', (e) => {
  if (e.target.id === 'retry') {
    engine.abort();
    startGame(playing.sc, playing.duration, playing.cue);
    return;
  }
  if (e.target.id === 'quit') {
    engine.abort();
    exitGameUI();
    course = null;
    setView('home');
    return;
  }
  if (engine.mode === 'play' && (engine.phase === 'ready' || engine.phase === 'paused')) engine.lock();
});
// 移動シナリオの可動範囲と自分の位置・向き (上が画面の奥 = 開始時の正面)
function drawMiniMap(h) {
  const c = $('#miniMap'), g = c.getContext('2d');
  const S = c.width, pad = 10, k = (S - pad * 2) / (h.area * 2);
  g.clearRect(0, 0, S, S);
  g.fillStyle = 'rgba(7,10,18,0.7)';
  g.fillRect(0, 0, S, S);
  g.strokeStyle = h.atEdge ? '#ffb84d' : '#3fd0ff';
  g.lineWidth = 2;
  g.strokeRect(pad, pad, S - pad * 2, S - pad * 2);
  const x = S / 2 + h.px * k, y = S / 2 + h.pz * k;
  const a = (-h.yaw * Math.PI) / 180;
  g.fillStyle = '#00ff9c';
  g.beginPath();
  g.moveTo(x - Math.sin(a) * 9, y - Math.cos(a) * 9);
  g.lineTo(x - Math.sin(a + 2.5) * 6, y - Math.cos(a + 2.5) * 6);
  g.lineTo(x - Math.sin(a - 2.5) * 6, y - Math.cos(a - 2.5) * 6);
  g.closePath();
  g.fill();
  g.fillStyle = '#8b97b0';
  g.font = '10px sans-serif';
  g.fillText('移動範囲', 4, S - 3);
}
function exitGameUI() {
  showMsg('');
  $('#moveHud').hidden = true;
  $('#miniMap').hidden = true;
  showFps(false);
  $('#hud').hidden = true;
  $('#crosshair').hidden = true;
  $('#app').hidden = false;
}

async function finishGame(sc, rec) {
  exitGameUI();
  const res = analyze(rec, sc);
  const diag = diagnose(res, sc, rec.settings);
  const prev = loadSessions().filter((s) => s.scenarioId === sc.id);
  const prevBest = prev.length ? Math.max(...prev.map((s) => s.rating)) : null;
  const id = Date.now().toString();
  const { fitts, byDist, byDir, ...mSummary } = res.metrics;
  const session = {
    id, date: Date.now(), scenarioId: sc.id, name: sc.name, category: sc.category, type: sc.type, generated: !!sc.generated,
    duration: rec.duration, score: res.score, rating: res.rating, rank: res.rank, metrics: mSummary,
    game: rec.settings.game, cm360: rec.settings.cm360, hfov: rec.settings.hfov,
    pb: prevBest != null && res.rating > prevBest, first: prevBest == null, replayId: id, course: course ? course.id : null, rv: RATING_VERSION,
    weak: diag.weaknesses.slice(0, 3).map((w) => w.title),
    weakKeys: diag.weaknesses.map((w) => w.key),
    sc: sc.generated ? sc : undefined, // 生成シナリオは設定ごと保存し、後で上級者比を計算し直せるようにする
    avgFps: rec.settings.avgFps,
  };
  addSession(session);
  saveReplay({ id, date: session.date, name: sc.name, rec, targetColor: settings.targetColor }).catch(() => {});
  if (course) {
    const st = course.steps[course.i];
    course.results.push({ sc, res, diag, session, step: st, goal: course.kind === 'menu' ? checkGoal(st.goal, res) : null });
  }
  setView('result', { sc, res, diag, session, prev, prevBest, rec });
}

// ================= 結果 =================
function metricTiles(res, sc) {
  const m = res.metrics;
  const T = (k, v, unit = '', cls = '') => `<div class="tile ${cls}"><div class="k">${k}</div><div class="v num">${v}<small>${unit}</small></div></div>`;
  if (sc.type === 'track') {
    return [
      T('オンターゲット率', pct(m.onRatio)), T('射撃中の命中時間', pct(m.fireOnRatio)),
      T('遅れて追う割合', pct(m.behindRate), '', m.behindRate > 0.68 ? 'bad' : ''),
      T('一定区間の遅れ', ms(m.lagMs), 'ms', m.lagMs > 0.07 ? 'bad' : m.lagMs <= 0.03 ? 'good' : ''),
      T('切り返し反応', ms(m.reversalLatency), 'ms', m.reversalLatency > 0.24 ? 'bad' : m.reversalLatency < 0.19 ? 'good' : ''),
      T('ブレ指数', isNaN(m.jitter) ? '—' : m.jitter.toFixed(2), '', m.jitter > 0.85 ? 'bad' : m.jitter < 0.55 ? 'good' : ''),
      T('切り返しに気づくまで', ms(m.decelLat), 'ms', m.decelLat > 0.2 ? 'bad' : m.decelLat < 0.15 ? 'good' : ''),
      T('気づいて反対へ', ms(m.transLat), 'ms', m.transLat > 0.12 ? 'bad' : ''),
      T('切り返し後の行き過ぎ', pct(m.revOvershoot), '', m.revOvershoot > 0.35 ? 'bad' : ''),
      T('先読みの疑い', isNaN(m.anticipPerMin) ? '—' : m.anticipPerMin.toFixed(1), '回/分', m.anticipPerMin > 5 ? 'bad' : ''),
      T('縦ずれの割合', pct(m.vertErrShare)),
      ...(sc.player ? [T('移動中の命中', pct(m.onMoving), '', m.onMoving < m.onStill * 0.8 ? 'bad' : ''), T('停止中の命中', pct(m.onStill)),
        T('移動している割合', pct(m.movingRatio), '', sc.player.requireMoving && m.movingRatio < 0.6 ? 'bad' : '')] : []),
      ...(m.tiltOffset == null || isNaN(m.tiltOffset) ? [] : [T('右と左での上下のずれ', `${m.tiltOffset >= 0 ? '右で上' : '右で下'} ${Math.abs(m.tiltOffset).toFixed(2)}°`, '', Math.abs(m.tiltOffset) > 0.3 ? 'bad' : '')]),
      ...(sc.hpTime && isFinite(sc.hpTime) ? [T('撃破数', m.kills)] : []),
      T('前半→後半', `${m.fade >= 0 ? '+' : ''}${Math.round(m.fade * 100)}`, '%', m.fade < -0.18 ? 'bad' : m.fade > 0.1 ? 'good' : ''),
    ].join('');
  }
  if (sc.type === 'detect') {
    return [
      T('切り返しの検知', ms(m.rtReverse), 'ms'), T('光の検知', ms(m.rtFlash), 'ms'),
      T('動きの知覚にかかる時間', isNaN(m.motionCost) ? '—' : Math.round(m.motionCost * 1000), 'ms', m.motionCost > 0.1 ? 'bad' : 'good'),
      T('見逃し', m.missRev + m.missFlash, '回'), T('フライング', m.falseClicks, '回', m.falseClicks >= 4 ? 'bad' : ''),
    ].join('');
  }
  if (sc.spawnDelay) {
    return [
      T('撃破まで (中央値)', ms(m.rt), 'ms'), T('最速', ms(m.bestRT), 'ms', 'good'), T('撃破数', m.kills),
      T('フライング', m.falseStarts, '回', m.falseStarts >= 3 ? 'bad' : ''), T('見逃し', m.expired, '回'),
      T('動き出し', ms(m.onset), 'ms'),
    ].join('');
  }
  return [
    T('撃破数', m.kills), T('命中率', pct(m.accuracy), '', m.accuracy < 0.72 ? 'bad' : m.accuracy > 0.93 ? 'good' : ''),
    T('1体あたり', ms(m.avgMT), 'ms'), T('動き出し', ms(m.onset), 'ms', m.onset > 0.3 ? 'bad' : m.onset < 0.22 ? 'good' : ''),
    T('スループット', isNaN(m.throughput) ? '—' : m.throughput.toFixed(2), 'bits/s'),
    T('行き過ぎ率', pct(m.overRate), '', m.overRate > 0.35 ? 'bad' : ''),
    T('手前止まり率', pct(m.underRate)), T('修正回数', isNaN(m.corrections) ? '—' : m.corrections.toFixed(1), '回/体', m.corrections > 1.2 ? 'bad' : ''),
    ...(sc.player ? [T('動きながら撃った割合', pct(m.movingShotRate), '', m.movingShotRate > 0.2 ? 'bad' : m.movingShotRate < 0.05 ? 'good' : ''),
      T('止まってから撃つまで', ms(m.stopToShot), 'ms', m.stopToShot > 0.25 ? 'bad' : ''),
      T('止まるまで', ms(m.stopTime), 'ms'), T('カウンターストレイフ', pct(m.counterRate), '', m.counterRate < 0.4 ? 'bad' : '')] : []),
    T('一振り目の振れ幅', pct(m.gainMean), '', ''), T('振れ幅のばらつき', isNaN(m.gainCV) ? '—' : m.gainCV.toFixed(2), '', m.gainCV > 0.25 ? 'bad' : m.gainCV < 0.15 ? 'good' : ''),
    T('マウスの傾き', tiltText(m.tiltDeg), '', Math.abs(m.tiltDeg) > 2 ? 'bad' : Math.abs(m.tiltDeg) < 1 ? 'good' : ''),
    ...(m.searchRate > 0 ? [T('画面外 (索敵)', `${pct(m.searchRate)} ・ ${ms(m.searchTime)}`, 'ms'), T('索敵を除く照準', ms(m.aimMT), 'ms/体')] : []),
  ].join('');
}

// 傾きの表示 (正 = マウスが時計回り)
function tiltText(d) {
  if (d == null || isNaN(d)) return '—';
  if (Math.abs(d) < 0.5) return 'ほぼ 0°';
  return `${d > 0 ? '時計回り' : '反時計回り'} ${Math.abs(d).toFixed(1)}°`;
}
function confetti(el) {
  const colors = ['#00ff9c', '#3fd0ff', '#ffe14d', '#ff5d73', '#b07cff'];
  for (let i = 0; i < 70; i++) {
    const c = document.createElement('i');
    c.className = 'confetti';
    c.style.left = Math.random() * 100 + '%';
    c.style.background = colors[i % colors.length];
    c.style.animationDuration = 1.5 + Math.random() * 2 + 's';
    c.style.animationDelay = Math.random() * 0.6 + 's';
    el.appendChild(c);
  }
}
function countUp(el, to, dur = 1200) {
  const t0 = performance.now();
  const f = (now) => {
    const k = Math.min(1, (now - t0) / dur);
    el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))).toLocaleString();
    if (k < 1) requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
}

function feedbackHTML(diag) {
  const refs = srcChips;
  return `
    <div class="grid g2">
      <div>
        <h3 style="color:var(--good)">💪 強み</h3>
        <div class="fb-list">${diag.strengths.length ? diag.strengths.map((s) => `<div class="fb s"><h4>${s.title}</h4><p>${s.detail}</p></div>`).join('') : '<div class="fb"><p>はっきりした強みはまだ見つかっていません。プレイを重ねると傾向が見えてきます。</p></div>'}</div>
      </div>
      <div>
        <h3 style="color:var(--bad)">🔧 弱点</h3>
        <div class="fb-list">${diag.weaknesses.length ? diag.weaknesses.map((w) => `<div class="fb w"><h4>${w.title}</h4><p>${w.detail}</p>${refs(w.refs)}</div>`).join('') : '<div class="fb"><p>大きな弱点は見つかりませんでした。シナリオの難易度を上げるか、別の要素も試しましょう。</p></div>'}</div>
      </div>
    </div>
    ${diag.focus.length ? `<h3 style="margin-top:20px">🎯 次のプレイで意識すること</h3><ol class="focus-list">${diag.focus.map((f) => `<li>${f.text}<div class="cue-src">${srcChips(f.src)}</div></li>`).join('')}</ol>` : ''}`;
}

function practiceHTML(gens, recs, sessions) {
  if (!gens.length && !recs.length) return '';
  return `<h2>おすすめ練習</h2>
    ${gens.length ? `<p class="dim">弱点に合わせて、今の上級者比で達成できる難易度のシナリオを生成しました。</p>
    <div class="cards" id="genCards">${gens.map((g, i) => `<div class="sc-card" style="--cat:${CATEGORIES[g.category].color}">
      <div class="cat">生成シナリオ ・ ${g.reason}</div><h3>${g.name}</h3><p>${g.desc}</p>
      <div class="row"><button class="btn small" data-gen="${i}">保存して練習</button></div></div>`).join('')}</div>` : ''}
    ${recs.length ? `<h3 style="margin-top:18px">定番シナリオ</h3><div class="cards" id="recCards">${recs.map((s) => scenarioCard(s, sessions)).join('')}</div>` : ''}`;
}
function bindPractice(gens) {
  $$('[data-gen]').forEach((b) => (b.onclick = () => {
    const g = gens[+b.dataset.gen];
    saveCustomScenario(g);
    toast('シナリオを保存しました (ホームの「あなた専用シナリオ」)');
    course = null;
    openPrep(g);
  }));
  const rc = $('#recCards');
  if (rc) bindCards(rc);
}

// ランクの物差し: ランクごとに同じ幅の区間を取り、区間内の位置で現在地を示す
function rankLadder(rating) {
  const n = RANKS.length;
  const cur = RANKS.indexOf(rankOf(rating));
  const lo = RANKS[cur].min, hi = RANKS[cur + 1] ? RANKS[cur + 1].min : RANKS[cur].min + 20;
  const pos = ((cur + Math.min(1, (rating - lo) / (hi - lo))) / n) * 100;
  return `<div class="ladder">
    <div class="ladder-bar">${RANKS.map((r, i) => `<div style="background:${r.color};opacity:${i <= cur ? 0.9 : 0.25}"></div>`).join('')}
      <div class="ladder-mark" style="left:${pos}%"><span>${ratio(rating)}</span></div></div>
    <div class="ladder-labels">${RANKS.map((r, i) => `<div class="${i === cur ? 'cur' : ''}"><b style="color:${r.color}">${r.name}</b><span>${r.min}%〜</span></div>`).join('')}</div>
  </div>`;
}
function fmtUnit(v, unit) {
  if (unit === 'ms') return `${Math.round(v * 1000)}ms`;
  if (unit === '%') return `${Math.round(v * 100)}%`;
  return `${v}${unit}`;
}
function gapsHTML(gaps) {
  if (!gaps || !gaps.length) return '';
  return `<div class="gaps"><div class="gaps-title">上級者の目安との差</div>${gaps.map((g) => {
    if (g.you == null || isNaN(g.you)) return '';
    const ok = g.better === 'lower' ? g.you <= g.ref : g.you >= g.ref;
    const diff = Math.abs(g.you - g.ref);
    const msg = ok ? '<span class="ok">✓ 目安を達成</span>'
      : `<span class="ng">あと ${fmtUnit(diff, g.unit)}${g.better === 'lower' ? (g.unit === 'ms' ? ' 速く' : ' 減らす') : (g.unit === '%' ? ' 上げる' : ' 増やす')}</span>`;
    return `<div class="gap-row"><span>${g.label}</span><b class="num">${fmtUnit(g.you, g.unit)}</b><span class="dim">→ 目安 ${fmtUnit(g.ref, g.unit)}</span>${msg}</div>`;
  }).join('')}</div>`;
}
function fpsNote(fps) {
  if (!fps) return '';
  const low = fps < 60;
  return `<div class="fps-note ${low ? 'bad' : ''}">プレイ中の平均フレームレート <b>${fps} FPS</b>${low ? ' ・ 60 FPS を下回ると照準の表示が遅れ、成績が下がりやすくなります。ほかのアプリを閉じるか、ブラウザのハードウェアアクセラレーションを確認してください。' : ''}</div>`;
}
function breakdownText(parts, score) {
  if (!parts) return '';
  const add = parts.filter((p) => p.mult == null);
  const mul = parts.find((p) => p.mult != null);
  const sum = add.map((p, i) => `${i ? (p.val < 0 ? ' − ' : ' ＋ ') : ''}${p.label} ${Math.abs(p.val).toLocaleString()} (${p.expr})`).join('');
  return mul ? `(${sum}) × ${mul.label} ${mul.mult} (${mul.expr}) ＝ ${score.toLocaleString()}` : `${sum} ＝ ${score.toLocaleString()}`;
}

function viewResult({ sc, res, diag, session, prev, prevBest, rec }) {
  const r = rankOf(res.rating);
  const idx = RANKS.indexOf(r);
  const next = RANKS[idx + 1];
  const recent = prev.slice(-5);
  const avg5 = recent.length ? recent.reduce((a, s) => a + s.rating, 0) / recent.length : null;
  const delta = avg5 != null ? res.rating - avg5 : null;
  const gens = course ? [] : diag.gens.slice(0, 2).map((k) => generateScenario(k, sc, res.rating)).filter(Boolean);
  const recs = course ? [] : recommendBuiltins(diag, sc);
  const isLast = course && course.i === course.steps.length - 1;
  const mstep = course && course.kind === 'menu' ? course.steps[course.i] : null;
  const mres = mstep ? course.results[course.results.length - 1] : null;
  view.innerHTML = `
    <div class="row" style="margin-bottom:14px">
      <div><div class="dim small" style="color:${CATEGORIES[sc.category].color}">${CATEGORIES[sc.category].name}${course ? ` ・ ${course.label} ${course.i + 1}/${course.steps.length}` : ''}</div><h1>${sc.name}</h1></div>
      <span class="spacer"></span>
      ${course ? `<button class="btn big" id="next">${isLast ? (mstep ? 'メニューのまとめへ' : '総合結果を見る') : (mstep ? '次のステップへ ▶' : '次のシナリオへ ▶')}</button>` :
        `<button class="btn" id="again">もう一度</button>`}
      <button class="btn blue" id="replay">▶ リプレイ</button>
      <button class="btn ghost" id="menu">${course ? `${course.label}を中断` : 'メニュー'}</button>
    </div>
    ${mstep ? goalCardHTML(mstep, mres.goal) : ''}
    <div class="result-head">
      <div class="panel score-box" id="scoreBox">
        ${session.pb ? '<div class="pb-banner">🏆 自己ベスト更新！</div>' : session.first ? '<div class="pb-banner">✨ 初記録</div>' : ''}
        <div class="label">上級者比</div>
        <div class="score">${ratio(res.rating)}</div>
        ${badge(res.rating, true)}
        <div class="dim small" style="margin-top:8px">このシナリオの「上級者の目安」を 100% としたときの成績</div>
        <div style="margin-top:12px" class="row" >
          ${delta != null ? `<span class="delta ${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '▲' : '▼'} ${ratio(Math.abs(delta), 1)} <span class="dim small">(直近${recent.length}回平均比)</span></span>` : ''}
          <span class="spacer"></span>
          ${prevBest != null ? `<span class="dim small">これまでのベスト ${ratio(prevBest)}</span>` : ''}
        </div>
        ${rankLadder(res.rating)}
        <div class="dim small" style="text-align:right;margin-top:6px">${next ? `${next.name}まで あと ${(Math.ceil((next.min - res.rating) * 10) / 10).toFixed(1)}%` : '最高ランク到達！'}</div>
        ${gapsHTML(res.gaps)}
        ${fpsNote(rec.settings.avgFps)}
        <div class="score-line"><span class="dim">SCORE</span> <b class="num" id="score">0</b>
          <div class="dim small">${breakdownText(res.breakdown, res.score)}</div></div>
      </div>
      <div class="panel"><div class="stat-tiles" style="margin:0">${metricTiles(res, sc)}</div></div>
    </div>
    <h2>分析グラフ</h2>
    <div class="grid g2" id="charts"></div>
    <h2>フィードバック</h2>
    <div class="panel">${feedbackHTML(diag)}</div>
    ${practiceHTML(gens, recs, loadSessions())}
  `;
  countUp($('#score'), res.score);
  if (session.pb || session.first) {
    confetti($('#scoreBox'));
    sfx.play('fanfare', 0.7);
  }
  $('#replay').onclick = () => openReplay(session.replayId);
  $('#menu').onclick = () => { course = null; setView('home'); };
  if (course) $('#next').onclick = () => {
    if (isLast) setView(mstep ? 'menuSummary' : 'benchSummary');
    else if (mstep) { course.i++; setView('brief'); }
    else { course.i++; const st = course.steps[course.i]; startGame(st.sc, st.dur); }
  };
  else $('#again').onclick = () => startGame(sc, session.duration);
  bindPractice(gens);

  // グラフ
  const box = $('#charts');
  if (sc.type === 'track') {
    box.innerHTML = `<div class="panel" style="grid-column:1/-1"><h3>目標からのずれ (目標半径 = 1)</h3><div class="chart-wrap"><canvas id="c1"></canvas></div></div>`;
    chart($('#c1'), {
      type: 'line',
      data: { datasets: [
        { label: 'ずれ', data: res.errSeries.map(([x, y]) => ({ x, y: Math.min(y, 6) })), borderColor: '#3fd0ff', borderWidth: 1.2, pointRadius: 0, fill: { target: { value: 1 }, above: '#ff5d7322', below: '#00ff9c33' } },
        { label: '命中ライン', data: [{ x: 0, y: 1 }, { x: rec.duration, y: 1 }], borderColor: '#00ff9c', borderDash: [5, 5], pointRadius: 0, borderWidth: 1.5 },
      ] },
      options: { maintainAspectRatio: false, animation: false, scales: { x: { type: 'linear', title: { display: true, text: '秒' } }, y: { min: 0, max: 6 } }, plugins: { legend: { display: false } } },
    });
  } else {
    const trials = res.trials;
    const noPaths = sc.spawnDelay || sc.type === 'detect';
    box.innerHTML = `
      ${noPaths ? '' : `<div class="panel"><h3>フリック軌跡 <span class="dim small">(開始→目標を正規化)</span></h3><canvas id="paths" style="width:100%;height:260px;border-radius:10px"></canvas></div>`}
      <div class="panel" ${noPaths ? 'style="grid-column:1/-1"' : ''}><h3>${sc.type === 'detect' ? '合図ごとの反応時間 (ms) ・ 青: 切り返し / 黄: 光' : '1 体ごとの所要時間 (ms)'}</h3><div class="chart-wrap"><canvas id="c2"></canvas></div></div>`;
    if (!noPaths) drawPaths($('#paths'), res.paths);
    const col = { over: '#ff5d73', under: '#ffb84d', on: '#2ee6a6', reverse: '#3fd0ff', flash: '#ffe14d' };
    chart($('#c2'), {
      type: 'bar',
      data: { labels: trials.map((_, i) => i + 1), datasets: [{ data: trials.map((t) => Math.round((t.totalMT ?? t.MT) * 1000)), backgroundColor: trials.map((t) => (col[t.outcome] || '#3fd0ff') + 'cc'), borderRadius: 3 }] },
      options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { maxTicksLimit: 15 } } } },
    });
  }
}

// ================= ベンチマーク =================
function loadBench() { try { return JSON.parse(localStorage.getItem('at_bench') || '[]'); } catch { return []; } }
function viewBenchmark() {
  const hist = loadBench();
  view.innerHTML = `
    <h1>総合ベンチマーク</h1>
    <p class="lead">エイムの 6 要素を 30 秒ずつ連続で計測します。終わると要素別の上級者比と、全体を通した弱点・練習方針をまとめて表示します。</p>
    <div class="grid g3">${BENCHMARK.map((id, i) => { const s = getScenario(id); return `<div class="sc-card" style="--cat:${CATEGORIES[s.category].color};cursor:default"><div class="cat">${i + 1}. ${CATEGORIES[s.category].name}</div><h3>${s.name}</h3><p>${s.desc}</p></div>`; }).join('')}</div>
    <div class="row" style="margin-top:22px"><button class="btn big" id="start">ベンチマーク開始</button><span class="dim">合計 約 3〜4 分 (シナリオの間で休憩できます)</span></div>
    ${hist.length ? `<h2>これまでのベンチマーク</h2><div class="panel"><div class="chart-wrap"><canvas id="bh"></canvas></div></div>` : ''}
  `;
  $('#start').onclick = () => {
    course = { kind: 'bench', label: 'ベンチマーク', id: 'b' + Date.now(), steps: BENCHMARK.map((id) => ({ sc: getScenario(id), dur: 30 })), i: 0, results: [] };
    startGame(course.steps[0].sc, 30);
  };
  if (hist.length) benchChart($('#bh'), hist);
}
function benchChart(canvas, hist) {
  chart(canvas, {
    type: 'line',
    data: {
      labels: hist.map((h) => fmtDate(h.date)),
      datasets: [
        { label: '総合', data: hist.map((h) => h.overall), borderColor: '#00ff9c', backgroundColor: '#00ff9c33', borderWidth: 3, tension: 0.3, fill: true },
        ...AXES.map((a) => ({ label: CATEGORIES[a].name, data: hist.map((h) => h.axes[a] ?? null), borderColor: CATEGORIES[a].color, borderWidth: 1.2, pointRadius: 2, tension: 0.3 })),
      ],
    },
    options: { maintainAspectRatio: false, scales: { y: { min: 0, ticks: { callback: (v) => v + '%' }, grid: { color: (c) => (c.tick.value === 100 ? '#00ff9c88' : '#1a2338') } } } },
  });
}
function viewBenchSummary() {
  const results = course.results;
  const axes = {};
  for (const r of results) axes[r.sc.category] = r.res.rating;
  const overall = results.reduce((a, r) => a + r.res.rating, 0) / results.length;
  const hist = loadBench();
  const prevB = hist[hist.length - 1];
  hist.push({ id: course.id, date: Date.now(), overall, axes });
  localStorage.setItem('at_bench', JSON.stringify(hist));
  const isBest = hist.length > 1 && overall > Math.max(...hist.slice(0, -1).map((h) => h.overall));
  const weak = results.flatMap((r) => r.diag.weaknesses.map((w) => ({ ...w, scName: r.sc.name, sc: r.sc, rating: r.res.rating }))).sort((a, b) => b.sev - a.sev);
  const strengths = results.flatMap((r) => r.diag.strengths.map((s) => ({ ...s, scName: r.sc.name })));
  const focus = results.flatMap((r) => r.diag.focus).filter((f, i, a) => a.findIndex((x) => x.text === f.text) === i).slice(0, 4);
  // 最も上級者比の低い要素 + 重大な弱点からシナリオを生成
  const gens = [];
  for (const w of weak) {
    const kinds = results.find((r) => r.sc === w.sc).diag.gens;
    for (const k of kinds) {
      if (gens.length >= 3 || gens.some((g) => g.kind === k)) continue;
      const g = generateScenario(k, w.sc, w.rating);
      if (g) gens.push(Object.assign(g, { kind: k }));
    }
  }
  const sorted = [...results].sort((a, b) => a.res.rating - b.res.rating);
  view.innerHTML = `
    <div class="row"><h1>ベンチマーク結果</h1><span class="spacer"></span><button class="btn ghost" id="menu">メニューへ</button></div>
    <div class="result-head" style="margin-top:14px">
      <div class="panel score-box" id="scoreBox">
        ${isBest ? '<div class="pb-banner">🏆 総合ベスト更新！</div>' : ''}
        <div class="label">総合 上級者比</div>
        <div class="score">${ratio(overall)}</div>
        ${badge(overall, true)}
        ${prevB ? `<div style="margin-top:14px" class="delta ${overall >= prevB.overall ? 'up' : 'down'}">前回 ${ratio(prevB.overall)} → ${overall >= prevB.overall ? '▲' : '▼'} ${ratio(Math.abs(overall - prevB.overall), 1)}</div>` : ''}
        <table class="hist" style="margin-top:18px">${results.map((r) => `<tr><td style="color:${CATEGORIES[r.sc.category].color}">${CATEGORIES[r.sc.category].name}</td><td>${r.sc.name}</td><td class="num" style="font-size:18px">${ratio(r.res.rating)}</td><td>${badge(r.res.rating)}</td></tr>`).join('')}</table>
      </div>
      <div class="panel"><h3>スキルレーダー</h3><div class="chart-wrap tall"><canvas id="radar"></canvas></div></div>
    </div>
    <h2>総合フィードバック</h2>
    <div class="panel">
      <p>最も伸びしろがある要素は <b style="color:${CATEGORIES[sorted[0].sc.category].color}">${CATEGORIES[sorted[0].sc.category].name}</b>、最も得意な要素は <b style="color:${CATEGORIES[sorted[sorted.length - 1].sc.category].color}">${CATEGORIES[sorted[sorted.length - 1].sc.category].name}</b> です。
      練習時間の半分程度を苦手な要素に、残りを総合練習 (コンバット・ミックス) に充てると、要素別の上達を実戦へ移しやすくなります (Shea &amp; Morgan, 1979)。</p>
      ${feedbackHTML({
        strengths: strengths.slice(0, 5).map((s) => ({ ...s, title: `${s.title} (${s.scName})` })),
        weaknesses: weak.slice(0, 5).map((w) => ({ ...w, title: `${w.title} (${w.scName})` })),
        focus,
      })}
    </div>
    ${practiceHTML(gens, [], loadSessions())}
  `;
  $('#menu').onclick = () => { course = null; setView('home'); };
  if (isBest) { confetti($('#scoreBox')); sfx.play('fanfare', 0.7); }
  radarChart($('#radar'), AXES.map((a) => CATEGORIES[a].name), [
    { label: '今回', data: AXES.map((a) => (axes[a] != null ? Math.min(110, axes[a]) : null)), color: '#00ff9c' },
    ...(prevB ? [{ label: '前回', data: AXES.map((a) => (prevB.axes[a] != null ? Math.min(110, prevB.axes[a]) : null)), color: '#8b97b0' }] : []),
  ]);
  course = null;
  bindPractice(gens);
}

// ================= トレーニングメニュー =================
function loadTraining() { try { return JSON.parse(localStorage.getItem('at_training') || '[]'); } catch { return []; } }
const menuMinutes = (m) => Math.round((m.total + m.steps.length * 25) / 60);
function goalValue(goal, v) {
  if (v == null || Number.isNaN(v)) return '—';
  if (goal.metric === 'rating') return ratio(v);
  if (['onset', 'reversalLatency', 'lagMs', 'decelLat', 'transLat', 'rtReverse', 'rtFlash', 'stopToShot'].includes(goal.metric)) return `${Math.round(v * 1000)}ms`;
  if (goal.metric === 'anticipPerMin') return `${v.toFixed(1)}回/分`;
  if (goal.metric === 'tiltAbs') return `${v.toFixed(1)}°`;
  if (goal.metric === 'gainCV') return v.toFixed(2);
  if (['corrections', 'jitter', 'cvMT'].includes(goal.metric)) return v.toFixed(2);
  if (goal.metric === 'falseStarts') return `${v}回`;
  if (goal.metric === 'behindRate' && goal.op === '>=') return `追い越し ${Math.round((1 - v) * 100)}%`;
  return `${Math.round(v * 100)}%`;
}
function goalCardHTML(st, gr) {
  const ph = PHASES[st.phase];
  const status = !st.goal ? `<span class="dim">このステップは目標なし (${ph.name})</span>`
    : gr.ok === true ? '<span class="goal-ok">✓ 目標達成</span>'
    : gr.ok === false ? '<span class="goal-ng">✗ 目標未達</span>' : '<span class="dim">判定できるデータが不足</span>';
  return `<div class="panel goal-card" style="border-color:${ph.color}">
    <div class="row"><span class="phase-chip" style="background:${ph.color}">${ph.name}</span>
      <span>意識すること: <b>${st.cue}</b></span><span class="spacer"></span>${status}</div>
    ${st.goal ? `<div class="dim small" style="margin-top:6px">目標: ${st.goal.label} ・ 今回: <b style="color:var(--text)">${goalValue(st.goal, gr.value)}</b></div>` : ''}
  </div>`;
}
function menuStepsHTML(m) {
  return `<ol class="menu-steps">${m.steps.map((st) => {
    const ph = PHASES[st.phase];
    return `<li><span class="phase-chip" style="background:${ph.color}">${ph.name}</span>
      <div><b>${st.sc.name}</b> <span class="dim small">${st.dur} 秒</span>
      <div class="small">🎯 ${st.cue || '—'} ${srcChips(st.cueSrc)}</div>${st.goal ? `<div class="dim small">目標: ${st.goal.label}</div>` : ''}</div></li>`;
  }).join('')}</ol>`;
}
function startMenu(m) {
  course = { kind: 'menu', label: m.name, id: 'm' + Date.now(), menuId: m.id, name: m.name, steps: m.steps, i: 0, results: [] };
  setView('brief');
}
function openMenu(m) {
  const md = modal(`
    <div class="dim small">トレーニングメニュー ・ 約 ${menuMinutes(m)} 分</div>
    <h1>${m.name}</h1><p class="lead">${m.desc}</p>
    ${menuStepsHTML(m)}
    <div class="row" style="margin-top:14px"><button class="btn big" id="go">このメニューで練習</button><button class="btn ghost" id="cancel">閉じる</button></div>`);
  $('#cancel', md).onclick = closeModal;
  $('#go', md).onclick = () => { closeModal(); startMenu(m); };
}

function viewTraining() {
  const sessions = loadSessions();
  const menus = buildMenus(sessions, skillProfile(sessions));
  const hist = loadTraining();
  view.innerHTML = `
    <h1>トレーニングメニュー</h1>
    <p class="lead">練習の順番と「意識すること」を、運動学習の研究に沿って組んだメニューです。各ステップの前に、何を意識するかと目標を表示します。</p>
    <div class="phase-flow">${Object.values(PHASES).map((p, i) => `
      <div class="phase-box" style="--c:${p.color}"><div class="phase-no">${i + 1}</div><h3>${p.name}</h3><p>${p.why}</p></div>`).join('<div class="phase-arrow">▶</div>')}</div>
    <div class="panel tips">
      <h3>練習の進め方のコツ</h3>
      <ul>
        <li><b>意識は 1 回に 1 つ。</b> 一度にあれこれ直そうとせず、ステップごとに示す 1 つだけに集中します。</li>
        <li><b>体ではなく、照準と目標を意識する。</b> 「手首をこう動かす」より「目標の手前の縁で止める」のように、照準や目標の動きに注意を向けた方が身につきやすいことが知られています (Wulf, 2013)。</li>
        <li><b>ステップの間に 20〜30 秒休む。</b> 休憩を挟むと、疲れた状態で雑に繰り返すことを防げます (Lee &amp; Genovese, 1988)。</li>
        <li><b>短い時間を、なるべく毎日。</b> 競技エイムのコミュニティでは 1 日 20〜60 分程度がよく勧められます。長時間をまとめて行うより、短く頻繁な方が上達が残りやすいとされます。</li>
        <li><b>難しすぎるシナリオに固執しない。</b> 今の実力に合った難易度から段階的に上げ、似たシナリオを交互に行って同じ配置のパターンを覚えないようにします (Voltaic のルーティン)。</li>
        <li><b>正確さを先に作り、速さは後から。</b> 速さを上げるのは、命中率を保てるようになってからにします (Aim Labs の解説)。</li>
      </ul>
    </div>
    <h2>メニューを選ぶ</h2>
    <div class="cards">${menus.map((m, i) => `<div class="sc-card menu-card" data-i="${i}" style="--cat:${m.auto ? '#00ff9c' : '#3fd0ff'}">
      <div class="cat">${m.tag || 'トレーニング'} ・ 約 ${menuMinutes(m)} 分 ・ ${m.steps.length} ステップ</div>
      <h3>${m.name}</h3><p>${m.desc}</p>
      <div class="foot">${[...new Set(m.steps.map((s) => s.phase))].map((p) => `<span class="phase-dot" style="background:${PHASES[p].color}"></span>${PHASES[p].name}`).join(' ')}</div></div>`).join('')}
    ${menus.some((m) => m.auto) ? '' : '<div class="sc-card" style="--cat:#555;cursor:default"><div class="cat">おすすめ</div><h3>おまかせメニュー</h3><p>総合ベンチマークか、いくつかのシナリオをプレイすると、弱点に合わせたメニューを自動で作ります。</p></div>'}
    </div>
    ${hist.length ? `<h2>これまでのトレーニング</h2><div class="panel"><table class="hist"><tr><th>日時</th><th>メニュー</th><th>目標達成</th><th>時間</th></tr>
      ${hist.slice(-10).reverse().map((h) => `<tr><td>${fmtDate(h.date)}</td><td>${h.name}</td><td>${h.goalsTotal ? `${h.goalsHit} / ${h.goalsTotal}` : '—'}</td><td>${Math.round(h.seconds / 60)} 分</td></tr>`).join('')}</table></div>` : ''}
  `;
  $$('.menu-card').forEach((c) => (c.onclick = () => openMenu(menus[+c.dataset.i])));
}

// 各ステップの前のブリーフィング
function viewBrief() {
  const st = course.steps[course.i];
  const ph = PHASES[st.phase];
  const prevSame = course.results.filter((r) => !r.skipped && r.step.sc.id === st.sc.id && r.step.phase === st.phase).pop();
  view.innerHTML = `
    <div class="row"><div><div class="dim small">${course.name} ・ ステップ ${course.i + 1} / ${course.steps.length}</div><h1>${st.sc.name}</h1></div>
      <span class="spacer"></span><button class="btn ghost" id="quit">メニューを中断</button></div>
    <div class="steps-bar">${course.steps.map((x, i) => `<div class="${i < course.i ? 'done' : i === course.i ? 'cur' : ''}" style="--c:${PHASES[x.phase].color}" title="${x.sc.name}"></div>`).join('')}</div>
    <div class="brief">
      <div class="panel brief-main" style="border-color:${ph.color}">
        <span class="phase-chip" style="background:${ph.color}">${ph.name}</span>
        <div class="cue-label" style="margin-top:18px">🎯 このステップで意識すること</div>
        <div class="brief-cue">${st.cue}</div>
        <div class="cue-src" style="justify-content:center">根拠: ${srcChips(st.cueSrc)}</div>
        ${st.note ? `<div class="small" style="margin-top:8px">${st.note}</div>` : ''}
        ${st.goal ? `<div class="brief-goal">目標: <b>${st.goal.label}</b>${prevSame && prevSame.goal ? ` <span class="dim small">(前のセット: ${goalValue(st.goal, prevSame.goal.value)})</span>` : ''}</div>` : '<div class="brief-goal dim">このステップは成績を気にせず、意識することだけに集中</div>'}
        <div class="row" style="margin-top:22px;justify-content:center">
          <button class="btn big" id="go">開始 (${st.dur} 秒)</button>
          <button class="btn ghost small" id="skip">このステップを飛ばす</button>
        </div>
        <div id="rest" class="dim small" style="margin-top:12px"></div>
      </div>
      <div class="panel">
        <h3>なぜこのステップ？</h3>
        <p class="dim" style="line-height:1.7">${ph.why}</p>
        <h3 style="margin-top:16px">シナリオ</h3>
        <p class="dim" style="line-height:1.7">${st.sc.desc}</p>
        <p class="small">🖱 ${opText(st.sc)}</p>
      </div>
    </div>`;
  if (course.i > 0) {
    let left = 25;
    const tick = () => { $('#rest').textContent = left > 0 ? `休憩の目安: あと ${left} 秒 (手首と指を軽く伸ばしましょう)` : '準備ができたら開始してください'; left--; };
    tick();
    viewTimer = setInterval(tick, 1000);
  }
  $('#go').onclick = () => startGame(st.sc, st.dur, st.cue);
  $('#skip').onclick = () => {
    course.results.push({ step: st, skipped: true });
    if (course.i === course.steps.length - 1) setView('menuSummary');
    else { course.i++; setView('brief'); }
  };
  $('#quit').onclick = () => { if (confirm('メニューを中断しますか？ (ここまでのプレイ記録は残ります)')) { course = null; setView('training'); } };
}

function viewMenuSummary() {
  const rs = course.results;
  const played = rs.filter((r) => !r.skipped);
  const withGoal = played.filter((r) => r.step.goal && r.goal && r.goal.ok != null);
  const hit = withGoal.filter((r) => r.goal.ok).length;
  const seconds = played.reduce((a, r) => a + r.step.dur, 0);
  const hist = loadTraining();
  hist.push({ id: course.id, date: Date.now(), menuId: course.menuId, name: course.name, goalsHit: hit, goalsTotal: withGoal.length, seconds });
  localStorage.setItem('at_training', JSON.stringify(hist.slice(-200)));
  const missed = [...new Set(withGoal.filter((r) => !r.goal.ok).map((r) => r.step.cue))];
  const counts = {};
  played.flatMap((r) => r.session.weakKeys || []).forEach((k) => (counts[k] = (counts[k] || 0) + 1));
  const topWeak = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const allHit = withGoal.length > 0 && hit === withGoal.length;
  view.innerHTML = `
    <div class="row"><h1>${course.name} 完了！</h1><span class="spacer"></span><button class="btn ghost" id="menu">トレーニングへ戻る</button></div>
    <div class="grid g3" style="margin-top:14px">
      <div class="panel score-box" id="scoreBox">${allHit ? '<div class="pb-banner">🎯 全目標クリア！</div>' : ''}<div class="label">目標達成</div><div class="score">${withGoal.length ? `${hit}<span class="score-unit"> / ${withGoal.length}</span>` : '—'}</div></div>
      <div class="panel score-box"><div class="label">練習時間</div><div class="score">${Math.round(seconds / 60)}<span class="score-unit"> 分</span></div></div>
      <div class="panel score-box"><div class="label">連続練習日数</div><div class="score">${dayStreak(loadSessions())}<span class="score-unit"> 日</span></div></div>
    </div>
    <h2>ステップごとの結果</h2>
    <div class="panel" style="overflow-x:auto"><table class="hist">
      <tr><th>段階</th><th>シナリオ</th><th>意識すること</th><th>目標</th><th>結果</th><th>上級者比</th></tr>
      ${rs.map((r) => {
        const ph = PHASES[r.step.phase];
        const out = r.skipped ? '<span class="dim">スキップ</span>' : !r.step.goal ? '<span class="dim">—</span>'
          : r.goal.ok ? `<span class="goal-ok">✓ ${goalValue(r.step.goal, r.goal.value)}</span>`
          : r.goal.ok === false ? `<span class="goal-ng">✗ ${goalValue(r.step.goal, r.goal.value)}</span>` : '—';
        return `<tr><td><span class="phase-chip" style="background:${ph.color}">${ph.name}</span></td><td>${r.step.sc.name}</td><td class="small">${r.step.cue}</td>
          <td class="dim small">${r.step.goal ? r.step.goal.label : '—'}</td><td>${out}</td><td class="num">${r.skipped ? '' : ratio(r.res.rating)}</td></tr>`;
      }).join('')}
    </table></div>
    <h2>次回に向けて</h2>
    <div class="panel">
      ${missed.length ? `<h3>次回も続けて意識すること</h3><ol class="focus-list">${missed.slice(0, 3).map((c) => `<li>${c}</li>`).join('')}</ol>` : '<p>今日の目標はすべて達成できました。次回は同じメニューで、目標より一段上の成績を狙いましょう。</p>'}
      ${topWeak ? `<p class="dim">今日のプレイ全体では「${weakName(topWeak[0])}」が最も多く見られました。次回の「おまかせメニュー」はこれを重点に組みます。</p>` : ''}
      <p class="dim small">練習直後の成績が伸びなくても心配はいりません。運動技能の上達は、休んだ後 (翌日以降) の成績に表れやすいことが知られています (Schmidt &amp; Bjork, 1992)。</p>
    </div>`;
  if (allHit) { confetti($('#scoreBox')); sfx.play('fanfare', 0.7); }
  $('#menu').onclick = () => setView('training');
  course = null;
}

// ================= リプレイ =================
async function openReplay(id) {
  const rep = await getReplay(id).catch(() => null);
  if (!rep) { toast('リプレイが見つかりません (最新 30 件のみ保存)'); return; }
  $('#app').hidden = true;
  $('#replayBar').hidden = false;
  $('#crosshair').hidden = false;
  renderCrosshair($('#crosshair'), settings.crosshair);
  $('#rpName').textContent = `${rep.name} ・ ${fmtDate(rep.date)}`;
  showFps(true);
  engine.loadReplay(rep);
  engine.rplay = true;
  const seek = $('#rpSeek');
  let dragging = false;
  engine.onReplayTick = (t, end) => {
    if (!dragging) seek.value = Math.round((t / end) * 1000);
    $('#rpTime').textContent = `${t.toFixed(1)} / ${end.toFixed(1)}`;
    $('#rpPlay').textContent = engine.rplay ? '❚❚' : '▶';
  };
  const end = () => rep.rec.samples.t[rep.rec.samples.t.length - 1] || 0;
  seek.oninput = () => { dragging = true; engine.rt = (seek.value / 1000) * end(); };
  seek.onchange = () => { dragging = false; };
  $('#rpPlay').onclick = () => {
    if (!engine.rplay && engine.rt >= end()) engine.rt = 0;
    engine.rplay = !engine.rplay;
  };
  $('#rpSpeed').value = '1';
  $('#rpSpeed').onchange = (e) => (engine.rspeed = +e.target.value);
  $('#rpTrail').checked = true;
  $('#rpTrail').onchange = (e) => (engine.trail = e.target.checked);
  $('#rpClose').onclick = closeReplay;
}
function closeReplay() {
  showFps(false);
  engine.stopReplay();
  engine.onReplayTick = null;
  $('#replayBar').hidden = true;
  $('#crosshair').hidden = true;
  $('#app').hidden = false;
}
document.addEventListener('keydown', (e) => {
  if (engine.mode !== 'replay') return;
  if (e.code === 'Space') { e.preventDefault(); $('#rpPlay').click(); }
  if (e.code === 'ArrowRight') engine.rt += 1;
  if (e.code === 'ArrowLeft') engine.rt = Math.max(0, engine.rt - 1);
  if (e.code === 'Escape') closeReplay();
});

// ================= 履歴 =================
async function viewHistory(selId) {
  const sessions = loadSessions();
  const replayIds = new Set(await listReplayIds().catch(() => []));
  const played = [...new Set(sessions.map((s) => s.scenarioId))];
  const names = Object.fromEntries(sessions.map((s) => [s.scenarioId, s.name]));
  const sel = selId && played.includes(selId) ? selId : played[played.length - 1];
  // 活動ヒートマップ (16 週)
  const counts = {};
  for (const s of sessions) { const k = new Date(s.date).toDateString(); counts[k] = (counts[k] || 0) + 1; }
  const start = new Date(); start.setDate(start.getDate() - 7 * 16 + 1 - start.getDay());
  const cells = [];
  for (let d = new Date(start); d <= new Date(); d.setDate(d.getDate() + 1)) {
    const n = counts[d.toDateString()] || 0;
    const a = n ? Math.min(1, 0.25 + n / 8) : 0;
    cells.push(`<div title="${d.getMonth() + 1}/${d.getDate()}: ${n}回" style="${n ? `background:rgba(0,255,156,${a})` : ''}"></div>`);
  }
  const bench = loadBench();
  const list = sessions.filter((s) => s.scenarioId === sel);
  const best = list.length ? Math.max(...list.map((s) => s.rating)) : 0;
  const first = list[0];
  view.innerHTML = `
    <div class="row"><h1>履歴</h1><span class="spacer"></span><button class="btn ghost small" id="clear">履歴を全て削除</button></div>
    <div class="grid g2" style="margin-top:14px">
      <div class="panel"><h3>練習カレンダー <span class="dim small">直近 16 週</span></h3><div class="heat">${cells.join('')}</div>
        <div class="stat-tiles"><div class="tile"><div class="k">連続練習日数</div><div class="v num">${dayStreak(sessions)}<small>日</small></div></div>
        <div class="tile"><div class="k">練習した日数</div><div class="v num">${Object.keys(counts).length}<small>日</small></div></div></div></div>
      <div class="panel"><h3>ベンチマークの推移</h3>${bench.length ? '<div class="chart-wrap"><canvas id="bh"></canvas></div>' : '<p class="dim">まだベンチマークの記録がありません。</p>'}</div>
    </div>
    ${played.length ? `
    <h2>シナリオ別の推移</h2>
    <div class="panel">
      <div class="row"><select id="sel" class="field" style="max-width:360px;margin:0;background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:10px;padding:8px">
        ${played.map((id) => `<option value="${id}" ${id === sel ? 'selected' : ''}>${names[id]}</option>`).join('')}</select>
        <span class="spacer"></span>${badge(best)}<span class="dim">ベスト <b class="num" style="font-size:20px;color:var(--text)">${ratio(best)}</b></span>
        ${first && list.length > 1 ? `<span class="delta ${best >= first.rating ? 'up' : 'down'}">初回から ${best >= first.rating ? '+' : '−'}${ratio(Math.abs(best - first.rating), 1)}</span>` : ''}
      </div>
      <div class="chart-wrap tall" style="margin-top:12px"><canvas id="hc"></canvas></div>
    </div>
    <h2>プレイ記録</h2>
    <div class="panel" style="overflow-x:auto"><table class="hist">
      <tr><th>日時</th><th>シナリオ</th><th>スコア</th><th>上級者比</th><th>ランク</th><th>主な弱点</th><th>感度</th><th></th></tr>
      ${sessions.slice(-60).reverse().map((s) => `<tr>
        <td>${fmtDate(s.date)}</td><td>${s.name}${s.pb ? ' 🏆' : ''}</td><td class="num">${s.score.toLocaleString()}</td>
        <td class="num">${ratio(s.rating)}</td><td>${badge(s.rating)}</td><td class="dim small">${(s.weak || []).join(' / ') || '—'}</td>
        <td class="dim small">${GAMES[s.game]?.name || ''} ${s.cm360.toFixed(1)}cm</td>
        <td>${replayIds.has(s.replayId) ? `<button class="btn small blue" data-rp="${s.replayId}">リプレイ</button>` : ''}</td></tr>`).join('')}
    </table></div>` : '<p class="dim" style="margin-top:20px">まだプレイ記録がありません。</p>'}
  `;
  $('#clear').onclick = () => {
    if (confirm('すべてのプレイ履歴とベンチマーク記録を削除しますか？ (元に戻せません)')) {
      clearSessions(); localStorage.removeItem('at_bench'); setView('history');
    }
  };
  $$('[data-rp]').forEach((b) => (b.onclick = () => openReplay(b.dataset.rp)));
  if (bench.length) benchChart($('#bh'), bench);
  if (played.length) {
    $('#sel').onchange = (e) => setView('history', e.target.value);
    let run = -Infinity;
    chart($('#hc'), {
      type: 'line',
      data: {
        labels: list.map((s) => fmtDate(s.date)),
        datasets: [
          { label: '上級者比', data: list.map((s) => s.rating), borderColor: '#3fd0ff', backgroundColor: '#3fd0ff22', fill: true, tension: 0.3, borderWidth: 2.5,
            pointBackgroundColor: list.map((s) => (s.pb ? '#ffe14d' : '#3fd0ff')), pointRadius: list.map((s) => (s.pb ? 6 : 3)) },
          { label: '自己ベスト', data: list.map((s) => (run = Math.max(run, s.rating))), borderColor: '#ffe14d', borderDash: [6, 4], pointRadius: 0, stepped: true, borderWidth: 1.5 },
        ],
      },
      options: {
        maintainAspectRatio: false,
        plugins: { tooltip: { callbacks: { afterLabel: (c) => (c.datasetIndex === 0 ? `スコア ${list[c.dataIndex].score.toLocaleString()} / ${list[c.dataIndex].rank}` : '') } } },
        scales: { y: { min: 0, suggestedMax: 110, ticks: { callback: (v) => v + '%' },
          grid: { color: (c) => (c.tick.value === 100 ? '#00ff9c88' : RANKS.some((r) => r.min === c.tick.value) ? '#3a4a6a' : '#1a2338') } } },
      },
    });
  }
}

// ================= 設定 =================
function viewSettings() {
  const s = settings;
  const g = s.game, G = GAMES[g];
  view.innerHTML = `
    <h1>感度・FOV 設定</h1>
    <p class="lead">普段プレイしているゲームと同じ値を入力すると、振り向き量と視野が一致します (マウス 1 カウントあたりの回転角 = 感度 × ゲーム固有の係数)。</p>
    <div class="game-pick">${Object.entries(GAMES).map(([k, v]) => `<button data-g="${k}" class="${k === g ? 'on' : ''}">${v.name}</button>`).join('')}</div>
    <div class="grid g2" style="margin-top:18px">
      <div class="panel">
        <h3>${G.name}</h3>
        <div class="field"><label>ゲーム内感度</label><input id="sens" type="number" step="${G.sensStep}" min="0" value="${s.sens[g]}" /></div>
        ${g === 'custom' ? `<div class="field"><label>係数 (度/カウント)</label><input id="yaw" type="number" step="0.0001" value="${s.customYaw}" /><div class="note">例: Source/Apex/CS 系 0.022、Overwatch 0.0066、VALORANT 0.07</div></div>` : ''}
        <div class="field"><label>マウス DPI</label><input id="dpi" type="number" step="50" min="100" value="${s.dpi}" /></div>
        <div class="field"><label>FOV</label>
          ${G.fixedFov ? `<input type="text" value="103 (固定)" disabled />` : `<div class="row"><input id="fovR" type="range" min="${G.fovMin}" max="${G.fovMax}" step="1" value="${s.fov[g]}" style="flex:1" /><input id="fov" type="number" min="${G.fovMin}" max="${G.fovMax}" value="${s.fov[g]}" style="width:90px" /></div>`}
          <div class="note">${G.fovNote}</div></div>
        <label class="chk" style="margin-top:6px"><input id="raw" type="checkbox" ${s.rawInput ? 'checked' : ''}/> Raw Input (OS のマウス加速を無効化。対応ブラウザのみ)</label>
        <label class="chk" style="margin-top:6px"><input id="fpsOn" type="checkbox" ${s.showFps ? 'checked' : ''}/> フレームレートを表示 (プレイ中・リプレイ中、画面右上)</label>
        <label class="chk" style="margin-top:6px"><input id="offOn" type="checkbox" ${s.showOffscreen ? 'checked' : ''}/> 画面外の目標を画面端の矢印で示す (実際のゲームに近づけたいときはオフ)</label>
      </div>
      <div class="panel" id="derived"></div>
    </div>
    <div class="grid g2" style="margin-top:14px">
      <div class="panel">
        <h3>クロスヘア</h3>
        <div class="xh-preview"><div id="xhPrev" style="position:absolute;left:50%;top:50%"></div></div>
        <div class="grid g2" style="margin-top:12px">
          <div class="field"><label>色</label><input id="xc" type="color" value="${s.crosshair.color}" /></div>
          <div class="field"><label>長さ ${s.crosshair.size}</label><input id="xs" type="range" min="0" max="20" value="${s.crosshair.size}" /></div>
          <div class="field"><label>隙間 ${s.crosshair.gap}</label><input id="xg" type="range" min="0" max="15" value="${s.crosshair.gap}" /></div>
          <div class="field"><label>太さ ${s.crosshair.thick}</label><input id="xt" type="range" min="1" max="6" value="${s.crosshair.thick}" /></div>
        </div>
        <label class="chk"><input id="xd" type="checkbox" ${s.crosshair.dot ? 'checked' : ''}/> 中心点</label>
        <label class="chk"><input id="xo" type="checkbox" ${s.crosshair.outline ? 'checked' : ''}/> 縁取り</label>
      </div>
      <div class="panel">
        <h3>その他</h3>
        <div class="field"><label>ターゲットの色</label><input id="tc" type="color" value="${s.targetColor}" /></div>
        <div class="field"><label>音量 ${Math.round(s.volume * 100)}%</label><input id="vol" type="range" min="0" max="1" step="0.05" value="${s.volume}" /></div>
        <div class="field"><label>標準プレイ時間</label><select id="dur">${[30, 45, 60, 90, 120].map((d) => `<option ${d === s.duration ? 'selected' : ''} value="${d}">${d} 秒</option>`).join('')}</select></div>
      </div>
    </div>
    <p class="license-links dim small">
      ライセンス: <a href="https://github.com/cover1sea/aim-carte/blob/main/LICENSE" target="_blank" rel="noopener">AIM CARTE (MIT License)</a>
      ・ <a href="./THIRD_PARTY_LICENSES.txt" target="_blank" rel="noopener">使用しているオープンソースソフトウェア</a>
    </p>`;
  const save = () => { saveSettings(settings); updateSensBadge(); renderDerived(); };
  $$('.game-pick button').forEach((b) => (b.onclick = () => { settings.game = b.dataset.g; save(); viewSettings(); }));
  const num = (id, fn) => { const el = $('#' + id); if (el) el.oninput = () => { const v = parseFloat(el.value); if (v > 0) { fn(v); save(); } }; };
  num('sens', (v) => (settings.sens[g] = v));
  num('dpi', (v) => (settings.dpi = v));
  num('yaw', (v) => (settings.customYaw = v));
  const fr = $('#fovR'), fn = $('#fov');
  if (fr) {
    fr.oninput = () => { fn.value = fr.value; settings.fov[g] = +fr.value; save(); };
    fn.oninput = () => { const v = +fn.value; if (v >= G.fovMin && v <= G.fovMax) { fr.value = v; settings.fov[g] = v; save(); } };
  }
  $('#raw').onchange = (e) => { settings.rawInput = e.target.checked; save(); };
  $('#fpsOn').onchange = (e) => { settings.showFps = e.target.checked; save(); };
  $('#offOn').onchange = (e) => { settings.showOffscreen = e.target.checked; save(); };
  const xh = () => renderCrosshair($('#xhPrev'), settings.crosshair);
  const xbind = (id, key, conv = (x) => +x) => ($('#' + id).oninput = (e) => {
    settings.crosshair[key] = e.target.type === 'checkbox' ? e.target.checked : conv(e.target.value);
    const lab = e.target.closest('.field')?.querySelector('label');
    if (lab && e.target.type === 'range') lab.textContent = lab.textContent.replace(/\d+$/, e.target.value);
    save(); xh();
  });
  xbind('xc', 'color', (x) => x); xbind('xs', 'size'); xbind('xg', 'gap'); xbind('xt', 'thick'); xbind('xd', 'dot'); xbind('xo', 'outline');
  $('#tc').oninput = (e) => { settings.targetColor = e.target.value; save(); };
  $('#vol').oninput = (e) => {
    settings.volume = +e.target.value; sfx.setVolume(settings.volume);
    e.target.previousElementSibling.textContent = `音量 ${Math.round(settings.volume * 100)}%`; save();
  };
  $('#vol').onchange = () => sfx.play('hit');
  $('#dur').onchange = (e) => { settings.duration = +e.target.value; save(); };
  xh();
  renderDerived();
}
function renderDerived() {
  const el = $('#derived');
  if (!el) return;
  const s = settings, g = s.game;
  const hf = hfov169(s);
  const cm = cm360(s);
  const style = cm < 20 ? '高感度 (手首主体)' : cm < 35 ? '中感度' : cm < 55 ? '低め (腕主体)' : '超低感度';
  el.innerHTML = `
    <h3>換算結果</h3>
    <div class="stat-tiles" style="margin:0 0 14px">
      <div class="tile"><div class="k">振り向き (360°)</div><div class="v num">${cm.toFixed(2)}<small>cm</small></div></div>
      <div class="tile"><div class="k">水平FOV (16:9)</div><div class="v num">${hf.toFixed(1)}<small>°</small></div></div>
      <div class="tile"><div class="k">垂直FOV</div><div class="v num">${vfovOf(hf).toFixed(1)}<small>°</small></div></div>
      <div class="tile"><div class="k">1カウントの回転</div><div class="v num">${(s.sens[g] * (g === 'custom' ? s.customYaw : GAMES[g].yaw)).toFixed(4)}<small>°</small></div></div>
    </div>
    <div class="dim small" style="margin-bottom:10px">感度帯: ${style}</div>
    <h3>他ゲームでの同じ振り向き量</h3>
    <table class="conv-table"><tr><th>ゲーム</th><th>同じ cm/360 になる感度</th><th></th></tr>
      ${Object.entries(GAMES).filter(([k]) => k !== g && k !== 'custom').map(([k, v]) => {
        const val = convertSens(s, g, k);
        return `<tr><td>${v.name}</td><td class="num" style="font-size:18px">${val.toFixed(k === 'val' ? 3 : 2)}</td><td><button class="btn small ghost" data-apply="${k}" data-v="${val}">このゲームに切替</button></td></tr>`;
      }).join('')}</table>
    <p class="dim small">FOV が違うと画面上の見かけの速さは変わりますが、振り向き量 (cm/360) は一致します。</p>`;
  $$('[data-apply]', el).forEach((b) => (b.onclick = () => {
    const k = b.dataset.apply;
    settings.sens[k] = Math.round(+b.dataset.v * 10000) / 10000;
    settings.game = k;
    saveSettings(settings); updateSensBadge(); viewSettings();
    toast(`${GAMES[k].name} に切り替えました (感度 ${settings.sens[k]})`);
  }));
}

// ================= 理論 =================
function viewTheory() {
  view.innerHTML = `
    <h1>分析の理論と参考文献</h1>
    <p class="lead">このアプリのフィードバックは、運動制御とヒューマンインタフェースの研究で使われてきた指標を、FPS のエイムに当てはめて計算しています。</p>
    <div class="grid g2">
      <div class="panel"><h3>1. エイムを要素に分ける</h3><p class="dim">エイムは「フリック (静止目標への移動)」「マイクロ精度 (小さな修正)」「ターゲット切替」「トラッキング (滑らかな追従)」「リアクティブ (切り返しへの反応)」「反応速度」に分けられます。Voltaic などの練習体系もクリック・トラッキング・スイッチに分けて段階的に練習します。弱い要素を個別に練習し、総合シナリオで組み合わせます。</p></div>
      <div class="panel"><h3>2. フィッツの法則とスループット</h3><p class="dim">目標までの時間は難易度 ID = log₂(距離 / 幅 + 1) にほぼ比例します。本アプリは ID/時間 = スループット (bits/s) を計算し、さらにプレイごとに回帰直線を引いて「距離や方向の影響を除いても遅い」条件を見つけます。</p></div>
      <div class="panel"><h3>3. 一次移動と修正 (サブムーブメント)</h3><p class="dim">照準の速度を解析し、最初の大きな動き (一次移動) が止まった位置を求めます。目標を通り過ぎた割合 = 行き過ぎ率、手前で止まった割合 = 手前止まり率、その後の再加速の回数 = 修正回数です。熟練者は一次移動を少し手前で終え、小さな修正 1 回で合わせる傾向があります。目標が画面外に出た場合は、目標が画面に入るまでの視点移動を「索敵」として除外し、画面に入った時点から照準の解析を始めます (所要時間とスコアには索敵時間も含みます)。</p></div>
      <div class="panel"><h3>4. トラッキングの分析</h3><p class="dim">照準が目標の進行方向の後ろにあるか前にあるか (遅れ / 追い越し)、目標が切り返してから照準が向きを変えるまでの時間 (切り返し反応)、照準と目標の速度差 (ブレ指数) を計算します。</p></div>
      <div class="panel"><h3>5. 感度について</h3><p class="dim">感度には速さと精度のトレードオフで決まる最適な範囲があることが報告されています。本アプリは行き過ぎや修正の傾向と cm/360 を組み合わせ、感度が合っていない可能性があるときだけ「1 割程度の調整を試す」ことを提案します。</p></div>
      <div class="panel"><h3>6. 練習の進め方</h3><p class="dim">明確な課題を決め、結果をすぐ確認して次に活かす「意図的練習」が上達につながります。苦手な要素だけを反復すると短期の成績は伸びやすく、要素を混ぜた練習は実戦での定着と転移に効きます。生成シナリオで弱点を練習し、ベンチマークで定期的に確認する流れを推奨します。</p></div>
      <div class="panel"><h3>7. トレーニングメニューの組み方</h3><p class="dim">メニューは「ウォームアップ → 集中練習 → ミックス練習 → 確認」の順です。集中練習では 1 つの弱点だけを繰り返し (意図的練習)、ミックス練習で実戦に近い形に戻します (文脈干渉効果)。ステップの間には休憩を挟みます (分散練習)。各ステップの「意識すること」は、体の動きではなく照準や目標の動きに注意を向ける言い方 (外的焦点) で書いています。練習直後の成績より、翌日以降の成績を上達の目安にしてください。</p></div>
    </div>
    <h2>参考文献</h2>
    <div class="panel">${Object.values(REFERENCES).map((r) => `<div class="ref-item"><b>${r.short}</b> — ${r.note}<div class="full">${r.full}${r.url ? ` <a href="${r.url}" target="_blank" rel="noopener">リンク</a>` : ''}</div></div>`).join('')}</div>
    <h2>視点とマウスの対応・センサーエイム</h2>
    <div class="panel">
      <p>「振り向き距離を体に覚えさせる」かどうかはコミュニティで意見が分かれます。研究の立場から整理すると、次のようになります。</p>
      <ul class="dim" style="line-height:1.8">
        <li><b>覚えるのは距離の一覧ではなく「倍率」という規則。</b> 画面の動きの倍率への適応は速く、練習しなかった方向にも広く当てはまる (Krakauer et al., 2000)。目標はどこにでも出るので、具体的な距離を覚えることはもともとできない。</li>
        <li><b>ただし対応の正確さは大事。</b> 一振り目がどこまで届くかはこの対応の精度で決まる。本アプリは一振り目の振れ幅の比 (平均・ばらつき・距離別) を見ながらのプレイのまま計測する。</li>
        <li><b>感度を変えても腕前は失われない。</b> 経験のある FPS プレイヤーが 6 種類の感度を使った後でも、自分の感度での成績に有意な低下はなかった。ただし各回の中では慣れの効果が強く、変えた直後は慣らしが要る (Boudaoud et al., 2022)。2 つの倍率を同時に覚えるのは 1 つより遅い (Pearson et al., 2010)。</li>
        <li><b>変化のある練習は、新しい条件への適応を速くする可能性がある</b> (Braun et al., 2009)。ただし FPS の感度で直接確かめた研究はない。</li>
      </ul>
      <p>「センサーエイム」は、照準を動かしているのはマウスのセンサーなので、センサーの動きを基準に操作するという考え方です (個人の解説が中心で、効果を比べた研究はない)。幾何的には、センサーは自分の向きを基準に動きを報告するため、マウスが傾いていると真横に動かしても照準は斜めに動き、手首を支点に回すと軌道が弧でも照準はほぼ水平に動きます。本アプリは一振り目のずれ方からマウスの傾きを推定し、「水平ライン・フリック」「垂直ライン・フリック」「ライン・トラッキング」で集中的に確かめられます。</p>
    </div>
    <h2 id="rankRef">上級者比とランクの決め方</h2>
    <div class="panel">
      <p>上級者比は、各シナリオの主な指標が「上級者の目安」の何 % かを表します。時間の指標は <b>目安 ÷ 自分</b>、割合の指標は <b>自分 ÷ 目安</b> で計算するので、どのシナリオでも「目安より 2 割遅い・少ない」がおおむね同じ上級者比 (約 80%) になります。</p>
      <ul class="dim" style="line-height:1.8">
        <li>クリック系: 撃破数 ÷ (プレイ時間 ÷ 目安の 1 体あたり時間) × 命中率の補正</li>
        <li>リアクション: 目安の撃破時間 ÷ 自分の撃破時間 (中央値) × (1 − フライング・見逃しの割合)</li>
        <li>トラッキング: 射撃中の命中時間 ÷ 目安 (撃破のあるシナリオは撃破数の比と半分ずつ)</li>
        <li>切り返し検知テスト: 目安 ÷ 自分の反応時間 (切り返し 7 割・光 3 割) × (1 − 誤クリック・見逃しの割合)</li>
      </ul>
      <p>上級者の目安は、シナリオごとに手で決めず、次の共通の前提値から計算しています。前提値は研究の値をもとにした<b>推定</b>で、多くのプレイヤーの実測による較正はしていません。</p>
      <table class="hist">
        <tr><th>前提値</th><th>値</th><th>根拠</th></tr>
        <tr><td>照準移動のスループット</td><td class="num">${EXPERT.tp} bits/s</td><td class="small dim">経験のある FPS プレイヤーの計測 (Boudaoud et al., 2022: 7〜25° の目標で 1 体 0.4〜0.8 秒) に合う値は 8 bits/s・反応 200ms。その経験者が上級者比 70% 前後 (ダイヤモンド付近) になる水準を上級者と置いた</td></tr>
        <tr><td>出現への反応</td><td class="num">${Math.round(EXPERT.rt * 1000)}ms</td><td class="small dim">若年成人の視覚の単純反応 200〜250ms (Woods et al., 2015) の速い側</td></tr>
        <tr><td>次の目標を選ぶ判断</td><td class="num">${Math.round(EXPERT.switchRt * 1000)}ms</td><td class="small dim">目標が見えている切替系の推定</td></tr>
        <tr><td>機器の遅延</td><td class="num">${Math.round(EXPERT.sysLat * 1000)}ms</td><td class="small dim">マウスと表示の遅延の推定 (計測値に含まれる分)</td></tr>
        <tr><td>命中率</td><td class="num">${Math.round(EXPERT.acc * 100)}%</td><td class="small dim">推定</td></tr>
        <tr><td>切り返しへの手の反応</td><td class="num">${Math.round(EXPERT.revRt * 1000)}ms</td><td class="small dim">目の追従は約 90〜130ms で反応 (Soechting et al., 2005)。手の遅れを加えた推定</td></tr>
        <tr><td>切り返し後に追いつく速さ</td><td class="num">目標の ${EXPERT.catchUp} 倍</td><td class="small dim">推定</td></tr>
        <tr><td>定常の追従誤差</td><td class="num">${EXPERT.sigma0}° + ${EXPERT.sigmaV}° × 目標の速さ</td><td class="small dim">推定</td></tr>
        <tr><td>光 / 動きの変化への反応</td><td class="num">${Math.round(EXPERT.flashRt * 1000)}ms / +${Math.round(EXPERT.motionExtra * 1000)}ms</td><td class="small dim">単純反応の速い側と、動きの変化に気づく上乗せの推定</td></tr>
      </table>
      <h3 style="margin-top:18px">各シナリオの上級者の目安</h3>
      <table class="hist">
        <tr><th>シナリオ</th><th>目安 (上級者比 100%)</th><th>計算</th></tr>
        ${BASE_SCENARIOS.map((sc) => { const r = expertRef(sc); return `<tr><td>${sc.name}</td><td>${r.summary}</td><td class="small dim">${r.formula}</td></tr>`; }).join('')}
      </table>
      <p class="dim small" style="margin-top:10px">クリック系は、平均難易度 (ID = log₂(距離 ÷ 目標の直径 + 1)) をスループットで割った移動時間に、反応と機器の遅延を足しています。トラッキング系は、目標に乗っている割合を「定常の追従誤差」と「切り返しのたびに外れる時間」から見積もっています。</p>
    </div>
    <h2>ランクの目安</h2>
    <div class="panel row">${RANKS.map((r) => `<span>${badge(r.min)} <span class="dim small">上級者比 ${r.min}%〜</span></span>`).join('')}</div>
  `;
}

const VIEWS = {
  home: viewHome, benchmark: viewBenchmark, benchSummary: viewBenchSummary, history: viewHistory,
  settings: viewSettings, theory: viewTheory, result: viewResult,
  training: viewTraining, brief: viewBrief, menuSummary: viewMenuSummary,
};
// 上級者比の計算方法を変えたときは、保存済みの指標から過去の記録を計算し直す
const RATING_VERSION = 6;
function migrateRatings() {
  const all = loadSessions();
  if (!all.some((s) => s.rv !== RATING_VERSION)) return;
  const best = {};
  for (const s of all) {
    // 生成シナリオは保存した設定、無ければ種類から作り直した近い設定で計算する
    const sc = getScenario(s.scenarioId) || s.sc ||
      (s.scenarioId.startsWith('menu_') ? generateScenario(s.scenarioId.slice(5), null, 60) : null);
    if (sc && s.metrics) {
      s.rating = computeRating(sc, s.metrics, s.duration);
      s.rank = rankOf(s.rating).name;
    }
    s.pb = best[s.scenarioId] != null && s.rating > best[s.scenarioId];
    s.first = best[s.scenarioId] == null;
    best[s.scenarioId] = Math.max(best[s.scenarioId] ?? -Infinity, s.rating);
    s.rv = RATING_VERSION;
  }
  replaceSessions(all);
  // ベンチマークの記録も、同じプレイの新しい上級者比で作り直す
  const bench = loadBench();
  for (const b of bench) {
    const ss = all.filter((s) => s.course === b.id);
    if (!ss.length) continue;
    b.axes = Object.fromEntries(ss.map((s) => [s.category, s.rating]));
    b.overall = ss.reduce((a, s) => a + s.rating, 0) / ss.length;
  }
  localStorage.setItem('at_bench', JSON.stringify(bench));
}
migrateRatings();

updateSensBadge();
updateFsUI();
setView('home');
if (import.meta.env.DEV) window.__at = { engine, startGame, getScenario, setView };
