/* ------------------------------------------------------------------
   push-to-remote.js — copy the LOCAL digit.db into the hosted
   (Turso / libSQL) database, so a Vercel deployment starts with the
   same data you see on localhost.

       node scripts/push-to-remote.js             # target must be empty
       node scripts/push-to-remote.js --replace   # wipe the target first
       node scripts/push-to-remote.js --dry-run   # report, change nothing

   It is the mirror image of scripts/seed-demo.js: that one GENERATES
   placeholder data locally, this one UPLOADS whatever is in digit.db —
   demo accounts, the ~180 [demo] tasks and their event trail — keeping
   every primary key, so foreign keys still line up on the other side.

   Credentials come from DATABASE_URL / DATABASE_AUTH_TOKEN, read from
   the environment or from .env.local (what `vercel env pull` writes).
------------------------------------------------------------------- */
const path = require('path');
const { createClient } = require('@libsql/client');

const ROOT = path.join(__dirname, '..');

/* Node does not auto-load .env files for plain scripts — only Next.js and
   friends do. Load .env.local if it exists so `vercel env pull` is enough. */
for (const f of ['.env.local', '.env']) {
  try { process.loadEnvFile(path.join(ROOT, f)); } catch { /* absent — fine */ }
}

const REPLACE = process.argv.includes('--replace');
const DRY_RUN = process.argv.includes('--dry-run');

const url = process.env.DATABASE_URL;
const authToken = process.env.DATABASE_AUTH_TOKEN || undefined;

if (!url) {
  console.error(
    'DATABASE_URL is not set, so there is no hosted database to push to.\n' +
    'Provision one (Vercel → Storage → Turso, or `vercel integration add tursocloud/database`),\n' +
    'then run `vercel env pull .env.local` and try again.');
  process.exit(1);
}
if (url.startsWith('file:')) {
  console.error(`DATABASE_URL points at a local file (${url}). Nothing to upload — set it to a libsql:// URL.`);
  process.exit(1);
}

/* Requiring db.js AFTER the env check would still build a client against the
   remote URL, which we do not want to use for reads. Pull only the schema. */
const { SCHEMA_TABLES, SCHEMA_INDEXES } = require(path.join(ROOT, 'db'));

const local = createClient({ url: 'file:' + path.join(ROOT, 'digit.db') });
const remote = createClient(authToken ? { url, authToken } : { url });

/* Parents before children: users own fixer_skills and tasks, tasks own events.
   Deletes walk this list backwards. */
const TABLES = ['users', 'fixer_skills', 'tasks', 'task_events'];
const CHUNK = 50;   // statements per batched round-trip

const columnsOf = async (client, table) => {
  const r = await client.execute(`PRAGMA table_info(${table})`);
  return r.rows.map(c => c.name);
};
const countOf = async (client, table) => {
  const r = await client.execute(`SELECT COUNT(*) AS n FROM ${table}`);
  return Number(r.rows[0].n);
};
/* libSQL hands back BigInt for large integers; SQLite bind params reject
   anything exotic, so normalise to plain JS values. */
const normalise = (v) => (typeof v === 'bigint' ? Number(v) : v === undefined ? null : v);

async function copyTable(table) {
  const localCols = await columnsOf(local, table);
  const remoteCols = new Set(await columnsOf(remote, table));
  // Only columns that exist on BOTH sides, so a schema that has drifted on
  // either end degrades to a partial copy instead of failing outright.
  const cols = localCols.filter(c => remoteCols.has(c));
  const missing = localCols.filter(c => !remoteCols.has(c));
  if (missing.length) console.warn(`  ! ${table}: skipping column(s) absent remotely: ${missing.join(', ')}`);

  const rows = (await local.execute(`SELECT ${cols.map(c => `"${c}"`).join(',')} FROM ${table}`)).rows;
  if (!rows.length) { console.log(`  ${table}: nothing to copy`); return 0; }

  const sql = `INSERT INTO ${table} (${cols.map(c => `"${c}"`).join(',')}) ` +
              `VALUES (${cols.map(() => '?').join(',')})`;

  let done = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK)
      .map(r => ({ sql, args: cols.map(c => normalise(r[c])) }));
    await remote.batch(batch, 'write');
    done += batch.length;
    process.stdout.write(`\r  ${table}: ${done}/${rows.length}`);
  }
  process.stdout.write('\n');
  return done;
}

async function main() {
  const host = url.replace(/^libsql:\/\//, '').split('?')[0];
  console.log(`[push] source  digit.db`);
  console.log(`[push] target  ${host}${DRY_RUN ? '  (dry run)' : ''}\n`);

  // Local tallies first — also proves digit.db is readable before we touch
  // anything remote.
  const localCounts = {};
  for (const t of TABLES) localCounts[t] = await countOf(local, t);
  console.log('local:  ' + TABLES.map(t => `${t}=${localCounts[t]}`).join('  '));

  if (!DRY_RUN) {
    await remote.executeMultiple(SCHEMA_TABLES);
    await remote.executeMultiple(SCHEMA_INDEXES);
  }

  const before = {};
  for (const t of TABLES) before[t] = DRY_RUN ? 0 : await countOf(remote, t);
  console.log('remote: ' + TABLES.map(t => `${t}=${before[t]}`).join('  ') + '\n');

  const occupied = TABLES.filter(t => before[t] > 0);
  if (occupied.length && !REPLACE) {
    console.error(
      `Target is not empty (${occupied.map(t => `${t}=${before[t]}`).join(', ')}).\n` +
      'Re-run with --replace to wipe those tables and upload a clean copy.');
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log('[push] dry run — nothing written.');
    return;
  }

  if (REPLACE && occupied.length) {
    for (const t of [...TABLES].reverse()) await remote.execute(`DELETE FROM ${t}`);
    console.log('[push] wiped target tables\n');
  }

  for (const t of TABLES) await copyTable(t);

  // Verify by re-counting rather than trusting the write path.
  console.log('');
  let ok = true;
  for (const t of TABLES) {
    const n = await countOf(remote, t);
    const match = n === localCounts[t];
    if (!match) ok = false;
    console.log(`  ${match ? '✓' : '✗'} ${t}: ${n} remote / ${localCounts[t]} local`);
  }
  if (!ok) { console.error('\n[push] row counts do NOT match — investigate before deploying.'); process.exit(1); }
  console.log('\n[push] done — hosted database mirrors digit.db.');
}

main().then(() => process.exit(0)).catch(e => { console.error('\n' + (e.stack || e.message)); process.exit(1); });
