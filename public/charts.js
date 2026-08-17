/* ==================================================================
   charts.js — the SVG chart primitives the Analytics page draws with.

   No dependencies and no build step: every function returns an SVG
   string, so charts drop straight into the same innerHTML render the
   rest of the app uses. Hover is handled by ONE delegated listener at
   the bottom of this file rather than per-chart wiring, which is what
   lets the markup stay a plain string.

   Colours come from the CSS custom properties defined in index.html
   (--s1…--s8 categorical, --seq-* sequential). That palette was checked
   against this app's white surface with the dataviz validator: every
   adjacent pair clears the colour-blind separation floor. Three of the
   slots sit under 3:1 contrast on white, so charts here always carry
   direct labels or a table view — colour never carries meaning alone.
================================================================== */

const CH = {
  /* categorical slots, assigned in fixed order and never cycled */
  series: ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)', 'var(--s8)'],
  grid: 'var(--line)',
  axis: 'var(--silver)',
  ink: 'var(--muted)',
  /* sequential ramp, light → dark; index 0 is nearest the surface */
  seq: ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b'],
  /* ordinal steps never go lighter than seq[3] — below that a discrete mark
     recedes into the background. Used for funnel stages. */
  ordinal: (i, n) => CH.seq[Math.min(CH.seq.length - 1, 3 + Math.round(i * (8 / Math.max(1, n - 1))))],
};

const chEsc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/* Marks carry their tooltip as data attributes; the delegated handler reads
   them back out with textContent, so nothing here can inject markup. */
const tip = (title, value) => `data-tip="${chEsc(title)}" data-tipv="${chEsc(value)}"`;

/* "Nice" axis maximum — rounds up to 1/2/5 × a power of ten so ticks land on
   readable numbers instead of 3847. */
function niceMax(v) {
  if (!(v > 0)) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
}

function ticks(max, count = 4) {
  const out = [];
  for (let i = 0; i <= count; i++) out.push((max / count) * i);
  return out;
}

/* Thin out x labels so they never collide: show at most `keep` of them. */
function labelEvery(n, keep = 7) { return Math.max(1, Math.ceil(n / keep)); }

const svgOpen = (w, h, cls = '') =>
  `<svg class="chart-svg ${cls}" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img">`;

/* ------------------------------------------------------------------
   Line / area — trend over time. Crosshair + tooltip on hover.
   series: [{ name, points: [{ x: <label>, y: <number> }] }]
------------------------------------------------------------------- */
function chartLine({ series, width = 560, height = 220, format = String, area = null, yMax = null }) {
  const pad = { t: 14, r: 14, b: 26, l: 46 };
  const W = width, H = height;
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const labels = series[0] ? series[0].points.map(p => p.x) : [];
  const n = labels.length;
  if (!n) return chartEmpty(W, H);

  const max = niceMax(yMax != null ? yMax : Math.max(1, ...series.flatMap(s => s.points.map(p => p.y))));
  const px = (i) => pad.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  const py = (v) => pad.t + ih - (v / max) * ih;
  // A single series reads as one shape; area fill only makes sense there.
  const useArea = area == null ? series.length === 1 : area;

  let out = svgOpen(W, H, 'chart-line');

  for (const t of ticks(max)) {
    out += `<line x1="${pad.l}" y1="${py(t).toFixed(1)}" x2="${W - pad.r}" y2="${py(t).toFixed(1)}" stroke="${CH.grid}" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
    out += `<text x="${pad.l - 8}" y="${(py(t) + 4).toFixed(1)}" text-anchor="end" class="chart-tick">${chEsc(format(t))}</text>`;
  }

  const step = labelEvery(n);
  labels.forEach((l, i) => {
    if (i % step && i !== n - 1) return;
    out += `<text x="${px(i).toFixed(1)}" y="${H - 8}" text-anchor="middle" class="chart-tick">${chEsc(l)}</text>`;
  });

  series.forEach((s, si) => {
    const c = s.color || CH.series[si % CH.series.length];
    const d = s.points.map((p, i) => `${i ? 'L' : 'M'}${px(i).toFixed(1)},${py(p.y).toFixed(1)}`).join(' ');
    if (useArea) {
      out += `<path d="${d} L${px(n - 1).toFixed(1)},${py(0).toFixed(1)} L${px(0).toFixed(1)},${py(0).toFixed(1)} Z" fill="${c}" opacity=".10"/>`;
    }
    out += `<path d="${d}" fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`;
    // A lone point would be invisible as a path — draw it as a dot.
    if (n === 1) out += `<circle cx="${px(0)}" cy="${py(s.points[0].y)}" r="4" fill="${c}"/>`;
    s.points.forEach((p, i) => {
      out += `<circle class="ch-dot" data-i="${i}" data-s="${si}" cx="${px(i).toFixed(1)}" cy="${py(p.y).toFixed(1)}" r="4" fill="${c}" stroke="#fff" stroke-width="2" opacity="0"/>`;
    });
  });

  out += `<line class="ch-cross" x1="0" y1="${pad.t}" x2="0" y2="${pad.t + ih}" stroke="${CH.axis}" stroke-width="1" stroke-dasharray="3 3" opacity="0" vector-effect="non-scaling-stroke"/>`;
  out += `<line x1="${pad.l}" y1="${pad.t + ih}" x2="${W - pad.r}" y2="${pad.t + ih}" stroke="${CH.axis}" stroke-width="1" vector-effect="non-scaling-stroke"/>`;

  // Invisible hit bands: one per x position, each wider than the mark so the
  // whole column is grabbable rather than just the 4px dot.
  const bw = n === 1 ? iw : iw / (n - 1);
  labels.forEach((l, i) => {
    const value = series.map(s => `${s.name}: ${format(s.points[i] ? s.points[i].y : 0)}`).join('  ·  ');
    out += `<rect class="ch-band" data-i="${i}" data-x="${px(i).toFixed(1)}" x="${(px(i) - bw / 2).toFixed(1)}" y="${pad.t}" width="${bw.toFixed(1)}" height="${ih}" fill="transparent" ${tip(l, value)}/>`;
  });

  return out + '</svg>';
}

/* ------------------------------------------------------------------
   Bars — magnitude, low → high. Horizontal by default: category names
   are long, and a horizontal bar gives them room to be read straight.
   rows: [{ label, value, sub? }]
------------------------------------------------------------------- */
function chartBars({ rows, width = 560, rowHeight = 30, format = String, color = null, sequential = true, labelWidth = 140 }) {
  if (!rows.length) return chartEmpty(width, 120);
  const W = width, H = rows.length * rowHeight + 12;
  const pad = { l: labelWidth, r: 62 };
  const iw = W - pad.l - pad.r;
  const max = Math.max(1, ...rows.map(r => r.value));

  let out = svgOpen(W, H, 'chart-bars');
  rows.forEach((r, i) => {
    const y = i * rowHeight + 6;
    const h = rowHeight - 12;
    const w = Math.max(r.value > 0 ? 3 : 0, (r.value / max) * iw);
    const c = r.color || color || (sequential
      ? CH.seq[Math.min(CH.seq.length - 1, 4 + Math.round((r.value / max) * 7))]
      : CH.series[i % CH.series.length]);
    out += `<text x="${pad.l - 10}" y="${y + h / 2 + 4}" text-anchor="end" class="chart-label">${chEsc(r.label)}</text>`;
    out += `<rect x="${pad.l}" y="${y}" width="${iw}" height="${h}" rx="4" fill="var(--bg-soft)"/>`;
    // 4px rounded data-end, anchored flat against the baseline.
    if (w > 0) out += `<rect class="ch-mark" x="${pad.l}" y="${y}" width="${w.toFixed(1)}" height="${h}" rx="4" fill="${c}" ${tip(r.label, r.sub ? `${format(r.value)}  ·  ${r.sub}` : format(r.value))}/>`;
    // Direct label: the required relief for the sub-3:1 slots, and it saves a
    // trip to the tooltip for the value people actually came to read.
    out += `<text x="${W - pad.r + 8}" y="${y + h / 2 + 4}" class="chart-value">${chEsc(format(r.value))}</text>`;
  });
  return out + '</svg>';
}

/* ------------------------------------------------------------------
   Grouped bars — two measures side by side per category (supply vs
   demand). Two series only; more than that becomes unreadable.
------------------------------------------------------------------- */
function chartGrouped({ rows, series, width = 560, rowHeight = 34, format = String, labelWidth = 140 }) {
  if (!rows.length) return chartEmpty(width, 120);
  const W = width, H = rows.length * rowHeight + 12;
  const pad = { l: labelWidth, r: 56 };
  const iw = W - pad.l - pad.r;
  const max = Math.max(1, ...rows.flatMap(r => series.map(s => r[s.key])));

  let out = svgOpen(W, H, 'chart-grouped');
  rows.forEach((r, i) => {
    const top = i * rowHeight + 5;
    const bh = (rowHeight - 14) / series.length;
    out += `<text x="${pad.l - 10}" y="${top + rowHeight / 2 - 1}" text-anchor="end" class="chart-label">${chEsc(r.label)}</text>`;
    series.forEach((s, si) => {
      const v = r[s.key];
      const w = v > 0 ? Math.max(3, (v / max) * iw) : 0;
      // 2px surface gap between the two bars so they never fuse into one mark.
      const y = top + si * (bh + 2);
      if (w > 0) out += `<rect class="ch-mark" x="${pad.l}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${bh.toFixed(1)}" rx="3" fill="${CH.series[si]}" ${tip(r.label, `${s.name}: ${format(v)}`)}/>`;
      out += `<text x="${pad.l + w + 6}" y="${(y + bh / 2 + 3.5).toFixed(1)}" class="chart-value sm">${chEsc(format(v))}</text>`;
    });
  });
  return out + '</svg>';
}

/* ------------------------------------------------------------------
   Funnel — ordered stages, each a share of the first. Ordinal ramp, so
   the darkening reads as "further along" rather than as identity.
------------------------------------------------------------------- */
function chartFunnel({ stages, width = 560, rowHeight = 42 }) {
  if (!stages.length) return chartEmpty(width, 120);
  const W = width, H = stages.length * rowHeight + 8;
  const pad = { l: 128, r: 96 };
  const iw = W - pad.l - pad.r;
  const top = Math.max(1, stages[0].n);

  let out = svgOpen(W, H, 'chart-funnel');
  stages.forEach((s, i) => {
    const y = i * rowHeight + 6;
    const h = rowHeight - 14;
    const w = (s.n / top) * iw;
    const share = top ? Math.round((s.n / top) * 100) : 0;
    const dropped = i ? stages[i - 1].n - s.n : 0;
    out += `<text x="${pad.l - 10}" y="${y + h / 2 + 4}" text-anchor="end" class="chart-label">${chEsc(s.label)}</text>`;
    out += `<rect x="${pad.l}" y="${y}" width="${iw}" height="${h}" rx="4" fill="var(--bg-soft)"/>`;
    if (w > 0) out += `<rect class="ch-mark" x="${pad.l}" y="${y}" width="${w.toFixed(1)}" height="${h}" rx="4" fill="${CH.ordinal(i, stages.length)}" ${tip(s.label, `${s.n} tasks · ${share}% of posted${i ? ` · ${dropped} lost at this step` : ''}`)}/>`;
    out += `<text x="${W - pad.r + 8}" y="${y + h / 2 + 4}" class="chart-value">${s.n} <tspan class="chart-muted">(${share}%)</tspan></text>`;
  });
  return out + '</svg>';
}

/* ------------------------------------------------------------------
   Heatmap — day of week × hour of day. Sequential magnitude, so one hue
   light → dark; the cell value is in the tooltip.
------------------------------------------------------------------- */
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function chartHeatmap({ cells, width = 1080 }) {
  const pad = { l: 40, t: 18, b: 6 };
  const cols = 24, rowsN = 7;
  const cw = (width - pad.l - 6) / cols, chh = 22;
  const H = rowsN * chh + pad.t + pad.b;
  const grid = {};
  let max = 0;
  for (const c of cells) { grid[`${c.dow}:${c.hour}`] = c.n; if (c.n > max) max = c.n; }

  let out = svgOpen(width, H, 'chart-heat');
  for (let h = 0; h < cols; h += 3) {
    out += `<text x="${(pad.l + h * cw + cw / 2).toFixed(1)}" y="12" text-anchor="middle" class="chart-tick">${String(h).padStart(2, '0')}</text>`;
  }
  for (let d = 0; d < rowsN; d++) {
    out += `<text x="${pad.l - 8}" y="${pad.t + d * chh + chh / 2 + 4}" text-anchor="end" class="chart-tick">${DOW[d]}</text>`;
    for (let h = 0; h < cols; h++) {
      const v = grid[`${d}:${h}`] || 0;
      // Zero is the surface, not the palest step — an empty hour should read as
      // nothing happened, not as a small amount.
      const fill = v === 0 ? 'var(--bg-soft)' : CH.seq[Math.min(CH.seq.length - 1, Math.round((v / max) * (CH.seq.length - 1)))];
      out += `<rect class="ch-mark" x="${(pad.l + h * cw + 1).toFixed(1)}" y="${pad.t + d * chh + 1}" width="${(cw - 2).toFixed(1)}" height="${chh - 2}" rx="3" fill="${fill}" ${tip(`${DOW[d]} ${String(h).padStart(2, '0')}:00`, `${v} task${v === 1 ? '' : 's'} posted`)}/>`;
    }
  }
  return out + '</svg>';
}

/* ------------------------------------------------------------------
   Stat-tile trimmings
------------------------------------------------------------------- */
function sparkline({ points, width = 120, height = 32, color = 'var(--s1)' }) {
  if (!points || points.length < 2) return '';
  const max = Math.max(1, ...points);
  const px = (i) => (i / (points.length - 1)) * width;
  const py = (v) => height - 2 - (v / max) * (height - 4);
  const d = points.map((v, i) => `${i ? 'L' : 'M'}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true">
    <path d="${d} L${width},${height} L0,${height} Z" fill="${color}" opacity=".10"/>
    <path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;
}

/* A single ratio against its limit — a meter, not a two-slice pie. */
function meter({ value, max = 100, label = '', color = 'var(--s1)' }) {
  const p = max ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return `<div class="meter"><div class="meter-track"><div class="meter-fill" style="transform:scaleX(${(p / 100).toFixed(4)});background:${color}"></div></div>
    ${label ? `<div class="meter-label">${chEsc(label)}</div>` : ''}</div>`;
}

function chartEmpty(width, height) {
  return `${svgOpen(width, height, 'chart-none')}<text x="${width / 2}" y="${height / 2}" text-anchor="middle" class="chart-tick">No data in this range</text></svg>`;
}

/* Legend — always present for 2+ series, so identity never rests on colour. */
function legend(items) {
  return `<div class="chart-legend">${items.map((it, i) =>
    `<span class="lg"><i style="background:${it.color || CH.series[i % CH.series.length]}"></i>${chEsc(it.name)}</span>`).join('')}</div>`;
}

/* ==================================================================
   One delegated hover layer for every chart on the page.
================================================================== */
(function chartHover() {
  let el = null;
  const box = () => (el = el || (() => {
    const d = document.createElement('div');
    d.id = 'chart-tip';
    d.innerHTML = '<b></b><span></span>';
    document.body.appendChild(d);
    return d;
  })());

  function show(target, e) {
    const b = box();
    b.querySelector('b').textContent = target.getAttribute('data-tip') || '';
    b.querySelector('span').textContent = target.getAttribute('data-tipv') || '';
    b.classList.add('show');
    move(e);
  }
  function move(e) {
    const b = box();
    const w = b.offsetWidth, h = b.offsetHeight;
    // Flip before the tooltip runs off the right edge or the top of the window.
    let x = e.clientX + 14, y = e.clientY - h - 12;
    if (x + w > window.innerWidth - 8) x = e.clientX - w - 14;
    if (y < 8) y = e.clientY + 18;
    b.style.transform = `translate(${x}px, ${y}px)`;
  }
  function hide() { if (el) el.classList.remove('show'); }

  document.addEventListener('mousemove', (e) => {
    const t = e.target.closest && e.target.closest('[data-tip]');
    if (!t) { hide(); crosshair(null); return; }
    show(t, e);
    if (t.classList.contains('ch-band')) crosshair(t);
  });
  document.addEventListener('mouseleave', () => { hide(); crosshair(null); });
  // A scroll moves the chart out from under a pinned tooltip.
  window.addEventListener('scroll', hide, { passive: true });

  /* Line charts: park the dashed rule on the hovered column and light up that
     column's dots. Everything else stays put. */
  function crosshair(band) {
    const svgs = document.querySelectorAll('svg.chart-line');
    for (const svg of svgs) {
      const line = svg.querySelector('.ch-cross');
      const mine = band && svg.contains(band);
      if (line) line.setAttribute('opacity', mine ? '1' : '0');
      if (mine) {
        const x = band.getAttribute('data-x');
        line.setAttribute('x1', x); line.setAttribute('x2', x);
      }
      const i = mine ? band.getAttribute('data-i') : null;
      svg.querySelectorAll('.ch-dot').forEach(d => d.setAttribute('opacity', d.getAttribute('data-i') === i ? '1' : '0'));
    }
  }
})();
