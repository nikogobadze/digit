# Digit

A friendly IT-help marketplace. Everyday people post a tech problem; a **manager**
triages it and agrees on a fair price; a qualified **fixer** picks it up; the
**client** confirms it's fixed. An **admin** promotes/demotes staff.

Built to be the *easiest* full stack to run on Windows:

| Layer    | Choice                          | Why |
|----------|---------------------------------|-----|
| Server   | Node + Express                  | tiny, ubiquitous; exported for Vercel |
| Database | **libSQL** (SQLite)             | local `digit.db` file in dev, Turso in the cloud — same SQL |
| Auth     | JWT in an httpOnly cookie + bcrypt | stateless, survives restarts |
| Uploads  | local disk in dev, **Vercel Blob** in prod | persists on serverless |
| Frontend | one `index.html` + `app.js`     | extends the original Digit prototype |

## Run it

```bash
npm install
npm start
```

Then open **http://localhost:3000**. The database (`digit.db`) and demo
accounts are created automatically on first run.

> Dev tip: `npm run dev` restarts on file changes.

## Demo accounts

| Role    | Email                | Password     |
|---------|----------------------|--------------|
| Admin   | admin@digit.app      | `admin123`   |
| Manager | manager@digit.app    | `manager123` |
| Fixer   | alex@digit.app       | `fixer123`   (hardware, OS, network, security) |
| Fixer   | sam@digit.app        | `fixer123`   (web, backend, mobile, data) |
| Client  | client@digit.app     | `client123`  |

You can also register fresh **client** and **fixer** accounts from the UI.

## The workflow

```
Client posts problem (+ photo, + suggested price)
        │  status: submitted
        ▼
Manager reviews ──approve──▶ open ──manager assigns a fixer──▶ assigned
        │            (ready to assign)                            │ fixer marks done
        └─counter price──▶ price_countered                        ▼
                              │  client accepts──▶ open          work_done
                              └  client declines─▶ declined       │ client confirms
                                                                  ▼
                                                              completed
```

- **The manager hand-picks the fixer.** Tasks never sit in a shared pool for
  fixers to grab. Once a price is agreed the task is "ready to assign", and a
  manager — who knows their fixers personally — assigns it to exactly one of them.
  They can do this in the review step or later from the *Ready to assign* queue.
- **Skills are a hint, not a gate.** The shared taxonomy (a client's category ==
  a fixer's skill key) surfaces matching fixers first in the assign picker, but the
  manager may assign anyone they judge best for the job.
- A fixer only ever sees the jobs **assigned to them** — there is no browse/accept.
- If a fixer can't finish, a manager **reassigns** (unassign → back to *ready to
  assign* → pick a different fixer).
- The **manager's price explanation** is shown to the client in plain language.

## Roles & permissions

- **client** — post problems, respond to price suggestions, confirm completion.
- **fixer** — register qualifications, work the jobs a manager assigns, mark done.
- **manager** — review queue, approve or counter prices, and **assign each task to
  a specific fixer**; can reassign in-progress work.
- **admin** — everything a manager can do, plus promote/demote
  fixer ⇄ manager ⇄ admin. The first seeded admin is protected and can't be changed.

## Project layout

```
server.js        Express app + all API routes (exported for Vercel)
db.js            libSQL schema, shared taxonomy, seed data
vercel.json      Vercel routing config
public/
  index.html     UI (landing, auth, post flow, dashboards)
  app.js         SPA logic + API calls
uploads/         local-dev image storage (Vercel Blob in production)
```

## Deploy to Vercel

The app runs on Vercel using **Turso (libSQL)** for the database and **Vercel Blob**
for uploaded images (local dev still uses a `digit.db` file + the `uploads/` folder —
no setup needed).

1. **Create a Turso database** at https://turso.tech → copy its **Database URL**
   (`libsql://...`) and create an **auth token**.
2. **Import this repo into Vercel** (New Project → pick the GitHub repo).
3. In the project's **Storage** tab, create a **Blob** store and connect it
   (this auto-adds `BLOB_READ_WRITE_TOKEN`).
4. In **Settings → Environment Variables** add:
   - `DATABASE_URL` = your Turso URL
   - `DATABASE_AUTH_TOKEN` = your Turso token
   - `JWT_SECRET` = a long random string
5. **Deploy.** On first boot the schema is created and demo accounts are seeded.

Config lives in `vercel.json` (routes everything to the Express app, which is
exported from `server.js`).

## Notes for going to production

Already handled: hosted DB, blob image storage, simulated payments, a strong
`JWT_SECRET` via env var. Still worth adding before a real launch: real
email/SMS notifications, actual payment processing, rate limiting, and tests.
