// グラフ (Chart.js) と独自描画
import Chart from 'chart.js/auto';

Chart.defaults.color = '#8b97b0';
Chart.defaults.borderColor = '#24304a';
Chart.defaults.font.family = "'Noto Sans JP', sans-serif";

const live = [];
export function chart(canvas, cfg) {
  const c = new Chart(canvas, cfg);
  live.push(c);
  return c;
}
export function destroyCharts() { live.splice(0).forEach((c) => c.destroy()); }

export function radarChart(canvas, labels, sets) {
  return chart(canvas, {
    type: 'radar',
    data: {
      labels,
      datasets: sets.map((s) => ({
        label: s.label, data: s.data, borderColor: s.color, backgroundColor: s.color + '33', pointBackgroundColor: s.color,
        borderWidth: 2, pointRadius: 3, spanGaps: true,
      })),
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { display: sets.length > 1 } },
      scales: {
        r: {
          min: 0, max: 110, ticks: { display: false, stepSize: 20 },
          grid: { color: '#24304a' }, angleLines: { color: '#24304a' },
          pointLabels: { color: '#e7ecf6', font: { size: 13, weight: '700' } },
        },
      },
    },
  });
}

// フリック軌跡: 開始点 (0,0)、目標 (1,0) に正規化した照準の通り道
export function drawPaths(canvas, paths) {
  const dpr = devicePixelRatio || 1;
  const W = canvas.clientWidth, H = canvas.clientHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const g = canvas.getContext('2d');
  g.scale(dpr, dpr);
  const x0 = -0.08, x1 = 1.45, yr = 0.42;
  const sx = (x) => ((x - x0) / (x1 - x0)) * W;
  const sy = (y) => H / 2 - (y / yr) * (H / 2);
  g.fillStyle = '#0b1120';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = '#24304a';
  g.setLineDash([4, 4]);
  g.beginPath(); g.moveTo(sx(1), 0); g.lineTo(sx(1), H); g.moveTo(0, sy(0)); g.lineTo(W, sy(0)); g.stroke();
  g.setLineDash([]);
  const col = { over: '#ff5d73', under: '#ffb84d', on: '#2ee6a6' };
  for (const { p, o } of paths) {
    g.strokeStyle = (col[o] || '#8b97b0') + 'aa';
    g.lineWidth = 1.6;
    g.beginPath();
    p.forEach(([x, y], i) => (i ? g.lineTo(sx(x), sy(y)) : g.moveTo(sx(x), sy(y))));
    g.stroke();
  }
  g.fillStyle = '#ffffff';
  g.beginPath(); g.arc(sx(0), sy(0), 4, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#ff3b5c'; g.lineWidth = 2;
  g.beginPath(); g.arc(sx(1), sy(0), 9, 0, Math.PI * 2); g.stroke();
  g.font = '12px Noto Sans JP';
  g.fillStyle = '#8b97b0';
  g.fillText('開始位置', sx(0) + 8, sy(0) + 18);
  g.fillText('目標', sx(1) + 12, sy(0) + 18);
  let lx = 10;
  for (const [k, name] of [['on', '一発で到達'], ['under', '手前で停止'], ['over', '行き過ぎ']]) {
    g.fillStyle = col[k]; g.fillRect(lx, 10, 12, 4);
    g.fillStyle = '#c3cbe0'; g.fillText(name, lx + 16, 16);
    lx += 100;
  }
}
