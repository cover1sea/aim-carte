// 効果音 (public/sfx の WAV を WebAudio で再生)
// 読み込み時に、頭の無音と末尾の無音を切り、短いフェードを付けてプツッという音を防ぐ
const NAMES = ['hit', 'shot', 'kill', 'fanfare', 'beep', 'tick', 'spawn'];
let ctx = null;
const buffers = {};
let master = null;

const FADE_IN = 0.003;
const FADE_OUT = 0.02;

function clean(buf) {
  const sr = buf.sampleRate;
  const chs = [...Array(buf.numberOfChannels)].map((_, c) => buf.getChannelData(c));
  let peak = 0;
  for (const d of chs) for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  const thr = peak * 0.01;
  const loud = (i) => chs.some((d) => Math.abs(d[i]) > thr);
  let start = 0;
  while (start < buf.length - 1 && !loud(start)) start++;
  let end = buf.length - 1;
  while (end > start && !loud(end)) end--;
  end = Math.min(buf.length, end + Math.round(sr * 0.03));
  const len = Math.max(1, end - start);
  const out = ctx.createBuffer(buf.numberOfChannels, len, sr);
  const fi = Math.round(sr * FADE_IN), fo = Math.min(Math.round(sr * FADE_OUT), Math.floor(len / 2));
  chs.forEach((d, c) => {
    const o = out.getChannelData(c);
    for (let i = 0; i < len; i++) {
      let g = 1;
      if (i < fi) g = i / fi;
      if (i > len - fo) g = Math.min(g, (len - i) / fo);
      o[i] = d[start + i] * g;
    }
  });
  return out;
}

export async function initAudio(volume) {
  if (ctx) { setVolume(volume); return; }
  ctx = new AudioContext();
  master = ctx.createGain();
  master.connect(ctx.destination);
  setVolume(volume);
  await Promise.all(NAMES.map(async (n) => {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}sfx/${n}.wav`);
      buffers[n] = clean(await ctx.decodeAudioData(await res.arrayBuffer()));
    } catch { /* 音が無くても動作は続ける */ }
  }));
}
export function setVolume(v) { if (master) master.gain.value = v; }
export function resume() { if (ctx && ctx.state !== 'running') ctx.resume(); }

// pos を渡すと立体音にする。pos はカメラから見た向き (x: 右, y: 上, z: 後ろ が正)
export function play(name, gain = 1, rate = 1, pos = null) {
  if (!ctx || !buffers[name]) return;
  const src = ctx.createBufferSource();
  src.buffer = buffers[name];
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.value = gain;
  let node = src.connect(g);
  if (pos) {
    const p = new PannerNode(ctx, {
      panningModel: 'HRTF', distanceModel: 'inverse', refDistance: 1, rolloffFactor: 0,
      positionX: pos.x, positionY: pos.y, positionZ: pos.z,
    });
    node = node.connect(p);
  }
  node.connect(master);
  src.start();
}
