/* ==================================================================
   analytics.js — the admin Analytics tab.

   Renders into #analytics-root, which renderAdmin/renderManager leave
   behind. Kept out of app.js because that file is already large, and
   this view has no overlap with the rest of the dashboard.

   Only function declarations at the top level: this script loads before
   app.js, and touching one of app.js's consts at load time would hit a
   temporal-dead-zone error.
================================================================== */

const AN_DAY = 86400000;
const AN_PRESETS = [
  ['7d', 'Last 7 days', 7],
  ['30d', 'Last 30 days', 30],
  ['90d', 'Last 90 days', 90],
  ['12m', 'Last 12 months', 365],
  ['all', 'All time', null],
];

/* CSV payloads, keyed by button id — a table's data stays next to the table
   that drew it instead of being re-derived at download time. */
const AN_CSV = {};
let anTimer = null;

/* ---------- formatting ---------- */
const anIso = (d) => d.toISOString().slice(0, 10);
const anNum = (n) => Number(n || 0).toLocaleString();
const anGel = (n) => `₾${Number(n || 0).toLocaleString()}`;
const anPct = (n) => `${Number(n || 0)}%`;
/* Axis labels get compacted so ticks stay narrow; table cells never do. */
function anCompact(n) {
  n = Number(n || 0);
  if (Math.abs(n) >= 1000000) return `${Math.round(n / 100000) / 10}M`;
  if (Math.abs(n) >= 1000) return `${Math.round(n / 100) / 10}k`;
  return String(Math.round(n * 10) / 10);
}
/* Durations arrive in hours. Past two days, days are the honest unit. */
function anDur(h) {
  if (h == null) return '—';
  h = Number(h);
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 48) return `${Math.round(h * 10) / 10}h`;
  return `${Math.round((h / 24) * 10) / 10}d`;
}
const anStars = (v) => v == null ? '—' : `${Number(v).toFixed(1)}★`;
/* Bucket keys come back as 2026-07-29 / 2026-W30 / 2026-07 — label each one
   the way it actually reads. */
function anBucketLabel(b, bucket) {
  if (bucket === 'month') { const [y, m] = b.split('-'); return `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+m - 1]} ${y.slice(2)}`; }
  if (bucket === 'week') return b.replace('-W', ' w');
  const [, m, d] = b.split('-');
  return `${+d}/${+m}`;
}

/* ---------- range state ---------- */
function anRange() {
  if (!state.analytics) {
    const to = new Date();
    state.analytics = { preset: '30d', from: anIso(new Date(to.getTime() - 29 * AN_DAY)), to: anIso(to) };
  }
  return state.analytics;
}
function anSetPreset(key) {
  const p = AN_PRESETS.find(x => x[0] === key);
  if (!p) return;
  const to = new Date();
  state.analytics = {
    preset: key,
    from: p[2] === null ? '2000-01-01' : anIso(new Date(to.getTime() - (p[2] - 1) * AN_DAY)),
    to: anIso(to),
  };
}

/* ==================================================================
   Mount
================================================================== */
async function mountAnalytics() {
  const host = document.getElementById('analytics-root');
  if (!host) return;
  const r = anRange();
  try {
    const data = await api(`/api/analytics?from=${r.from}&to=${r.to}`);
    host.innerHTML = analyticsHTML(data);
    anWire(host);
  } catch (err) {
    host.innerHTML = `<div class="empty"><div>Couldn't load analytics — ${esc(err.message)}</div></div>`;
  }

  // Analytics is deliberately outside the dashboard's 10-second poll: these are
  // aggregate queries, and nobody needs revenue to tick every ten seconds. The
  // timer clears itself once the tab is gone, so nothing leaks.
  clearInterval(anTimer);
  anTimer = setInterval(() => {
    if (!document.getElementById('analytics-root')) return clearInterval(anTimer);
    if (document.visibilityState !== 'visible') return;
    if (document.getElementById('modal-bg').classList.contains('show')) return;
    mountAnalytics();
  }, 600000);
}

function anWire(host) {
  host.querySelectorAll('[data-preset]').forEach(b => b.onclick = () => {
    anSetPreset(b.getAttribute('data-preset'));
    mountAnalytics();
  });
  const from = host.querySelector('#an-from'), to = host.querySelector('#an-to');
  const custom = () => {
    if (!from.value || !to.value) return;
    state.analytics = { preset: 'custom', from: from.value, to: to.value };
    mountAnalytics();
  };
  if (from) from.onchange = custom;
  if (to) to.onchange = custom;

  const refresh = host.querySelector('#an-refresh');
  if (refresh) refresh.onclick = () => { refresh.classList.add('spinning'); mountAnalytics(); };
  const print = host.querySelector('#an-print');
  if (print) print.onclick = () => window.print();

  host.querySelectorAll('[data-table-toggle]').forEach(b => b.onclick = () => {
    const wrap = document.getElementById(b.getAttribute('data-table-toggle'));
    if (!wrap) return;
    const open = wrap.classList.toggle('show');
    b.setAttribute('aria-expanded', open ? 'true' : 'false');
    b.textContent = open ? 'Hide table' : 'Table';
  });

  host.querySelectorAll('[data-csv]').forEach(b => b.onclick = () => anDownloadCsv(b.getAttribute('data-csv')));
  host.querySelectorAll('[data-worker]').forEach(b => b.onclick = () => openWorkerDetail(+b.getAttribute('data-worker')));
}

/* ==================================================================
   CSV
================================================================== */
function anCsvCell(v) {
  const s = String(v ?? '');
  // Quote anything a spreadsheet would otherwise split or mangle.
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function anDownloadCsv(id) {
  const set = AN_CSV[id];
  if (!set) return;
  const lines = [set.headers.map(anCsvCell).join(','), ...set.rows.map(r => r.map(anCsvCell).join(','))];
  // The BOM makes Excel read UTF-8 (and the ₾ sign) correctly.
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  const r = anRange();
  a.href = URL.createObjectURL(blob);
  a.download = `digit-${set.name}-${r.from}-to-${r.to}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ==================================================================
   Building blocks
================================================================== */
let anCardSeq = 0;

/* Every chart ships with its own table view: the three lightest palette slots
   sit under 3:1 on white, so the numbers must be readable without colour. */
function anCard({ title, sub, body, table, csv, wide }) {
  const id = `an-t${++anCardSeq}`;
  let tools = '';
  if (table) {
    tools += `<button class="an-tool" data-table-toggle="${id}" aria-expanded="false">Table</button>`;
    if (csv) {
      AN_CSV[id] = { name: csv, headers: table.headers, rows: table.rows };
      tools += `<button class="an-tool" data-csv="${id}">CSV</button>`;
    }
  }
  return `<section class="an-card${wide ? ' wide' : ''}">
    <header class="an-card-head">
      <div><h3>${esc(title)}</h3>${sub ? `<p>${esc(sub)}</p>` : ''}</div>
      ${tools ? `<div class="an-tools">${tools}</div>` : ''}
    </header>
    <div class="an-card-body">${body}</div>
    ${table ? `<div class="an-table-wrap" id="${id}">${anTable(table)}</div>` : ''}
  </section>`;
}

function anTable({ headers, rows, align = [] }) {
  return `<table class="an-table"><thead><tr>${headers.map((h, i) =>
      `<th${align[i] === 'r' ? ' class="r"' : ''}>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.length ? rows.map(r => `<tr>${r.map((c, i) =>
      `<td${align[i] === 'r' ? ' class="r"' : ''} data-label="${esc(headers[i])}">${esc(c)}</td>`).join('')}</tr>`).join('')
      : `<tr><td colspan="${headers.length}" class="an-empty-row">Nothing in this range.</td></tr>`}</tbody></table>`;
}

/* A stat tile: value, what it is, and how it moved. Never a one-bar chart. */
function anTile({ value, label, hint, prev, current, invert, spark, hero }) {
  let delta = '';
  if (prev != null && current != null) {
    const diff = current - prev;
    // No previous figure to compare against — say so rather than implying +100%.
    if (!prev && !diff) delta = '';
    else {
      const pctv = prev ? Math.round((diff / Math.abs(prev)) * 1000) / 10 : null;
      const good = invert ? diff < 0 : diff > 0;
      const cls = diff === 0 ? 'flat' : good ? 'up' : 'down';
      const arrow = diff === 0 ? '→' : diff > 0 ? '↑' : '↓';
      delta = `<div class="an-delta ${cls}"><span aria-hidden="true">${arrow}</span> ${pctv == null ? 'new' : `${Math.abs(pctv)}%`}
        <span class="an-delta-sub">vs previous period</span></div>`;
    }
  }
  // "an-lead", not "hero": the landing page already owns .hero, and that rule is
  // a full-viewport flex column — inheriting it stretched the whole tile row.
  return `<div class="an-tile${hero ? ' an-lead' : ''}">
    <div class="an-tile-v">${esc(value)}</div>
    <div class="an-tile-l">${esc(label)}</div>
    ${hint ? `<div class="an-tile-h">${esc(hint)}</div>` : ''}
    ${delta}${spark || ''}</div>`;
}

/* ==================================================================
   The page
================================================================== */
function analyticsHTML(d) {
  // Card ids and their CSV payloads are rebuilt every render; without this the
  // registry would grow by ~16 entries on every 10-minute refresh.
  anCardSeq = 0;
  for (const k of Object.keys(AN_CSV)) delete AN_CSV[k];
  const r = anRange();
  const money = d.showMoney;
  const updated = new Date(d.generated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const controls = `
    <div class="an-bar">
      <div class="an-presets">
        ${AN_PRESETS.map(([k, l]) => `<button class="an-chip ${r.preset === k ? 'on' : ''}" data-preset="${k}">${l}</button>`).join('')}
      </div>
      <div class="an-dates">
        <label>From <input type="date" id="an-from" class="input" value="${esc(r.from)}" max="${esc(r.to)}"></label>
        <label>To <input type="date" id="an-to" class="input" value="${esc(r.to)}" min="${esc(r.from)}"></label>
      </div>
      <div class="an-actions">
        <span class="an-updated">Updated ${esc(updated)}</span>
        <button class="an-tool" id="an-refresh" title="Refresh now">↻ Refresh</button>
        <button class="an-tool" id="an-print">Print</button>
      </div>
    </div>`;

  const scopeNote = money ? '' :
    `<div class="an-note">Showing only the tasks you managed. Revenue figures are admin-only.</div>`;

  return `<div class="analytics">
    ${controls}
    ${scopeNote}
    ${anHeadline(d, money)}
    ${money ? anRevenue(d) : ''}
    ${anFunnel(d)}
    ${anWorkers(d, money)}
    ${anCategories(d, money)}
    <p class="an-foot">Range ${esc(r.from)} → ${esc(r.to)} · ${d.range.days} days · bucketed by ${esc(d.range.bucket)}</p>
  </div>`;
}

/* ---------- headline ---------- */
function anHeadline(d, money) {
  const h = d.headline;
  const tiles = [];
  if (money) {
    tiles.push(anTile({
      value: anGel(h.collected), label: 'Collected', hint: `${anNum(h.paidJobs)} paid jobs`,
      prev: h.collectedPrev, current: h.collected, hero: true,
    }));
    tiles.push(anTile({ value: anGel(h.booked), label: 'Booked', hint: `${anNum(h.bookedJobs)} completed jobs` }));
    tiles.push(anTile({
      value: anGel(h.outstanding), label: 'Outstanding',
      hint: `${anNum(h.outstandingJobs)} completed but unpaid`,
    }));
  }
  tiles.push(anTile({
    value: anNum(h.tasksCompleted), label: 'Tasks completed',
    prev: h.tasksCompletedPrev, current: h.tasksCompleted,
  }));
  tiles.push(anTile({
    value: anNum(h.tasksPosted), label: 'Tasks posted',
    prev: h.tasksPostedPrev, current: h.tasksPosted,
  }));
  tiles.push(anTile({
    value: anStars(h.avgRating), label: 'Average worker score',
    hint: `${anNum(h.ratingCount)} rating${h.ratingCount === 1 ? '' : 's'}`,
    prev: h.avgRatingPrev, current: h.avgRating,
  }));
  tiles.push(anTile({ value: anPct(h.completionRate), label: 'Completion rate', hint: 'of tasks posted in range' }));
  tiles.push(anTile({ value: anPct(h.cancelRate), label: 'Cancelled or declined', hint: 'of tasks posted in range', invert: true }));

  return `<div class="an-tiles">${tiles.join('')}</div>`;
}

/* ---------- revenue ---------- */
function anRevenue(d) {
  const rv = d.revenue, b = d.range.bucket;
  const keys = [...new Set([...rv.series.collected.map(x => x.b), ...rv.series.booked.map(x => x.b)])].sort();
  const byKey = (arr) => Object.fromEntries(arr.map(x => [x.b, x.v]));
  const col = byKey(rv.series.collected), boo = byKey(rv.series.booked);
  const series = [
    { name: 'Collected', points: keys.map(k => ({ x: anBucketLabel(k, b), y: col[k] || 0 })) },
    { name: 'Booked', points: keys.map(k => ({ x: anBucketLabel(k, b), y: boo[k] || 0 })) },
  ];

  const trend = anCard({
    title: 'Revenue over time', sub: 'Collected is money received; booked is the agreed value of work completed.',
    wide: true,
    body: chartLine({ series, width: 1080, height: 240, format: (v) => `₾${anCompact(v)}`, area: false })
      + legend([{ name: 'Collected' }, { name: 'Booked' }]),
    table: {
      headers: ['Period', 'Collected (₾)', 'Booked (₾)'],
      rows: keys.map(k => [anBucketLabel(k, b), col[k] || 0, boo[k] || 0]),
      align: ['', 'r', 'r'],
    },
    csv: 'revenue-over-time',
  });

  const cat = anCard({
    title: 'Revenue by category', sub: 'Completed jobs in this range.',
    body: chartBars({
      rows: rv.byCategory.map(c => ({ label: c.label, value: c.revenue, sub: `${c.jobs} job${c.jobs === 1 ? '' : 's'}` })),
      width: 520, format: anGel, labelWidth: 150,
    }),
    table: {
      headers: ['Category', 'Jobs', 'Revenue (₾)'],
      rows: rv.byCategory.map(c => [c.label, c.jobs, c.revenue]),
      align: ['', 'r', 'r'],
    },
    csv: 'revenue-by-category',
  });

  const health = anCard({
    title: 'Payment health',
    body: `
      <div class="an-mini">
        <div><span class="an-mini-v">${anGel(rv.avgJobValue || 0)}</span><span class="an-mini-l">Average job value</span></div>
        <div><span class="an-mini-v">${anGel(rv.medianJobValue || 0)}</span><span class="an-mini-l">Median job value</span></div>
        <div><span class="an-mini-v">${anDur(rv.avgHoursToPay)}</span><span class="an-mini-l">Average time to pay</span></div>
      </div>
      ${meter({ value: rv.paymentRate, max: 100, label: `${anPct(rv.paymentRate)} of ${anNum(rv.completedJobs)} completed jobs paid (${anNum(rv.paidJobs)})` })}
      <h4 class="an-sub">Income from urgency fees</h4>
      ${chartBars({
        rows: rv.urgencyIncome.map(u => ({ label: u.urgency, value: u.total, sub: `${u.jobs} × ₾${u.fee}` })),
        width: 520, format: anGel, rowHeight: 28, labelWidth: 170,
      })}`,
    table: {
      headers: ['Urgency', 'Paid jobs', 'Fee each (₾)', 'Total (₾)'],
      rows: rv.urgencyIncome.map(u => [u.urgency, u.jobs, u.fee, u.total]),
      align: ['', 'r', 'r', 'r'],
    },
    csv: 'urgency-income',
  });

  const outstanding = anCard({
    title: 'Outstanding payments',
    sub: 'Every completed job still unpaid — a running balance, not limited to the selected range.',
    wide: true,
    body: rv.outstandingJobs.length
      ? `<p class="an-lede">${anGel(rv.outstandingJobs.reduce((t, x) => t + x.amount, 0))} across ${anNum(rv.outstandingJobs.length)} job${rv.outstandingJobs.length === 1 ? '' : 's'}${rv.outstandingJobs.length ? `, oldest ${anNum(rv.outstandingJobs[0].daysOutstanding)} days` : ''}.</p>`
      : `<p class="an-lede ok">Everything completed has been paid for.</p>`,
    table: {
      headers: ['Task', 'Client', 'Worker', 'Category', 'Amount (₾)', 'Days outstanding'],
      rows: rv.outstandingJobs.map(x => [x.title, x.client, x.fixer || '—', x.categoryLabel, x.amount, x.daysOutstanding]),
      align: ['', '', '', '', 'r', 'r'],
    },
    csv: 'outstanding-payments',
  });

  return `<h2 class="an-h">Revenue &amp; payments</h2><div class="an-grid">${trend}${cat}${health}${outstanding}</div>`;
}

/* ---------- funnel ---------- */
function anFunnel(d) {
  const f = d.funnel, b = d.range.bucket;
  const keys = [...new Set([...f.series.posted.map(x => x.b), ...f.series.completed.map(x => x.b)])].sort();
  const byKey = (arr) => Object.fromEntries(arr.map(x => [x.b, x.v]));
  const po = byKey(f.series.posted), co = byKey(f.series.completed);

  const funnelCard = anCard({
    title: 'Task funnel', sub: 'Of the tasks posted in this range, how far each one got.',
    body: chartFunnel({ stages: f.stages, width: 520 }),
    table: {
      headers: ['Stage', 'Tasks', 'Share of posted'],
      rows: f.stages.map(s => [s.label, s.n, `${f.stages[0].n ? Math.round((s.n / f.stages[0].n) * 100) : 0}%`]),
      align: ['', 'r', 'r'],
    },
    csv: 'task-funnel',
  });

  const throughput = anCard({
    title: 'Posted vs completed',
    body: chartLine({
      series: [
        { name: 'Posted', points: keys.map(k => ({ x: anBucketLabel(k, b), y: po[k] || 0 })) },
        { name: 'Completed', points: keys.map(k => ({ x: anBucketLabel(k, b), y: co[k] || 0 })) },
      ],
      width: 520, height: 220, format: anCompact, area: false,
    }) + legend([{ name: 'Posted' }, { name: 'Completed' }]),
    table: {
      headers: ['Period', 'Posted', 'Completed'],
      rows: keys.map(k => [anBucketLabel(k, b), po[k] || 0, co[k] || 0]),
      align: ['', 'r', 'r'],
    },
    csv: 'throughput',
  });

  const durations = anCard({
    title: 'How long each step takes',
    sub: 'Average across tasks that reached both ends of the step. Tasks still in flight are excluded.',
    body: chartBars({
      rows: f.durations.map(x => ({
        label: x.label, value: x.avgHours || 0,
        sub: `median ${anDur(x.medianHours)} · ${x.n} task${x.n === 1 ? '' : 's'}`,
      })),
      width: 520, format: anDur, labelWidth: 165,
    }),
    table: {
      headers: ['Step', 'Average', 'Median', 'Tasks measured'],
      rows: f.durations.map(x => [x.label, anDur(x.avgHours), anDur(x.medianHours), x.n]),
      align: ['', 'r', 'r', 'r'],
    },
    csv: 'stage-durations',
  });

  const lost = anCard({
    title: 'Where tasks are lost',
    sub: `${anNum(f.lostAt.reduce((t, x) => t + x.n, 0))} cancelled or declined · ${anPct(f.reassignRate)} of tasks needed reassigning.`,
    body: chartBars({
      rows: f.lostAt.map(x => ({ label: x.label, value: x.n })),
      width: 520, format: anNum, labelWidth: 175,
    }),
    table: {
      headers: ['Stage reached', 'Tasks lost'],
      rows: f.lostAt.map(x => [x.label, x.n]),
      align: ['', 'r'],
    },
    csv: 'tasks-lost',
  });

  const heat = anCard({
    title: 'When problems get posted', sub: 'Day of week against hour of day. Darker means busier.',
    wide: true,
    body: chartHeatmap({ cells: f.heatmap, width: 1080 }),
    table: {
      headers: ['Day', 'Hour', 'Tasks'],
      rows: f.heatmap.slice().sort((a, x) => a.dow - x.dow || a.hour - x.hour)
        .map(c => [['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][c.dow], `${String(c.hour).padStart(2, '0')}:00`, c.n]),
      align: ['', '', 'r'],
    },
    csv: 'posting-times',
  });

  return `<h2 class="an-h">Task funnel &amp; throughput</h2><div class="an-grid">${funnelCard}${throughput}${durations}${lost}${heat}</div>`;
}

/* ---------- workers ---------- */
function anWorkers(d, money) {
  const w = d.workers;
  const rated = w.leaderboard.filter(x => x.avgRating != null);
  const best = rated.slice().sort((a, b) => b.avgRating - a.avgRating)[0];
  const totalRatings = w.ratingDistribution.reduce((t, x) => t + x.n, 0);

  const dist = anCard({
    title: 'Worker scores',
    sub: best ? `Best rated: ${best.name} at ${anStars(best.avgRating)}` : 'No ratings in this range yet.',
    body: `<div class="an-hero-figure">${anStars(d.headline.avgRating)}<span>average across ${anNum(totalRatings)} rating${totalRatings === 1 ? '' : 's'}</span></div>
      ${chartBars({
        rows: w.ratingDistribution.slice().reverse().map(x => ({
          label: `${x.star} ★`, value: x.n,
          sub: totalRatings ? `${Math.round((x.n / totalRatings) * 100)}%` : '0%',
        })),
        width: 520, rowHeight: 28, format: anNum, labelWidth: 60,
      })}`,
    table: {
      headers: ['Stars', 'Ratings', 'Share'],
      rows: w.ratingDistribution.slice().reverse().map(x =>
        [`${x.star}★`, x.n, totalRatings ? `${Math.round((x.n / totalRatings) * 100)}%` : '0%']),
      align: ['', 'r', 'r'],
    },
    csv: 'rating-distribution',
  });

  const staffing = anCard({
    title: 'Skill coverage vs demand',
    sub: 'Active workers holding each skill, against the tasks posted in that category.',
    body: chartGrouped({
      rows: w.staffing.map(s => ({ label: s.label, workers: s.workers, tasks: s.tasks })),
      series: [{ key: 'workers', name: 'Workers' }, { key: 'tasks', name: 'Tasks' }],
      width: 520, format: anNum, labelWidth: 150,
    }) + legend([{ name: 'Workers with the skill' }, { name: 'Tasks posted' }]),
    table: {
      headers: ['Category', 'Workers', 'Tasks posted'],
      rows: w.staffing.map(s => [s.label, s.workers, s.tasks]),
      align: ['', 'r', 'r'],
    },
    csv: 'skill-coverage',
  });

  const headers = ['Worker', 'Completed', 'Active', 'Avg score', 'Ratings', 'Avg time to fix'];
  if (money) headers.push('Revenue (₾)');
  headers.push('Availability');

  const rows = w.leaderboard.map(x => {
    const base = [x.name, x.completed, x.active, x.avgRating == null ? '—' : x.avgRating.toFixed(1), x.ratingCount, anDur(x.avgFixHours)];
    if (money) base.push(x.revenue);
    base.push(availMeta(x.availability).label);
    return base;
  });

  const boardBody = `<div class="an-table-wrap show"><table class="an-table board">
    <thead><tr>${headers.map((h, i) => `<th${i > 0 && i < headers.length - 1 ? ' class="r"' : ''}>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${w.leaderboard.length ? w.leaderboard.map(x => `<tr>
      <td data-label="Worker"><button class="an-link" data-worker="${x.id}">${avatarHTML(x.name, x.avatar, 26)} ${esc(x.name)}</button>
        ${x.employment_status !== 'active' ? `<span class="an-flag">${esc(x.employment_status)}</span>` : ''}</td>
      <td class="r" data-label="Completed">${anNum(x.completed)}</td>
      <td class="r" data-label="Active">${anNum(x.active)}</td>
      <td class="r" data-label="Avg score">${x.avgRating == null ? '—' : `<span class="rating-avg">★ ${x.avgRating.toFixed(1)}</span>`}</td>
      <td class="r" data-label="Ratings">${anNum(x.ratingCount)}</td>
      <td class="r" data-label="Avg time to fix">${anDur(x.avgFixHours)}</td>
      ${money ? `<td class="r" data-label="Revenue">${anGel(x.revenue)}</td>` : ''}
      <td data-label="Availability"><span class="an-dot" style="background:${availMeta(x.availability).dot}"></span>${esc(availMeta(x.availability).label)}</td>
    </tr>`).join('') : `<tr><td colspan="${headers.length}" class="an-empty-row">No workers yet.</td></tr>`}</tbody></table></div>`;

  const board = anCard({
    title: 'Worker leaderboard', sub: 'Click a worker for their own breakdown.', wide: true,
    body: boardBody,
    table: { headers, rows },
    csv: 'workers',
  });

  return `<h2 class="an-h">Workers</h2><div class="an-grid">${dist}${staffing}${board}</div>`;
}

/* ---------- categories, pricing, clients ---------- */
function anCategories(d, money) {
  const p = d.pricing, c = d.clients, b = d.range.bucket;

  const cats = anCard({
    title: 'Categories by volume',
    body: chartBars({
      rows: d.categories.map(x => ({
        label: x.label, value: x.posted,
        sub: `${x.completed} completed · ${x.cancelRate}% lost`,
      })),
      width: 520, format: anNum, labelWidth: 150,
    }),
    table: {
      headers: ['Category', 'Posted', 'Completed', 'Cancelled/declined'],
      rows: d.categories.map(x => [x.label, x.posted, x.completed, `${x.cancelRate}%`]),
      align: ['', 'r', 'r', 'r'],
    },
    csv: 'categories',
  });

  const movement = (lead) => p.movementPct == null
    ? 'Not enough negotiated tasks to compare yet.'
    : p.movementPct === 0
      ? `${lead} settle at exactly the opening offer, across ${anNum(p.sampleSize)} task${p.sampleSize === 1 ? '' : 's'}.`
      : `${lead} settle <b>${Math.abs(p.movementPct)}% ${p.movementPct > 0 ? 'above' : 'below'}</b> the opening offer, across ${anNum(p.sampleSize)} task${p.sampleSize === 1 ? '' : 's'}.`;

  const priceBody = money
    ? `<div class="an-mini">
         <div><span class="an-mini-v">${anGel(p.avgFirstOffer || 0)}</span><span class="an-mini-l">Manager's opening offer</span></div>
         <div><span class="an-mini-v">${anGel(p.avgAgreed || 0)}</span><span class="an-mini-l">Agreed in the end</span></div>
         <div><span class="an-mini-v">${p.avgRounds == null ? '—' : p.avgRounds}</span><span class="an-mini-l">Offers per task</span></div>
       </div>
       <p class="an-lede">${movement('Prices')}</p>`
    // A manager keeps the movement — it is a percentage, carries no amount, and
    // is the part of pricing that is actually their job.
    : `<p class="an-lede">${movement('Your prices')} Amounts are admin-only.</p>`;

  const pricing = anCard({
    // Plain '&': anCard runs the title through esc(), so a pre-escaped entity
    // would render literally as "Pricing &amp; negotiation".
    title: 'Pricing & negotiation',
    body: `${priceBody}
      ${chartBars({
        rows: [
          { label: 'Accepted first offer', value: p.acceptedFirstOffer },
          { label: 'Agreed after haggling', value: p.negotiated },
          { label: 'Declined the price', value: p.declined },
        ],
        width: 520, rowHeight: 30, format: anNum, labelWidth: 165,
      })}
      <p class="an-foot-note">Average ${p.avgRounds == null ? '—' : p.avgRounds} offer${p.avgRounds === 1 ? '' : 's'} per priced task.</p>`,
    table: {
      headers: ['Outcome', 'Tasks'],
      rows: [['Accepted first offer', p.acceptedFirstOffer], ['Agreed after haggling', p.negotiated], ['Declined the price', p.declined]],
      align: ['', 'r'],
    },
    csv: 'negotiation',
  });

  const clientCard = anCard({
    title: 'Clients', sub: `${anNum(c.total)} registered · ${anNum(c.repeatClients)} have come back (${anPct(c.repeatRate)} of those who ever posted).`,
    wide: !money,
    body: chartLine({
      series: [{ name: 'New clients', points: c.series.map(x => ({ x: anBucketLabel(x.b, b), y: x.v })) }],
      width: money ? 520 : 1080, height: 200, format: anCompact,
    }),
    table: {
      headers: ['Period', 'New clients'],
      rows: c.series.map(x => [anBucketLabel(x.b, b), x.v]),
      align: ['', 'r'],
    },
    csv: 'new-clients',
  });

  const spenders = money ? anCard({
    title: 'Top clients by spend', sub: 'Payments received in this range.',
    body: chartBars({
      rows: (c.topSpenders || []).map(x => ({ label: x.name, value: x.spent, sub: `${x.jobs} job${x.jobs === 1 ? '' : 's'}` })),
      width: 520, format: anGel, rowHeight: 28, labelWidth: 130,
    }),
    table: {
      headers: ['Client', 'Jobs paid', 'Spent (₾)'],
      rows: (c.topSpenders || []).map(x => [x.name, x.jobs, x.spent]),
      align: ['', 'r', 'r'],
    },
    csv: 'top-clients',
  }) : '';

  return `<h2 class="an-h">Categories, pricing &amp; clients</h2><div class="an-grid">${cats}${pricing}${clientCard}${spenders}</div>`;
}

/* ==================================================================
   Worker drill-down
================================================================== */
async function openWorkerDetail(id) {
  const r = anRange();
  modal(`<h3>Worker</h3>${loadingBox()}`);
  let d;
  try {
    d = await api(`/api/analytics/worker/${id}?from=${r.from}&to=${r.to}`);
  } catch (err) { closeModal(); return toast(err.message, true); }

  const w = d.worker, b = d.range.bucket;
  const vsTeam = (d.avgFixHours != null && d.teamAvgFixHours)
    ? (() => {
        const diff = d.avgFixHours - d.teamAvgFixHours;
        const faster = diff < 0;
        return `<span class="an-delta ${faster ? 'up' : diff === 0 ? 'flat' : 'down'}">${faster ? '↓' : diff === 0 ? '→' : '↑'} ${anDur(Math.abs(diff))} ${faster ? 'faster' : diff === 0 ? 'same as' : 'slower'} than the team</span>`;
      })()
    : '';

  modal(`
    <div class="an-modal-head">
      ${avatarHTML(w.name, w.avatar, 46)}
      <div><h3>${esc(w.name)}</h3>
        <p class="sub">${esc(w.experience || 'Experience not set')}${w.work_mode ? ` · ${esc(w.work_mode)}` : ''}
          · <span class="an-dot" style="background:${availMeta(w.availability).dot}"></span>${esc(availMeta(w.availability).label)}</p></div>
    </div>
    ${w.skills.length ? `<div class="an-chips">${w.skills.map(s => `<span class="chip">${esc(labelOf(s))}</span>`).join('')}</div>` : ''}
    <div class="an-mini wide">
      <div><span class="an-mini-v">${anNum(d.completed)}</span><span class="an-mini-l">Completed</span></div>
      <div><span class="an-mini-v">${anNum(d.active)}</span><span class="an-mini-l">Active now</span></div>
      <div><span class="an-mini-v">${anStars(d.avgRating)}</span><span class="an-mini-l">${anNum(d.ratingCount)} rating${d.ratingCount === 1 ? '' : 's'}</span></div>
      <div><span class="an-mini-v">${anDur(d.avgFixHours)}</span><span class="an-mini-l">Average time to fix</span></div>
      ${d.showMoney ? `<div><span class="an-mini-v">${anGel(d.revenue)}</span><span class="an-mini-l">Revenue generated</span></div>` : ''}
    </div>
    ${vsTeam ? `<p class="an-lede">${vsTeam}</p>` : ''}

    <h4 class="an-sub">Jobs completed</h4>
    ${chartLine({
      series: [{ name: 'Completed', points: d.series.jobs.map(x => ({ x: anBucketLabel(x.b, b), y: x.v })) }],
      width: 520, height: 170, format: anCompact,
    })}

    <h4 class="an-sub">Average score over time</h4>
    ${d.series.rating.length
      ? chartLine({
          series: [{ name: 'Rating', points: d.series.rating.map(x => ({ x: anBucketLabel(x.b, b), y: x.v })), color: 'var(--s4)' }],
          width: 520, height: 170, yMax: 5, format: (v) => v.toFixed(1),
        })
      : emptyBox('No ratings in this range.')}

    <h4 class="an-sub">What they work on</h4>
    ${d.byCategory.length
      ? chartBars({ rows: d.byCategory.map(x => ({ label: x.label, value: x.n })), width: 520, rowHeight: 26, format: anNum, labelWidth: 150 })
      : emptyBox('No tasks in this range.')}

    <div class="flow-actions"><button class="btn btn-soft" onclick="closeModal()">Close</button></div>`);
}
