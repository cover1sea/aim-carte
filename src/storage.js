// 履歴 (localStorage) とリプレイ (IndexedDB)
const SKEY = 'at_sessions';
const CKEY = 'at_custom_scenarios';
const MAX_REPLAYS = 30;

export function loadSessions() {
  try { return JSON.parse(localStorage.getItem(SKEY) || '[]'); } catch { return []; }
}
export function addSession(s) {
  const all = loadSessions();
  all.push(s);
  if (all.length > 3000) all.splice(0, all.length - 3000);
  localStorage.setItem(SKEY, JSON.stringify(all));
}
export function clearSessions() { localStorage.removeItem(SKEY); }
export function replaceSessions(all) { localStorage.setItem(SKEY, JSON.stringify(all)); }

export function loadCustomScenarios() {
  try { return JSON.parse(localStorage.getItem(CKEY) || '[]'); } catch { return []; }
}
export function saveCustomScenario(sc) {
  const all = loadCustomScenarios().filter((x) => x.id !== sc.id);
  all.unshift(sc);
  localStorage.setItem(CKEY, JSON.stringify(all.slice(0, 30)));
}
export function deleteCustomScenario(id) {
  localStorage.setItem(CKEY, JSON.stringify(loadCustomScenarios().filter((x) => x.id !== id)));
}

let dbp = null;
function db() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open('aimtrainer', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('replays', { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbp;
}
function tx(mode, fn) {
  return db().then((d) => new Promise((resolve, reject) => {
    const t = d.transaction('replays', mode);
    const r = fn(t.objectStore('replays'));
    t.oncomplete = () => resolve(r && r.result);
    t.onerror = () => reject(t.error);
  }));
}
export async function saveReplay(rep) {
  await tx('readwrite', (st) => st.put(rep));
  const keys = await tx('readonly', (st) => st.getAllKeys());
  if (keys.length > MAX_REPLAYS) {
    const sorted = keys.slice().sort();
    await tx('readwrite', (st) => sorted.slice(0, keys.length - MAX_REPLAYS).forEach((k) => st.delete(k)));
  }
}
export const getReplay = (id) => tx('readonly', (st) => st.get(id));
export const listReplayIds = () => tx('readonly', (st) => st.getAllKeys());
