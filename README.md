# Van Seat Reservation

Wedding shuttle-van seat reservation web app (Vite + React).

It runs on one of two backends, chosen automatically:

- **Supabase** — when `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` are set.
  Real, shared, multi-user bookings with atomic (overbooking-proof) seat math
  and live seat counts.
- **In-memory fallback** — when those are absent. A self-contained demo;
  bookings live in browser memory and reset on refresh. Handy for local UI work.

Structure: 2 points × 2 vans each × 2 trips = 8 runs, 10 seats each = 80 seats.
Origin spec: [`files/VAN-RESERVATION-HANDOFF.md`](files/VAN-RESERVATION-HANDOFF.md).

## Run it

```bash
npm install
npm run dev
```

Open the printed local URL (default http://localhost:5173). With no `.env`, it
runs the in-memory demo. Build for hosting (Vercel / Netlify):

```bash
npm run build && npm run preview
```

## What's here

- **Book a seat** — pick point → van + trip → passenger names + booker contact
  (name, phone, optional email) → confirmation with a booking reference.
- **Manage booking** — look up by reference (e.g. `VAN-7QK2A`) to edit
  passengers or cancel.
- **View bookings** — organizer panel: every booking grouped by van-run with
  per-run seat counts, cancel, and CSV export. On Supabase it's **passcode-
  gated** (so guest contact details aren't public); in the local demo it's open.

## Going live with Supabase

1. **Create env file** — copy `.env.example` to `.env` and fill in your Project
   URL + anon (public) key from Supabase → Project Settings → API.

   ```bash
   cp .env.example .env
   ```

2. **Run the schema** — in the Supabase SQL editor, paste and run
   [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).
   It creates the tables, the `seats_left` view, the atomic `book_seats` RPC,
   the guest self-service RPCs, the organizer list, and Row-Level Security.

3. **Set the organizer passcode** — run this privately in the SQL editor
   (do **not** commit the value). It's what the "View bookings" panel asks for:

   ```sql
   insert into admin_config (id, passcode) values (1, 'choose-a-secret')
   on conflict (id) do update set passcode = excluded.passcode;
   ```

4. **Run it** — `npm run dev`. The footer should read "Live · seats update in
   real time". Test overbooking by opening two tabs and grabbing the last seats
   at once — exactly one should succeed.

### Deploy (Vercel / Netlify)

`npm run build`, connect the repo, and add the two `VITE_SUPABASE_*` env vars in
the host's dashboard. The anon key is safe in the browser — all enforcement is
in the Postgres functions behind RLS.

## Where to edit

| Change | File |
|---|---|
| Event details, pickup names/notes, trip times, date, seat cap | `src/config.js` |
| Which backend / storage details | `src/store.js` (selector), `src/store.supabase.js`, `src/store.memory.js` |
| Database schema + RPCs + RLS | `supabase/migrations/0001_init.sql` |
| Look & feel | `src/styles.js` |
| Screens & flow | `src/App.jsx` |

### Notes

- **Placeholders:** pickup names ("Hotel Lobby", "Church Courtyard") and the
  date-less header are placeholders. Set the real strings + `EVENT_DATE` in
  `src/config.js`, and keep the seed rows in `0001_init.sql` in sync.
- **Per-booker cap** is `10` = the run capacity, so it adds no real limit today.
  To cap group size per booker, lower `MAX_PER_BOOKER` in `src/config.js` **and**
  `_max_per_booker()` in the SQL (the server value is the one that's enforced).
- **Security model:** the anon key never reads raw `bookings`. Guests act on
  their own booking via its reference; the organizer list requires the passcode.
  The client-side seat check is UX only — `book_seats` is the real enforcement.
