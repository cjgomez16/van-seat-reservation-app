# Van Seat Reservation — Developer Handoff

This document explains how to take the front-end demo (`van-reservation-demo.jsx`)
to a production web app with a real, multi-user backend.

---

## 1. What the demo is / isn't

**Is:** the complete UI/UX and booking flow — pick point → pick van + trip →
enter names + booker contact → confirm. Rustic wedding styling. All logic for
seat math, name lists, and validation is real.

**Isn't:** persistent. State lives in React memory (`useState`), so seats reset
on refresh and nothing is shared between users. The `initialBooked()` map just
seeds a few counts so you can see the "few left" and "full" states.

**Your job:** replace the in-memory `booked` state and the `submitBooking()`
mutation with Supabase calls, keeping the same UI.

---

## 2. Data model

Fixed structure (does not change per event):

- **Points:** A (Hotel Lobby) → Van 1, Van 2 · B (Church Courtyard) → Van 3, Van 4
- **Trips:** t1 = 11:15–11:30 AM (First) · t2 = 12:15–12:30 PM (Second)
- **Van-run** = one van on one trip. 4 vans × 2 trips = **8 runs**, 10 seats each = **80 seats**.

A booking always lands on **one van-run** (same van + same trip for all names).

---

## 3. Recommended stack

- **Front-end:** the existing React component (Vite or Next.js). Host on **Vercel** or **Netlify** (free tier is plenty).
- **Backend:** **Supabase** (Postgres + auto REST + real-time + RPC). Free tier covers this easily.
- No custom server needed — the browser talks to Supabase directly with the **anon** key, and all capacity enforcement happens inside a Postgres function (so the client can't overbook even though it holds the key).

---

## 4. Supabase schema

Run this in the Supabase SQL editor.

```sql
-- Fixed catalogue of the 8 van-runs
create table van_runs (
  id          text primary key,          -- e.g. 'v1-t1'
  point_id    text not null,             -- 'A' | 'B'
  point_name  text not null,
  point_note  text not null,
  van_id      text not null,             -- 'v1'..'v4'
  van_name    text not null,             -- 'Van 1'..
  trip_id     text not null,             -- 't1' | 't2'
  trip_label  text not null,             -- 'First Trip'
  trip_time   text not null,             -- '11:15 – 11:30 AM'
  capacity    int  not null default 10
);

-- One row per booking (a group of passengers on one run)
create table bookings (
  id           uuid primary key default gen_random_uuid(),
  run_id       text not null references van_runs(id),
  booker_name  text not null,
  booker_phone text not null,
  passengers   text[] not null,          -- array of names
  seats        int  not null,            -- = array_length(passengers)
  created_at   timestamptz not null default now()
);

create index on bookings(run_id);

-- Seed the 8 runs
insert into van_runs (id, point_id, point_name, point_note, van_id, van_name, trip_id, trip_label, trip_time) values
('v1-t1','A','Pickup Point A','Hotel Lobby','v1','Van 1','t1','First Trip','11:15 – 11:30 AM'),
('v1-t2','A','Pickup Point A','Hotel Lobby','v1','Van 1','t2','Second Trip','12:15 – 12:30 PM'),
('v2-t1','A','Pickup Point A','Hotel Lobby','v2','Van 2','t1','First Trip','11:15 – 11:30 AM'),
('v2-t2','A','Pickup Point A','Hotel Lobby','v2','Van 2','t2','Second Trip','12:15 – 12:30 PM'),
('v3-t1','B','Pickup Point B','Church Courtyard','v3','Van 3','t1','First Trip','11:15 – 11:30 AM'),
('v3-t2','B','Pickup Point B','Church Courtyard','v3','Van 3','t2','Second Trip','12:15 – 12:30 PM'),
('v4-t1','B','Pickup Point B','Church Courtyard','v4','Van 4','t1','First Trip','11:15 – 11:30 AM'),
('v4-t2','B','Pickup Point B','Church Courtyard','v4','Van 4','t2','Second Trip','12:15 – 12:30 PM');
```

### Live seats-left view

```sql
create view seats_left as
select
  r.id            as run_id,
  r.capacity,
  r.capacity - coalesce(sum(b.seats), 0) as left
from van_runs r
left join bookings b on b.run_id = r.id
group by r.id, r.capacity;
```

---

## 5. Atomic booking function (prevents overbooking)

**This is the important part.** Never decrement seats in the browser. Two guests
grabbing the last seats at once would both "succeed" client-side. Do the
check-and-insert in one Postgres transaction with a row lock:

```sql
create or replace function book_seats(
  p_run_id       text,
  p_booker_name  text,
  p_booker_phone text,
  p_passengers   text[]
) returns bookings
language plpgsql
as $$
declare
  v_cap    int;
  v_taken  int;
  v_seats  int := array_length(p_passengers, 1);
  v_row    bookings;
begin
  if v_seats is null or v_seats < 1 then
    raise exception 'NO_PASSENGERS';
  end if;

  -- Lock the run row so concurrent bookings serialize
  select capacity into v_cap from van_runs where id = p_run_id for update;
  if v_cap is null then
    raise exception 'RUN_NOT_FOUND';
  end if;

  select coalesce(sum(seats), 0) into v_taken from bookings where run_id = p_run_id;

  if v_taken + v_seats > v_cap then
    raise exception 'NOT_ENOUGH_SEATS: % left', v_cap - v_taken;
  end if;

  insert into bookings (run_id, booker_name, booker_phone, passengers, seats)
  values (p_run_id, p_booker_name, p_booker_phone, p_passengers, v_seats)
  returning * into v_row;

  return v_row;
end;
$$;
```

### Row-Level Security

Enable RLS so the anon key can only read runs/seats and call the function —
not read others' bookings or write raw rows.

```sql
alter table van_runs enable row level security;
alter table bookings  enable row level security;

-- Anyone may read the run catalogue
create policy "read runs" on van_runs for select using (true);

-- No direct select/insert on bookings from anon; force use of the RPC.
-- (Grant execute on the function to the anon role.)
grant execute on function book_seats(text, text, text, text[]) to anon;
```

Expose `seats_left` for reads (it aggregates counts only, no personal data):

```sql
grant select on seats_left to anon;
```

---

## 6. Front-end wiring

Install the client:

```bash
npm install @supabase/supabase-js
```

```js
// lib/supabase.js
import { createClient } from "@supabase/supabase-js";
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
```

### Replace the three demo touch-points

**A. Initial load — fetch live counts instead of `initialBooked()`:**

```js
const [seatsMap, setSeatsMap] = useState({}); // { 'v1-t1': 3, ... } = seats LEFT

useEffect(() => {
  supabase.from("seats_left").select("run_id,left").then(({ data }) => {
    if (data) setSeatsMap(Object.fromEntries(data.map(r => [r.run_id, r.left])));
  });
}, []);
```

Then change `seatsLeft()` in the component to read from `seatsMap` instead of
computing from `booked`:

```js
const seatsLeft = (vanId, tripId) => seatsMap[`${vanId}-${tripId}`] ?? 0;
```

**B. Real-time updates — seats change as others book:**

```js
useEffect(() => {
  const ch = supabase
    .channel("bookings")
    .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "bookings" },
        () => {
          supabase.from("seats_left").select("run_id,left").then(({ data }) => {
            if (data) setSeatsMap(Object.fromEntries(data.map(r => [r.run_id, r.left])));
          });
        })
    .subscribe();
  return () => supabase.removeChannel(ch);
}, []);
```

**C. Submit — call the RPC instead of the in-memory `setBooked`:**

```js
async function submitBooking() {
  setError("");
  const clean = names.map(n => n.trim()).filter(Boolean);
  if (!booker.name.trim())  return setError("Please enter the booker's name.");
  if (!booker.phone.trim()) return setError("Please enter a contact number.");
  if (clean.length === 0)   return setError("Please enter at least one passenger name.");

  const { data, error: rpcErr } = await supabase.rpc("book_seats", {
    p_run_id: `${selectedRun.vanId}-${selectedRun.tripId}`,
    p_booker_name: booker.name.trim(),
    p_booker_phone: booker.phone.trim(),
    p_passengers: clean,
  });

  if (rpcErr) {
    // e.g. 'NOT_ENOUGH_SEATS: 2 left' — surface a friendly message
    if (rpcErr.message.includes("NOT_ENOUGH_SEATS")) {
      return setError("Sorry — those seats were just taken. Please pick again.");
    }
    return setError("Something went wrong. Please try again.");
  }

  // build confirmation from selectedRun + clean (as the demo already does)
  setStep("done");
}
```

Everything else in the component — the flow, the styling, the name list,
the client-side "not more than seats left" guard — stays as-is. The client
guard is just UX; the RPC is the real enforcement.

---

## 7. Admin / viewing bookings

The organizer needs the passenger list. Options:

- **Simplest:** view the `bookings` table in the Supabase dashboard, or export CSV.
- **Nicer:** a tiny password-gated `/admin` page that reads `bookings` via a
  service-role key (server-side only — never ship the service key to the browser).
- Optional: a Supabase Database Webhook / Edge Function to email or Slack the
  organizer on each new booking.

---

## 8. Deploy checklist

1. Create Supabase project → run the SQL in sections 4 & 5.
2. Copy Project URL + anon key into `.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
3. Wire the three touch-points (section 6).
4. `npm run build`, push to GitHub, connect to Vercel/Netlify, add the two env vars.
5. Test overbooking: open two tabs, book the last seats simultaneously — one must fail.
6. Share the URL (or a short link / custom domain) with guests.

---

## 9. Things to confirm with the client before launch

- Pickup point **names/notes** ("Hotel Lobby", "Church Courtyard") — placeholders.
- Whether to **cap total seats per booker** (e.g. no one grabs all 10).
- Whether to collect **email** in addition to phone (for confirmations).
- Whether bookings should be **editable/cancelable** by guests (adds a lookup flow).
- Event **date** — the demo shows times only; add the date to the header/ticket.
