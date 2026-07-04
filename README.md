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
Manager reviews ──approve──▶ open ──fixer accepts──▶ assigned
        │                                                │ fixer marks done
        └─counter price──▶ price_countered               ▼
                              │  client accepts──▶ open   work_done
                              └  client declines─▶ declined│ client confirms
                                                           ▼
                                                       completed
```

- **Matching** is by a shared taxonomy: the categories a client picks are the
  same keys a fixer registers as skills, so a fixer only sees jobs they qualify for.
- **First fixer to accept wins** — the claim is an atomic DB update guarded on
  `status='open' AND assigned_fixer_id IS NULL`.
- The **manager's price explanation** is shown to the client in plain language.

## Roles & permissions

- **client** — post problems, respond to price suggestions, confirm completion.
- **fixer** — register qualifications, see/accept matching jobs, mark done.
- **manager** — review queue, approve or counter prices, see all tasks.
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
