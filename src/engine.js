// 3D 描画・入力・シナリオ実行・記録・リプレイ再生
import * as THREE from 'three';
import * as sfx from './audio.js';
import { degPerCount, hfov169, vfovOf, cm360 } from './settings.js';

export const DIST = 20;
const TICK = 1 / 12;
// プレイヤーの移動 (1 単位 ≈ 1m、目標は中心から 20 単位の球面上)
const MOVE = { max: 5.4, accel: 40, friction: 22, area: 6, accurate: 0.3 };
// ゲームごとの移動の挙動。OW は基本速度 5.5m/秒 で、加速・減速がほぼ一瞬
const MOVE_BY_GAME = {
  ow: { max: 5.5, accel: 90, friction: 70 },
  default: { max: 5.4, accel: 40, friction: 22 },
};
const DEG = Math.PI / 180;
const rand = (a, b) => a + Math.random() * (b - a);
const r3 = (v) => Math.round(v * 1000) / 1000;
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

// x: 右が正の水平角, y: 上が正の垂直角 (度)
export function dirOf(x, y, out = new THREE.Vector3()) {
  const yaw = -x * DEG, p = y * DEG;
  return out.set(-Math.sin(yaw) * Math.cos(p), Math.sin(p), -Math.cos(yaw) * Math.cos(p));
}
export function angBetween(x1, y1, x2, y2) {
  const d = dirOf(x1, y1, _a).dot(dirOf(x2, y2, _b));
  return Math.acos(Math.min(1, Math.max(-1, d))) / DEG;
}

function gridTexture(base, line, cells) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 512, 512);
  g.strokeStyle = line;
  const step = 512 / cells;
  for (let i = 0; i <= cells; i++) {
    g.lineWidth = i % 4 === 0 ? 3 : 1;
    g.beginPath(); g.moveTo(i * step, 0); g.lineTo(i * step, 512); g.stroke();
    g.beginPath(); g.moveTo(0, i * step); g.lineTo(512, i * step); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Engine {
  constructor(canvas, overlay) {
    this.canvas = canvas;
    this.overlay = overlay;
    this.octx = overlay.getContext('2d');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0b0f1a');
    this.camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 600);
    this.camera.rotation.order = 'YXZ';
    this.buildRoom();
    this.geo = new THREE.SphereGeometry(1, 32, 20);
    this.meshes = new Map();
    this.effects = [];
    this.phase = 'idle';
    this.mode = 'idle';
    this.cx = 0; this.cy = 0;
    this.firing = false;
    this.active = false;
    this.last = performance.now();

    addEventListener('resize', () => this.resize());
    document.addEventListener('mousemove', (e) => this.onMove(e));
    document.addEventListener('mousedown', (e) => this.onDown(e));
    document.addEventListener('mouseup', (e) => { if (e.button === 0) this.firing = false; });
    this.keys = {};
    const KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
    document.addEventListener('keydown', (e) => {
      if (!KEYS.includes(e.code) || this.mode !== 'play' || !this.locked()) return;
      e.preventDefault();
      this.keys[e.code] = true;
    });
    document.addEventListener('keyup', (e) => { if (KEYS.includes(e.code)) this.keys[e.code] = false; });
    document.addEventListener('pointerlockchange', () => this.onLockChange());
    canvas.addEventListener('click', () => { if (this.mode === 'play' && !this.locked()) this.lock(); });
    this.resize();
    // フレームレート: 0.5 秒ごとに平均 FPS と最悪フレーム時間を通知。プレイ中は平均も記録する
    this.fpsAcc = { n: 0, ms: 0, worst: 0 };
    const loop = (now) => {
      const frameMs = now - this.last;
      const dt = Math.min(0.05, frameMs / 1000);
      this.last = now;
      if (this.active) {
        this.frame(dt);
      }
      // タブが裏に回っていた間の長いフレームは計測から除く
      if (this.active && frameMs < 1000) {
        const a = this.fpsAcc;
        a.n++; a.ms += frameMs; a.worst = Math.max(a.worst, frameMs);
        if (this.mode === 'play' && this.phase === 'play') { this.playFrames++; this.playMs += frameMs; }
        if (a.ms >= 500) {
          this.onFps && this.onFps(Math.round((a.n * 1000) / a.ms), a.worst);
          this.fpsAcc = { n: 0, ms: 0, worst: 0 };
        }
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  buildRoom() {
    const W = 200, H = 70, floorY = -14;
    const wallTex = gridTexture('#121a2c', '#22304d', 16);
    const floorTex = gridTexture('#0e1422', '#1d2a44', 16);
    const mk = (w, h, tex, rx, ry) => {
      const t = tex.clone(); t.needsUpdate = true; t.repeat.set(w / 40, h / 40);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 }));
      m.rotation.set(rx, ry, 0);
      return m;
    };
    const top = floorY + H;
    const cy = (floorY + top) / 2;
    const floor = mk(W, W, floorTex, -Math.PI / 2, 0); floor.position.y = floorY;
    const ceil = mk(W, W, wallTex, Math.PI / 2, 0); ceil.position.y = top;
    const front = mk(W, H, wallTex, 0, 0); front.position.set(0, cy, -W / 2);
    const back = mk(W, H, wallTex, 0, Math.PI); back.position.set(0, cy, W / 2);
    const left = mk(W, H, wallTex, 0, Math.PI / 2); left.position.set(-W / 2, cy, 0);
    const right = mk(W, H, wallTex, 0, -Math.PI / 2); right.position.set(W / 2, cy, 0);
    this.scene.add(floor, ceil, front, back, left, right);
    this.buildMoveArea();
    this.scene.add(new THREE.HemisphereLight(0xc8d8ff, 0x1a1a2a, 1.1));
    this.scene.add(new THREE.AmbientLight(0x8090b0, 0.9));
    const dl = new THREE.DirectionalLight(0xffffff, 1.4);
    dl.position.set(20, 40, 30);
    this.scene.add(dl);
  }

  // 移動シナリオの可動範囲: 足元の床 (目の高さの 1.6m 下) と、腰の高さの手すりで示す
  buildMoveArea() {
    const A = MOVE.area, y0 = -1.6, y1 = -0.8;
    const g = new THREE.Group();
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(A * 2, A * 2),
      new THREE.MeshBasicMaterial({ color: 0x3fd0ff, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = y0;
    const grid = new THREE.GridHelper(A * 2, A * 2, 0x3fd0ff, 0x3fd0ff);
    grid.position.y = y0 + 0.01;
    grid.material.transparent = true; grid.material.opacity = 0.18;
    const pts = [];
    const sq = [[-A, -A], [A, -A], [A, A], [-A, A]];
    for (let i = 0; i < 4; i++) {
      const [ax, az] = sq[i], [bx, bz] = sq[(i + 1) % 4];
      for (const y of [y0, y1]) pts.push(ax, y, az, bx, y, bz);
      pts.push(ax, y0, az, ax, y1, az); // 角の柱
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.areaEdge = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x3fd0ff, transparent: true, opacity: 0.6 }));
    g.add(floor, grid, this.areaEdge);
    g.visible = false;
    this.moveArea = g;
    this.scene.add(g);
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.overlay.width = w * devicePixelRatio;
    this.overlay.height = h * devicePixelRatio;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setFov(vfov) { this.camera.fov = vfov; this.camera.updateProjectionMatrix(); }
  locked() { return document.pointerLockElement === this.canvas; }
  lock() {
    sfx.resume();
    const p = this.canvas.requestPointerLock({ unadjustedMovement: !!(this.s && this.s.rawInput) });
    if (p && p.catch) p.catch(() => this.canvas.requestPointerLock());
  }

  // ---------------- プレイ ----------------
  start(sc, { settings, duration, onHud, onEnd, onPause, onCountdown }) {
    this.clearMeshes();
    this.mode = 'play';
    this.sc = sc;
    this.s = settings;
    this.dpc = degPerCount(settings);
    const hf = hfov169(settings);
    this.setFov(vfovOf(hf));
    this.snap = { game: settings.game, sens: settings.sens[settings.game], dpi: settings.dpi, cm360: cm360(settings), hfov: hf, vfov: vfovOf(hf), aspect: this.camera.aspect };
    this.duration = duration;
    this.onHud = onHud; this.onEnd = onEnd; this.onPause = onPause; this.onCountdown = onCountdown;
    this.cx = 0; this.cy = 0; this.t = 0;
    this.targets = []; this.nextId = 1; this.pending = [];
    this.events = [];
    this.samples = { t: [], cx: [], cy: [], f: [], tg: [] };
    this.lastSample = -1;
    this.kills = 0; this.shots = 0; this.hits = 0; this.onTime = 0;
    this.playFrames = 0; this.playMs = 0;
    this.lastCue = null; this.lastRT = null; this.falses = 0; this.flashUntil = 0;
    this.player = { x: 0, z: 0, vx: 0, vz: 0, spd: 0, counter: false, autoDir: 1, autoTimer: 0, travel: 0 };
    this.keys = {};
    this.waitMove = 0;
    this.nextCue = sc.cueEvery ? rand(...sc.cueEvery) : 0;
    this.firing = false;
    this.phase = 'ready';
    this.active = true;
    this.targetColor = new THREE.Color(settings.targetColor);
    this.moveArea.visible = !!sc.player;
    this.move = MOVE_BY_GAME[settings.game] || MOVE_BY_GAME.default;
  }

  abort() {
    this.phase = 'idle'; this.mode = 'idle'; this.active = false;
    if (this.locked()) document.exitPointerLock();
    this.clearMeshes();
  }

  onLockChange() {
    if (this.mode !== 'play') return;
    if (this.locked()) {
      if (this.phase === 'ready' || this.phase === 'paused') {
        this.phase = 'countdown';
        this.cd = 3;
        this.lastCd = 4;
      }
    } else if (this.phase === 'play' || this.phase === 'countdown') {
      this.phase = 'paused';
      this.firing = false;
      this.onPause && this.onPause();
    }
  }

  onMove(e) {
    if (!this.locked()) return;
    if (this.mode !== 'play' || (this.phase !== 'play' && this.phase !== 'countdown')) return;
    let mx = e.movementX, my = e.movementY;
    if (Math.abs(mx) > 3000 || Math.abs(my) > 3000) return; // ブラウザの異常値を捨てる
    this.cx += mx * this.dpc;
    this.cy = Math.max(-89, Math.min(89, this.cy - my * this.dpc));
  }

  onDown(e) {
    if (this.mode !== 'play' || !this.locked() || this.phase !== 'play' || e.button !== 0) return;
    this.firing = true;
    if (this.sc.type === 'click') this.shoot();
    else if (this.sc.type === 'detect') this.detectPress();
  }

  aimed(ox = 0, oy = 0) {
    let best = null, bestQ = 1;
    for (const t of this.targets) {
      const v = this.rel(t);
      const q = angBetween(this.cx + ox, this.cy + oy, v.x, v.y) / v.r;
      if (q <= bestQ) { bestQ = q; best = t; }
    }
    return best;
  }

  // 目標の、プレイヤーの位置から見た角度と見かけの大きさ (度)
  rel(t) {
    const P = this.player;
    if (!P || (!P.x && !P.z)) return { x: t.x, y: t.y, r: t.r };
    const w = dirOf(t.x, t.y, _a).multiplyScalar(DIST);
    const dx = w.x - P.x, dy = w.y, dz = w.z - P.z;
    const d = Math.hypot(dx, dy, dz);
    let x = -Math.atan2(-dx, -dz) / DEG;
    x += 360 * Math.round((this.cx - x) / 360);
    const Rw = DIST * Math.tan(t.r * DEG);
    return { x, y: Math.asin(dy / d) / DEG, r: Math.asin(Math.min(1, Rw / d)) / DEG };
  }

  // プレイヤーの位置から (x, y) の向きに見える、目標の球面上の点の角度 (中心から見た角度)
  canonical(x, y) {
    const P = this.player;
    if (!P || (!P.x && !P.z)) return [x, y];
    const u = dirOf(x, y, _b);
    const pu = P.x * u.x + P.z * u.z;
    const pp = P.x * P.x + P.z * P.z;
    const s = -pu + Math.sqrt(pu * pu - (pp - DIST * DIST));
    const w = { x: P.x + s * u.x, y: s * u.y, z: P.z + s * u.z };
    let cx = -Math.atan2(-w.x, -w.z) / DEG;
    cx += 360 * Math.round((x - cx) / 360);
    return [cx, Math.asin(w.y / DIST) / DEG];
  }

  // プレイヤーの移動 (WASD または自動のストレイフ)
  updatePlayer(dt) {
    const pc = this.sc.player, P = this.player;
    const a = -this.cx * DEG;
    const fw = [-Math.sin(a), -Math.cos(a)], rt = [Math.cos(a), -Math.sin(a)];
    let ix = 0, iz = 0;
    if (pc.mode === 'auto') {
      P.autoTimer -= dt;
      if (P.autoTimer <= 0) { P.autoDir = -P.autoDir; P.autoTimer = rand(pc.changeMin, pc.changeMax); }
      ix = rt[0] * P.autoDir; iz = rt[1] * P.autoDir;
    } else {
      const k = this.keys;
      const f = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0), s = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0);
      ix = fw[0] * f + rt[0] * s; iz = fw[1] * f + rt[1] * s;
      const n = Math.hypot(ix, iz);
      if (n) { ix /= n; iz /= n; }
    }
    const mv = this.move || MOVE_BY_GAME.default;
    const max = pc.speed || mv.max;
    const sp = Math.hypot(P.vx, P.vz);
    // 入力の向きが今の動きと逆なら、カウンターストレイフ (加速と摩擦の両方で止まる)
    P.counter = sp > 0.5 && (ix || iz) && (ix * P.vx + iz * P.vz) < 0;
    if (ix || iz) {
      P.vx += (ix * max - P.vx) * Math.min(1, (mv.accel * dt) / max);
      P.vz += (iz * max - P.vz) * Math.min(1, (mv.accel * dt) / max);
    }
    if (!(ix || iz) || P.counter) {
      const s2 = Math.hypot(P.vx, P.vz);
      const ns = Math.max(0, s2 - mv.friction * dt);
      if (s2 > 0) { P.vx *= ns / s2; P.vz *= ns / s2; }
    }
    P.x += P.vx * dt; P.z += P.vz * dt;
    const A = MOVE.area;
    if (Math.abs(P.x) > A) { P.x = Math.sign(P.x) * A; P.vx = 0; }
    if (Math.abs(P.z) > A) { P.z = Math.sign(P.z) * A; P.vz = 0; }
    P.spd = Math.hypot(P.vx, P.vz) / max;
    P.travel += Math.hypot(P.vx, P.vz) * dt;
  }

  shoot() {
    this.shots++;
    // 移動中は弾がぶれる (最高速度の 30% を超えると、速いほど大きく)
    let ox = 0, oy = 0;
    const spd = this.player ? this.player.spd : 0;
    if (this.sc.player && this.sc.player.moveInaccuracy && spd > MOVE.accurate) {
      const spread = 1.5 + 8 * (spd - MOVE.accurate) / (1 - MOVE.accurate);
      const ang = rand(0, Math.PI * 2), rr = spread * Math.sqrt(Math.random());
      ox = Math.cos(ang) * rr; oy = Math.sin(ang) * rr;
    }
    const hit = this.aimed(ox, oy);
    this.events.push({ t: r3(this.t), type: 'shot', hit: !!hit, id: hit ? hit.id : 0, empty: this.targets.length === 0, spd: r3(spd) });
    if (hit) {
      this.hits++;
      hit.hp--;
      if (hit.hp <= 0) this.kill(hit);
      else sfx.play('hit', 0.7);
    } else {
      sfx.play('shot', 0.35);
    }
  }

  // ---- 切り返し検知テスト: 目標の切り返しと発光を合図として出し、クリックまでの時間を測る ----
  stepDetect() {
    const t = this.targets[0];
    if (!t) return;
    const sc = this.sc;
    if (this.flashUntil && this.t >= this.flashUntil) {
      const m = this.meshes.get(t.id);
      if (m) { m.material.color.copy(this.targetColor); m.material.emissive.copy(this.targetColor); }
      this.flashUntil = 0;
    }
    // 出現範囲の端に着く前に切り返す (端での切り返しは予測できるので記録上は edge として区別)
    if (Math.abs(t.x + t.vx * 0.08 - t.fc) > sc.field.yaw - 0.3) {
      t.vx = -t.vx;
      this.cue('reverse', true);
      this.nextCue = rand(...sc.cueEvery);
      return;
    }
    this.nextCue -= this.lastDt || 0;
    if (this.nextCue > 0) return;
    this.nextCue = rand(...sc.cueEvery);
    // 0.7 秒以内に端へ着きそうなら光らせずに切り返す (合図の直後に端での切り返しが重ならないように)
    const nearEdge = Math.abs(t.x + t.vx * 0.7 - t.fc) > sc.field.yaw - 0.3;
    if (!nearEdge && Math.random() < (sc.flashRate || 0.3)) {
      const m = this.meshes.get(t.id);
      if (m) { m.material.color.set('#ffffff'); m.material.emissive.set('#ffffff'); }
      this.flashUntil = this.t + 0.12;
      this.cue('flash');
    } else {
      t.vx = -t.vx;
      this.cue('reverse');
    }
  }
  cue(kind, edge = false) {
    this.events.push({ t: r3(this.t), type: 'cue', kind, edge });
    this.lastCue = { t: this.t, kind, answered: false };
  }
  detectPress() {
    const c = this.lastCue;
    const rt = c ? this.t - c.t : Infinity;
    this.events.push({ t: r3(this.t), type: 'press' });
    if (c && !c.answered && rt >= 0.08 && rt <= 1.0) {
      c.answered = true;
      this.kills++;
      this.lastRT = rt;
      sfx.play('hit', 0.6);
    } else {
      this.falses++;
      sfx.play('shot', 0.4);
    }
  }

  kill(t) {
    this.kills++;
    this.events.push({ t: r3(this.t), type: 'kill', id: t.id });
    sfx.play('kill', 0.6, rand(0.95, 1.08));
    this.pop(t);
    this.removeTarget(t);
    this.scheduleSpawn();
  }

  removeTarget(t) {
    this.targets = this.targets.filter((x) => x !== t);
    const m = this.meshes.get(t.id);
    if (m) { this.scene.remove(m); m.material.dispose(); this.meshes.delete(t.id); }
  }

  scheduleSpawn() {
    if (this.sc.player && this.sc.player.requireMove) { this.waitMove = this.player.travel + this.sc.player.requireMove; return; }
    if (this.sc.spawnDelay) this.pending.push(this.t + rand(...this.sc.spawnDelay));
    else this.spawn();
  }

  spawn() {
    const sc = this.sc, f = sc.field;
    const fc = Math.round(this.cx / 360) * 360;
    const r = Array.isArray(sc.radius) ? rand(...sc.radius) : sc.radius;
    let x = fc, y = 0;
    for (let i = 0; i < 60; i++) {
      if (sc.spawn.relative) {
        const d = rand(sc.spawn.minDist, sc.spawn.maxDist);
        let th = rand(0, Math.PI * 2);
        if (sc.spawn.axis === 'h') th = Math.random() < 0.5 ? 0 : Math.PI;
        if (sc.spawn.axis === 'v') th = Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
        const b = sc.spawn.bias;
        if (b && Math.random() < b.weight) {
          const center = { right: 0, up: Math.PI / 2, left: Math.PI, down: -Math.PI / 2 }[b.dir];
          if (b.dir === 'vertical') th = (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2 + rand(-0.4, 0.4);
          else th = center + rand(-0.6, 0.6);
        }
        x = this.cx + d * Math.cos(th);
        y = this.cy + d * Math.sin(th);
        if (Math.abs(x - fc) > f.yaw || Math.abs(y) > f.pitch) continue;
      } else {
        x = fc + rand(-f.yaw, f.yaw);
        y = rand(-f.pitch, f.pitch);
        if (angBetween(x, y, this.cx, this.cy) < r * 4) continue;
      }
      if (this.targets.some((o) => angBetween(x, y, o.x, o.y) < (o.r + r) * 2.2)) continue;
      break;
    }
    x = Math.max(fc - f.yaw, Math.min(fc + f.yaw, x));
    y = Math.max(-f.pitch, Math.min(f.pitch, y));
    [x, y] = this.canonical(x, y);

    const mv = sc.move || { kind: 'none' };
    let kind = mv.kind;
    if (kind === 'mixed') kind = ['none', 'strafe', 'adad', 'strafe'][Math.floor(Math.random() * 4)];
    const t = {
      id: this.nextId++, x, y, r, fc, kind, vx: 0, vy: 0, timer: 0, heading: rand(0, Math.PI * 2), omega: 0,
      hp: sc.hp || 1, hpLeft: sc.hpTime || Infinity, born: this.t, speed: (mv.speed || 0) * (mv.fixed ? 1 : rand(0.85, 1.15)),
    };
    if (kind === 'strafe' || kind === 'adad' || kind === 'detect') {
      t.vx = (Math.random() < 0.5 ? -1 : 1) * t.speed;
      t.timer = rand(mv.changeMin, mv.changeMax);
    }
    this.targets.push(t);
    const rv = this.rel(t);
    this.events.push({ t: r3(this.t), type: 'spawn', id: t.id, x: r3(rv.x), y: r3(rv.y), r: r3(rv.r) });
    this.ensureMesh(t.id, r);
    const v = this.viewDir(rv.x, rv.y);
    if (this.sc.targets === 1 || !this.onScreen(v)) sfx.play('spawn', this.onScreen(v) ? 0.35 : 0.8, 1, v);
  }

  // カメラから見た目標の向き (x: 右, y: 上, z: 後ろが正)
  viewDir(x, y) {
    this.camera.rotation.set(this.cy * DEG, -this.cx * DEG, 0);
    return dirOf(x, y).applyQuaternion(this.camera.quaternion.clone().invert());
  }
  onScreen(v) {
    if (v.z >= 0) return false;
    const ty = Math.tan((this.camera.fov / 2) * DEG);
    return Math.abs(v.y / -v.z) <= ty && Math.abs(v.x / -v.z) <= ty * this.camera.aspect;
  }

  ensureMesh(id, r) {
    let m = this.meshes.get(id);
    if (!m) {
      const col = this.targetColor || new THREE.Color('#ff3b5c');
      m = new THREE.Mesh(this.geo, new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.35, roughness: 0.35, metalness: 0.1 }));
      this.scene.add(m);
      this.meshes.set(id, m);
    }
    m.scale.setScalar(DIST * Math.tan(r * DEG));
    return m;
  }

  clearMeshes() {
    for (const m of this.meshes.values()) { this.scene.remove(m); m.material.dispose(); }
    this.meshes.clear();
    for (const e of this.effects) this.scene.remove(e.mesh);
    this.effects = [];
  }

  pop(t) {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1, 32),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthTest: false }),
    );
    mesh.position.copy(dirOf(t.x, t.y).multiplyScalar(DIST));
    mesh.lookAt(0, 0, 0);
    const base = DIST * Math.tan(t.r * DEG);
    mesh.scale.setScalar(base);
    this.scene.add(mesh);
    this.effects.push({ mesh, age: 0, base });
  }

  moveTargets(dt) {
    const f = this.sc.field, mv = this.sc.move || {};
    for (const t of this.targets) {
      if (t.kind === 'none') continue;
      if (t.kind === 'strafe' || t.kind === 'adad') {
        t.timer -= dt;
        if (t.timer <= 0) {
          t.timer = t.kind === 'adad' ? rand(mv.changeMin || 0.2, mv.changeMax || 0.8) : rand(mv.changeMin || 0.5, mv.changeMax || 1.5);
          if (t.kind === 'adad' || Math.random() < 0.6) t.vx = -Math.sign(t.vx || 1) * t.speed * (mv.fixed ? 1 : rand(0.7, 1.25));
        }
      } else if (t.kind === 'smooth') {
        t.omega += rand(-1, 1) * 9 * dt;
        t.omega = Math.max(-2.4, Math.min(2.4, t.omega)) * 0.995;
        t.heading += t.omega * dt;
        t.vx = t.speed * Math.cos(t.heading);
        t.vy = t.speed * 0.55 * Math.sin(t.heading);
      }
      t.x += t.vx * dt;
      t.y += t.vy * dt;
      if (t.x > t.fc + f.yaw) { t.x = t.fc + f.yaw; t.vx = -Math.abs(t.vx); t.heading = Math.PI - t.heading; }
      if (t.x < t.fc - f.yaw) { t.x = t.fc - f.yaw; t.vx = Math.abs(t.vx); t.heading = Math.PI - t.heading; }
      if (t.y > f.pitch) { t.y = f.pitch; t.vy = -Math.abs(t.vy); t.heading = -t.heading; }
      if (t.y < -f.pitch) { t.y = -f.pitch; t.vy = Math.abs(t.vy); t.heading = -t.heading; }
    }
  }

  step(dt) {
    this.lastDt = dt;
    if (this.phase === 'countdown') {
      this.cd -= dt;
      const n = Math.ceil(this.cd);
      if (n !== this.lastCd) {
        this.lastCd = n;
        if (n > 0) sfx.play('beep', 0.5);
        this.onCountdown && this.onCountdown(n > 0 ? n : 0);
      }
      if (this.cd <= 0) {
        this.phase = 'play';
        if (this.t === 0) {
          sfx.play('beep', 0.6, 1.5);
          if (this.sc.spawnDelay) this.pending.push(rand(...this.sc.spawnDelay));
          else for (let i = 0; i < this.sc.targets; i++) this.spawn();
        }
      }
      return;
    }
    if (this.phase !== 'play') return;
    this.t += dt;
    if (this.sc.type === 'detect') this.stepDetect();
    if (this.sc.player) {
      this.updatePlayer(dt);
      if (this.waitMove && this.player.travel >= this.waitMove) { this.waitMove = 0; this.spawn(); }
    }
    this.moveTargets(dt);

    if (this.sc.lifetime) {
      for (const t of [...this.targets]) {
        if (this.t - t.born > this.sc.lifetime) {
          this.events.push({ t: r3(this.t), type: 'expire', id: t.id });
          this.removeTarget(t);
          this.scheduleSpawn();
        }
      }
    }
    this.pending = this.pending.filter((at) => {
      if (this.t >= at) { this.spawn(); return false; }
      return true;
    });

    if (this.sc.type === 'track') {
      const a = this.aimed();
      const on = !!a && this.firing && !(this.sc.player && this.sc.player.requireMoving && this.player.spd < 0.5);
      // 当たっている間、発射レート (12 発/秒) でヒット音を鳴らす。当たり始めは即座に鳴らす
      if (on) {
        this.tickAcc = (this.tickAcc ?? TICK) + dt;
        if (this.tickAcc >= TICK) { this.tickAcc -= TICK; sfx.play('tick', 0.55, 0.97 + Math.random() * 0.06); }
      } else this.tickAcc = TICK;
      if (on) {
        this.onTime += dt;
        a.hpLeft -= dt;
        if (a.hpLeft <= 0) this.kill(a);
      }
      for (const t of this.targets) {
        const m = this.meshes.get(t.id);
        if (m) m.material.emissiveIntensity = on && t === a ? 1.1 : 0.35;
      }
    }

    if (this.t - this.lastSample >= 1 / 250) {
      this.lastSample = this.t;
      const S = this.samples;
      S.t.push(r3(this.t)); S.cx.push(r3(this.cx)); S.cy.push(r3(this.cy)); S.f.push(this.firing ? 1 : 0);
      S.tg.push(this.targets.map((t) => { const v = this.rel(t); return [t.id, r3(v.x), r3(v.y), r3(v.r)]; }));
      if (this.sc.player) {
        (S.ps ||= []).push(Math.round(this.player.spd * 100) / 100);
        (S.pc ||= []).push(this.player.counter ? 1 : 0);
      }
    }

    this.onHud && this.onHud({
      lastRT: this.lastRT, falses: this.falses,
      left: Math.max(0, this.duration - this.t), kills: this.kills,
      spd: this.player ? this.player.spd : 0, moving: !!this.sc.player,
      px: this.player ? this.player.x : 0, pz: this.player ? this.player.z : 0, yaw: this.cx, area: MOVE.area,
      atEdge: this.player ? Math.max(Math.abs(this.player.x), Math.abs(this.player.z)) > MOVE.area - 0.05 : false,
      acc: this.shots ? this.hits / this.shots : 1, on: this.t > 0 ? this.onTime / this.t : 0,
    });

    if (this.t >= this.duration) this.finish();
  }

  finish() {
    this.phase = 'done';
    this.firing = false;
    if (this.locked()) document.exitPointerLock();
    const avgFps = this.playMs > 0 ? Math.round((this.playFrames * 1000) / this.playMs) : null;
    const rec = { samples: this.samples, events: this.events, duration: this.duration, settings: { ...this.snap, avgFps } };
    this.active = false;
    this.mode = 'idle';
    this.onEnd && this.onEnd(rec);
  }

  // ---------------- リプレイ ----------------
  loadReplay(rep) {
    this.moveArea.visible = false;
    this.clearMeshes();
    this.mode = 'replay';
    this.phase = 'idle';
    this.rep = rep;
    this.rt = 0;
    this.rplay = false;
    this.rspeed = 1;
    this.trail = true;
    this.targetColor = new THREE.Color(rep.targetColor || '#ff3b5c');
    this.setFov(rep.rec.settings.vfov);
    this.active = true;
    this.shotEvents = rep.rec.events.filter((e) => e.type === 'shot');
  }

  sampleIndex(t) {
    const T = this.rep.rec.samples.t;
    let lo = 0, hi = T.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (T[mid] <= t) lo = mid; else hi = mid - 1;
    }
    return lo;
  }

  aimAt(t) {
    const S = this.rep.rec.samples;
    const i = this.sampleIndex(t);
    const j = Math.min(i + 1, S.t.length - 1);
    const k = j > i ? Math.max(0, Math.min(1, (t - S.t[i]) / (S.t[j] - S.t[i]))) : 0;
    return { x: S.cx[i] + (S.cx[j] - S.cx[i]) * k, y: S.cy[i] + (S.cy[j] - S.cy[i]) * k, i };
  }

  replayFrame(dt) {
    const S = this.rep.rec.samples;
    if (!S.t.length) return;
    const end = S.t[S.t.length - 1];
    if (this.rplay) {
      this.rt += dt * this.rspeed;
      if (this.rt >= end) { this.rt = end; this.rplay = false; }
    }
    const a = this.aimAt(this.rt);
    this.cx = a.x; this.cy = a.y;
    const snap = S.tg[a.i] || [];
    const ids = new Set();
    for (const [id, x, y, r] of snap) {
      ids.add(id);
      const m = this.ensureMesh(id, r);
      m.position.copy(dirOf(x, y).multiplyScalar(DIST));
    }
    for (const [id, m] of this.meshes) if (!ids.has(id)) { this.scene.remove(m); m.material.dispose(); this.meshes.delete(id); }
    this.onReplayTick && this.onReplayTick(this.rt, end);
  }

  drawOverlay() {
    const g = this.octx, W = this.overlay.width, H = this.overlay.height;
    g.clearRect(0, 0, W, H);
    if (this.mode === 'play' && this.phase === 'play' && this.s.showOffscreen) { this.drawIndicators(g, W, H); return; }
    if (this.mode !== 'replay' || !this.trail) return;
    const proj = (x, y) => {
      const v = dirOf(x, y).multiplyScalar(DIST).project(this.camera);
      return v.z > 1 ? null : [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H];
    };
    const span = 0.7, steps = 42;
    let prev = null;
    g.lineCap = 'round';
    for (let k = steps; k >= 0; k--) {
      const t = this.rt - (span * k) / steps;
      if (t < 0) { prev = null; continue; }
      const a = this.aimAt(t);
      const p = proj(a.x, a.y);
      if (p && prev) {
        g.strokeStyle = `rgba(0,255,170,${(1 - k / steps) * 0.9})`;
        g.lineWidth = 3 * devicePixelRatio;
        g.beginPath(); g.moveTo(prev[0], prev[1]); g.lineTo(p[0], p[1]); g.stroke();
      }
      prev = p;
    }
    for (const e of this.shotEvents) {
      if (e.t > this.rt || e.t < this.rt - 0.5) continue;
      const a = this.aimAt(e.t);
      const p = proj(a.x, a.y);
      if (!p) continue;
      const al = 1 - (this.rt - e.t) / 0.5;
      const s = 9 * devicePixelRatio;
      g.lineWidth = 2.5 * devicePixelRatio;
      if (e.hit) {
        g.strokeStyle = `rgba(80,255,140,${al})`;
        g.beginPath(); g.arc(p[0], p[1], s, 0, Math.PI * 2); g.stroke();
      } else {
        g.strokeStyle = `rgba(255,80,90,${al})`;
        g.beginPath(); g.moveTo(p[0] - s, p[1] - s); g.lineTo(p[0] + s, p[1] + s);
        g.moveTo(p[0] + s, p[1] - s); g.lineTo(p[0] - s, p[1] + s); g.stroke();
      }
    }
  }

  drawIndicators(g, W, H) {
    const dpr = devicePixelRatio || 1;
    const m = 70 * dpr;
    const col = this.s.targetColor || '#ff3b5c';
    const pulse = 0.75 + 0.25 * Math.sin(performance.now() / 120);
    for (const t of this.targets) {
      const rv = this.rel(t);
      const v = this.viewDir(rv.x, rv.y);
      if (this.onScreen(v)) continue;
      let dx = v.x, dy = v.y;
      if (Math.hypot(dx, dy) < 1e-3) dx = 1; // 真後ろ
      const len = Math.hypot(dx, dy);
      dx /= len; dy /= len;
      const k = Math.min((W / 2 - m) / Math.abs(dx || 1e-9), (H / 2 - m) / Math.abs(dy || 1e-9));
      const px = W / 2 + dx * k, py = H / 2 - dy * k;
      const ang = Math.atan2(-dy, dx);
      const s = 16 * dpr;
      g.save();
      g.translate(px, py);
      g.rotate(ang);
      g.globalAlpha = pulse;
      g.fillStyle = col;
      g.strokeStyle = '#000';
      g.lineWidth = 2 * dpr;
      g.beginPath(); g.moveTo(s, 0); g.lineTo(-s * 0.7, s * 0.75); g.lineTo(-s * 0.35, 0); g.lineTo(-s * 0.7, -s * 0.75); g.closePath();
      g.stroke(); g.fill();
      g.restore();
      const deg = Math.round(angBetween(this.cx, this.cy, rv.x, rv.y));
      g.font = `700 ${13 * dpr}px Rajdhani, sans-serif`;
      g.textAlign = 'center';
      g.fillStyle = '#fff';
      g.globalAlpha = 0.9;
      g.fillText(`${deg}°`, px - dx * 28 * dpr, py + dy * 28 * dpr + 4 * dpr);
      g.globalAlpha = 1;
    }
  }

  stopReplay() { this.mode = 'idle'; this.active = false; this.rplay = false; this.clearMeshes(); this.octx.clearRect(0, 0, this.overlay.width, this.overlay.height); }

  // ---------------- 毎フレーム ----------------
  frame(dt) {
    if (this.mode === 'play') {
      this.step(dt);
      for (const t of this.targets || []) {
        const m = this.meshes.get(t.id);
        if (m) m.position.copy(dirOf(t.x, t.y).multiplyScalar(DIST));
      }
    } else if (this.mode === 'replay') {
      this.replayFrame(dt);
    }
    this.effects = this.effects.filter((e) => {
      e.age += dt;
      const k = e.age / 0.25;
      e.mesh.scale.setScalar(e.base * (1 + k * 1.6));
      e.mesh.material.opacity = Math.max(0, 0.9 * (1 - k));
      if (k >= 1) { this.scene.remove(e.mesh); e.mesh.geometry.dispose(); e.mesh.material.dispose(); return false; }
      return true;
    });
    this.camera.rotation.set(this.cy * DEG, -this.cx * DEG, 0);
    if (this.mode === 'play' && this.player) {
      this.camera.position.set(this.player.x, 0, this.player.z);
      if (this.sc && this.sc.player) {
        const edge = Math.max(Math.abs(this.player.x), Math.abs(this.player.z)) > MOVE.area - 0.05;
        this.areaEdge.material.color.set(edge ? 0xffb84d : 0x3fd0ff);
        this.areaEdge.material.opacity = edge ? 1 : 0.6;
      }
    }
    else this.camera.position.set(0, 0, 0);
    this.renderer.render(this.scene, this.camera);
    this.drawOverlay();
  }
}
