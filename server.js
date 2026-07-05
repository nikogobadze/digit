/* ------------------------------------------------------------------
   server.js — Digit API + static host.
   Local:  npm start      (uses a local SQLite file + disk uploads)
   Vercel: exported app    (uses Turso libSQL + Vercel Blob via env vars)
------------------------------------------------------------------- */
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { put } = require('@vercel/blob');
const { run, get, all, ready, CATEGORIES, CATEGORY_KEYS, labelFor } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'digit-dev-secret-change-me';
const COOKIE = 'digit_token';
const IS_PROD = !!process.env.VERCEL || process.env.NODE_ENV === 'production';

/* Fixer availability. Only "available" fixers can be handed new work; the rest
   are shown to the manager but cannot be assigned. */
const AVAILABILITY = {
  available: { label: 'Available', assignable: true },
  busy:      { label: 'Busy',      assignable: false },
  away:      { label: 'Away',      assignable: false },
  offline:   { label: 'Offline',   assignable: false },
};
const availMeta = (v) => AVAILABILITY[v] || AVAILABILITY.available;

/* Urgency surcharge — added on top of the manager's service price for the first
   offer. "Whenever" is free; sooner costs more. */
const URGENCY_FEE = {
  'No rush — whenever': 0,
  'Within a few days': 20,
  'As soon as possible': 30,
};
const urgencyFee = (u) => URGENCY_FEE[u] || 0;

app.set('trust proxy', 1); // behind Vercel's proxy
app.use(express.json());
app.use(cookieParser());

/* wrap async handlers so thrown errors reach the error handler */
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* ---------- uploads (Vercel Blob in prod, local disk in dev) ---------- */
const useBlob = !!process.env.BLOB_READ_WRITE_TOKEN;
// On Vercel the project dir is read-only; only /tmp is writable. Locally use ./uploads.
const UPLOAD_DIR = process.env.VERCEL ? path.join(require('os').tmpdir(), 'uploads') : path.join(__dirname, 'uploads');
if (!useBlob) { try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch {} }
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB
  fileFilter: (req, file, cb) => cb(null, /^image\//.test(file.mimetype)),
});
async function saveUpload(file) {
  const ext = (path.extname(file.originalname) || '.jpg').toLowerCase().slice(0, 8);
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
  if (useBlob) {
    const blob = await put(`uploads/${name}`, file.buffer, { access: 'public', contentType: file.mimetype });
    return blob.url; // full https URL
  }
  try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch {}
  fs.writeFileSync(path.join(UPLOAD_DIR, name), file.buffer);
  return name; // filename, served from /uploads
}
const fileUrl = (ref) => !ref ? null : (/^https?:\/\//.test(ref) ? ref : `/uploads/${path.basename(ref)}`);

/* Serve the SPA shell + static assets immediately — no DB wait, so reloads are fast. */
app.use(express.static(path.join(__dirname, 'public')));
if (!useBlob) app.use('/uploads', express.static(UPLOAD_DIR));

/* ---------- helpers ---------- */
async function ratingFor(fixerId) {
  const r = await get(`SELECT AVG(rating) AS avg, COUNT(rating) AS n FROM tasks WHERE assigned_fixer_id = ? AND rating IS NOT NULL`, [fixerId]);
  return { avg: r && r.avg ? Math.round(r.avg * 10) / 10 : 0, count: Number((r && r.n) || 0) };
}
async function publicUser(u) {
  if (!u) return null;
  const skills = u.role === 'fixer'
    ? (await all('SELECT category FROM fixer_skills WHERE user_id = ?', [u.id])).map(r => r.category) : undefined;
  return {
    id: u.id, role: u.role, name: u.name, email: u.email, phone: u.phone || null,
    bio: u.bio || null, experience: u.experience || null,
    hourly_rate: u.hourly_rate || null, work_mode: u.work_mode || null,
    is_primary: !!u.is_primary, skills,
    avatar: fileUrl(u.avatar),
    employment_status: u.employment_status || 'active',
    availability: u.role === 'fixer' ? (u.availability || 'available') : undefined,
    rating: u.role === 'fixer' ? await ratingFor(u.id) : undefined,
  };
}
const userById = (id) => get('SELECT * FROM users WHERE id = ?', [id]);
const userByEmail = (email) => get('SELECT * FROM users WHERE email = ?', [email]);
const taskById = (id) => get('SELECT * FROM tasks WHERE id = ?', [id]);

function event(taskId, actorId, text) {
  return run('INSERT INTO task_events (task_id,actor_id,text) VALUES (?,?,?)', [taskId, actorId, text]);
}

async function taskView(t) {
  const client = await userById(t.client_id);
  const fixer = t.assigned_fixer_id ? await userById(t.assigned_fixer_id) : null;
  const events = await all('SELECT * FROM task_events WHERE task_id = ? ORDER BY created_at ASC', [t.id]);
  const eventsOut = [];
  for (const e of events) {
    eventsOut.push({ text: e.text, who: e.actor_id ? ((await userById(e.actor_id)) || {}).name : 'System', at: e.created_at });
  }
  return {
    id: t.id,
    category: t.category,
    categoryLabel: t.custom_category ? t.custom_category : labelFor(t.category),
    title: t.title, description: t.description,
    photos: t.photo_path ? t.photo_path.split(',').filter(Boolean).map(fileUrl) : [],
    urgency: t.urgency,
    urgency_fee: urgencyFee(t.urgency),
    proposed_price: t.proposed_price,
    counter_price: t.counter_price,
    manager_note: t.manager_note,
    agreed_price: t.agreed_price,
    paid: !!t.paid, paid_at: t.paid_at || null, card_last4: t.card_last4 || null,
    rating: t.rating || null, rating_comment: t.rating_comment || null,
    status: t.status,
    created_at: t.created_at, updated_at: t.updated_at,
    client: { id: client.id, name: client.name },
    fixer: fixer ? { id: fixer.id, name: fixer.name } : null,
    events: eventsOut,
  };
}
const viewAll = (rows) => Promise.all(rows.map(taskView));

/* ---------- auth ---------- */
function setAuthCookie(res, user) {
  const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: IS_PROD, maxAge: 7 * 24 * 3600 * 1000 });
}
async function currentUser(req) {
  const token = req.cookies[COOKIE];
  if (!token) return null;
  try {
    const { id } = jwt.verify(token, JWT_SECRET);
    const u = await userById(id);
    // Dismissed/resigned accounts stay in the DB but can no longer act.
    if (!u || (u.employment_status && u.employment_status !== 'active')) return null;
    return u;
  } catch { return null; }
}
const auth = ah(async (req, res, next) => {
  const u = await currentUser(req);
  if (!u) return res.status(401).json({ error: 'Please log in.' });
  req.user = u; next();
});
const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Not allowed for your role.' });

/* FormData arrays arrive as JSON strings. */
const parseArr = (v) => { try { const a = JSON.parse(v); return Array.isArray(a) ? a : []; } catch { return Array.isArray(v) ? v : []; } };
/* Password policy: 8+ chars, at least one number and one capital letter. */
function passwordError(pw) {
  pw = pw || '';
  if (pw.length < 8) return 'Password must be at least 8 characters.';
  if (!/[0-9]/.test(pw)) return 'Password must include at least 1 number.';
  if (!/[A-Z]/.test(pw)) return 'Password must include at least 1 capital letter.';
  return null;
}
const setAvatar = (ref, id) => run('UPDATE users SET avatar=? WHERE id=?', [ref, id]);

/* ==================================================================
   PUBLIC
================================================================== */
app.get('/api/categories', (req, res) => res.json(CATEGORIES)); // no DB — instant

/* Everything below talks to the DB: ensure the schema/seed exist (cold start). */
app.use('/api', ah(async (req, res, next) => { await ready(); next(); }));

app.get('/api/reviews', ah(async (req, res) => {
  const rows = await all(`
    SELECT t.rating, t.rating_comment, t.rated_at, t.category, t.custom_category,
           f.name AS fixer, f.avatar AS fixer_avatar, c.name AS reviewer, c.avatar AS reviewer_avatar
    FROM tasks t JOIN users f ON f.id = t.assigned_fixer_id JOIN users c ON c.id = t.client_id
    WHERE t.rating IS NOT NULL ORDER BY t.rated_at DESC`);
  const reviews = rows.map(r => ({
    reviewer: r.reviewer, reviewerAvatar: fileUrl(r.reviewer_avatar),
    fixer: r.fixer, fixerAvatar: fileUrl(r.fixer_avatar),
    rating: r.rating, comment: r.rating_comment || null,
    categoryLabel: r.custom_category ? r.custom_category : labelFor(r.category), at: r.rated_at,
  }));
  const count = reviews.length;
  const avg = count ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / count) * 10) / 10 : 0;
  res.json({ reviews, summary: { count, avg } });
}));

/* ==================================================================
   AUTH
================================================================== */
app.post('/api/auth/register/client', upload.single('avatar'), ah(async (req, res) => {
  const { name, email, phone, password } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required.' });
  const pe = passwordError(password); if (pe) return res.status(400).json({ error: pe });
  if (await userByEmail(email.toLowerCase().trim())) return res.status(409).json({ error: 'That email is already registered.' });
  const r = await run(`INSERT INTO users (role,name,email,phone,password_hash) VALUES ('client',?,?,?,?) RETURNING id`,
    [name.trim(), email.toLowerCase().trim(), phone || null, bcrypt.hashSync(password, 10)]);
  const id = Number(r.rows[0].id);
  if (req.file) await setAvatar(await saveUpload(req.file), id);
  const user = await userById(id);
  setAuthCookie(res, user);
  res.json({ user: await publicUser(user) });
}));

app.post('/api/auth/register/fixer', upload.single('avatar'), ah(async (req, res) => {
  const { name, email, password, bio, experience, work_mode } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required.' });
  const pe = passwordError(password); if (pe) return res.status(400).json({ error: pe });
  const keys = parseArr((req.body || {}).skills).filter(s => CATEGORY_KEYS.has(s));
  const customs = parseArr((req.body || {}).custom_skills).map(s => String(s || '').trim().slice(0, 40)).filter(Boolean);
  if (keys.length === 0 && customs.length === 0) return res.status(400).json({ error: 'Pick or type at least one thing you can fix.' });
  if (await userByEmail(email.toLowerCase().trim())) return res.status(409).json({ error: 'That email is already registered.' });
  const finalSkills = new Set(keys);
  customs.forEach(c => finalSkills.add(c));
  if (customs.length) finalSkills.add('other');
  const r = await run(`INSERT INTO users (role,name,email,password_hash,bio,experience,work_mode) VALUES ('fixer',?,?,?,?,?,?) RETURNING id`,
    [name.trim(), email.toLowerCase().trim(), bcrypt.hashSync(password, 10), bio || null, experience || null, work_mode || null]);
  const id = Number(r.rows[0].id);
  if (req.file) await setAvatar(await saveUpload(req.file), id);
  for (const s of finalSkills) await run('INSERT OR IGNORE INTO fixer_skills (user_id,category) VALUES (?,?)', [id, s]);
  const user = await userById(id);
  setAuthCookie(res, user);
  res.json({ user: await publicUser(user) });
}));

app.post('/api/profile/avatar', auth, upload.single('avatar'), ah(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Please choose an image.' });
  await setAvatar(await saveUpload(req.file), req.user.id);
  res.json({ user: await publicUser(await userById(req.user.id)) });
}));

app.post('/api/auth/login', ah(async (req, res) => {
  const { email, password } = req.body || {};
  const u = await userByEmail((email || '').toLowerCase().trim());
  if (!u || !bcrypt.compareSync(password || '', u.password_hash))
    return res.status(401).json({ error: 'Wrong email or password.' });
  if (u.employment_status && u.employment_status !== 'active')
    return res.status(403).json({ error: 'This account is no longer active. Please contact an administrator.' });
  setAuthCookie(res, u);
  res.json({ user: await publicUser(u) });
}));

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie(COOKIE, { httpOnly: true, sameSite: 'lax', secure: IS_PROD });
  res.json({ ok: true });
});

app.get('/api/me', ah(async (req, res) => res.json({ user: await publicUser(await currentUser(req)) })));

app.post('/api/profile', auth, ah(async (req, res) => {
  const u = req.user; const b = req.body || {};
  const name = (b.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Name is required.' });
  let email = u.email;
  if (b.email) {
    const e = b.email.toLowerCase().trim();
    if (e && e !== u.email) {
      const ex = await userByEmail(e);
      if (ex && ex.id !== u.id) return res.status(409).json({ error: 'That email is already in use.' });
      email = e;
    }
  }
  let password_hash = u.password_hash;
  if (b.newPassword) {
    const npe = passwordError(b.newPassword); if (npe) return res.status(400).json({ error: npe });
    if (!bcrypt.compareSync(b.currentPassword || '', u.password_hash))
      return res.status(400).json({ error: 'Your current password is incorrect.' });
    password_hash = bcrypt.hashSync(b.newPassword, 10);
  }
  const phone = (b.phone != null) ? (String(b.phone).trim() || null) : u.phone;
  let bio = u.bio, experience = u.experience, work_mode = u.work_mode;
  if (u.role === 'fixer') {
    bio = (b.bio != null) ? (String(b.bio).trim() || null) : u.bio;
    experience = b.experience || u.experience;
    work_mode = b.work_mode || u.work_mode;
  }
  await run(`UPDATE users SET name=?, email=?, phone=?, bio=?, experience=?, work_mode=?, password_hash=? WHERE id=?`,
    [name, email, phone, bio, experience, work_mode, password_hash, u.id]);
  if (u.role === 'fixer') {
    const keys = Array.isArray(b.skills) ? b.skills.filter(s => CATEGORY_KEYS.has(s)) : [];
    const customs = (Array.isArray(b.custom_skills) ? b.custom_skills : []).map(s => String(s || '').trim().slice(0, 40)).filter(Boolean);
    if (keys.length === 0 && customs.length === 0) return res.status(400).json({ error: 'Pick or type at least one thing you can fix.' });
    await run('DELETE FROM fixer_skills WHERE user_id = ?', [u.id]);
    const fin = new Set(keys);
    customs.forEach(c => fin.add(c));
    if (customs.length) fin.add('other');
    for (const s of fin) await run('INSERT OR IGNORE INTO fixer_skills (user_id,category) VALUES (?,?)', [u.id, s]);
  }
  res.json({ user: await publicUser(await userById(u.id)) });
}));

/* ==================================================================
   CLIENT
================================================================== */
app.post('/api/tasks', auth, requireRole('client'), upload.array('photos', 4), ah(async (req, res) => {
  let { category, title, description, urgency } = req.body || {};
  // Category is optional now — if the client picks one it must be valid; otherwise
  // we file it under "other" (the client's title/description carries the detail).
  if (category && !CATEGORY_KEYS.has(category)) return res.status(400).json({ error: 'Choose a valid problem type.' });
  if (!category) category = 'other';
  if (!description || description.trim().length < 5) return res.status(400).json({ error: 'Please describe the problem.' });
  // The client no longer names a price — a manager makes the first offer. Urgency
  // is normalised to a known value so its surcharge is well-defined.
  urgency = URGENCY_FEE[urgency] != null ? urgency : 'As soon as possible';
  const customCategory = category === 'other'
    ? (((req.body || {}).custom_category || '').trim().slice(0, 60) || null)
    : null;
  let photoPath = null;
  if (req.files && req.files.length) photoPath = (await Promise.all(req.files.map(saveUpload))).join(',');
  const r = await run(`INSERT INTO tasks (client_id,category,custom_category,title,description,photo_path,urgency,proposed_price,status)
                       VALUES (?,?,?,?,?,?,?,NULL, 'submitted') RETURNING id`,
    [req.user.id, category, customCategory, (title && title.trim()) || customCategory || description.trim().slice(0, 60),
     description.trim(), photoPath, urgency]);
  const id = Number(r.rows[0].id);
  const fee = urgencyFee(urgency);
  await event(id, req.user.id, `Problem posted (${urgency}${fee ? `, +₾${fee} urgency fee` : ', free tier'}). Waiting for a manager to set a price.`);
  res.json({ task: await taskView(await taskById(id)) });
}));

app.get('/api/tasks/mine', auth, requireRole('client'), ah(async (req, res) => {
  res.json({ tasks: await viewAll(await all('SELECT * FROM tasks WHERE client_id = ? ORDER BY created_at DESC', [req.user.id])) });
}));

// Client responds to the manager's current price offer: accept, counter (negotiate
// with their own number + optional message), or decline.
app.post('/api/tasks/:id/respond', auth, requireRole('client'), ah(async (req, res) => {
  const t = await taskById(+req.params.id);
  if (!t || t.client_id !== req.user.id) return res.status(404).json({ error: 'Task not found.' });
  if (t.status !== 'price_countered') return res.status(400).json({ error: "There's no offer to respond to right now." });
  const { action } = req.body || {};
  const note = ((req.body || {}).note || '').trim().slice(0, 300) || null;
  if (action === 'accept') {
    await run(`UPDATE tasks SET status='open', agreed_price=?, updated_at=datetime('now') WHERE id=?`, [t.counter_price, t.id]);
    await event(t.id, req.user.id, `Client accepted the price of ₾${t.counter_price}. Ready for a manager to assign a fixer.`);
  } else if (action === 'counter') {
    const price = parseInt((req.body || {}).price, 10);
    if (!(price >= 0)) return res.status(400).json({ error: 'Enter the price you can offer.' });
    await run(`UPDATE tasks SET status='client_countered', counter_price=?, manager_note=?, updated_at=datetime('now') WHERE id=?`, [price, note, t.id]);
    await event(t.id, req.user.id, `Client countered with ₾${price}${note ? `: ${note}` : '.'}`);
  } else if (action === 'decline') {
    await run(`UPDATE tasks SET status='declined', updated_at=datetime('now') WHERE id=?`, [t.id]);
    await event(t.id, req.user.id, 'Client declined the price. Task closed.');
  } else {
    return res.status(400).json({ error: 'Unknown action.' });
  }
  res.json({ task: await taskView(await taskById(t.id)) });
}));

app.post('/api/tasks/:id/confirm', auth, requireRole('client'), ah(async (req, res) => {
  const t = await taskById(+req.params.id);
  if (!t || t.client_id !== req.user.id) return res.status(404).json({ error: 'Task not found.' });
  if (t.status !== 'work_done') return res.status(400).json({ error: 'This task is not awaiting confirmation.' });
  await run(`UPDATE tasks SET status='completed', updated_at=datetime('now') WHERE id=?`, [t.id]);
  await event(t.id, req.user.id, 'Client confirmed the problem is fixed. ✅');
  res.json({ task: await taskView(await taskById(t.id)) });
}));

app.post('/api/tasks/:id/pay', auth, requireRole('client'), ah(async (req, res) => {
  const t = await taskById(+req.params.id);
  if (!t || t.client_id !== req.user.id) return res.status(404).json({ error: 'Task not found.' });
  if (t.status !== 'completed') return res.status(400).json({ error: 'You can only pay once the job is completed.' });
  if (t.paid) return res.status(400).json({ error: 'This job is already paid.' });
  const amount = t.agreed_price != null ? t.agreed_price : t.proposed_price;
  const last4 = String((req.body || {}).last4 || '').replace(/\D/g, '').slice(-4) || null;
  await run(`UPDATE tasks SET paid=1, paid_at=datetime('now'), card_last4=?, updated_at=datetime('now') WHERE id=?`, [last4, t.id]);
  await event(t.id, req.user.id, `Client paid ₾${amount}${last4 ? ` (card ending ${last4})` : ''}. 💳`);
  res.json({ task: await taskView(await taskById(t.id)) });
}));

app.post('/api/tasks/:id/rate', auth, requireRole('client'), ah(async (req, res) => {
  const t = await taskById(+req.params.id);
  if (!t || t.client_id !== req.user.id) return res.status(404).json({ error: 'Task not found.' });
  if (t.status !== 'completed') return res.status(400).json({ error: 'You can only rate a completed job.' });
  if (!t.assigned_fixer_id) return res.status(400).json({ error: 'There is no fixer to rate.' });
  if (t.rating) return res.status(400).json({ error: 'You have already rated this job.' });
  const rating = parseInt((req.body || {}).rating, 10);
  if (!(rating >= 1 && rating <= 5)) return res.status(400).json({ error: 'Pick a rating from 1 to 5 stars.' });
  const comment = ((req.body || {}).comment || '').trim().slice(0, 300) || null;
  await run(`UPDATE tasks SET rating=?, rating_comment=?, rated_at=datetime('now'), updated_at=datetime('now') WHERE id=?`, [rating, comment, t.id]);
  const fixer = await userById(t.assigned_fixer_id);
  await event(t.id, req.user.id, `Client rated ${fixer ? fixer.name : 'the fixer'} ${'★'.repeat(rating)} (${rating}/5)${comment ? `: ${comment}` : ''}.`);
  res.json({ task: await taskView(await taskById(t.id)) });
}));

app.post('/api/tasks/:id/cancel', auth, requireRole('client'), ah(async (req, res) => {
  const t = await taskById(+req.params.id);
  if (!t || t.client_id !== req.user.id) return res.status(404).json({ error: 'Task not found.' });
  if (!['submitted', 'price_countered', 'client_countered', 'open', 'assigned'].includes(t.status))
    return res.status(400).json({ error: 'This task can no longer be cancelled.' });
  const hadFixer = !!t.assigned_fixer_id;
  await run(`UPDATE tasks SET status='cancelled', updated_at=datetime('now') WHERE id=?`, [t.id]);
  await event(t.id, req.user.id, hadFixer
    ? 'Client cancelled the request — they no longer need help. It has been removed from the fixer\'s jobs.'
    : 'Client cancelled the request — they no longer need help.');
  res.json({ task: await taskView(await taskById(t.id)) });
}));

/* ==================================================================
   MANAGER
================================================================== */
app.get('/api/manager/queue', auth, requireRole('manager', 'admin'), ah(async (req, res) => {
  res.json({ tasks: await viewAll(await all(`SELECT * FROM tasks WHERE status='submitted' ORDER BY created_at ASC`)) });
}));
app.get('/api/manager/all', auth, requireRole('manager', 'admin'), ah(async (req, res) => {
  res.json({ tasks: await viewAll(await all('SELECT * FROM tasks ORDER BY created_at DESC')) });
}));

// Manager makes the FIRST price offer on a freshly submitted task. They set a
// service price for the work; the urgency surcharge is added on top automatically.
// The offer then goes to the client, who can accept, counter, or decline.
app.post('/api/tasks/:id/review', auth, requireRole('manager', 'admin'), ah(async (req, res) => {
  const t = await taskById(+req.params.id);
  if (!t) return res.status(404).json({ error: 'Task not found.' });
  if (t.status !== 'submitted') return res.status(400).json({ error: 'This task is not awaiting a first price.' });
  const service = parseInt((req.body || {}).service_price, 10);
  if (!(service >= 0)) return res.status(400).json({ error: 'Enter a price for the work (₾0 or more).' });
  const note = ((req.body || {}).manager_note || '').trim().slice(0, 300) || null;
  const fee = urgencyFee(t.urgency);
  const total = service + fee;
  await run(`UPDATE tasks SET status='price_countered', counter_price=?, manager_id=?, manager_note=?, updated_at=datetime('now') WHERE id=?`,
    [total, req.user.id, note, t.id]);
  await event(t.id, req.user.id,
    `Manager offered ₾${total}${fee ? ` (₾${service} for the work + ₾${fee} ${t.urgency} fee)` : ''}${note ? `: ${note}` : '.'}`);
  res.json({ task: await taskView(await taskById(t.id)) });
}));

// Manager replies to a client's counter-offer: accept it, counter back with a new
// total, or decline. Keeps the back-and-forth going until someone agrees.
app.post('/api/tasks/:id/counter-reply', auth, requireRole('manager', 'admin'), ah(async (req, res) => {
  const t = await taskById(+req.params.id);
  if (!t) return res.status(404).json({ error: 'Task not found.' });
  if (t.status !== 'client_countered') return res.status(400).json({ error: 'There is no client counter to reply to.' });
  const { action } = req.body || {};
  const note = ((req.body || {}).manager_note || '').trim().slice(0, 300) || null;
  if (action === 'accept') {
    await run(`UPDATE tasks SET status='open', agreed_price=?, manager_id=COALESCE(manager_id,?), updated_at=datetime('now') WHERE id=?`, [t.counter_price, req.user.id, t.id]);
    await event(t.id, req.user.id, `Manager accepted the client's price of ₾${t.counter_price}. Ready to assign a fixer.`);
  } else if (action === 'counter') {
    const price = parseInt((req.body || {}).price, 10);
    if (!(price >= 0)) return res.status(400).json({ error: 'Enter your counter price.' });
    await run(`UPDATE tasks SET status='price_countered', counter_price=?, manager_id=COALESCE(manager_id,?), manager_note=?, updated_at=datetime('now') WHERE id=?`, [price, req.user.id, note, t.id]);
    await event(t.id, req.user.id, `Manager countered with ₾${price}${note ? `: ${note}` : '.'}`);
  } else if (action === 'decline') {
    await run(`UPDATE tasks SET status='declined', updated_at=datetime('now') WHERE id=?`, [t.id]);
    await event(t.id, req.user.id, "Manager declined the client's price. Task closed.");
  } else {
    return res.status(400).json({ error: 'Unknown action.' });
  }
  res.json({ task: await taskView(await taskById(t.id)) });
}));

// Manager/admin unassigns an in-progress task (e.g. the fixer can't complete it),
// putting it back to "open" so a different fixer can be hand-picked. Fixers cannot
// do this themselves.
app.post('/api/tasks/:id/release', auth, requireRole('manager', 'admin'), ah(async (req, res) => {
  const t = await taskById(+req.params.id);
  if (!t) return res.status(404).json({ error: 'Task not found.' });
  if (t.status !== 'assigned') return res.status(400).json({ error: 'Only an in-progress task can be released.' });
  const prev = t.assigned_fixer_id ? await userById(t.assigned_fixer_id) : null;
  await run(`UPDATE tasks SET status='open', assigned_fixer_id=NULL, updated_at=datetime('now') WHERE id=?`, [t.id]);
  await event(t.id, req.user.id, `${req.user.name} unassigned the task${prev ? ` from ${prev.name}` : ''}. Ready to assign a different fixer.`);
  res.json({ task: await taskView(await taskById(t.id)) });
}));

// Roster of fixers a manager can hand-pick from, with skills, rating and current
// workload so the manager can choose who's the best fit for a given task.
app.get('/api/manager/fixers', auth, requireRole('manager', 'admin'), ah(async (req, res) => {
  const rows = await all(`SELECT * FROM users WHERE role='fixer' AND employment_status='active' ORDER BY name ASC`);
  const fixers = await Promise.all(rows.map(async f => {
    const av = f.availability || 'available';
    return {
      id: f.id, name: f.name,
      skills: (await all('SELECT category FROM fixer_skills WHERE user_id = ?', [f.id])).map(r => r.category),
      experience: f.experience || null,
      work_mode: f.work_mode || null,
      availability: av,
      availabilityLabel: availMeta(av).label,
      assignable: availMeta(av).assignable,
      rating: await ratingFor(f.id),
      activeJobs: Number((await get(
        `SELECT COUNT(*) AS n FROM tasks WHERE assigned_fixer_id = ? AND status IN ('assigned','work_done')`, [f.id])).n) || 0,
    };
  }));
  res.json({ fixers });
}));

// Full fixer profiles for the manager/admin "Fixer profiles" page: skills, bio,
// availability, rating and job stats — so staff know who can do what.
app.get('/api/staff/fixers', auth, requireRole('manager', 'admin'), ah(async (req, res) => {
  const rows = await all(`SELECT * FROM users WHERE role='fixer' AND employment_status='active' ORDER BY name ASC`);
  const fixers = await Promise.all(rows.map(async f => {
    const av = f.availability || 'available';
    const active = Number((await get(
      `SELECT COUNT(*) AS n FROM tasks WHERE assigned_fixer_id = ? AND status IN ('assigned','work_done')`, [f.id])).n) || 0;
    const completed = Number((await get(
      `SELECT COUNT(*) AS n FROM tasks WHERE assigned_fixer_id = ? AND status = 'completed'`, [f.id])).n) || 0;
    return {
      id: f.id, name: f.name, avatar: fileUrl(f.avatar), bio: f.bio || null,
      experience: f.experience || null, work_mode: f.work_mode || null,
      skills: (await all('SELECT category FROM fixer_skills WHERE user_id = ?', [f.id])).map(r => r.category),
      availability: av, availabilityLabel: availMeta(av).label,
      rating: await ratingFor(f.id),
      activeJobs: active, completedJobs: completed,
    };
  }));
  res.json({ fixers });
}));

// Manager/admin hand-picks a fixer for an approved (open) task. Deliberately NOT
// restricted to matching skills — the manager knows their fixers and decides.
app.post('/api/tasks/:id/assign', auth, requireRole('manager', 'admin'), ah(async (req, res) => {
  const t = await taskById(+req.params.id);
  if (!t) return res.status(404).json({ error: 'Task not found.' });
  if (t.status !== 'open') return res.status(400).json({ error: 'Only an approved, unassigned task can be assigned.' });
  const fixerId = parseInt((req.body || {}).fixer_id, 10);
  if (!fixerId) return res.status(400).json({ error: 'Choose a fixer to assign.' });
  const fixer = await userById(fixerId);
  if (!fixer || fixer.role !== 'fixer') return res.status(400).json({ error: 'That fixer no longer exists.' });
  const av = availMeta(fixer.availability);
  if (!av.assignable) return res.status(409).json({ error: `${fixer.name} is currently ${av.label} and can't take new work. Pick a fixer who's Available.` });
  const r = await run(`UPDATE tasks SET status='assigned', assigned_fixer_id=?, manager_id=COALESCE(manager_id,?), updated_at=datetime('now')
                       WHERE id=? AND status='open'`, [fixerId, req.user.id, t.id]);
  if (!r.rowsAffected) return res.status(409).json({ error: 'This task was just updated — refresh and try again.' });
  // Taking on a job marks the fixer Busy automatically; they can change it back
  // themselves whenever they're ready for more.
  await run(`UPDATE users SET availability='busy' WHERE id=?`, [fixerId]);
  await event(t.id, req.user.id, `${req.user.name} assigned ${fixer.name} to this task. ${fixer.name} is now marked Busy.`);
  res.json({ task: await taskView(await taskById(t.id)) });
}));

/* ==================================================================
   FIXER  — fixers no longer browse a shared pool; a manager hand-picks
   who works each task, so a fixer only ever sees their own assignments.
================================================================== */
app.get('/api/fixer/mine', auth, requireRole('fixer'), ah(async (req, res) => {
  res.json({ tasks: await viewAll(await all('SELECT * FROM tasks WHERE assigned_fixer_id = ? ORDER BY updated_at DESC', [req.user.id])) });
}));

// A fixer sets their own availability. Managers see this and can only assign
// work to a fixer who is "available".
app.post('/api/fixer/availability', auth, requireRole('fixer'), ah(async (req, res) => {
  const v = String((req.body || {}).availability || '');
  if (!AVAILABILITY[v]) return res.status(400).json({ error: 'Pick a valid availability.' });
  await run(`UPDATE users SET availability=? WHERE id=?`, [v, req.user.id]);
  res.json({ user: await publicUser(await userById(req.user.id)) });
}));

app.post('/api/tasks/:id/done', auth, requireRole('fixer'), ah(async (req, res) => {
  const t = await taskById(+req.params.id);
  if (!t || t.assigned_fixer_id !== req.user.id) return res.status(404).json({ error: 'Task not found.' });
  if (t.status !== 'assigned') return res.status(400).json({ error: 'This task is not in progress.' });
  await run(`UPDATE tasks SET status='work_done', updated_at=datetime('now') WHERE id=?`, [t.id]);
  await event(t.id, req.user.id, `${req.user.name} marked the work as done. Waiting for the client to confirm.`);
  res.json({ task: await taskView(await taskById(t.id)) });
}));

/* ==================================================================
   ADMIN
================================================================== */
app.get('/api/admin/users', auth, requireRole('admin'), ah(async (req, res) => {
  const users = await all('SELECT * FROM users ORDER BY created_at ASC');
  res.json({ users: await Promise.all(users.map(publicUser)) });
}));

app.post('/api/admin/users/:id/role', auth, requireRole('admin'), ah(async (req, res) => {
  const target = await userById(+req.params.id);
  const { role } = req.body || {};
  if (!target) return res.status(404).json({ error: 'User not found.' });
  if (!['fixer', 'manager', 'admin'].includes(role)) return res.status(400).json({ error: 'Role must be fixer, manager or admin.' });
  if (target.role === 'client') return res.status(400).json({ error: 'Clients cannot be promoted into staff roles.' });
  if (target.is_primary) return res.status(400).json({ error: 'The primary admin cannot be changed.' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'You cannot change your own role.' });
  if (target.role === 'admin' && role !== 'admin') {
    const c = await get(`SELECT COUNT(*) AS n FROM users WHERE role='admin'`);
    if (Number(c.n) <= 1) return res.status(400).json({ error: 'There must always be at least one admin.' });
  }
  // Setting someone to a real role also reactivates them (in case they were
  // resigned/dismissed) — the two are one dropdown in the admin UI.
  await run(`UPDATE users SET role = ?, employment_status = 'active' WHERE id = ?`, [role, target.id]);
  res.json({ user: await publicUser(await userById(target.id)) });
}));

// Admin marks a staff member's employment status. "dismissed" / "resigned" keep
// the record but deactivate the account (no login, removed from the workforce);
// "active" reinstates them.
app.post('/api/admin/users/:id/employment', auth, requireRole('admin'), ah(async (req, res) => {
  const target = await userById(+req.params.id);
  const { status } = req.body || {};
  if (!target) return res.status(404).json({ error: 'User not found.' });
  if (!['active', 'dismissed', 'resigned'].includes(status)) return res.status(400).json({ error: 'Status must be active, dismissed or resigned.' });
  if (target.role === 'client') return res.status(400).json({ error: 'Employment status is only for staff (fixers, managers, admins).' });
  if (target.is_primary) return res.status(400).json({ error: 'The primary admin cannot be changed.' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'You cannot change your own employment status.' });
  await run('UPDATE users SET employment_status = ? WHERE id = ?', [status, target.id]);
  res.json({ user: await publicUser(await userById(target.id)) });
}));

/* ==================================================================
   SPA fallback + errors  (static assets are served near the top)
================================================================== */
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.use((err, req, res, next) => {
  const msg = err && err.code === 'LIMIT_UNEXPECTED_FILE' ? 'You can upload up to 4 photos.'
    : err && err.code === 'LIMIT_FILE_SIZE' ? 'Each photo must be under 8 MB.'
    : (err && err.message) || 'Something went wrong.';
  if (!res.headersSent) res.status(400).json({ error: msg });
});

/* Local dev: start a server. On Vercel the app is imported, not run. */
if (require.main === module) {
  ready().then(() => app.listen(PORT, () => console.log(`\n  Digit running →  http://localhost:${PORT}\n`)));
}
module.exports = app;
