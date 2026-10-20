// ゲームごとの感度・FOV 設定と換算
const KEY = 'at_settings';
const RAD = Math.PI / 180;

// yaw: 感度1あたり・マウス1カウントあたりの回転角 (度)
export const GAMES = {
  ow: { name: 'Overwatch 2', yaw: 0.0066, sens: 5, fov: 103, fovMin: 80, fovMax: 103, sensStep: 0.01,
    fovNote: 'ゲーム内の FOV 値 (16:9 の水平FOV)' },
  val: { name: 'VALORANT', yaw: 0.07, sens: 0.4, fov: 103, fixedFov: true, sensStep: 0.001,
    fovNote: 'FOV は 103° 固定 (16:9 の水平FOV)' },
  apex: { name: 'Apex Legends', yaw: 0.022, sens: 1.6, fov: 90, fovMin: 70, fovMax: 110, sensStep: 0.01,
    fovNote: 'ゲーム内の FOV 値 (4:3 基準)。16:9 の水平FOV に換算して表示' },
  custom: { name: 'カスタム', yaw: 0.022, sens: 1, fov: 103, fovMin: 60, fovMax: 130, sensStep: 0.001,
    fovNote: '16:9 の水平FOV を直接指定' },
};

const DEFAULTS = {
  game: 'val',
  sens: { ow: 5, val: 0.4, apex: 1.6, custom: 1 },
  fov: { ow: 103, val: 103, apex: 90, custom: 103 },
  customYaw: 0.022,
  dpi: 800,
  volume: 0.6,
  rawInput: true,
  showFps: true,
  showOffscreen: true,
  targetColor: '#ff3b5c',
  crosshair: { color: '#00ff9c', size: 6, gap: 3, thick: 2, dot: true, outline: true },
  duration: 60,
};

export function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}');
    return {
      ...DEFAULTS, ...s,
      sens: { ...DEFAULTS.sens, ...(s.sens || {}) },
      fov: { ...DEFAULTS.fov, ...(s.fov || {}) },
      crosshair: { ...DEFAULTS.crosshair, ...(s.crosshair || {}) },
    };
  } catch { return structuredClone(DEFAULTS); }
}
export function saveSettings(s) { localStorage.setItem(KEY, JSON.stringify(s)); }

export const yawOf = (s, g = s.game) => (g === 'custom' ? s.customYaw : GAMES[g].yaw);
export const degPerCount = (s) => s.sens[s.game] * yawOf(s);
export const cm360 = (s, g = s.game) => (360 / (s.sens[g] * yawOf(s, g) * s.dpi)) * 2.54;

// 16:9 での水平FOV (度)
export function hfov169(s, g = s.game) {
  if (g === 'val') return 103;
  const v = s.fov[g];
  if (g === 'apex') return (2 * Math.atan(Math.tan((v / 2) * RAD) * 4 / 3)) / RAD;
  return v;
}
// Hor+ なので垂直FOV は 16:9 基準で固定
export const vfovOf = (hfov) => (2 * Math.atan(Math.tan((hfov / 2) * RAD) * 9 / 16)) / RAD;

// cm/360 を保ったまま別ゲームの感度へ換算
export function convertSens(s, from, to) {
  return (s.sens[from] * yawOf(s, from)) / yawOf(s, to);
}
