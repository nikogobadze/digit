/* ------------------------------------------------------------------
   analytics.js — every number the admin Analytics page shows.

   Two rules hold throughout:

   1. Aggregate in SQL. Nothing here pulls a table into memory and reduces
      it in JS; each figure is a GROUP BY the database can answer with an
      index. The page stays fast as the task table grows.
   2. Money is stripped server-side. A manager's response never contains a
      currency figure at all — it isn't hidden in CSS, it is never sent.
------------------------------------------------------------------- */
const { get, all, CATEGORIES, labelFor, URGENCY_FEE } = require('./db');

/* ---------- range handling ---------- */

const DAY = 86400000;
const isoDay = (d) => d.toISOString().slice(0, 10);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/* Stored timestamps are UTC 'YYYY-MM-DD HH:MM:SS' strings, so a plain string
   compare is a correct date filter. `to` is inclusive: comparing against
   '<to> 23:59:59' keeps the whole final day. */
function resolveRange(query = {}) {
  const today = new Date();
  let to = DATE_RE.test(query.to || '') ? query.to : isoDay(today);
  let from = DATE_RE.test(query.from || '') ? query.from : isoDay(new Date(today.getTime() - 29 * DAY));
  if (from > to) [from, to] = [to, from];
  const days = Math.max(1, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY) + 1);
  // Bucket width follows the window so a chart never draws 365 daily points or
  // three monthly ones. %W is the ISO-ish week number SQLite gives us.
  const bucket = days <= 31 ? 'day' : days <= 180 ? 'week' : 'month';
  const fmt = bucket === 'day' ? '%Y-%m-%d' : bucket === 'week' ? '%Y-W%W' : '%Y-%m';
  return { from, to, lo: `${from} 00:00:00`, hi: `${to} 23:59:59`, days, bucket, fmt };
}

/* The equally-long window immediately before this one, for the KPI deltas. */
function previousRange(r) {
  const start = Date.parse(`${r.from}T00:00:00Z`);
  const prevTo = new Date(start - DAY);
  const prevFrom = new Date(start - r.days * DAY);
  return { lo: `${isoDay(prevFrom)} 00:00:00`, hi: `${isoDay(prevTo)} 23:59:59` };
}

/* ---------- small helpers ---------- */

const num = (v) => (v === null || v === undefined ? 0 : Number(v));
const round1 = (v) => Math.round(Number(v) * 10) / 10;
/* null (not 0) when there is nothing to average — an absent measurement must
   never render as a real zero. */
const avgOrNull = (v) => (v === null || v === undefined ? null : round1(v));
const pct = (part, whole) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);

/* Hours between two stored timestamps, as a SQL expression. */
const hoursBetween = (a, b) => `(julianday(${b}) - julianday(${a})) * 24.0`;

/* Median without a percentile function: order the non-null values and pick the
   middle row. Cheap enough at this scale and exact. */
async function median(expr, table, where, args) {
  const r = await get(
    `SELECT ${expr} AS v FROM ${table} WHERE ${where} AND (${expr}) IS NOT NULL
     ORDER BY v LIMIT 1 OFFSET (SELECT COUNT(*) / 2 FROM ${table} WHERE ${where} AND (${expr}) IS NOT NULL)`,
    [...args, ...args]);
  return r ? avgOrNull(r.v) : null;
}

/* ---------- scope ---------- */

/* A manager only ever sees the tasks they handled. Everything below builds its
   WHERE clause from here, so the scope cannot be forgotten in one query. */
function scopeClause(scope) {
  return scope.role === 'manager'
    ? { sql: ' AND manager_id = ?', args: [scope.managerId] }
    : { sql: '', args: [] };
}

const FINISHED = "('completed','declined','cancelled')";
const DEAD = "('declined','cancelled')";

/* ==================================================================
   The main payload
================================================================== */
async function computeAnalytics(query, scope) {
  const r = resolveRange(query);
  const prev = previousRange(r);
  const sc = scopeClause(scope);
  const money = scope.role !== 'manager';

  // Reused fragments: `created` filters by when a task was posted, `done` by
  // when it was confirmed complete, `paid` by when the money actually landed.
  const created = `created_at BETWEEN ? AND ?${sc.sql}`;
  const createdArgs = (lo, hi) => [lo, hi, ...sc.args];
  const done = `completed_at BETWEEN ? AND ?${sc.sql}`;
  const paidIn = `paid = 1 AND paid_at BETWEEN ? AND ?${sc.sql}`;

  const out = {
    range: { from: r.from, to: r.to, days: r.days, bucket: r.bucket },
    scope: scope.role,
    showMoney: money,
    generated_at: new Date().toISOString(),
  };

  /* ---------- headline ---------- */
  const [nowCounts, prevCounts] = await Promise.all([
    get(`SELECT COUNT(*) AS posted,
                SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed,
                SUM(CASE WHEN status IN ${DEAD} THEN 1 ELSE 0 END) AS dead
         FROM tasks WHERE ${created}`, createdArgs(r.lo, r.hi)),
    get(`SELECT COUNT(*) AS posted,
                SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed
         FROM tasks WHERE ${created}`, createdArgs(prev.lo, prev.hi)),
  ]);

  // Fired together, not one after another: against a hosted database each
  // await is a separate round trip, and these four don't depend on each other.
  const [completedNow, completedPrev, ratingNow, ratingPrev] = await Promise.all([
    get(`SELECT COUNT(*) AS n FROM tasks WHERE ${done}`, createdArgs(r.lo, r.hi)),
    get(`SELECT COUNT(*) AS n FROM tasks WHERE ${done}`, createdArgs(prev.lo, prev.hi)),
    get(`SELECT AVG(rating) AS avg, COUNT(rating) AS n FROM tasks
         WHERE rating IS NOT NULL AND rated_at BETWEEN ? AND ?${sc.sql}`, createdArgs(r.lo, r.hi)),
    get(`SELECT AVG(rating) AS avg FROM tasks
         WHERE rating IS NOT NULL AND rated_at BETWEEN ? AND ?${sc.sql}`, createdArgs(prev.lo, prev.hi)),
  ]);

  out.headline = {
    tasksPosted: num(nowCounts.posted),
    tasksPostedPrev: num(prevCounts.posted),
    tasksCompleted: num(completedNow.n),
    tasksCompletedPrev: num(completedPrev.n),
    completionRate: pct(num(nowCounts.completed), num(nowCounts.posted)),
    cancelRate: pct(num(nowCounts.dead), num(nowCounts.posted)),
    avgRating: avgOrNull(ratingNow.avg),
    avgRatingPrev: avgOrNull(ratingPrev.avg),
    ratingCount: num(ratingNow.n),
  };

  if (money) {
    const [collected, collectedPrev, booked, outstanding] = await Promise.all([
      get(`SELECT COALESCE(SUM(COALESCE(agreed_price, proposed_price)),0) AS v, COUNT(*) AS n
           FROM tasks WHERE ${paidIn}`, createdArgs(r.lo, r.hi)),
      get(`SELECT COALESCE(SUM(COALESCE(agreed_price, proposed_price)),0) AS v
           FROM tasks WHERE ${paidIn}`, createdArgs(prev.lo, prev.hi)),
      get(`SELECT COALESCE(SUM(COALESCE(agreed_price, proposed_price)),0) AS v, COUNT(*) AS n
           FROM tasks WHERE status='completed' AND ${done}`, createdArgs(r.lo, r.hi)),
      // Outstanding is a running balance, not a windowed figure: every completed
      // job still unpaid, whenever it was finished. Windowing it would hide debt.
      get(`SELECT COALESCE(SUM(COALESCE(agreed_price, proposed_price)),0) AS v, COUNT(*) AS n
           FROM tasks WHERE status='completed' AND paid = 0${sc.sql}`, sc.args),
    ]);
    out.headline.collected = num(collected.v);
    out.headline.collectedPrev = num(collectedPrev.v);
    out.headline.paidJobs = num(collected.n);
    out.headline.booked = num(booked.v);
    out.headline.bookedJobs = num(booked.n);
    out.headline.outstanding = num(outstanding.v);
    out.headline.outstandingJobs = num(outstanding.n);
  }

  /* ---------- revenue & payments ---------- */
  if (money) {
    const [byBucketPaid, byBucketBooked] = await Promise.all([
      all(`SELECT strftime('${r.fmt}', paid_at) AS b, SUM(COALESCE(agreed_price, proposed_price)) AS v
           FROM tasks WHERE ${paidIn} GROUP BY b ORDER BY b`, createdArgs(r.lo, r.hi)),
      all(`SELECT strftime('${r.fmt}', completed_at) AS b, SUM(COALESCE(agreed_price, proposed_price)) AS v
           FROM tasks WHERE status='completed' AND ${done} GROUP BY b ORDER BY b`, createdArgs(r.lo, r.hi)),
    ]);

    const [byCategory, value, payRate, timeToPay, urgency, unpaid, medianValue] = await Promise.all([
      all(`SELECT category, COUNT(*) AS jobs, COALESCE(SUM(COALESCE(agreed_price, proposed_price)),0) AS revenue
           FROM tasks WHERE status='completed' AND ${done}
           GROUP BY category ORDER BY revenue DESC`, createdArgs(r.lo, r.hi)),

      get(`SELECT AVG(COALESCE(agreed_price, proposed_price)) AS avg
           FROM tasks WHERE status='completed' AND ${done}`, createdArgs(r.lo, r.hi)),

      get(`SELECT COUNT(*) AS completed, SUM(CASE WHEN paid=1 THEN 1 ELSE 0 END) AS paid
           FROM tasks WHERE status='completed' AND ${done}`, createdArgs(r.lo, r.hi)),

      get(`SELECT AVG(${hoursBetween('completed_at', 'paid_at')}) AS avg
           FROM tasks WHERE ${paidIn} AND completed_at IS NOT NULL`, createdArgs(r.lo, r.hi)),

      // Urgency surcharge is a fixed table, so sum it by grouping on the urgency
      // label and pricing each group in JS — no per-row work in SQL.
      all(`SELECT urgency, COUNT(*) AS n FROM tasks WHERE ${paidIn} GROUP BY urgency`, createdArgs(r.lo, r.hi)),

      all(`SELECT t.id, t.title, t.category, t.custom_category, t.completed_at,
                  COALESCE(t.agreed_price, t.proposed_price) AS amount,
                  c.name AS client, f.name AS fixer,
                  CAST(julianday('now') - julianday(t.completed_at) AS INTEGER) AS days_outstanding
           FROM tasks t JOIN users c ON c.id = t.client_id
           LEFT JOIN users f ON f.id = t.assigned_fixer_id
           WHERE t.status='completed' AND t.paid=0${sc.sql}
           ORDER BY t.completed_at ASC`, sc.args),

      median('COALESCE(agreed_price, proposed_price)', 'tasks',
        `status='completed' AND ${done}`, createdArgs(r.lo, r.hi)),
    ]);

    out.revenue = {
      series: {
        collected: byBucketPaid.map(x => ({ b: x.b, v: num(x.v) })),
        booked: byBucketBooked.map(x => ({ b: x.b, v: num(x.v) })),
      },
      byCategory: byCategory.map(x => ({
        key: x.category, label: labelFor(x.category), jobs: num(x.jobs), revenue: num(x.revenue),
      })),
      avgJobValue: avgOrNull(value.avg),
      medianJobValue: medianValue,
      paymentRate: pct(num(payRate.paid), num(payRate.completed)),
      paidJobs: num(payRate.paid),
      completedJobs: num(payRate.completed),
      avgHoursToPay: avgOrNull(timeToPay.avg),
      urgencyIncome: urgency
        .map(x => ({ urgency: x.urgency || 'Not set', jobs: num(x.n), fee: URGENCY_FEE[x.urgency] || 0 }))
        .map(x => ({ ...x, total: x.jobs * x.fee }))
        .sort((a, b) => b.total - a.total),
      outstandingJobs: unpaid.map(x => ({
        id: x.id, title: x.title, client: x.client, fixer: x.fixer || null,
        categoryLabel: x.custom_category || labelFor(x.category),
        amount: num(x.amount), completed_at: x.completed_at, daysOutstanding: num(x.days_outstanding),
      })),
    };
  }

  /* ---------- funnel & throughput ---------- */
  // Every task that reached a stage, counted on the tasks posted in the window,
  // so the steps genuinely nest inside each other.
  const [funnel, statusRows, deaths, heat, reassigned] = await Promise.all([
    get(
      `SELECT COUNT(*) AS posted,
            SUM(CASE WHEN reviewed_at IS NOT NULL THEN 1 ELSE 0 END) AS priced,
            SUM(CASE WHEN agreed_at   IS NOT NULL THEN 1 ELSE 0 END) AS agreed,
            SUM(CASE WHEN assigned_at IS NOT NULL OR work_done_at IS NOT NULL OR completed_at IS NOT NULL THEN 1 ELSE 0 END) AS assigned,
            SUM(CASE WHEN work_done_at IS NOT NULL OR completed_at IS NOT NULL THEN 1 ELSE 0 END) AS worked,
            SUM(CASE WHEN completed_at IS NOT NULL THEN 1 ELSE 0 END) AS completed
       FROM tasks WHERE ${created}`, createdArgs(r.lo, r.hi)),

    all(`SELECT status, COUNT(*) AS n FROM tasks WHERE ${created} GROUP BY status`, createdArgs(r.lo, r.hi)),

    // Where a task died: the last stage it reached before being closed.
    get(
      `SELECT SUM(CASE WHEN reviewed_at IS NULL THEN 1 ELSE 0 END) AS before_price,
            SUM(CASE WHEN reviewed_at IS NOT NULL AND agreed_at IS NULL THEN 1 ELSE 0 END) AS during_pricing,
            SUM(CASE WHEN agreed_at IS NOT NULL AND assigned_at IS NULL AND work_done_at IS NULL THEN 1 ELSE 0 END) AS before_assign,
            SUM(CASE WHEN assigned_at IS NOT NULL OR work_done_at IS NOT NULL THEN 1 ELSE 0 END) AS in_progress
       FROM tasks WHERE status IN ${DEAD} AND ${created}`, createdArgs(r.lo, r.hi)),

    // Day-of-week (0=Sunday) × hour-of-day of task creation.
    all(`SELECT CAST(strftime('%w', created_at) AS INTEGER) AS dow,
              CAST(strftime('%H', created_at) AS INTEGER) AS hour, COUNT(*) AS n
       FROM tasks WHERE ${created} GROUP BY dow, hour`, createdArgs(r.lo, r.hi)),

    get(`SELECT SUM(CASE WHEN release_count > 0 THEN 1 ELSE 0 END) AS n, COUNT(*) AS total
       FROM tasks WHERE ${created}`, createdArgs(r.lo, r.hi)),
  ]);

  const [postedSeries, completedSeries] = await Promise.all([
    all(`SELECT strftime('${r.fmt}', created_at) AS b, COUNT(*) AS v
         FROM tasks WHERE ${created} GROUP BY b ORDER BY b`, createdArgs(r.lo, r.hi)),
    all(`SELECT strftime('${r.fmt}', completed_at) AS b, COUNT(*) AS v
         FROM tasks WHERE ${done} GROUP BY b ORDER BY b`, createdArgs(r.lo, r.hi)),
  ]);

  // Stage durations, in hours, over tasks that actually reached both ends.
  const STAGES = [
    ['toPrice', 'created_at', 'reviewed_at', 'Posted → first price'],
    ['toAgree', 'reviewed_at', 'agreed_at', 'First price → agreed'],
    ['toAssign', 'agreed_at', 'assigned_at', 'Agreed → assigned'],
    ['toFix', 'assigned_at', 'work_done_at', 'Assigned → work done'],
    ['toConfirm', 'work_done_at', 'completed_at', 'Work done → confirmed'],
    ['endToEnd', 'created_at', 'completed_at', 'Posted → completed'],
  ];
  // All six stages at once — serially this was twelve round trips on its own.
  const durations = await Promise.all(STAGES.map(async ([key, a, b, label]) => {
    const where = `${a} IS NOT NULL AND ${b} IS NOT NULL AND created_at BETWEEN ? AND ?${sc.sql}`;
    const args = createdArgs(r.lo, r.hi);
    const [row, med] = await Promise.all([
      get(`SELECT AVG(${hoursBetween(a, b)}) AS avg, COUNT(*) AS n FROM tasks WHERE ${where}`, args),
      median(hoursBetween(a, b), 'tasks', where, args),
    ]);
    return { key, label, avgHours: avgOrNull(row.avg), medianHours: med, n: num(row.n) };
  }));

  out.funnel = {
    stages: [
      { key: 'posted', label: 'Posted', n: num(funnel.posted) },
      { key: 'priced', label: 'Priced', n: num(funnel.priced) },
      { key: 'agreed', label: 'Price agreed', n: num(funnel.agreed) },
      { key: 'assigned', label: 'Assigned', n: num(funnel.assigned) },
      { key: 'worked', label: 'Work done', n: num(funnel.worked) },
      { key: 'completed', label: 'Confirmed', n: num(funnel.completed) },
    ],
    byStatus: statusRows.map(x => ({ status: x.status, n: num(x.n) })),
    lostAt: [
      { label: 'Before a price was set', n: num(deaths.before_price) },
      { label: 'During price negotiation', n: num(deaths.during_pricing) },
      { label: 'Waiting to be assigned', n: num(deaths.before_assign) },
      { label: 'After work started', n: num(deaths.in_progress) },
    ],
    series: {
      posted: postedSeries.map(x => ({ b: x.b, v: num(x.v) })),
      completed: completedSeries.map(x => ({ b: x.b, v: num(x.v) })),
    },
    durations,
    heatmap: heat.map(x => ({ dow: num(x.dow), hour: num(x.hour), n: num(x.n) })),
    reassignedTasks: num(reassigned.n),
    reassignRate: pct(num(reassigned.n), num(reassigned.total)),
  };

  /* ---------- workers ---------- */
  // One query for the whole leaderboard. Skills are joined separately (one more
  // query for everyone) rather than per worker, to stay clear of an N+1.
  const [workerRows, skillRows, ratingDist, supply, demand] = await Promise.all([
    all(
      `SELECT u.id, u.name, u.avatar, u.availability, u.employment_status, u.experience,
            COUNT(CASE WHEN t.completed_at BETWEEN ? AND ? THEN 1 END) AS completed,
            COUNT(CASE WHEN t.status IN ('assigned','work_done') THEN 1 END) AS active,
            AVG(CASE WHEN t.rated_at BETWEEN ? AND ? THEN t.rating END) AS avg_rating,
            COUNT(CASE WHEN t.rated_at BETWEEN ? AND ? THEN t.rating END) AS rating_count,
            AVG(CASE WHEN t.completed_at BETWEEN ? AND ? THEN ${hoursBetween('t.assigned_at', 't.work_done_at')} END) AS avg_fix_hours,
            COALESCE(SUM(CASE WHEN t.completed_at BETWEEN ? AND ? THEN COALESCE(t.agreed_price, t.proposed_price) END), 0) AS revenue
       FROM users u
       LEFT JOIN tasks t ON t.assigned_fixer_id = u.id${scope.role === 'manager' ? ' AND t.manager_id = ?' : ''}
       WHERE u.role = 'fixer'
       GROUP BY u.id ORDER BY completed DESC, u.name ASC`,
      [r.lo, r.hi, r.lo, r.hi, r.lo, r.hi, r.lo, r.hi, r.lo, r.hi, ...(scope.role === 'manager' ? [scope.managerId] : [])]),

    all(`SELECT fs.user_id, fs.category FROM fixer_skills fs JOIN users u ON u.id = fs.user_id WHERE u.role='fixer'`),

    all(`SELECT rating, COUNT(*) AS n FROM tasks
       WHERE rating IS NOT NULL AND rated_at BETWEEN ? AND ?${sc.sql}
       GROUP BY rating ORDER BY rating`, createdArgs(r.lo, r.hi)),

    // Staffing: active workers holding each skill, against demand in that category.
    all(`SELECT fs.category, COUNT(*) AS n FROM fixer_skills fs JOIN users u ON u.id = fs.user_id
       WHERE u.role='fixer' AND u.employment_status='active' GROUP BY fs.category`),

    all(`SELECT category, COUNT(*) AS n FROM tasks WHERE ${created} GROUP BY category`, createdArgs(r.lo, r.hi)),
  ]);

  const skillsBy = {};
  for (const s of skillRows) (skillsBy[s.user_id] = skillsBy[s.user_id] || []).push(s.category);
  const supplyBy = Object.fromEntries(supply.map(x => [x.category, num(x.n)]));
  const demandBy = Object.fromEntries(demand.map(x => [x.category, num(x.n)]));

  out.workers = {
    leaderboard: workerRows.map(w => {
      const row = {
        id: w.id, name: w.name, avatar: w.avatar || null,
        availability: w.availability || 'available',
        employment_status: w.employment_status || 'active',
        experience: w.experience || null,
        skills: skillsBy[w.id] || [],
        completed: num(w.completed),
        active: num(w.active),
        avgRating: avgOrNull(w.avg_rating),
        ratingCount: num(w.rating_count),
        avgFixHours: avgOrNull(w.avg_fix_hours),
      };
      if (money) row.revenue = num(w.revenue);
      return row;
    }),
    ratingDistribution: [1, 2, 3, 4, 5].map(star => ({
      star, n: num((ratingDist.find(x => num(x.rating) === star) || {}).n),
    })),
    staffing: CATEGORIES.map(c => ({
      key: c.key, label: c.label,
      workers: supplyBy[c.key] || 0,
      tasks: demandBy[c.key] || 0,
    })),
  };

  /* ---------- categories, pricing & clients ---------- */
  const [catRows, pricing, negotiation, newClients, clientTotals, repeat, posting] = await Promise.all([
    all(`SELECT category, COUNT(*) AS posted,
              SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed,
              SUM(CASE WHEN status IN ${DEAD} THEN 1 ELSE 0 END) AS dead
       FROM tasks WHERE ${created} GROUP BY category`, createdArgs(r.lo, r.hi)),

    // Price movement is first offer → agreed. Deliberately NOT "what the client
    // suggested": clients no longer name a price (see the INSERT in server.js —
    // proposed_price goes in as NULL), so that comparison would always be empty.
    // Only tasks where the opening offer survived count (see db.js — the backfill
    // leaves first_offer_price NULL when it is genuinely unknowable).
    get(`SELECT AVG(first_offer_price) AS first_offer, AVG(agreed_price) AS agreed,
              AVG(offer_count) AS rounds, COUNT(*) AS n
       FROM tasks WHERE agreed_price IS NOT NULL AND first_offer_price IS NOT NULL AND ${created}`,
      createdArgs(r.lo, r.hi)),

    get(`SELECT SUM(CASE WHEN agreed_price IS NOT NULL AND offer_count <= 1 THEN 1 ELSE 0 END) AS accepted_first,
              SUM(CASE WHEN agreed_price IS NOT NULL AND offer_count > 1 THEN 1 ELSE 0 END) AS negotiated,
              SUM(CASE WHEN status='declined' THEN 1 ELSE 0 END) AS declined,
              AVG(CASE WHEN offer_count > 0 THEN offer_count END) AS avg_rounds
       FROM tasks WHERE reviewed_at IS NOT NULL AND ${created}`, createdArgs(r.lo, r.hi)),

    all(`SELECT strftime('${r.fmt}', created_at) AS b, COUNT(*) AS v
       FROM users WHERE role='client' AND created_at BETWEEN ? AND ? GROUP BY b ORDER BY b`, [r.lo, r.hi]),

    get(`SELECT COUNT(*) AS total, SUM(CASE WHEN created_at BETWEEN ? AND ? THEN 1 ELSE 0 END) AS added
       FROM users WHERE role='client'`, [r.lo, r.hi]),

    get(`SELECT COUNT(*) AS repeaters FROM (
         SELECT client_id FROM tasks WHERE 1=1${sc.sql} GROUP BY client_id HAVING COUNT(*) > 1)`, sc.args),

    get(`SELECT COUNT(DISTINCT client_id) AS n FROM tasks WHERE 1=1${sc.sql}`, sc.args),
  ]);

  const catBy = Object.fromEntries(catRows.map(x => [x.category, x]));
  out.categories = CATEGORIES.map(c => {
    const x = catBy[c.key] || {};
    return {
      key: c.key, label: c.label, emoji: c.emoji,
      posted: num(x.posted), completed: num(x.completed),
      cancelRate: pct(num(x.dead), num(x.posted)),
    };
  }).sort((a, b) => b.posted - a.posted);

  out.pricing = {
    avgFirstOffer: avgOrNull(pricing.first_offer),
    avgAgreed: avgOrNull(pricing.agreed),
    sampleSize: num(pricing.n),
    // Negative means the manager conceded ground during the haggling.
    movementPct: pricing.first_offer && pricing.agreed
      ? Math.round(((num(pricing.agreed) - num(pricing.first_offer)) / num(pricing.first_offer)) * 1000) / 10 : null,
    acceptedFirstOffer: num(negotiation.accepted_first),
    negotiated: num(negotiation.negotiated),
    declined: num(negotiation.declined),
    avgRounds: avgOrNull(negotiation.avg_rounds),
  };
  if (!money) {
    // A manager keeps the shape of the negotiation (how often, how many rounds,
    // how far the price moved as a percentage) but never the amounts.
    delete out.pricing.avgFirstOffer;
    delete out.pricing.avgAgreed;
  }

  out.clients = {
    total: num(clientTotals.total),
    added: num(clientTotals.added),
    series: newClients.map(x => ({ b: x.b, v: num(x.v) })),
    everPosted: num(posting.n),
    repeatClients: num(repeat.repeaters),
    repeatRate: pct(num(repeat.repeaters), num(posting.n)),
  };

  if (money) {
    out.clients.topSpenders = (await all(
      `SELECT c.id, c.name, COUNT(*) AS jobs, COALESCE(SUM(COALESCE(t.agreed_price, t.proposed_price)),0) AS spent
       FROM tasks t JOIN users c ON c.id = t.client_id
       WHERE t.paid = 1 AND t.paid_at BETWEEN ? AND ?${sc.sql}
       GROUP BY c.id ORDER BY spent DESC LIMIT 10`, createdArgs(r.lo, r.hi)))
      .map(x => ({ id: x.id, name: x.name, jobs: num(x.jobs), spent: num(x.spent) }));
  }

  return out;
}

/* ==================================================================
   One worker's detail, for the drill-down modal
================================================================== */
async function computeWorkerDetail(workerId, query, scope) {
  const r = resolveRange(query);
  const sc = scopeClause(scope);
  const money = scope.role !== 'manager';
  const mine = `assigned_fixer_id = ?${sc.sql}`;
  const args = [workerId, ...sc.args];

  const worker = await get(`SELECT id, name, avatar, availability, experience, bio, work_mode FROM users WHERE id = ? AND role='fixer'`, [workerId]);
  if (!worker) return null;

  const [jobs, ratings, byCategory, totals, teamFix] = await Promise.all([
    all(`SELECT strftime('${r.fmt}', completed_at) AS b, COUNT(*) AS v
         FROM tasks WHERE ${mine} AND completed_at BETWEEN ? AND ? GROUP BY b ORDER BY b`, [...args, r.lo, r.hi]),
    all(`SELECT strftime('${r.fmt}', rated_at) AS b, AVG(rating) AS v, COUNT(*) AS n
         FROM tasks WHERE ${mine} AND rated_at BETWEEN ? AND ? GROUP BY b ORDER BY b`, [...args, r.lo, r.hi]),
    all(`SELECT category, COUNT(*) AS n FROM tasks
         WHERE ${mine} AND created_at BETWEEN ? AND ? GROUP BY category ORDER BY n DESC`, [...args, r.lo, r.hi]),
    get(`SELECT COUNT(CASE WHEN completed_at BETWEEN ? AND ? THEN 1 END) AS completed,
                COUNT(CASE WHEN status IN ('assigned','work_done') THEN 1 END) AS active,
                AVG(CASE WHEN rated_at BETWEEN ? AND ? THEN rating END) AS avg_rating,
                COUNT(CASE WHEN rated_at BETWEEN ? AND ? THEN rating END) AS rating_count,
                AVG(CASE WHEN completed_at BETWEEN ? AND ? THEN ${hoursBetween('assigned_at', 'work_done_at')} END) AS avg_fix_hours,
                COALESCE(SUM(CASE WHEN completed_at BETWEEN ? AND ? THEN COALESCE(agreed_price, proposed_price) END),0) AS revenue
         FROM tasks WHERE ${mine}`, [r.lo, r.hi, r.lo, r.hi, r.lo, r.hi, r.lo, r.hi, r.lo, r.hi, ...args]),
    // The team average to compare against, over the same window.
    get(`SELECT AVG(${hoursBetween('assigned_at', 'work_done_at')}) AS avg
         FROM tasks WHERE completed_at BETWEEN ? AND ?${sc.sql}`, [r.lo, r.hi, ...sc.args]),
  ]);

  const detail = {
    worker: {
      id: worker.id, name: worker.name, avatar: worker.avatar || null,
      availability: worker.availability || 'available',
      experience: worker.experience || null, bio: worker.bio || null, work_mode: worker.work_mode || null,
      skills: (await all('SELECT category FROM fixer_skills WHERE user_id = ?', [workerId])).map(x => x.category),
    },
    range: { from: r.from, to: r.to, bucket: r.bucket },
    showMoney: money,
    completed: num(totals.completed),
    active: num(totals.active),
    avgRating: avgOrNull(totals.avg_rating),
    ratingCount: num(totals.rating_count),
    avgFixHours: avgOrNull(totals.avg_fix_hours),
    teamAvgFixHours: avgOrNull(teamFix.avg),
    series: {
      jobs: jobs.map(x => ({ b: x.b, v: num(x.v) })),
      rating: ratings.map(x => ({ b: x.b, v: round1(x.v), n: num(x.n) })),
    },
    byCategory: byCategory.map(x => ({ key: x.category, label: labelFor(x.category), n: num(x.n) })),
  };
  if (money) detail.revenue = num(totals.revenue);
  return detail;
}

module.exports = { computeAnalytics, computeWorkerDetail, resolveRange };
