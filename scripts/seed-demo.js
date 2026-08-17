/* ------------------------------------------------------------------
   seed-demo.js — DEV ONLY. Fills the local database with a year of
   believable tasks so the Analytics page has something to draw.

       node scripts/seed-demo.js             add ~180 tasks
       node scripts/seed-demo.js --count=90  add ~90 instead
       node scripts/seed-demo.js --reset     delete demo data first

   The app never imports this. It writes the same columns the live
   routes write (including the stage timestamps), so the numbers it
   produces are the numbers real usage would produce.
------------------------------------------------------------------- */
const path = require('path');
const bcrypt = require('bcryptjs');
const { db, run, get, all, ready, CATEGORIES, urgencyFee } = require(path.join(__dirname, '..', 'db'));

if (process.env.DATABASE_URL) {
  console.error('Refusing to run: DATABASE_URL is set, which points at a real (Turso) database.\n' +
                'This script is for the local digit.db file only.');
  process.exit(1);
}

const countArg = (process.argv.find(a => a.startsWith('--count=')) || '').split('=')[1];
const TASK_COUNT = Math.max(1, parseInt(countArg, 10) || 180);
const DAY = 86400000;

/* Deterministic PRNG so repeated runs are comparable. Math.imul is load-bearing:
   a plain `s * 1103515245` overflows the 53-bit safe-integer range on the second
   step, and the garbage low bits collapse the stream into a short, correlated
   cycle (~15k distinct values per 100k draws) — which silently starved whole
   branches below, so no task ever came out 'open'. imul keeps the multiply exact
   at 32 bits and gives the full period. */
let s = 1337;
const rnd = () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const chance = (p) => rnd() < p;
const stamp = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');

const URGENCIES = ['No rush — whenever', 'Within a few days', 'As soon as possible'];

const TITLES = {
  hardware: ['Laptop won\'t turn on', 'Blue screen every morning', 'Fan noise and overheating', 'Screen flickers randomly'],
  os: ['Windows is painfully slow', 'Stuck on the update screen', 'Can\'t log in after update', 'Printer driver keeps failing'],
  network: ['Wi-Fi drops every hour', 'Router needs setting up', 'No internet in the back room', 'VPN won\'t connect'],
  security: ['Pop-ups everywhere', 'Think I clicked a bad link', 'Email account was hacked', 'Ransomware warning'],
  web: ['Shop page loads forever', 'Need a landing page built', 'Contact form stopped sending', 'Site broken on phones'],
  backend: ['API returns 500 at checkout', 'Database keeps timing out', 'Need a payment webhook', 'Cron job stopped running'],
  mobile: ['App crashes on open', 'Photos won\'t sync', 'Phone storage always full', 'Need help moving to a new phone'],
  data: ['Deleted the wrong folder', 'External drive not recognised', 'Recover photos from a dead phone', 'Spreadsheet is corrupted'],
  other: ['Smart TV won\'t cast', 'Set up a home office', 'Scanner won\'t talk to the Mac', 'Need a general tech health check'],
};
const COMMENTS = [
  'Fast and friendly, explained everything clearly.', 'Fixed in under an hour. Brilliant.',
  'Very patient with someone who is not technical at all.', 'Sorted it remotely, no fuss.',
  'Good work, though it took longer than I expected.', 'Knew exactly what the problem was.',
  'Polite and thorough. Would use again.', null, null,
];

const EXTRA_CLIENTS = [
  ['Priya Nair', 'priya@example.com'], ['Tom Becker', 'tom@example.com'],
  ['Aisha Karim', 'aisha@example.com'], ['Diego Santos', 'diego@example.com'],
  ['Lena Fischer', 'lena@example.com'], ['Marcus Hall', 'marcus@example.com'],
  ['Yuki Tanaka', 'yuki@example.com'], ['Nina Petrova', 'nina@example.com'],
];
const EXTRA_FIXERS = [
  ['Chris Doyle', 'chris@example.com', '3–6 years', ['hardware', 'os', 'data'], 30],
  ['Maya Osei', 'maya@example.com', '6+ years', ['web', 'backend', 'security'], 50],
  ['Ravi Shah', 'ravi@example.com', '1–3 years', ['network', 'mobile', 'other'], 25],
];

async function ensureUser(role, name, email, extra = {}) {
  const found = await get('SELECT id FROM users WHERE email = ?', [email]);
  if (found) return Number(found.id);
  const r = await db.execute({
    sql: `INSERT INTO users (role,name,email,password_hash,experience,hourly_rate,work_mode,bio,created_at)
          VALUES (?,?,?,?,?,?,?,?,?) RETURNING id`,
    args: [role, name, email, bcrypt.hashSync('Demo1234', 10), extra.experience || null,
           extra.rate || null, extra.mode || 'Remote & in person', extra.bio || null,
           extra.created_at || stamp(Date.now() - int(30, 360) * DAY)],
  });
  return Number(r.rows[0].id);
}

async function reset() {
  await run(`DELETE FROM task_events WHERE task_id IN (SELECT id FROM tasks WHERE title LIKE '[demo]%')`);
  const r = await run(`DELETE FROM tasks WHERE title LIKE '[demo]%'`);
  console.log(`[reset] removed ${r.rowsAffected} demo tasks`);
}

async function main() {
  await ready();
  if (process.argv.includes('--reset')) await reset();

  const managers = [];
  managers.push(Number((await get(`SELECT id FROM users WHERE email='manager@digit.app'`)).id));
  managers.push(await ensureUser('manager', 'Dana Kowalski', 'dana@example.com', { bio: 'Triages hardware and network jobs.' }));

  const clients = [Number((await get(`SELECT id FROM users WHERE email='client@digit.app'`)).id)];
  for (const [name, email] of EXTRA_CLIENTS) clients.push(await ensureUser('client', name, email));

  const fixers = (await all(`SELECT id FROM users WHERE role='fixer'`)).map(r => Number(r.id));
  for (const [name, email, exp, skills, rate] of EXTRA_FIXERS) {
    const id = await ensureUser('fixer', name, email, { experience: exp, rate, bio: `${exp} of hands-on work.` });
    for (const c of skills) {
      await run('INSERT OR IGNORE INTO fixer_skills (user_id,category) VALUES (?,?)', [id, c]);
    }
    if (!fixers.includes(id)) fixers.push(id);
  }
  const skillsOf = {};
  for (const f of fixers) {
    skillsOf[f] = (await all('SELECT category FROM fixer_skills WHERE user_id=?', [f])).map(r => r.category);
  }

  const now = Date.now();
  let made = 0;

  for (let i = 0; i < TASK_COUNT; i++) {
    // Weight recent months more heavily so trend lines slope instead of sitting flat.
    const ageDays = Math.floor(Math.pow(rnd(), 1.7) * 365);
    const created = now - ageDays * DAY - int(0, 23) * 3600000;
    const cat = pick(CATEGORIES).key;
    const client = pick(clients);
    const manager = pick(managers);
    const urgency = pick(URGENCIES);
    const fee = urgencyFee(urgency);
    // Notional job size, used only to vary the manager's offer. proposed_price
    // stays NULL because the real POST /api/tasks leaves it NULL — clients no
    // longer name a price, the manager makes the first offer.
    const size = int(3, 26) * 10;
    const title = `[demo] ${pick(TITLES[cat] || TITLES.other)}`;

    const ins = await db.execute({
      sql: `INSERT INTO tasks (client_id,category,title,description,urgency,proposed_price,status,created_at,updated_at)
            VALUES (?,?,?,?,?,NULL, 'submitted', ?, ?) RETURNING id`,
      args: [client, cat, title, 'Demo record generated by scripts/seed-demo.js.', urgency,
             stamp(created), stamp(created)],
    });
    const id = Number(ins.rows[0].id);
    const ev = (at, text) => run('INSERT INTO task_events (task_id,actor_id,text,created_at) VALUES (?,?,?,?)',
      [id, manager, text, stamp(at)]);
    made++;

    // --- still waiting on a first price?
    if (chance(0.06)) continue;

    const reviewed = created + int(1, 40) * 3600000;
    if (reviewed > now) continue;
    const service = Math.round(size * (0.8 + rnd() * 0.7) / 5) * 5;
    const firstOffer = service + fee;
    await run(`UPDATE tasks SET status='price_countered', counter_price=?, first_offer_price=?, reviewed_at=?,
                      manager_id=?, offer_count=1, updated_at=? WHERE id=?`,
      [firstOffer, firstOffer, stamp(reviewed), manager, stamp(reviewed), id]);
    await ev(reviewed, `Manager offered ₾${firstOffer}${fee ? ` (₾${service} for the work + ₾${fee} ${urgency} fee)` : '.'}`);

    // --- client declines outright
    if (chance(0.08)) {
      const at = reviewed + int(1, 30) * 3600000;
      if (at > now) continue;
      await run(`UPDATE tasks SET status='declined', updated_at=? WHERE id=?`, [stamp(at), id]);
      await ev(at, 'Client declined the price. Task closed.');
      continue;
    }

    // --- a round of haggling, sometimes
    let agreedPrice = firstOffer, rounds = 1;
    let agreed = reviewed + int(1, 48) * 3600000;
    const counterAt = agreed - 1800000;
    if (chance(0.3) && counterAt <= now) {
      rounds = 2;
      agreedPrice = Math.max(10, Math.round(firstOffer * (0.75 + rnd() * 0.2) / 5) * 5);
      await ev(counterAt, `Client countered with ₾${agreedPrice}.`);
    }
    // Stopping mid-negotiation has to leave the status saying whose move it is.
    // After a client counter the manager owes the reply ('client_countered');
    // with no counter the client still owes an answer to the opening offer, which
    // is what 'price_countered' already means — so only the first case is written.
    const stall = () => rounds > 1
      ? run(`UPDATE tasks SET status='client_countered', counter_price=?, offer_count=?, updated_at=? WHERE id=?`,
          [agreedPrice, rounds, stamp(counterAt), id])
      : Promise.resolve();
    if (agreed > now) { await stall(); continue; }
    // --- still negotiating. A counter awaiting the manager's reply is the one
    // state their queue needs to show, so those stall more often than a client
    // who is simply sitting on the opening offer.
    if (rounds > 1 ? chance(0.18) : chance(0.05)) { await stall(); continue; }

    await run(`UPDATE tasks SET status='open', agreed_price=?, agreed_at=?, offer_count=?, updated_at=? WHERE id=?`,
      [agreedPrice, stamp(agreed), rounds, stamp(agreed), id]);
    await ev(agreed, `Client accepted the price of ₾${agreedPrice}. Ready for a manager to assign a worker.`);

    // --- client changes their mind
    if (chance(0.05)) {
      const at = agreed + int(2, 60) * 3600000;
      if (at > now) continue;
      await run(`UPDATE tasks SET status='cancelled', updated_at=? WHERE id=?`, [stamp(at), id]);
      await ev(at, 'Client cancelled the request — they no longer need help.');
      continue;
    }

    // --- waiting to be assigned
    if (chance(0.07)) continue;

    // Prefer a worker who actually holds the skill, like a real manager would.
    const matching = fixers.filter(f => (skillsOf[f] || []).includes(cat));
    const fixer = matching.length && chance(0.85) ? pick(matching) : pick(fixers);
    let assigned = agreed + int(1, 72) * 3600000;
    if (assigned > now) continue;

    // --- occasionally the first worker can't do it and it gets reassigned
    let releases = 0;
    if (chance(0.07)) {
      releases = 1;
      const rel = assigned + int(4, 48) * 3600000;
      await ev(rel, 'Manager unassigned the task. Ready to assign a different worker.');
      assigned = rel + int(1, 36) * 3600000;
      if (assigned > now) continue;
    }
    await run(`UPDATE tasks SET status='assigned', assigned_fixer_id=?, assigned_at=?, release_count=?, updated_at=? WHERE id=?`,
      [fixer, stamp(assigned), releases, stamp(assigned), id]);
    await ev(assigned, `Manager assigned a worker to this task.`);

    // --- work in progress
    if (chance(0.08)) continue;

    const worked = assigned + int(2, 96) * 3600000;
    if (worked > now) continue;
    await run(`UPDATE tasks SET status='work_done', work_done_at=?, updated_at=? WHERE id=?`, [stamp(worked), stamp(worked), id]);
    await ev(worked, 'Worker marked the work as done. Waiting for the client to confirm.');

    // --- awaiting the client's confirmation
    if (chance(0.09)) continue;

    const completed = worked + int(1, 60) * 3600000;
    if (completed > now) continue;
    await run(`UPDATE tasks SET status='completed', completed_at=?, updated_at=? WHERE id=?`, [stamp(completed), stamp(completed), id]);
    await ev(completed, 'Client confirmed the problem is fixed. ✅');

    // --- payment (most, not all)
    if (chance(0.86)) {
      const paid = completed + int(1, 96) * 3600000;
      if (paid <= now) {
        await run(`UPDATE tasks SET paid=1, paid_at=?, card_last4=?, updated_at=? WHERE id=?`,
          [stamp(paid), String(int(1000, 9999)), stamp(paid), id]);
        await ev(paid, `Client paid ₾${agreedPrice}. 💳`);
      }
    }

    // --- rating (most, not all). Skew high, with a long tail.
    if (chance(0.78)) {
      const rated = completed + int(1, 72) * 3600000;
      if (rated <= now) {
        const stars = chance(0.62) ? 5 : chance(0.6) ? 4 : chance(0.6) ? 3 : chance(0.5) ? 2 : 1;
        const comment = pick(COMMENTS);
        await run(`UPDATE tasks SET rating=?, rating_comment=?, rated_at=? WHERE id=?`, [stars, comment, stamp(rated), id]);
        await ev(rated, `Client rated the worker ${'★'.repeat(stars)} (${stars}/5).`);
      }
    }
  }

  const summary = await get(`SELECT COUNT(*) AS n,
      SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN paid=1 THEN 1 ELSE 0 END) AS paid,
      SUM(CASE WHEN rating IS NOT NULL THEN 1 ELSE 0 END) AS rated
    FROM tasks WHERE title LIKE '[demo]%'`);
  console.log(`[seed-demo] ${made} tasks written — ${summary.completed} completed, ${summary.paid} paid, ${summary.rated} rated.`);
  console.log('[seed-demo] Extra logins use the password  Demo1234');
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
