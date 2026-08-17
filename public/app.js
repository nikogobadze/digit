/* ==================================================================
   Digit front-end — single-page app logic.
   Talks to the API in server.js; cookie holds the JWT session.
================================================================== */
const state = { user: null, cats: [], dashTab: null, peopleFilter: 'all' };

/* Fixer availability — must mirror AVAILABILITY in server.js. Only "available"
   fixers can be assigned new work. */
const AVAIL = {
  available: { label: 'Available', dot: '#1F9D6B', assignable: true },
  busy:      { label: 'Busy',      dot: '#C2410C', assignable: false },
  away:      { label: 'Away',      dot: '#B8860B', assignable: false },
  offline:   { label: 'Offline',   dot: '#9AA0AA', assignable: false },
};
const AVAIL_ORDER = ['available', 'busy', 'away', 'offline'];
const availMeta = (v) => AVAIL[v] || AVAIL.available;

/* Cache the logged-in user locally so a reload shows the right navbar instantly
   (no "logged out then in" flash). The JWT itself stays in the httpOnly cookie. */
function setAuth(user) {
  state.user = user;
  state.dashTab = null;   // reset dashboard tab so each role opens on its default (admin → People)
  try { user ? localStorage.setItem('digit_user', JSON.stringify(user)) : localStorage.removeItem('digit_user'); } catch {}
  renderNav();
}
function readAuthCache() {
  try { return JSON.parse(localStorage.getItem('digit_user') || 'null'); } catch { return null; }
}

/* ---------- tiny helpers ---------- */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
const money = (n) => (n || n === 0) ? `₾${n}` : '—';
/* the internal "fixer" role is shown to users as "worker" (label only) */
const roleLabel = (r) => r === 'fixer' ? 'worker' : r;
/* read-only star row for a 1–5 value */
function starsRO(n) {
  n = Math.round(n || 0); let s = '';
  for (let i = 1; i <= 5; i++) s += `<span class="star-ro ${i <= n ? 'on' : ''}">★</span>`;
  return `<span class="stars-ro">${s}</span>`;
}
/* fixer's average rating as text, e.g. "★ 4.8 (12)" */
function ratingText(r) {
  if (!r || !r.count) return '<span style="color:var(--muted)">No ratings yet</span>';
  return `<span class="rating-avg">★ ${r.avg.toFixed(1)}</span> <span style="color:var(--muted);font-weight:500">(${r.count})</span>`;
}
/* avatar: an <img> if there's a picture, else an initials circle */
function avatarHTML(name, url, size = 32) {
  const s = `width:${size}px;height:${size}px`;
  if (url) return `<img class="avatar" src="${url}" style="${s}" alt="">`;
  const initials = (name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return `<span class="avatar avatar-fallback" style="${s};font-size:${Math.round(size * 0.4)}px">${esc(initials)}</span>`;
}
/* wire a circular file picker (prefix-avatar-input / -preview / -ph) */
function wireAvatarPicker(prefix, onFile) {
  const input = $(`#${prefix}-avatar-input`); if (!input) return;
  input.addEventListener('change', () => {
    const f = input.files[0]; if (!f) return;
    const img = $(`#${prefix}-avatar-preview`), ph = $(`#${prefix}-avatar-ph`);
    img.src = URL.createObjectURL(f); img.style.display = ''; if (ph) ph.style.display = 'none';
    onFile(f);
  });
}
let regClientAvatar = null, regFixerAvatar = null;
/* Password policy: 8+ chars, ≥1 number, ≥1 capital letter. */
function passwordError(pw) {
  pw = pw || '';
  if (pw.length < 8) return 'Password must be at least 8 characters.';
  if (!/[0-9]/.test(pw)) return 'Password must include at least 1 number.';
  if (!/[A-Z]/.test(pw)) return 'Password must include at least 1 capital letter.';
  return null;
}

async function api(path, { method, body, form } = {}) {
  if (!method) method = (body || form) ? 'POST' : 'GET';
  const opts = { method, credentials: 'same-origin', headers: {} };
  if (form) opts.body = form;
  else if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const res = await fetch(path, opts);
  let data = {};
  try { data = await res.json(); } catch {}
  // A logged-in session that turns invalid (expired, or the account was
  // dismissed/resigned) — sign out cleanly instead of leaving a stuck screen.
  if (res.status === 401 && state.user) { setAuth(null); toast('Your session ended. Please log in again.', true); go('login'); }
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

let toastTimer;
function toast(msg, bad = false) {
  const t = $('#toast');
  t.textContent = msg; t.classList.toggle('bad', bad); t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

function modal(html) { $('#modal').innerHTML = html; $('#modal-bg').classList.add('show'); }
function closeModal() { $('#modal-bg').classList.remove('show'); }
$('#modal-bg').addEventListener('click', e => { if (e.target.id === 'modal-bg') closeModal(); });

/* ---------- navigation ---------- */
const VIEWS = ['home','login','registerClient','registerFixer','post','dashboard','about','profile','reviews','fixers'];
/* Each view maps to a real URL so the browser's Back/Forward buttons work. */
const PATHS = { home:'/', login:'/login', registerClient:'/signup', registerFixer:'/join', post:'/post', dashboard:'/dashboard', about:'/about', profile:'/profile', reviews:'/reviews', fixers:'/fixers' };
const VIEW_BY_PATH = Object.fromEntries(Object.entries(PATHS).map(([v, p]) => [p, v]));

function showView(view) {
  VIEWS.forEach(v => $('#view-' + v)?.classList.remove('active'));
  $('#view-' + (VIEWS.includes(view) ? view : 'home')).classList.add('active');
  window.scrollTo({ top: 0, behavior: 'auto' });
}

/* push=true adds a history entry (normal navigation); false is used when we are
   already responding to the browser (popstate / first load). */
function go(view, hash, push = true) {
  // Access rules
  if (view === 'post') {
    if (!state.user) { toast('Create a free account to post a problem.'); return go('registerClient', null, push); }
    if (state.user.role !== 'client') { toast('Posting is for client accounts.'); return go('dashboard', null, push); }
    resetPostFlow();
  }
  if (view === 'dashboard' && !state.user) return go('login', null, push);
  if (view === 'profile' && !state.user) return go('login', null, push);
  if (view === 'fixers' && !(state.user && ['manager', 'admin'].includes(state.user.role))) {
    toast('Worker profiles are for managers and admins.');
    return go(state.user ? 'dashboard' : 'login', null, push);
  }
  showView(view);
  if (view === 'dashboard') renderDashboard();
  if (view === 'profile') renderProfile();
  if (view === 'reviews') renderReviews();
  if (view === 'fixers') renderFixers();
  const url = (PATHS[view] || '/') + (hash ? '#' + hash : '');
  if (push) history.pushState({ view, hash: hash || null }, '', url);
  else history.replaceState({ view, hash: hash || null }, '', url);
  if (hash) setTimeout(() => $('#' + hash)?.scrollIntoView({ behavior: 'smooth' }), 60);
}

document.addEventListener('click', e => {
  const t = e.target.closest('[data-go]');
  if (t) { e.preventDefault(); $('#mobile-menu')?.classList.remove('open'); go(t.getAttribute('data-go'), t.getAttribute('data-hash')); }
});

/* mobile hamburger menu */
$('#nav-toggle')?.addEventListener('click', () => {
  const m = $('#mobile-menu'); const open = m.classList.toggle('open');
  $('#nav-toggle').setAttribute('aria-expanded', open ? 'true' : 'false');
});

/* Back / Forward buttons: restore the view from history without re-pushing. */
window.addEventListener('popstate', e => {
  const view = (e.state && e.state.view) || VIEW_BY_PATH[location.pathname] || 'home';
  const hash = (e.state && e.state.hash) || (location.hash ? location.hash.slice(1) : null);
  go(view, hash, false);
});

/* ---------- nav bar (auth aware) — fills both the desktop bar and the mobile menu ---------- */
function renderNav() {
  const u = state.user;
  let html;
  if (!u) {
    html = `
      <a class="btn btn-ghost" data-go="registerClient" style="padding:.54rem 1.1rem .66rem">Sign up</a>
      <button class="btn btn-primary" data-go="login" style="padding:.54rem 1.2rem .66rem">Log in</button>`;
  } else {
    const first = esc(u.name.split(' ')[0]);
    html = `
      <a class="who" data-go="profile" title="Your profile">${avatarHTML(u.name, u.avatar, 32)} ${first} <span class="role-tag">${roleLabel(u.role)}</span></a>
      <a class="btn btn-ghost btn-sm" data-go="dashboard">Dashboard</a>
      <button class="btn btn-soft btn-sm js-logout">Log out</button>`;
  }
  $('#nav-cta').innerHTML = html;
  const ma = $('#mobile-auth'); if (ma) ma.innerHTML = html;
  $$('.js-logout').forEach(b => b.onclick = async () => {
    await api('/api/auth/logout', { method: 'POST' });
    setAuth(null); $('#mobile-menu')?.classList.remove('open'); toast('Logged out.'); go('home');
  });
}

/* ---------- bootstrap taxonomy + chips ---------- */
async function loadCategories() {
  state.cats = await api('/api/categories');
  // home category cards (decorative discovery — they just open the post form)
  $('#home-cats').innerHTML = state.cats.map(c =>
    `<button class="cat" data-cat="${c.key}" data-pick><span class="cico">${c.emoji}</span>${esc(c.label)}</button>`).join('');
  // fixer skill chips (multi select) — fixers still register what they can do
  $('#skill-chips').innerHTML = state.cats.filter(c => c.key !== 'other').map(c =>
    `<span class="chip" data-skill="${c.key}">${c.emoji} ${esc(c.label)}</span>`).join('');
}

/* home "Common Problems" card → open the post form (problems no longer have a category) */
document.addEventListener('click', e => {
  const card = e.target.closest('[data-pick]');
  if (!card) return;
  go('post');
});
/* Home "describe it yourself" box → jump into the post flow with the text as the title. */
function homeOther() {
  const v = $('#home-other-input').value.trim();
  go('post');
  if (state.user && state.user.role === 'client') {
    if (v) { $('#problem-title').value = v; $('#problem-text').focus(); }
    $('#home-other-input').value = '';
  }
}
$('#home-other-btn').addEventListener('click', homeOther);
$('#home-other-input').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); homeOther(); } });

/* skill chip multi-select */
$('#skill-chips').addEventListener('click', e => {
  const ch = e.target.closest('.chip'); if (ch) ch.classList.toggle('on');
});

/* ==================================================================
   AUTH FORMS
================================================================== */
function showErr(id, msg) { const e = $('#' + id); e.textContent = msg; e.classList.add('show'); }
function clearErr(id) { $('#' + id)?.classList.remove('show'); }

/* ---- per-field inline errors (red line under the field) ---- */
function fieldErr(input, msg) {
  if (!input) return;
  const wrap = input.closest('.field'); if (!wrap) return;
  let e = wrap.querySelector('.field-err');
  if (!e) { e = document.createElement('div'); e.className = 'field-err'; wrap.appendChild(e); }
  e.textContent = msg; e.classList.add('show'); input.classList.add('invalid');
}
const fieldErrByName = (scope, name, msg) => fieldErr(scope.querySelector(`[name="${name}"]`), msg);
function clearFieldErrs(scope) {
  scope.querySelectorAll('.field-err').forEach(e => e.classList.remove('show'));
  scope.querySelectorAll('.invalid').forEach(i => i.classList.remove('invalid'));
}
/* Show an error on a non-input field (e.g. the skill chips block). */
function blockErr(innerSelector, msg) {
  const wrap = $(innerSelector)?.closest('.field'); if (!wrap) return;
  let e = wrap.querySelector('.field-err');
  if (!e) { e = document.createElement('div'); e.className = 'field-err'; wrap.appendChild(e); }
  e.textContent = msg; e.classList.add('show');
}
/* Clear a field's error as soon as the user edits it. */
document.addEventListener('input', e => {
  const i = e.target;
  if (i.classList && i.classList.contains('invalid')) {
    i.classList.remove('invalid');
    i.closest('.field')?.querySelector('.field-err')?.classList.remove('show');
  }
});

$('#login-form').addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target; clearFieldErrs(f);
  let ok = true;
  if (!f.email.value.trim()) { fieldErr(f.email, 'Please enter your email.'); ok = false; }
  if (!f.password.value) { fieldErr(f.password, 'Please enter your password.'); ok = false; }
  if (!ok) return;
  try {
    const { user } = await api('/api/auth/login', { body: { email: f.email.value, password: f.password.value } });
    setAuth(user); f.reset();
    toast(`Welcome back, ${user.name.split(' ')[0]}.`); go('dashboard');
  } catch (err) { fieldErr(f.password, err.message); }
});

/* Contact form (front-end only for this demo). */
$('#contact-form').addEventListener('submit', e => {
  e.preventDefault(); const f = e.target; clearFieldErrs(f);
  let ok = true;
  if (!f.name.value.trim()) { fieldErr(f.name, 'Please add your name.'); ok = false; }
  if (!f.email.value.trim()) { fieldErr(f.email, 'Please add your email.'); ok = false; }
  if (!f.message.value.trim()) { fieldErr(f.message, 'Please write a message.'); ok = false; }
  if (!ok) return;
  f.reset(); toast('Thanks! We\'ll get back to you soon.');
});

$('#rc-form').addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target; clearFieldErrs(f);
  let ok = true;
  if (!f.name.value.trim()) { fieldErr(f.name, 'Please add your name.'); ok = false; }
  if (!f.email.value.trim()) { fieldErr(f.email, 'Please add your email.'); ok = false; }
  if (!f.phone.value.trim()) { fieldErr(f.phone, 'Please add your phone number.'); ok = false; }
  if (!f.password.value) { fieldErr(f.password, 'Please choose a password.'); ok = false; }
  else { const pe = passwordError(f.password.value); if (pe) { fieldErr(f.password, pe); ok = false; } }
  if (f.password.value && f.password.value !== f.password2.value) { fieldErr(f.password2, 'The two passwords don\'t match.'); ok = false; }
  if (!ok) return;
  try {
    const fd = new FormData();
    fd.append('name', f.name.value); fd.append('email', f.email.value);
    fd.append('phone', f.phone.value); fd.append('password', f.password.value);
    if (regClientAvatar) fd.append('avatar', regClientAvatar);
    const { user } = await api('/api/auth/register/client', { form: fd });
    setAuth(user); f.reset(); regClientAvatar = null;
    toast('Account created. Let\'s fix something.'); go('post');
  } catch (err) { fieldErr(f.email, err.message); }
});
wireAvatarPicker('rc', f => regClientAvatar = f);

/* fixer registration (2 steps inside the form) */
function goFixerStep(n) {
  $$('#view-registerFixer .fstep').forEach(s => s.classList.remove('active'));
  $(`#view-registerFixer .fstep[data-pstep="${n}"]`).classList.add('active');
  $('#view-registerFixer .flow-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
/* Parse the free-text "Other speciality" box into a clean array. */
function customSkillList() {
  return ($('#custom-skills').value || '').split(',').map(s => s.trim()).filter(Boolean);
}
$$('#view-registerFixer [data-pnext]').forEach(b => b.onclick = () => {
  // validate step 1 essentials before moving on
  const f = $('#rf-form');
  const step1 = b.closest('.fstep'); clearFieldErrs(step1);
  let ok = true;
  if (!f.name.value.trim()) { fieldErr(f.name, 'Please add your name.'); ok = false; }
  if (!f.email.value.trim()) { fieldErr(f.email, 'Please add your email.'); ok = false; }
  if (!$$('#skill-chips .chip.on').length && !customSkillList().length) {
    blockErr('#skill-chips', 'Pick or type at least one thing you can fix.'); ok = false; }
  if (!ok) return;
  goFixerStep(+b.getAttribute('data-pnext'));
});
/* clear the skills error once they pick a chip or type a speciality */
$('#skill-chips').addEventListener('click', () => $('#skill-chips').closest('.field')?.querySelector('.field-err')?.classList.remove('show'));
$('#custom-skills').addEventListener('input', () => $('#skill-chips').closest('.field')?.querySelector('.field-err')?.classList.remove('show'));
$$('#view-registerFixer [data-pprev]').forEach(b => b.onclick = () => goFixerStep(+b.getAttribute('data-pprev')));

$('#rf-form').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target; const step2 = $('#view-registerFixer .fstep[data-pstep="2"]'); clearFieldErrs(step2);
  if (!f.password.value) { fieldErr(f.password, 'Please choose a password.'); return; }
  const pe = passwordError(f.password.value); if (pe) { fieldErr(f.password, pe); return; }
  if (f.password.value !== f.password2.value) { fieldErr(f.password2, 'The two passwords don\'t match.'); return; }
  const skills = $$('#skill-chips .chip.on').map(c => c.getAttribute('data-skill'));
  const custom_skills = customSkillList();
  try {
    const fd = new FormData();
    fd.append('name', f.name.value); fd.append('email', f.email.value); fd.append('password', f.password.value);
    fd.append('bio', f.bio.value); fd.append('experience', f.experience.value); fd.append('work_mode', f.work_mode.value);
    fd.append('skills', JSON.stringify(skills)); fd.append('custom_skills', JSON.stringify(custom_skills));
    if (regFixerAvatar) fd.append('avatar', regFixerAvatar);
    if (regFixerCv) fd.append('cv', regFixerCv);
    const { user } = await api('/api/auth/register/fixer', { form: fd });
    setAuth(user); f.reset(); regFixerAvatar = null; regFixerCv = null;
    const cvLabel = $('#rf-cv-label'); if (cvLabel) cvLabel.textContent = 'Tap to upload your CV';
    $$('#skill-chips .chip').forEach(c => c.classList.remove('on')); goFixerStep(1);
    toast('Welcome aboard, worker!'); go('dashboard');
  } catch (err) {
    // server errors (e.g. email already registered) live on step 1
    goFixerStep(1); fieldErr(f.email, err.message);
  }
});
wireAvatarPicker('rf', f => regFixerAvatar = f);
/* CV file picker on the fixer registration form */
let regFixerCv = null;
$('#rf-cv-input')?.addEventListener('change', e => {
  const file = e.target.files[0];
  if (file) { regFixerCv = file; const l = $('#rf-cv-label'); if (l) l.textContent = file.name; }
});

/* ==================================================================
   POST A PROBLEM FLOW
================================================================== */
const fileInput = $('#file'), drop = $('#drop'), thumbs = $('#thumbs');
const MAX_PHOTOS = 4;
let postFiles = [];
/* The drop area is a <label> wrapping the input, so the OS picker opens
   natively on a single click — no JS trigger needed (avoids double-open). */
fileInput.addEventListener('change', () => {
  for (const f of fileInput.files) {
    if (postFiles.length >= MAX_PHOTOS) { toast(`You can add up to ${MAX_PHOTOS} photos.`); break; }
    postFiles.push(f);
  }
  fileInput.value = '';
  renderThumbs();
});
function renderThumbs() {
  thumbs.innerHTML = postFiles.map((f, i) =>
    `<div class="tb"><button type="button" class="rm" data-i="${i}" aria-label="Remove photo">×</button><img src="${URL.createObjectURL(f)}" alt="photo ${i + 1}"></div>`).join('');
  drop.style.display = postFiles.length >= MAX_PHOTOS ? 'none' : 'block';
}
thumbs.addEventListener('click', e => {
  const b = e.target.closest('.rm'); if (!b) return;
  postFiles.splice(+b.getAttribute('data-i'), 1); renderThumbs();
});

function resetPostFlow() {
  postStep(1);
  $('#problem-title').value = ''; $('#problem-text').value = ''; $('#c-when').selectedIndex = 0;
  postFiles = []; renderThumbs(); fileInput.value = ''; drop.style.display = 'block'; clearErr('post-error');
}
function postStep(n) {
  $$('#view-post .fstep').forEach(s => s.classList.remove('active'));
  $(`#view-post .fstep[data-step="${n}"]`).classList.add('active');
  $$('#post-progress .pdot').forEach(d => {
    const i = +d.getAttribute('data-d');
    d.classList.toggle('active', i === n); d.classList.toggle('done', i < n);
  });
  $$('#post-progress .pseg').forEach(s => s.classList.toggle('fill', +s.getAttribute('data-s') < n));
  $('.flow-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
$$('#view-post [data-next]').forEach(b => b.onclick = async () => {
  const n = +b.getAttribute('data-next');
  if (n === 2) { // validate step 1 — only a description is required now
    if ($('#problem-text').value.trim().length < 5) { showErr('post-error', 'Please describe the problem.'); return; }
    clearErr('post-error'); postStep(2);
  } else if (n === 3) { await submitTask(b); }
});
$$('#view-post [data-prev]').forEach(b => b.onclick = () => postStep(+b.getAttribute('data-prev')));

async function submitTask(btn) {
  clearFieldErrs($('#view-post'));
  const fd = new FormData();
  fd.append('title', $('#problem-title').value);
  fd.append('description', $('#problem-text').value);
  fd.append('urgency', $('#c-when').value);   // manager sets the price; no client price
  postFiles.forEach(f => fd.append('photos', f));
  btn.disabled = true;
  try {
    const { task } = await api('/api/tasks', { method: 'POST', form: fd });
    buildSummary(task); postStep(3);
  } catch (err) { toast(err.message, true); }
  finally { btn.disabled = false; }
}
function buildSummary(t) {
  $('#summary').innerHTML = `
    <div class="row"><b>Problem</b><span>${esc(t.title)}</span></div>
    <div class="row"><b>Details</b><span>${esc(t.description.slice(0, 90))}${t.description.length > 90 ? '…' : ''}</span></div>
    <div class="row"><b>Timing</b><span>${esc(t.urgency)}${t.urgency_fee ? ` (+${money(t.urgency_fee)})` : ' (free)'}</span></div>
    <div class="row"><b>Price</b><span>A manager will send you an offer</span></div>`;
}

/* ==================================================================
   DASHBOARDS
================================================================== */
function badge(status) {
  const labels = { submitted:'Awaiting price', price_countered:'Offer to review', client_countered:'Counter sent', open:'Finding a worker',
    assigned:'In progress', work_done:'Done — confirm?', completed:'Completed',
    declined:'Declined', cancelled:'Cancelled' };
  return `<span class="badge b-${status}">${labels[status] || status}</span>`;
}
function eventsHtml(t) {
  return `<div class="toggle-ev" data-action="toggle-ev">Show timeline (${t.events.length})</div>
    <div class="events">${t.events.map(e =>
      `<div class="ev"><span class="dot">•</span><span class="ev-body"><span class="ev-text"><b>${esc(e.who)}</b> — ${esc(e.text)}</span><span class="ev-time">${fmtDateTime(e.at)}</span></span></div>`).join('')}</div>`;
}
function priceBlock(t) {
  // Show the agreed price once there is one; negotiation cards render the live
  // offer in their own markup, and a just-submitted task has no price yet.
  if (t.agreed_price != null) return `<div class="price">${money(t.agreed_price)}</div>`;
  return '';
}
/* urgency + its surcharge, for meta rows */
function urgencyMeta(t) {
  return `<span>${esc(t.urgency || '')}${t.urgency_fee ? ` · +${money(t.urgency_fee)} urgency` : ' · free'}</span>`;
}
function cardShell(t, inner) {
  return `<div class="tcard" data-id="${t.id}">
    <div class="top">${badge(t.status)}</div>
    <h3>${esc(t.title)}</h3>
    <p class="desc">${esc(t.description)}</p>
    ${(t.photos && t.photos.length) ? `<div class="tphotos">${t.photos.map(p => `<img class="tphoto" src="${p}" alt="problem photo">`).join('')}</div>` : ''}
    ${inner || ''}
    ${eventsHtml(t)}
  </div>`;
}

/* event delegation for dashboard actions */
document.addEventListener('click', async e => {
  const a = e.target.closest('[data-action]'); if (!a) return;
  const card = a.closest('.tcard'); const id = card?.getAttribute('data-id');
  const action = a.getAttribute('data-action');
  try {
    if (action === 'toggle-ev') {
      const ev = card.querySelector('.events'); ev.classList.toggle('show');
      a.textContent = ev.classList.contains('show') ? 'Hide timeline' : `Show timeline (${ev.children.length})`;
      return;
    }
    if (action === 'set-star') { // highlight stars up to the clicked one (UI only)
      const stars = a.parentElement; const n = +a.getAttribute('data-n');
      stars.setAttribute('data-val', n);
      [...stars.children].forEach((s, i) => s.classList.toggle('on', i < n));
      return;
    }
    if (action === 'submit-rating') {
      const w = a.closest('.rate'); const val = +w.querySelector('.stars').getAttribute('data-val');
      if (!val) { toast('Pick a star rating first.'); return; }
      await api(`/api/tasks/${id}/rate`, { body: { rating: val, comment: w.querySelector('.rate-comment').value } });
      toast('Thanks for rating!'); renderDashboard(); return;
    }
    if (action === 'accept-counter') { await api(`/api/tasks/${id}/respond`, { body:{ action:'accept' } }); toast('Price accepted — a manager will assign a worker.'); }
    if (action === 'decline-counter') { await api(`/api/tasks/${id}/respond`, { body:{ action:'decline' } }); toast('Price declined.'); }
    if (action === 'client-counter') { return openClientCounter(id); }
    if (action === 'counter-reply') { return openCounterReply(id); }
    if (action === 'confirm-done') { await api(`/api/tasks/${id}/confirm`, { method:'POST' }); toast('Marked as fixed. Thank you!'); }
    if (action === 'assign') { return openAssign(id); }
    if (action === 'release') { return confirmRelease(id); }
    if (action === 'mark-done') { await api(`/api/tasks/${id}/done`, { method:'POST' }); toast('Marked done. Waiting for client to confirm.'); }
    if (action === 'cancel-task') { return confirmCancel(id); }
    if (action === 'pay') { return openPay(id, +a.getAttribute('data-amount')); }
    if (action === 'review') { return openSetPrice(id); }
    if (['accept-counter','decline-counter','confirm-done','mark-done'].includes(action)) renderDashboard();
  } catch (err) { toast(err.message, true); renderDashboard(); }
});

async function renderDashboard(silent = false) {
  const u = state.user; if (!u) return go('login');
  const root = $('#dash-root');
  if (!silent) root.innerHTML = loadingBox();
  if (u.role === 'client') return renderClient(root);
  if (u.role === 'fixer') return renderFixer(root);
  if (u.role === 'manager') return renderManager(root);
  if (u.role === 'admin') return renderAdmin(root);
}

/* Auto-refresh: keeps each dashboard live so a manager's approval reaches
   fixers (and a fixer's accept disappears for others) without reloading. */
setInterval(() => {
  if (document.visibilityState !== 'visible') return;
  if (!state.user) return;
  if (!$('#view-dashboard').classList.contains('active')) return;
  if ($('#modal-bg').classList.contains('show')) return;   // don't interrupt a review
  // Analytics runs aggregate queries and owns its own 10-minute refresh (plus a
  // Refresh button) — re-running all of it every 10s would be pure waste.
  if (state.dashTab === 'analytics') return;
  const a = document.activeElement;                         // don't yank focus mid-interaction
  if (a && $('#dash-root').contains(a) && /^(SELECT|INPUT|TEXTAREA)$/.test(a.tagName)) return;
  if ($('#dash-root').querySelector('.events.show')) return; // don't collapse activity the user opened
  if ($('#dash-root').querySelector('.stars[data-val]:not([data-val="0"])')) return; // mid-rating
  renderDashboard(true);
}, 10000);

const emptyBox = (msg) => `<div class="empty">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12h6M9 16h6M9 8h6"/><rect x="4" y="3" width="16" height="18" rx="2"/></svg>
  <div>${msg}</div></div>`;
const loadingBox = (msg = 'Loading…') => `<div class="loading"><span class="spin"></span>${msg}</div>`;

/* ---------- CLIENT ---------- */
async function renderClient(root) {
  const tab = ['ongoing', 'completed'].includes(state.dashTab) ? state.dashTab : 'ongoing';
  const { tasks } = await api('/api/tasks/mine');
  const done = ['completed', 'declined', 'cancelled'];
  const ongoing   = tasks.filter(t => !done.includes(t.status));
  const completed = tasks.filter(t => done.includes(t.status));
  const list = tab === 'completed' ? completed : ongoing;
  const empty = tab === 'completed'
    ? 'No finished problems yet.'
    : (tasks.length ? 'No problems in progress right now.' : 'You haven\'t posted anything yet. Tap “Post a new problem”.');
  root.innerHTML = `
    <div class="dash-head">
      <div><h1>My problems</h1><p>Track every fix from review to done.</p></div>
      <button class="btn btn-primary" data-go="post">Post a new problem
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg></button>
    </div>
    <div class="tabs">
      <div class="tab ${tab==='ongoing'?'on':''}" data-tab="ongoing">Ongoing <span class="count">${ongoing.length}</span></div>
      <div class="tab ${tab==='completed'?'on':''}" data-tab="completed">Completed <span class="count">${completed.length}</span></div>
    </div>
    <div class="grid">${list.length ? list.map(clientCard).join('') : emptyBox(empty)}</div>`;
  wireTabs(root);
}
function clientCard(t) {
  let inner = priceBlock(t);
  if (t.status === 'submitted') {
    inner += `<div class="note-box">${urgencyMeta(t)} — a manager is reviewing your problem and will send you a price offer.</div>`;
  } else if (t.status === 'price_countered') {
    inner += `<div class="note-box"><b>Manager's offer: ${money(t.counter_price)}</b>${t.manager_note ? ` — ${esc(t.manager_note)}` : ''}</div>
      <div class="card-actions">
        <button class="btn btn-ok btn-sm" data-action="accept-counter">Accept ${money(t.counter_price)}</button>
        <button class="btn btn-soft btn-sm" data-action="client-counter">Negotiate</button>
        <button class="btn btn-danger btn-sm" data-action="decline-counter">Decline</button></div>`;
  } else if (t.status === 'client_countered') {
    inner += `<div class="note-box"><b>Your counter: ${money(t.counter_price)}</b>${t.manager_note ? ` — ${esc(t.manager_note)}` : ''}<br><span style="color:var(--muted)">Waiting for the manager to reply.</span></div>`;
  } else if (t.status === 'work_done') {
    inner += `<div class="card-actions"><button class="btn btn-ok btn-sm" data-action="confirm-done">Confirm it's fixed ✓</button></div>`;
  } else if (t.status === 'open') {
    inner += `<div class="note-box">Price agreed — a worker will be assigned to you shortly.</div>`;
  }
  if (t.fixer) inner += `<div class="meta"><span>Worker: <b>${esc(t.fixer.name)}</b></span></div>`;
  // Payment: once the job is completed the client pays the agreed price.
  if (t.status === 'completed') {
    inner += t.paid
      ? `<div class="paid-tag">✓ Paid ${money(t.agreed_price)}${t.card_last4 ? ` · card ···· ${esc(t.card_last4)}` : ''}</div>`
      : `<div class="card-actions"><button class="btn btn-primary btn-sm" data-action="pay" data-amount="${t.agreed_price || 0}">Pay ${money(t.agreed_price)}</button></div>`;
    // Rating: client rates the fixer who did the job.
    if (t.fixer) {
      inner += t.rating
        ? `<div class="rated">You rated ${starsRO(t.rating)}${t.rating_comment ? ` — “${esc(t.rating_comment)}”` : ''}</div>`
        : `<div class="rate">
            <span class="rate-lab">Rate ${esc(t.fixer.name)}:</span>
            <div class="stars" data-val="0">${[1,2,3,4,5].map(n => `<button type="button" class="star" data-action="set-star" data-n="${n}">★</button>`).join('')}</div>
            <input class="input rate-comment" placeholder="Add a comment (optional)">
            <button class="btn btn-primary btn-sm" data-action="submit-rating">Submit rating</button>
          </div>`;
    }
  }
  // Let the client call it off (e.g. they fixed it themselves) while it's still in progress.
  if (['submitted', 'price_countered', 'client_countered', 'open', 'assigned'].includes(t.status)) {
    inner += `<div class="card-actions"><button class="btn btn-ghost btn-sm" data-action="cancel-task">I fixed it myself — cancel</button></div>`;
  }
  return cardShell(t, inner);
}

/* ---------- FIXER ----------
   Fixers no longer browse a pool. A manager assigns each job to a specific
   fixer, so the dashboard only shows jobs assigned to this fixer. */
async function renderFixer(root) {
  const tab = ['ongoing', 'unconfirmed', 'finished'].includes(state.dashTab) ? state.dashTab : 'ongoing';
  const [mine, me] = await Promise.all([api('/api/fixer/mine'), api('/api/me')]);
  // keep availability (e.g. auto-Busy on assignment) in sync without resetting the tab
  if (me && me.user) { state.user = me.user; try { localStorage.setItem('digit_user', JSON.stringify(me.user)); } catch {} }
  const ongoing     = mine.tasks.filter(t => t.status === 'assigned');
  const unconfirmed = mine.tasks.filter(t => t.status === 'work_done');
  const finished    = mine.tasks.filter(t => t.status === 'completed');
  let list, empty;
  if (tab === 'unconfirmed')      { list = unconfirmed; empty = 'Nothing waiting on a client to confirm.'; }
  else if (tab === 'finished')    { list = finished;    empty = 'No finished jobs yet.'; }
  else                            { list = ongoing;     empty = 'No jobs assigned to you yet. A manager will assign work that fits your skills.'; }
  const av = state.user.availability || 'available';
  root.innerHTML = `
    <div class="dash-head"><div><h1>Worker dashboard</h1>
      <p>Your skills: ${(state.user.skills||[]).map(k => esc(labelOf(k))).join(', ') || '—'} &nbsp;·&nbsp; Rating: ${ratingText(state.user.rating)}</p></div>
      <div class="avail-set">
        <span class="avail-lab">Your status</span>
        <div class="avail-select">
          <span class="avail-dot" style="background:${availMeta(av).dot}"></span>
          <span class="avail-cur" id="avail-cur">${availMeta(av).label}</span>
          <svg class="avail-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
          <select id="avail-picker" class="avail-native" aria-label="Set your availability">
            ${AVAIL_ORDER.map(k => `<option value="${k}" ${k===av?'selected':''}>${AVAIL[k].label}</option>`).join('')}
          </select>
        </div>
      </div>
    </div>
    <div class="tabs">
      <div class="tab ${tab==='ongoing'?'on':''}" data-tab="ongoing">Assigned to me <span class="count">${ongoing.length}</span></div>
      <div class="tab ${tab==='unconfirmed'?'on':''}" data-tab="unconfirmed">Awaiting confirmation <span class="count">${unconfirmed.length}</span></div>
      <div class="tab ${tab==='finished'?'on':''}" data-tab="finished">Finished <span class="count">${finished.length}</span></div>
    </div>
    <div class="grid">${list.length ? list.map(fixerMineCard).join('') : emptyBox(empty)}</div>`;
  wireTabs(root);
  const picker = $('#avail-picker');
  if (picker) picker.addEventListener('change', async () => {
    const v = picker.value;
    try {
      const { user } = await api('/api/fixer/availability', { body: { availability: v } });
      state.user = user;   // update in place (don't reset the active tab)
      try { localStorage.setItem('digit_user', JSON.stringify(user)); } catch {}
      const wrap = picker.closest('.avail-select');
      if (wrap) {
        wrap.querySelector('.avail-dot').style.background = availMeta(v).dot;
        wrap.querySelector('.avail-cur').textContent = availMeta(v).label;
      }
      toast(`Status set to ${availMeta(v).label}.`);
    } catch (err) { toast(err.message, true); renderDashboard(); }
  });
}
function fixerMineCard(t) {
  let actions = '';
  if (t.status === 'assigned') actions = `<button class="btn btn-ok btn-sm" data-action="mark-done">Mark as done</button>`;
  const payLine = t.status === 'completed'
    ? (t.paid ? `<div class="paid-tag">✓ Paid ${money(t.agreed_price)}</div>`
              : `<div class="meta"><span style="color:var(--warn)">Awaiting client payment</span></div>`) : '';
  const rateLine = (t.status === 'completed' && t.rating)
    ? `<div class="rated">Client rated you ${starsRO(t.rating)}${t.rating_comment ? ` — “${esc(t.rating_comment)}”` : ''}</div>` : '';
  const cantHint = t.status === 'assigned'
    ? `<div class="note-box">Can't complete it? Contact a manager — they can reassign it to another worker.</div>` : '';
  return cardShell(t, `${priceBlock(t)}
    <div class="meta"><span>Client: <b>${esc(t.client.name)}</b></span><span>${esc(t.urgency||'')}</span></div>
    ${payLine}${rateLine}${cantHint}
    ${actions ? `<div class="card-actions">${actions}</div>` : ''}`);
}

/* ---------- MANAGER ---------- */
/* One window per task state, so the queue isn't a jumble of everything. */
const TASK_GROUPS = [
  { key: 'queue',     label: 'Review queue',    empty: 'Nothing to review. Inbox zero! 🎉', match: s => s === 'submitted' },
  { key: 'awaiting',  label: 'Negotiating', empty: 'No price negotiations in progress.', match: s => s === 'price_countered' || s === 'client_countered' },
  { key: 'open',      label: 'Ready to assign', empty: 'Nothing waiting to be assigned right now.', match: s => s === 'open' },
  { key: 'progress',  label: 'In progress',     empty: 'No tasks in progress right now.', match: s => s === 'assigned' },
  { key: 'unconfirmed', label: 'Awaiting confirmation', empty: 'Nothing waiting on a client to confirm.', match: s => s === 'work_done' },
  { key: 'completed', label: 'Completed',       empty: 'No completed tasks yet.', match: s => s === 'completed' },
  { key: 'closed',    label: 'Cancelled',       empty: 'No declined or cancelled tasks.', match: s => s === 'declined' || s === 'cancelled' },
];
function bucketize(tasks) {
  const g = {}; TASK_GROUPS.forEach(x => g[x.key] = tasks.filter(t => x.match(t.status))); return g;
}
function groupTabsHtml(groups, active) {
  return TASK_GROUPS.map(x =>
    `<div class="tab ${active===x.key?'on':''}" data-tab="${x.key}">${x.label} <span class="count">${groups[x.key].length}</span></div>`).join('');
}
function groupCards(groups, active) {
  const def = TASK_GROUPS.find(x => x.key === active) || TASK_GROUPS[0];
  const list = groups[active] || [];
  if (!list.length) return emptyBox(def.empty);
  const render = active === 'queue'    ? managerQueueCard
               : active === 'awaiting' ? managerNegotiateCard
               : active === 'open'     ? managerAssignCard
               : managerAllCard;
  return list.map(render).join('');
}

async function renderManager(root) {
  const { tasks } = await api('/api/manager/all');
  const groups = bucketize(tasks);
  const keys = [...TASK_GROUPS.map(g => g.key), 'analytics'];
  const tab = keys.includes(state.dashTab) ? state.dashTab : 'queue';
  // A manager's Analytics tab covers only the tasks they managed, and the
  // server leaves every money figure out of their payload.
  const body = tab === 'analytics'
    ? `<div id="analytics-root">${loadingBox('Crunching the numbers…')}</div>`
    : `<div class="grid">${groupCards(groups, tab)}</div>`;
  root.innerHTML = `
    <div class="dash-head"><div><h1>Manager dashboard</h1><p>Review new problems, set fair prices, route to workers.</p></div>
      ${seeFixersBtn()}</div>
    <div class="tabs spread">${groupTabsHtml(groups, tab)}
      <div class="tab ${tab==='analytics'?'on':''}" data-tab="analytics">Analytics</div></div>
    ${body}`;
  wireTabs(root);
  if (tab === 'analytics') mountAnalytics();
}
function managerQueueCard(t) {
  return cardShell(t, `
    <div class="meta"><span>Client: <b>${esc(t.client.name)}</b></span>${urgencyMeta(t)}</div>
    <div class="card-actions"><button class="btn btn-primary btn-sm" data-action="review">Set a price</button></div>`);
}
function managerNegotiateCard(t) {
  const noteBox = t.manager_note
    ? `<div class="note-box"><b>${t.status === 'client_countered' ? "Client's note" : 'Your note'}:</b> ${esc(t.manager_note)}</div>` : '';
  const body = t.status === 'client_countered'
    ? `<div class="offer-line">Client countered with <b>${money(t.counter_price)}</b>.</div>${noteBox}
       <div class="card-actions"><button class="btn btn-primary btn-sm" data-action="counter-reply">Respond</button></div>`
    : `<div class="offer-line">You offered <b>${money(t.counter_price)}</b> — waiting for the client to reply.</div>${noteBox}`;
  return cardShell(t, `<div class="meta"><span>Client: <b>${esc(t.client.name)}</b></span>${urgencyMeta(t)}</div>${body}`);
}
function managerAssignCard(t) {
  const note = t.manager_note ? `<div class="note-box"><b>Your note:</b> ${esc(t.manager_note)}</div>` : '';
  return cardShell(t, `${priceBlock(t)}${note}
    <div class="meta"><span>Client: <b>${esc(t.client.name)}</b></span><span>${esc(t.urgency||'')}</span></div>
    <div class="card-actions"><button class="btn btn-primary btn-sm" data-action="assign">Assign a worker</button></div>`);
}
function managerAllCard(t) {
  const note = (t.status === 'price_countered' && t.manager_note)
    ? `<div class="note-box"><b>Your note:</b> ${esc(t.manager_note)}</div>` : '';
  const payLine = t.status === 'completed'
    ? (t.paid ? `<div class="paid-tag">✓ Paid ${money(t.agreed_price)}</div>`
              : `<div class="meta"><span style="color:var(--warn)">Awaiting client payment</span></div>`) : '';
  const rateLine = (t.status === 'completed' && t.rating)
    ? `<div class="rated">Rated ${starsRO(t.rating)}${t.rating_comment ? ` — “${esc(t.rating_comment)}”` : ''}</div>` : '';
  const release = t.status === 'assigned'
    ? `<div class="card-actions"><button class="btn btn-ghost btn-sm" data-action="release">Reassign</button></div>` : '';
  return cardShell(t, `${priceBlock(t)}${note}
    <div class="meta"><span>Client: <b>${esc(t.client.name)}</b></span>${t.fixer?`<span>Worker: <b>${esc(t.fixer.name)}</b></span>`:''}</div>
    ${payLine}${rateLine}${release}`);
}

/* ---------- simulated payment ---------- */
function luhnOk(s) {
  if (!/^\d{13,19}$/.test(s)) return false;
  let sum = 0, alt = false;
  for (let i = s.length - 1; i >= 0; i--) { let n = +s[i]; if (alt) { n *= 2; if (n > 9) n -= 9; } sum += n; alt = !alt; }
  return sum % 10 === 0;
}
function expOk(v) {
  if (!/^\d{2}\/\d{2}$/.test(v)) return false;
  const [mm, yy] = v.split('/').map(Number);
  if (mm < 1 || mm > 12) return false;
  return new Date(2000 + yy, mm) > new Date(); // first of the following month
}
function openPay(id, amount) {
  modal(`
    <h3>Pay for your fix</h3>
    <p class="sub">Amount due: <b>${money(amount)}</b>. This is a <b>simulated</b> payment — no real card is charged.</p>
    <div class="form-error" id="pay-error"></div>
    <form id="pay-form" novalidate>
      <label class="field"><span class="lab">Name on card</span><input class="input" name="cardName" placeholder="Jordan Smith"></label>
      <label class="field"><span class="lab">Card number</span><input class="input" name="cardNumber" inputmode="numeric" autocomplete="off" placeholder="6767 6767 6767 6767" maxlength="23"></label>
      <div class="two">
        <label class="field"><span class="lab">Expiry</span><input class="input" name="cardExp" inputmode="numeric" placeholder="MM/YY" maxlength="5"></label>
        <label class="field"><span class="lab">CVC</span><input class="input" name="cardCvc" inputmode="numeric" placeholder="123" maxlength="4"></label>
      </div>
      <div class="flow-actions">
        <button class="btn btn-ghost" type="button" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" type="submit" id="pay-submit">Pay ${money(amount)}</button>
      </div>
    </form>
    <p style="text-align:center;color:var(--muted);font-size:.78rem;margin-top:.8rem">Test card: 6767 6767 6767 6767 · any future date · any CVC</p>`);
  const num = $('#pay-form [name=cardNumber]');
  num.addEventListener('input', () => {
    const v = num.value.replace(/\D/g, '').slice(0, 19);
    num.value = v.replace(/(.{4})/g, '$1 ').trim();
  });
  const exp = $('#pay-form [name=cardExp]');
  exp.addEventListener('input', () => {
    let v = exp.value.replace(/\D/g, '').slice(0, 4);
    if (v.length > 2) v = v.slice(0, 2) + '/' + v.slice(2);
    exp.value = v;
  });
  $('#pay-form').addEventListener('submit', e => doPay(e, id));
}
async function doPay(e, id) {
  e.preventDefault();
  const f = e.target; clearFieldErrs(f);
  const num = f.cardNumber.value.replace(/\s/g, '');
  let ok = true;
  if (!f.cardName.value.trim()) { fieldErr(f.cardName, 'Enter the name on the card.'); ok = false; }
  if (!luhnOk(num)) { fieldErr(f.cardNumber, 'Enter a valid card number.'); ok = false; }
  if (!expOk(f.cardExp.value)) { fieldErr(f.cardExp, 'Enter a valid future expiry.'); ok = false; }
  if (!/^\d{3,4}$/.test(f.cardCvc.value)) { fieldErr(f.cardCvc, 'Enter the security code.'); ok = false; }
  if (!ok) return;
  const btn = $('#pay-submit'); btn.disabled = true; btn.textContent = 'Processing…';
  try {
    await new Promise(r => setTimeout(r, 900)); // simulate the payment gateway
    await api(`/api/tasks/${id}/pay`, { body: { last4: num.slice(-4) } });
    closeModal(); toast('Payment successful — thank you! 🎉'); renderDashboard();
  } catch (err) {
    const box = $('#pay-error'); if (box) { box.textContent = err.message; box.classList.add('show'); } else toast(err.message, true);
    btn.disabled = false; btn.textContent = 'Try again';
  }
}

function confirmRelease(id) {
  modal(`
    <h3>Reassign this task?</h3>
    <p class="sub">This unassigns the current worker and moves the job back to “Ready to assign”, so you can hand-pick a different worker.</p>
    <div class="flow-actions">
      <button class="btn btn-ghost" type="button" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" type="button" id="release-yes">Okay</button>
    </div>`);
  $('#release-yes').onclick = async () => {
    try { await api(`/api/tasks/${id}/release`, { method: 'POST' }); closeModal(); toast('Unassigned — ready to assign a different worker.'); renderDashboard(); }
    catch (err) { closeModal(); toast(err.message, true); renderDashboard(); }
  };
}

/* One row in the assign picker. Non-available fixers are shown but disabled. */
function assignRowHTML(f) {
  const skillNames = f.skills.map(k => labelOf(k)).join(', ') || '—';
  const m = availMeta(f.availability);
  return `<label class="assign-row${f.assignable ? '' : ' disabled'}" data-name="${esc(f.name.toLowerCase())}">
    <input type="radio" name="assign-fixer" value="${f.id}" ${f.assignable ? '' : 'disabled'}>
    <span class="assign-main">
      <span class="assign-name">${esc(f.name)}</span>
      <span class="assign-sub">${esc(skillNames)}</span>
    </span>
    <span class="assign-meta">
      <span class="avail"><span class="avail-dot" style="background:${m.dot}"></span>${m.label}</span>
      <span class="assign-load">${ratingText(f.rating)} · ${f.activeJobs} active</span>
    </span>
  </label>`;
}

/* Manager hand-picks a fixer for an approved task. All fixers are listed
   alphabetically in a searchable dropdown; matching-skill fixers get a tag, and
   only fixers whose status is "Available" can actually be chosen. */
async function openAssign(id) {
  modal(`<h3>Assign a worker</h3><p class="sub">${loadingBox('Loading your workers…')}</p>`);
  let fixers, task;
  try {
    const [fr, tr] = await Promise.all([api('/api/manager/fixers'), api('/api/manager/all')]);
    fixers = fr.fixers;
    task = tr.tasks.find(t => String(t.id) === String(id));
  } catch (err) { closeModal(); toast(err.message, true); return; }
  if (!task) { closeModal(); toast('That task is no longer available.', true); renderDashboard(); return; }
  if (!fixers.length) { closeModal(); toast('No workers exist yet to assign.', true); return; }
  fixers.sort((a, b) => a.name.localeCompare(b.name));       // alphabetical
  const availCount = fixers.filter(f => f.assignable).length;
  modal(`
    <h3>Assign a worker</h3>
    <p class="sub">Pick who should handle this task. Only workers marked <b>Available</b> can be assigned (${availCount} right now).</p>
    <div class="form-error" id="assign-error"></div>
    <div class="combo">
      <input class="input" id="assign-search" placeholder="Search workers by name or surname…" autocomplete="off">
      <div class="assign-list" id="assign-results"></div>
    </div>
    <div class="flow-actions">
      <button class="btn btn-ghost" type="button" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" type="button" id="assign-yes">Assign worker</button>
    </div>`);
  const results = $('#assign-results');
  const search = $('#assign-search');
  let selected = '';   // chosen fixer id (survives re-filtering)
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    const tokens = q.split(/\s+/).filter(Boolean);
    const shown = fixers.filter(f =>
      !tokens.length || tokens.every(tk => f.name.toLowerCase().split(/\s+/).some(w => w.startsWith(tk)) || f.name.toLowerCase().includes(tk)));
    results.innerHTML = shown.length
      ? shown.map(f => assignRowHTML(f)).join('')
      : `<div class="assign-none">No worker matches “${esc(search.value)}”.</div>`;
    if (selected) { const r = results.querySelector(`input[value="${selected}"]`); if (r && !r.disabled) r.checked = true; }
  };
  results.addEventListener('change', e => { if (e.target.name === 'assign-fixer') selected = e.target.value; });
  search.addEventListener('input', draw);
  draw();
  search.focus();
  $('#assign-yes').onclick = async () => {
    const err = $('#assign-error');
    if (!selected) { err.textContent = 'Search and choose an available worker first.'; err.classList.add('show'); return; }
    try {
      await api(`/api/tasks/${id}/assign`, { body: { fixer_id: selected } });
      closeModal(); toast('Worker assigned. 🛠️'); renderDashboard();
    } catch (e) { if (err) { err.textContent = e.message; err.classList.add('show'); } else toast(e.message, true); }
  };
}
function confirmCancel(id) {
  modal(`
    <h3>Cancel this request?</h3>
    <p class="sub">Only do this if you no longer need help (for example, you fixed it yourself). If a worker already took the job, it will be removed from their list.</p>
    <div class="flow-actions">
      <button class="btn btn-ghost" type="button" onclick="closeModal()">Keep it</button>
      <button class="btn btn-danger" type="button" id="cancel-yes">Yes, cancel it</button>
    </div>`);
  $('#cancel-yes').onclick = async () => {
    try {
      await api(`/api/tasks/${id}/cancel`, { method: 'POST' });
      closeModal(); toast('Request cancelled.'); renderDashboard();
    } catch (err) { closeModal(); toast(err.message, true); renderDashboard(); }
  };
}

/* Manager makes the FIRST offer: set a service price; the urgency fee is added
   on top to form the total offer sent to the client. */
async function openSetPrice(id) {
  modal(`<h3>Set a price</h3><p class="sub">${loadingBox('Loading…')}</p>`);
  let task = null;
  try {
    const { tasks } = await api('/api/manager/all');
    task = tasks.find(t => String(t.id) === String(id));
  } catch (err) { closeModal(); toast(err.message, true); return; }
  if (!task || task.status !== 'submitted') { closeModal(); toast('This task is no longer awaiting a first price.', true); renderDashboard(); return; }
  const fee = task.urgency_fee || 0;
  modal(`
    <h3>Set a price</h3>
    <p class="sub">Set your price for the work. The <b>${esc(task.urgency)}</b> urgency fee of <b>${money(fee)}</b> is added on top. The client can accept or negotiate.</p>
    <div class="form-error" id="rev-error"></div>
    <label class="field"><span class="lab">Price for the work (USD)</span><input class="input" id="rev-price" type="number" min="0" inputmode="numeric" placeholder="e.g. 50"></label>
    <div class="offer-total" id="rev-total">Total offer: <b>${money(fee)}</b> <span>(work ${money(0)} + ${money(fee)} urgency)</span></div>
    <label class="field"><span class="lab">Note to the client <span class="opt">optional</span></span><textarea class="input" id="rev-note" placeholder="e.g. This needs a part replacement plus about 2 hours of labour."></textarea></label>
    <div class="flow-actions">
      <button class="btn btn-ghost" type="button" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" type="button" id="rev-send">Send offer</button>
    </div>`);
  const priceEl = $('#rev-price');
  const totalEl = $('#rev-total');
  const sync = () => { const s = parseInt(priceEl.value, 10) || 0;
    totalEl.innerHTML = `Total offer: <b>${money(s + fee)}</b> <span>(work ${money(s)} + ${money(fee)} urgency)</span>`; };
  priceEl.addEventListener('input', sync);
  $('#rev-send').onclick = async () => {
    const err = $('#rev-error');
    const service = parseInt(priceEl.value, 10);
    if (!(service >= 0)) { err.textContent = 'Enter a price for the work ($0 or more).'; err.classList.add('show'); return; }
    try {
      await api(`/api/tasks/${id}/review`, { body: { service_price: service, manager_note: $('#rev-note').value } });
      closeModal(); toast('Offer sent to the client.'); renderDashboard();
    } catch (e) { if (err) { err.textContent = e.message; err.classList.add('show'); } else toast(e.message, true); }
  };
}

/* Client negotiates: counter the manager's offer with their own number + message. */
async function openClientCounter(id) {
  modal(`<h3>Make a counter-offer</h3><p class="sub">${loadingBox('Loading…')}</p>`);
  let task = null;
  try { const { tasks } = await api('/api/tasks/mine'); task = tasks.find(t => String(t.id) === String(id)); }
  catch (err) { closeModal(); toast(err.message, true); return; }
  if (!task || task.status !== 'price_countered') { closeModal(); toast("There's no offer to respond to right now.", true); renderDashboard(); return; }
  modal(`
    <h3>Make a counter-offer</h3>
    <p class="sub">The manager offered <b>${money(task.counter_price)}</b>. Propose a price that works for you — the manager can accept or counter back.</p>
    <div class="form-error" id="cc-error"></div>
    <label class="field"><span class="lab">Your price (USD)</span><input class="input" id="cc-price" type="number" min="0" inputmode="numeric" placeholder="e.g. 40"></label>
    <label class="field"><span class="lab">Message <span class="opt">optional</span></span><textarea class="input" id="cc-note" placeholder="e.g. That's a bit high for me — could we do ₾40?"></textarea></label>
    <div class="flow-actions">
      <button class="btn btn-ghost" type="button" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" type="button" id="cc-send">Send counter</button>
    </div>`);
  $('#cc-send').onclick = async () => {
    const err = $('#cc-error');
    const price = parseInt($('#cc-price').value, 10);
    if (!(price >= 0)) { err.textContent = 'Enter the price you can offer.'; err.classList.add('show'); return; }
    try {
      await api(`/api/tasks/${id}/respond`, { body: { action: 'counter', price, note: $('#cc-note').value } });
      closeModal(); toast('Counter-offer sent to the manager.'); renderDashboard();
    } catch (e) { if (err) { err.textContent = e.message; err.classList.add('show'); } else toast(e.message, true); }
  };
}

/* Manager replies to a client's counter: accept, counter back, or decline. */
async function openCounterReply(id) {
  modal(`<h3>Client's counter-offer</h3><p class="sub">${loadingBox('Loading…')}</p>`);
  let task = null;
  try { const { tasks } = await api('/api/manager/all'); task = tasks.find(t => String(t.id) === String(id)); }
  catch (err) { closeModal(); toast(err.message, true); return; }
  if (!task || task.status !== 'client_countered') { closeModal(); toast('There is no client counter to reply to.', true); renderDashboard(); return; }
  modal(`
    <h3>Client's counter-offer</h3>
    <p class="sub">The client countered with <b>${money(task.counter_price)}</b>${task.manager_note ? ` — “${esc(task.manager_note)}”` : ''}. Accept it, counter back, or decline.</p>
    <div class="form-error" id="cr-error"></div>
    <label class="field"><span class="lab">Counter price <span class="opt">only if countering</span></span><input class="input" id="cr-price" type="number" min="0" inputmode="numeric" placeholder="e.g. 55"></label>
    <label class="field"><span class="lab">Note to the client <span class="opt">optional</span></span><textarea class="input" id="cr-note" placeholder="e.g. I can meet you at ₾55."></textarea></label>
    <div class="flow-actions">
      <button class="btn btn-danger" type="button" id="cr-decline">Decline</button>
      <button class="btn btn-soft" type="button" id="cr-counter">Counter</button>
      <button class="btn btn-ok" type="button" id="cr-accept">Accept ${money(task.counter_price)}</button>
    </div>`);
  const err = $('#cr-error');
  const send = async (body, okMsg) => {
    try { await api(`/api/tasks/${id}/counter-reply`, { body }); closeModal(); toast(okMsg); renderDashboard(); }
    catch (e) { if (err) { err.textContent = e.message; err.classList.add('show'); } else toast(e.message, true); }
  };
  $('#cr-accept').onclick = () => send({ action: 'accept' }, 'Accepted — ready to assign a worker.');
  $('#cr-decline').onclick = () => send({ action: 'decline' }, 'Counter declined. Task closed.');
  $('#cr-counter').onclick = () => {
    const price = parseInt($('#cr-price').value, 10);
    if (!(price >= 0)) { err.textContent = 'Enter your counter price.'; err.classList.add('show'); return; }
    send({ action: 'counter', price, manager_note: $('#cr-note').value }, 'Counter sent to the client.');
  };
}

/* ---------- ADMIN ---------- */
async function renderAdmin(root) {
  const keys = ['people', 'analytics', ...TASK_GROUPS.map(g => g.key)];
  const tab = keys.includes(state.dashTab) ? state.dashTab : 'people';
  const { tasks } = await api('/api/manager/all');
  const groups = bucketize(tasks);
  const tabsHtml = `<div class="tab ${tab==='people'?'on':''}" data-tab="people">People</div>
    <div class="tab ${tab==='analytics'?'on':''}" data-tab="analytics">Analytics</div>${groupTabsHtml(groups, tab)}`;
  let body;
  if (tab === 'people') {
    const { users } = await api('/api/admin/users');
    body = adminPeople(users);
  } else if (tab === 'analytics') {
    // Placeholder now, filled by mountAnalytics() — the tabs stay responsive
    // while the aggregate queries run.
    body = `<div id="analytics-root">${loadingBox('Crunching the numbers…')}</div>`;
  } else {
    body = `<div class="grid">${groupCards(groups, tab)}</div>`;
  }
  root.innerHTML = `
    <div class="dash-head"><div><h1>Admin dashboard</h1><p>Manage people and triage tasks by state.</p></div>
      ${seeFixersBtn()}</div>
    <div class="tabs spread">${tabsHtml}</div>
    ${body}`;
  wireTabs(root);
  if (tab === 'people') wireRoleSelects();
  if (tab === 'analytics') mountAnalytics();
}
// Fixed order: admins → managers → fixers → clients, A–Z within each group.
const ROLE_RANK = { admin: 0, manager: 1, fixer: 2, client: 3 };
function sortUsers(users) {
  return [...users].sort((a, b) => (ROLE_RANK[a.role] - ROLE_RANK[b.role]) || a.name.localeCompare(b.name));
}
function adminPeople(users) {
  const counts = users.reduce((m,u)=>(m[u.role]=(m[u.role]||0)+1,m),{});
  const filter = state.peopleFilter || 'all';
  const filtered = filter === 'all' ? users
    : (filter === 'resigned' || filter === 'dismissed') ? users.filter(u => (u.employment_status || 'active') === filter)
    : users.filter(u => u.role === filter);
  const rows = sortUsers(filtered).map(u => {
    const canChange = !u.is_primary && u.id !== state.user.id && u.role !== 'client';
    let control = '<span style="color:var(--muted);font-size:.85rem">—</span>';
    if (u.is_primary) control = '<span style="color:var(--muted);font-size:.85rem">primary admin</span>';
    else if (u.id === state.user.id) control = '<span style="color:var(--muted);font-size:.85rem">(you)</span>';
    else if (canChange) {
      const st = u.employment_status || 'active';
      const curSel = st !== 'active' ? st : u.role;   // show resigned/dismissed if inactive
      control = `<select class="input role-select ${st !== 'active' ? 'emp-danger' : ''}" data-uid="${u.id}" data-current="${curSel}" data-name="${esc(u.name)}" style="padding:.34rem 2rem .46rem .7rem;width:auto;font-size:.85rem">
        ${['fixer','manager','admin'].map(r => `<option value="${r}" ${curSel===r?'selected':''}>${roleLabel(r)}</option>`).join('')}
        <option class="opt-danger" value="resigned" ${curSel==='resigned'?'selected':''}>resigned</option>
        <option class="opt-danger" value="dismissed" ${curSel==='dismissed'?'selected':''}>dismissed</option>
      </select>`;
    }
    const rating = (u.role === 'fixer' && u.rating && u.rating.count)
      ? `<span class="rating-avg">★ ${u.rating.avg.toFixed(1)}</span> <span style="color:var(--muted)">(${u.rating.count})</span>` : '—';
    return `<tr>
      <td data-label="Name"><span class="cell-user">${avatarHTML(u.name, u.avatar, 28)} ${esc(u.name)}</span></td>
      <td data-label="Email">${esc(u.email)}</td>
      <td data-label="Role"><span class="role-chip rc-${u.role}">${roleLabel(u.role)}</span></td>
      <td data-label="Rating">${rating}</td>
      <td data-label="Qualifications">${u.role==='fixer' ? (u.skills||[]).map(k=>esc(labelOf(k))).join(', ')||'—' : '—'}</td>
      <td data-label="Change role">${control}</td></tr>`;
  }).join('');
  return `
    <div class="stat-row">
      <div class="stat"><div class="n">${counts.client||0}</div><div class="l">Clients</div></div>
      <div class="stat"><div class="n">${counts.fixer||0}</div><div class="l">Workers</div></div>
      <div class="stat"><div class="n">${counts.manager||0}</div><div class="l">Managers</div></div>
      <div class="stat"><div class="n">${counts.admin||0}</div><div class="l">Admins</div></div>
    </div>
    <div class="people-bar">
      <label class="people-filter">Show
        <select class="input" id="people-filter">
          ${[['all','Everyone'],['admin','Admins'],['manager','Managers'],['fixer','Workers'],['client','Clients']]
            .map(([v, l]) => `<option value="${v}" ${filter === v ? 'selected' : ''}>${l}</option>`).join('')}
          ${[['resigned','Resigned'],['dismissed','Dismissed']]
            .map(([v, l]) => `<option class="opt-danger" value="${v}" ${filter === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </label>
    </div>
    <div class="table-wrap"><table class="users"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Rating</th><th>Qualifications</th><th>Change role</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:1.5rem">No one with that role.</td></tr>`}</tbody></table></div>`;
}
function confirmEmployment(id, name, status) {
  const copy = {
    dismissed: { title: `Dismiss ${name}?`, sub: "They'll be removed from the workforce and can no longer log in. Their record is kept for your reference (do-not-rehire) — you can reactivate them later.", btn: 'Yes, dismiss', cls: 'btn-danger', ok: `${name} dismissed.` },
    resigned:  { title: `Mark ${name} as resigned?`, sub: 'They left voluntarily. Their account is deactivated but kept in the database — you can reactivate them later.', btn: 'Mark resigned', cls: 'btn-primary', ok: `${name} marked resigned.` },
    active:    { title: `Reactivate ${name}?`, sub: 'They will be able to log in and take on work again.', btn: 'Reactivate', cls: 'btn-primary', ok: `${name} reactivated.` },
  }[status];
  modal(`<h3>${esc(copy.title)}</h3><p class="sub">${copy.sub}</p>
    <div class="flow-actions">
      <button class="btn btn-ghost" type="button" onclick="closeModal()">Cancel</button>
      <button class="btn ${copy.cls}" type="button" id="emp-yes">${copy.btn}</button>
    </div>`);
  $('#emp-yes').onclick = async () => {
    try { await api(`/api/admin/users/${id}/employment`, { body: { status } }); closeModal(); toast(copy.ok); renderDashboard(); }
    catch (err) { closeModal(); toast(err.message, true); renderDashboard(); }
  };
}
function wireRoleSelects() {
  $$('#dash-root select[data-uid]').forEach(sel => sel.onchange = () => {
    const id = sel.getAttribute('data-uid');
    const cur = sel.getAttribute('data-current');
    const next = sel.value;
    sel.value = cur;              // revert the dropdown — only apply after confirming
    if (next === cur) return;
    const name = sel.getAttribute('data-name');
    if (next === 'resigned' || next === 'dismissed') return confirmEmployment(id, name, next);
    confirmRole(id, name, next);   // picking a real role also reactivates the person
  });
  const pf = $('#people-filter');
  if (pf) pf.onchange = () => { state.peopleFilter = pf.value; renderDashboard(); };
}
function confirmRole(id, name, newRole) {
  modal(`
    <h3>Change this person's role?</h3>
    <p class="sub">Make <b>${esc(name)}</b> a <b>${esc(newRole)}</b>? You can change it back anytime.</p>
    <div class="flow-actions">
      <button class="btn btn-ghost" type="button" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" type="button" id="role-yes">Yes, change it</button>
    </div>`);
  $('#role-yes').onclick = async () => {
    try { await api(`/api/admin/users/${id}/role`, { body: { role: newRole } }); closeModal(); toast('Role updated.'); renderDashboard(); }
    catch (err) { closeModal(); toast(err.message, true); renderDashboard(); }
  };
}

/* ---------- shared ---------- */
function wireTabs(root) {
  $$('.tab', root).forEach(t => t.onclick = () => { state.dashTab = t.getAttribute('data-tab'); renderDashboard(); });
}
function labelOf(key) { return (state.cats.find(c => c.key === key) || {}).label || key; }

/* ---------- PUBLIC REVIEWS PAGE ---------- */
function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s.replace(' ', 'T') + 'Z');
  return isNaN(d) ? '' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
/* Exact local date + time (to the second) for the task timeline. Stored times are
   UTC ("YYYY-MM-DD HH:MM:SS"), so normalise to ISO+Z before parsing. */
function fmtDateTime(s) {
  if (!s) return '';
  const d = new Date(s.replace(' ', 'T') + 'Z');
  return isNaN(d) ? esc(s) : d.toLocaleString(undefined,
    { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
async function renderReviews() {
  const root = $('#reviews-root');
  root.innerHTML = loadingBox();
  let data;
  try { data = await api('/api/reviews'); } catch { root.innerHTML = emptyBox('Could not load reviews.'); return; }
  const { reviews, summary } = data;
  const head = `<div class="reviews-head">
    <h1 class="page-title">What clients are saying</h1>
    ${summary.count
      ? `<div class="reviews-summary">${starsRO(summary.avg)} <span class="rating-avg">${summary.avg.toFixed(1)}</span> <span class="muted">· ${summary.count} review${summary.count > 1 ? 's' : ''}</span></div>`
      : `<p class="page-lead" style="margin:.6rem auto 0">No reviews yet — get a fix and be the first to leave one!</p>`}
  </div>`;
  const grid = reviews.length
    ? `<div class="reviews-grid">${reviews.map(reviewCard).join('')}</div>` : '';
  root.innerHTML = head + grid;
}
function reviewCard(r) {
  return `<div class="review-card">
    <div class="review-top">
      ${avatarHTML(r.reviewer, r.reviewerAvatar, 40)}
      <div class="review-who"><b>${esc(r.reviewer)}</b><span class="review-sub">${fmtDate(r.at)}</span></div>
      ${starsRO(r.rating)}
    </div>
    ${r.comment ? `<p class="review-text">“${esc(r.comment)}”</p>` : `<p class="review-text muted">No comment left.</p>`}
    <div class="review-fixed"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg> Fixed by <b>${esc(r.fixer)}</b></div>
  </div>`;
}

/* ---------- FIXER PROFILES (manager / admin) ---------- */
function seeFixersBtn() {
  return `<button class="btn btn-primary" data-go="fixers">
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
    Worker profiles</button>`;
}
async function renderFixers() {
  const root = $('#fixers-root');
  root.innerHTML = loadingBox('Loading worker profiles…');
  let data;
  try { data = await api('/api/staff/fixers'); } catch { root.innerHTML = emptyBox('Could not load worker profiles.'); return; }
  const fixers = data.fixers;
  const head = `<div class="dash-head fixers-head"><div>
    <h1>Worker profiles</h1>
    <p>Who can do what — skills, availability, ratings and stats to help you assign the right person.</p>
  </div></div>`;
  const body = fixers.length
    ? `<div class="fixer-grid">${fixers.map(fixerProfileCard).join('')}</div>`
    : emptyBox('No workers have joined yet.');
  root.innerHTML = head + body;
}
function fixerProfileCard(f) {
  const m = availMeta(f.availability);
  const skills = f.skills.length
    ? f.skills.map(k => `<span class="fp-skill">${esc(labelOf(k))}</span>`).join('')
    : `<span class="muted">No skills listed yet.</span>`;
  const avgTxt = f.rating && f.rating.count ? f.rating.avg.toFixed(1) : '—';
  return `<div class="fixer-prof">
    <div class="fp-top">
      ${avatarHTML(f.name, f.avatar, 52)}
      <div class="fp-id">
        <b>${esc(f.name)}</b>
        <span class="avail"><span class="avail-dot" style="background:${m.dot}"></span>${m.label}</span>
      </div>
    </div>
    ${f.bio ? `<p class="fp-bio">${esc(f.bio)}</p>` : ''}
    <div class="fp-meta">
      ${f.experience ? `<span class="fp-tag">🧰 ${esc(f.experience)} experience</span>` : ''}
      ${f.work_mode ? `<span class="fp-tag">📍 ${esc(f.work_mode)}</span>` : ''}
      ${f.cv ? `<a class="fp-tag fp-cv" href="${f.cv}" target="_blank" rel="noopener">📄 View CV ↗</a>` : ''}
    </div>
    <div class="fp-group">
      <div class="fp-skills-lab">Can fix</div>
      <div class="fp-skills">${skills}</div>
    </div>
    <div class="fp-stats">
      <div class="fp-stat"><span class="n">${f.completedJobs}</span><span class="l">completed</span></div>
      <div class="fp-stat"><span class="n">${f.activeJobs}</span><span class="l">active now</span></div>
      <div class="fp-stat"><span class="n">${avgTxt}</span><span class="l">avg rating${f.rating && f.rating.count ? ` (${f.rating.count})` : ''}</span></div>
    </div>
  </div>`;
}

/* ---------- PROFILE (editable, role-aware) ---------- */
function renderProfile() {
  const u = state.user; if (!u) return go('login');
  const root = $('#profile-root');
  const isFixer = u.role === 'fixer';
  const skillSet = new Set(u.skills || []);
  const customSkills = (u.skills || []).filter(s => !state.cats.some(c => c.key === s));
  const chips = state.cats.filter(c => c.key !== 'other').map(c =>
    `<span class="chip ${skillSet.has(c.key) ? 'on' : ''}" data-skill="${c.key}">${c.emoji} ${esc(c.label)}</span>`).join('');
  const expOpts = ['Less than 1', '1–3 years', '3–6 years', '6+ years'];
  const modeOpts = ['Remote only', 'In person only', 'Remote & in person'];
  root.innerHTML = `
    <h2 class="flow-title">Your profile</h2>
    <p class="flow-sub">Update your details — you're signed in as a <b>${esc(roleLabel(u.role))}</b>.</p>
    ${isFixer ? `<p class="flow-sub" style="margin-top:.3rem">Your rating: ${ratingText(u.rating)}</p>` : ''}
    <div style="margin-top:1rem"></div>
    <div class="avatar-pick">
      <label class="avatar-drop">
        <img id="pf-avatar-preview" class="avatar avatar-lg" src="${u.avatar || ''}" style="${u.avatar ? '' : 'display:none'}" alt="">
        <span id="pf-avatar-ph" class="avatar avatar-lg avatar-fallback" style="${u.avatar ? 'display:none' : ''}">${esc((u.name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase())}</span>
        <input type="file" id="pf-avatar-input" accept="image/*" hidden>
      </label>
      <div class="avatar-pick-text"><strong>Profile photo</strong><span>Click to change</span></div>
    </div>
    <form id="profile-form" novalidate>
      <div class="two">
        <label class="field"><span class="lab">Name</span><input class="input" name="name" value="${esc(u.name)}"></label>
        <label class="field"><span class="lab">Email</span><input class="input" name="email" type="email" value="${esc(u.email)}"></label>
      </div>
      <label class="field"><span class="lab">Phone</span><input class="input" name="phone" value="${esc(u.phone || '')}" placeholder="+1 555 0100"></label>
      ${isFixer ? `
        <label class="field"><span class="lab">Short bio</span><textarea class="input" name="bio" placeholder="Tell clients what you're great at.">${esc(u.bio || '')}</textarea></label>
        <div class="two">
          <label class="field"><span class="lab">Years of experience</span><select class="input" name="experience">${expOpts.map(o => `<option ${u.experience === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>
          <label class="field"><span class="lab">How you work</span><select class="input" name="work_mode">${modeOpts.map(o => `<option ${u.work_mode === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>
        </div>
        <label class="field"><span class="lab">What you can fix</span><div class="qchips" id="profile-skills">${chips}</div></label>
        <label class="field"><span class="lab">Other speciality <span class="opt">comma-separate for more</span></span><input class="input" id="profile-custom-skills" value="${esc(customSkills.join(', '))}"></label>
        <div class="field"><span class="lab">CV / résumé</span>
          <label class="upload" id="pf-cv-drop">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>
            <div><strong id="pf-cv-label">${u.cv ? 'Replace your CV' : 'Upload your CV'}</strong> <span class="cv-hint">PDF or Word, up to 8 MB</span></div>
            <input type="file" id="pf-cv-input" accept=".pdf,.doc,.docx,application/pdf" hidden>
          </label>
          ${u.cv ? `<a class="cv-link" href="${u.cv}" target="_blank" rel="noopener">📄 View current CV ↗</a>` : ''}
        </div>
      ` : ''}
      <hr class="profile-sep">
      <div class="profile-sec-title">Change password</div>
      <label class="field"><span class="lab">Current password</span><input class="input" name="currentPassword" type="password" placeholder="••••••••"></label>
      <div class="two">
        <label class="field"><span class="lab">New password</span><input class="input" name="newPassword" type="password" placeholder="••••••••"></label>
        <label class="field"><span class="lab">Repeat new password</span><input class="input" name="newPassword2" type="password" placeholder="••••••••"></label>
      </div>
      <span class="field-hint" style="margin-top:-.35rem">At least 8 characters, 1 number, 1 capital letter</span>
      <button class="btn btn-primary btn-block" type="submit" style="margin-top:.8rem">Save changes</button>
    </form>`;
  const sk = $('#profile-skills');
  if (sk) sk.addEventListener('click', e => { const ch = e.target.closest('.chip'); if (ch) ch.classList.toggle('on'); });
  $('#profile-form').addEventListener('submit', saveProfile);
  wireAvatarPicker('pf', async file => {
    const fd = new FormData(); fd.append('avatar', file);
    try { const { user } = await api('/api/profile/avatar', { form: fd }); setAuth(user); toast('Photo updated.'); }
    catch (err) { toast(err.message, true); }
  });
  $('#pf-cv-input')?.addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    const fd = new FormData(); fd.append('cv', file);
    try { const { user } = await api('/api/profile/cv', { form: fd }); setAuth(user); toast('CV updated.'); renderProfile(); }
    catch (err) { toast(err.message, true); }
  });
}

async function saveProfile(e) {
  e.preventDefault();
  const f = e.target; clearFieldErrs(f);
  let ok = true;
  if (!f.name.value.trim()) { fieldErr(f.name, 'Name is required.'); ok = false; }
  if (!f.email.value.trim()) { fieldErr(f.email, 'Email is required.'); ok = false; }
  if (f.newPassword.value) {
    if (!f.currentPassword.value) { fieldErr(f.currentPassword, 'Enter your current password to change it.'); ok = false; }
    const pe = passwordError(f.newPassword.value); if (pe) { fieldErr(f.newPassword, pe); ok = false; }
    if (f.newPassword.value !== f.newPassword2.value) { fieldErr(f.newPassword2, 'The new passwords don\'t match.'); ok = false; }
  }
  const body = {
    name: f.name.value, email: f.email.value, phone: f.phone.value,
    currentPassword: f.currentPassword.value, newPassword: f.newPassword.value,
  };
  if (state.user.role === 'fixer') {
    body.bio = f.bio.value; body.experience = f.experience.value; body.work_mode = f.work_mode.value;
    body.skills = $$('#profile-skills .chip.on').map(c => c.getAttribute('data-skill'));
    body.custom_skills = ($('#profile-custom-skills').value || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!body.skills.length && !body.custom_skills.length) { blockErr('#profile-skills', 'Pick or type at least one thing you can fix.'); ok = false; }
  }
  if (!ok) return;
  try {
    const { user } = await api('/api/profile', { body });
    setAuth(user); renderProfile();
    toast('Profile updated.');
  } catch (err) {
    if (/email/i.test(err.message)) fieldErr(f.email, err.message);
    else if (/current password/i.test(err.message)) fieldErr(f.currentPassword, err.message);
    else toast(err.message, true);
  }
}

/* ==================================================================
   BOOT
================================================================== */
(async function init() {
  state.user = readAuthCache();      // instantly restore the last-known login (no flash)
  renderNav();
  // Confirm with the server + load categories in parallel.
  /* Called by i18n.js after the language switch. The DOM translator handles all
     the copy on its own; this exists for the parts a text swap cannot reach —
     dates and numbers already formatted in the previous locale, which only a
     fresh render will restate. */
  window.__i18nRerender = () => {
    renderNav();
    const cur = VIEWS.find(v => $('#view-' + v)?.classList.contains('active'));
    if (cur === 'dashboard') renderDashboard(true);
    else if (cur === 'profile') renderProfile();
    else if (cur === 'reviews') renderReviews();
    else if (cur === 'fixers') renderFixers();
  };

  const cats = loadCategories();
  const me = api('/api/me').then(r => setAuth(r.user)).catch(() => {});
  await Promise.allSettled([cats, me]);
  // Open the view that matches the current URL (deep link / refresh / first load).
  const initialView = VIEW_BY_PATH[location.pathname] || 'home';
  const initialHash = location.hash ? location.hash.slice(1) : null;
  go(initialView, initialHash, false);
})();
