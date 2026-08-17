/* ------------------------------------------------------------------
   db.js — database setup, schema, shared taxonomy, and seed data.

   Uses libSQL (@libsql/client) which speaks SQLite. Locally it runs
   against a file (digit.db); in production set DATABASE_URL to a Turso
   database (libsql://...) + DATABASE_AUTH_TOKEN. Same SQL either way.
------------------------------------------------------------------- */
const { createClient } = require('@libsql/client');
const bcrypt = require('bcryptjs');

// In production (Vercel) the filesystem is read-only, so a local SQLite file
// can't work — a hosted Turso (libSQL) database is required. Fail clearly rather
// than crashing cryptically on the first write.
if (!process.env.DATABASE_URL && (process.env.VERCEL || process.env.NODE_ENV === 'production')) {
  throw new Error('DATABASE_URL is not set. In production, create a Turso database (https://turso.tech) and set DATABASE_URL and DATABASE_AUTH_TOKEN. See README → "Deploy to Vercel".');
}

const url = process.env.DATABASE_URL || 'file:digit.db';
const authToken = process.env.DATABASE_AUTH_TOKEN || undefined;
const db = createClient(authToken ? { url, authToken } : { url });

/* tiny async query helpers (positional ? args, same as before) */
async function run(sql, args = []) { return db.execute({ sql, args }); }
async function get(sql, args = []) { const r = await db.execute({ sql, args }); return r.rows[0] || null; }
async function all(sql, args = []) { const r = await db.execute({ sql, args }); return r.rows; }

/* ------------------------------------------------------------------
   Shared taxonomy — the SAME keys are used for the problems clients
   post and the skills fixers register, which makes matching trivial.
------------------------------------------------------------------- */
const CATEGORIES = [
  { key: 'hardware', label: 'Hardware & crashes', emoji: '🖥️' },
  { key: 'os',       label: 'Operating system',   emoji: '🐌' },
  { key: 'network',  label: 'Wi-Fi & networking', emoji: '📶' },
  { key: 'security', label: 'Virus & security',   emoji: '🛡️' },
  { key: 'web',      label: 'Website development', emoji: '🌐' },
  { key: 'backend',  label: 'Backend & APIs',     emoji: '⚙️' },
  { key: 'mobile',   label: 'Phone & apps',       emoji: '📱' },
  { key: 'data',     label: 'Data recovery',      emoji: '💾' },
  { key: 'other',    label: 'Something else',     emoji: '✨' },
];
const CATEGORY_KEYS = new Set(CATEGORIES.map(c => c.key));
const labelFor = (key) => (CATEGORIES.find(c => c.key === key) || {}).label || key;

/* Urgency surcharge — added on top of the manager's service price for the first
   offer. "Whenever" is free; sooner costs more. Lives here (not in server.js) so
   the analytics module can price the surcharge without importing the app. */
const URGENCY_FEE = {
  'No rush — whenever': 0,
  'Within a few days': 20,
  'As soon as possible': 30,
};
const urgencyFee = (u) => URGENCY_FEE[u] || 0;

/* Tables first, indexes afterwards (see SCHEMA_INDEXES) — an index on a column
   added by a migration can only be created once that migration has run. */
const SCHEMA_TABLES = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  role          TEXT NOT NULL CHECK (role IN ('client','fixer','manager','admin')),
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  phone         TEXT,
  password_hash TEXT NOT NULL,
  bio           TEXT,
  experience    TEXT,
  hourly_rate   INTEGER,
  work_mode     TEXT,
  avatar        TEXT,
  cv            TEXT,
  availability  TEXT NOT NULL DEFAULT 'available',
  employment_status TEXT NOT NULL DEFAULT 'active',
  is_primary    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS fixer_skills (
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  PRIMARY KEY (user_id, category)
);
CREATE TABLE IF NOT EXISTS tasks (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id        INTEGER NOT NULL REFERENCES users(id),
  category         TEXT NOT NULL,
  custom_category  TEXT,
  title            TEXT NOT NULL,
  description      TEXT NOT NULL,
  photo_path       TEXT,
  urgency          TEXT,
  proposed_price   INTEGER,
  counter_price    INTEGER,
  manager_note     TEXT,
  agreed_price     INTEGER,
  paid             INTEGER NOT NULL DEFAULT 0,
  paid_at          TEXT,
  card_last4       TEXT,
  rating           INTEGER,
  rating_comment   TEXT,
  rated_at         TEXT,
  status           TEXT NOT NULL DEFAULT 'submitted',
  manager_id       INTEGER REFERENCES users(id),
  assigned_fixer_id INTEGER REFERENCES users(id),
  -- Stage timestamps. Each is stamped by the route that causes the transition,
  -- so the analytics page can measure how long every step actually took instead
  -- of guessing from updated_at (which only remembers the most recent change).
  reviewed_at      TEXT,
  agreed_at        TEXT,
  assigned_at      TEXT,
  work_done_at     TEXT,
  completed_at     TEXT,
  -- The manager's FIRST offer, kept forever. counter_price is overwritten on
  -- every negotiation round, so without this the price movement is unknowable.
  first_offer_price INTEGER,
  offer_count      INTEGER NOT NULL DEFAULT 0,
  -- How many times this task had to be taken off a worker and reassigned.
  release_count    INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS task_events (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id   INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  actor_id  INTEGER REFERENCES users(id),
  text      TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

const SCHEMA_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_tasks_status     ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_client     ON tasks(client_id);
CREATE INDEX IF NOT EXISTS idx_tasks_fixer      ON tasks(assigned_fixer_id);
CREATE INDEX IF NOT EXISTS idx_tasks_manager    ON tasks(manager_id);
CREATE INDEX IF NOT EXISTS idx_tasks_created    ON tasks(created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_rating     ON tasks(assigned_fixer_id, rating);
CREATE INDEX IF NOT EXISTS idx_tasks_paid_at    ON tasks(paid_at);
CREATE INDEX IF NOT EXISTS idx_tasks_completed  ON tasks(completed_at);
CREATE INDEX IF NOT EXISTS idx_tasks_category   ON tasks(category);
CREATE INDEX IF NOT EXISTS idx_events_task      ON task_events(task_id);
CREATE INDEX IF NOT EXISTS idx_fixer_skills_cat ON fixer_skills(category);
CREATE INDEX IF NOT EXISTS idx_users_role       ON users(role);
`;

async function seed() {
  const r = await db.execute(`SELECT COUNT(*) AS n FROM users`);
  if (Number(r.rows[0].n) > 0) return;
  const h = (pw) => bcrypt.hashSync(pw, 10);
  const insUser = async (role, name, email, phone, pw, bio, exp, rate, mode, primary) => {
    const res = await db.execute({
      sql: `INSERT INTO users (role,name,email,phone,password_hash,bio,experience,hourly_rate,work_mode,is_primary)
            VALUES (?,?,?,?,?,?,?,?,?,?) RETURNING id`,
      args: [role, name, email, phone, h(pw), bio, exp, rate, mode, primary],
    });
    return Number(res.rows[0].id);
  };
  const insSkill = (uid, cat) => db.execute({ sql: 'INSERT INTO fixer_skills (user_id,category) VALUES (?,?)', args: [uid, cat] });

  await insUser('admin', 'Digit Admin', 'admin@digit.app', null, 'admin123', null, null, null, null, 1);
  await insUser('manager', 'Morgan Lee', 'manager@digit.app', null, 'manager123', 'Triages incoming problems and sets fair prices.', null, null, null, 0);
  const a = await insUser('fixer', 'Alex Rivera', 'alex@digit.app', null, 'fixer123', '6 years in IT support. Fast with Windows crashes and Wi-Fi issues.', '6+ years', 35, 'Remote & in person', 0);
  for (const c of ['hardware', 'os', 'network', 'security']) await insSkill(a, c);
  const s = await insUser('fixer', 'Sam Patel', 'sam@digit.app', null, 'fixer123', 'Full-stack developer. Websites, APIs, and mobile apps.', '3–6 years', 45, 'Remote only', 0);
  for (const c of ['web', 'backend', 'mobile', 'data']) await insSkill(s, c);
  await insUser('client', 'Jordan Smith', 'client@digit.app', '+1 555 0100', 'client123', null, null, null, null, 0);
  console.log('[seed] Created demo accounts (see README for logins).');
}

/* Columns added after the original schema shipped. These run against LOCAL and
   REMOTE databases alike: a Turso database created before a column was added
   never gets it from CREATE TABLE IF NOT EXISTS, so skipping the check there
   would leave production permanently missing the column. Both PRAGMAs go out in
   one batch to keep it to a single round-trip on a cold start. */
const TASK_COLUMNS = {
  custom_category: 'TEXT', paid: 'INTEGER NOT NULL DEFAULT 0', paid_at: 'TEXT',
  card_last4: 'TEXT', rating: 'INTEGER', rating_comment: 'TEXT', rated_at: 'TEXT',
  reviewed_at: 'TEXT', agreed_at: 'TEXT', assigned_at: 'TEXT', work_done_at: 'TEXT',
  completed_at: 'TEXT', first_offer_price: 'INTEGER', offer_count: 'INTEGER NOT NULL DEFAULT 0',
  release_count: 'INTEGER NOT NULL DEFAULT 0',
};
const USER_COLUMNS = {
  avatar: 'TEXT', cv: 'TEXT',
  availability: "TEXT NOT NULL DEFAULT 'available'",
  employment_status: "TEXT NOT NULL DEFAULT 'active'",
};

async function migrateColumns() {
  const [t, u] = await db.batch(['PRAGMA table_info(tasks)', 'PRAGMA table_info(users)'], 'read');
  const have = (r) => new Set(r.rows.map(c => c.name));
  const haveTasks = have(t), haveUsers = have(u);
  const added = [];
  for (const [c, def] of Object.entries(TASK_COLUMNS)) {
    if (!haveTasks.has(c)) { await db.execute(`ALTER TABLE tasks ADD COLUMN ${c} ${def}`); added.push(c); }
  }
  for (const [c, def] of Object.entries(USER_COLUMNS)) {
    if (!haveUsers.has(c)) { await db.execute(`ALTER TABLE users ADD COLUMN ${c} ${def}`); added.push(c); }
  }
  return added;
}

/* One-time, best-effort backfill of the stage timestamps for tasks that predate
   them, read out of the task_events trail. Matching on the wording the server
   itself writes is brittle — which is exactly why this runs ONCE, guarded on the
   ALTER above, and is never the live source. From the migration onward the
   columns are authoritative. Rows that don't match stay NULL and are excluded
   from timing averages rather than counted as zero. */
const BACKFILL = [
  `UPDATE tasks SET reviewed_at = (SELECT MIN(e.created_at) FROM task_events e
     WHERE e.task_id = tasks.id AND e.text LIKE 'Manager offered%') WHERE reviewed_at IS NULL`,
  `UPDATE tasks SET agreed_at = (SELECT MIN(e.created_at) FROM task_events e
     WHERE e.task_id = tasks.id AND e.text LIKE '%accepted the%price%') WHERE agreed_at IS NULL`,
  // MAX, not MIN: a task can be released and reassigned, and the clock that
  // matters is the assignment the work actually happened under.
  `UPDATE tasks SET assigned_at = (SELECT MAX(e.created_at) FROM task_events e
     WHERE e.task_id = tasks.id AND e.text LIKE '% assigned %to this task%') WHERE assigned_at IS NULL`,
  `UPDATE tasks SET work_done_at = (SELECT MAX(e.created_at) FROM task_events e
     WHERE e.task_id = tasks.id AND e.text LIKE '%marked the work as done%') WHERE work_done_at IS NULL`,
  `UPDATE tasks SET completed_at = (SELECT MAX(e.created_at) FROM task_events e
     WHERE e.task_id = tasks.id AND e.text LIKE '%confirmed the problem is fixed%') WHERE completed_at IS NULL`,
  `UPDATE tasks SET offer_count = COALESCE((SELECT COUNT(*) FROM task_events e
     WHERE e.task_id = tasks.id AND (e.text LIKE 'Manager offered%' OR e.text LIKE '%countered with%')), 0)
   WHERE offer_count = 0`,
  `UPDATE tasks SET release_count = COALESCE((SELECT COUNT(*) FROM task_events e
     WHERE e.task_id = tasks.id AND e.text LIKE '%unassigned the task%'), 0)
   WHERE release_count = 0`,
  // Only knowable when nobody countered — otherwise counter_price has already
  // been overwritten and the first offer is genuinely lost. Leave those NULL.
  `UPDATE tasks SET first_offer_price = counter_price
   WHERE first_offer_price IS NULL AND counter_price IS NOT NULL
     AND (SELECT COUNT(*) FROM task_events e WHERE e.task_id = tasks.id AND e.text LIKE '%countered with%') = 0`,
];

let initPromise = null;
async function init() {
  await db.executeMultiple(SCHEMA_TABLES);
  const added = await migrateColumns();
  // Indexes come after the migration: several cover columns it may have added.
  await db.executeMultiple(SCHEMA_INDEXES);
  if (added.some(c => c in TASK_COLUMNS)) {
    for (const sql of BACKFILL) await db.execute(sql);
  }
  await seed();
}
/* ready resolves once the schema/seed are in place (idempotent, cached). */
function ready() { return (initPromise = initPromise || init()); }

module.exports = {
  db, run, get, all, ready, CATEGORIES, CATEGORY_KEYS, labelFor, URGENCY_FEE, urgencyFee,
  // Exported for scripts/push-to-remote.js, which builds the schema on a fresh
  // hosted database without running seed() (the rows it copies include the
  // seeded accounts already).
  SCHEMA_TABLES, SCHEMA_INDEXES,
};
