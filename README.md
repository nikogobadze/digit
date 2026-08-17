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

## Analytics

The **Analytics** tab on the admin dashboard reports on the whole business:
money, the task funnel, worker performance, categories, pricing and clients.

- **Money is three separate figures**, because they answer different questions:
  *collected* (paid), *booked* (agreed value of completed work) and
  *outstanding* (completed but not yet paid). There is no commission model —
  these are gross client payments.
- **Range**: presets from 7 days to all time, plus a custom from/to window.
  Charts re-bucket themselves — daily, weekly or monthly — to suit the range.
- **Managers get the same page for their own tasks**, with every money figure
  omitted server-side. They see throughput, worker scores and how their pricing
  moved, not revenue.
- Every chart ships with a table view and a CSV export, the page prints cleanly,
  and clicking a worker opens their individual breakdown.
- Unlike the other dashboards (which poll every 10 seconds), Analytics refreshes
  every 10 minutes and has a **Refresh** button — these are aggregate queries.

Stage timings (how long pricing, assignment and the fix itself take) come from
real timestamp columns on `tasks`, written by the routes that cause each
transition. Tasks created before those columns existed are backfilled once from
the event trail; anything that can't be established stays empty rather than
being counted as zero.

**To see it with data**, a fresh database has no tasks — run:

```bash
node scripts/seed-demo.js        # ~180 tasks across the last 12 months
node scripts/seed-demo.js --reset  # remove them again
```

It only touches the local `digit.db` and refuses to run if `DATABASE_URL` is set.

To get that same data into the **hosted** database (so the deployed site isn't
empty), upload the local file once the database exists — see
[Seeding the hosted database](#seeding-the-hosted-database).

## Project layout

```
server.js        Express app + all API routes (exported for Vercel)
db.js            libSQL schema, shared taxonomy, urgency fees, seed data
analytics.js     every figure the Analytics page shows, aggregated in SQL
vercel.json      Vercel routing config
public/
  index.html     UI (landing, auth, post flow, dashboards)
  app.js         SPA logic + API calls
  charts.js      dependency-free SVG chart primitives
  analytics.js   the Analytics tab (range control, cards, CSV, drill-down)
scripts/
  seed-demo.js      dev-only: fills the local DB with a year of sample tasks
  push-to-remote.js uploads the local digit.db to the hosted (Turso) database
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

> Steps 1 and 4 can be done in one go with the Vercel CLI, which provisions a
> Turso database on the Marketplace and writes the two variables for you:
>
> ```bash
> vercel link
> vercel integration add tursocloud/database --plan starter -m region=hnd1
> ```
>
> The Marketplace names its variables `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN`;
> the app reads `DATABASE_URL` / `DATABASE_AUTH_TOKEN`, so alias them once with
> `vercel env add`.

### Seeding the hosted database

A fresh deployment only gets the five demo accounts from `db.js`, so the
Analytics page has nothing to draw. To give it the same year of data you have
locally, upload `digit.db` wholesale:

```bash
vercel env pull .env.local        # fetch DATABASE_URL + DATABASE_AUTH_TOKEN
node scripts/push-to-remote.js    # copy every row up
```

It copies `users`, `fixer_skills`, `tasks` and `task_events` **keeping their
primary keys**, so every foreign key still resolves, then re-counts both sides
and fails loudly if they disagree. It refuses to touch a database that already
has rows unless you pass `--replace` (which wipes those four tables first), and
`--dry-run` reports what it would do without writing.

## Notes for going to production

Already handled: hosted DB, blob image storage, simulated payments, a strong
`JWT_SECRET` via env var. Still worth adding before a real launch: real
email/SMS notifications, actual payment processing, rate limiting, and tests.
