# Van Seat Reservation

Wedding shuttle-van seat reservation web app. **Front-end only** for now —
bookings live in browser memory and reset on refresh (nothing is shared
between users yet). Built to be a drop-in swap to Supabase later; see
[`files/VAN-RESERVATION-HANDOFF.md`](files/VAN-RESERVATION-HANDOFF.md).

## Run it

```bash
npm install
npm run dev
```

Then open the printed local URL (default http://localhost:5173).

Build for hosting (Vercel / Netlify):

```bash
npm run build && npm run preview
```

## What's here

- **Book a seat** — pick point → van + trip → passenger names + booker contact
  (name, phone, optional email) → confirmation with a booking reference.
- **Manage booking** — look up by reference (e.g. `VAN-7QK2`) to edit passengers
  or cancel.
- **View bookings** — organizer panel: every booking grouped by van-run, with
  per-run seat counts, cancel, and CSV export.

Structure: 2 points × 2 vans each × 2 trips = 8 runs, 10 seats each = 80 seats.

## Where to edit

| Change | File |
|---|---|
| Event details, pickup names/notes, trip times, date, seat cap | `src/config.js` |
| Storage / going live with Supabase | `src/store.js` (the one swap point) |
| Look & feel | `src/styles.js` |
| Screens & flow | `src/App.jsx` |

### Config notes

- **Placeholders:** pickup names ("Hotel Lobby", "Church Courtyard") and the
  date-less header are placeholders — set the real strings and `EVENT_DATE` in
  `src/config.js`.
- **Per-booker cap** (`MAX_PER_BOOKER`) is `10` = the run capacity, so it adds
  no real limit today. Lower it (e.g. `6`) to cap group size per booker.

## Going live (Supabase)

`src/store.js` is the only file that knows how bookings are stored. Each method
(`createBooking`, `updateBooking`, `cancelBooking`, `seatsLeft`, `findByRef`)
has a documented Supabase equivalent in the handoff. Swap the bodies for the
`book_seats` RPC + `seats_left` view (with a realtime subscription) and the
rest of the UI is unchanged. **Front-end-only caveat:** the in-memory capacity
check is UX only; real overbooking protection must be the server-side
`book_seats` function.
