import React, { useState, useMemo, useEffect } from "react";
import {
  POINTS,
  TRIPS,
  EVENT_DATE,
  COUPLE,
  VENUE,
  SEATS_PER_RUN,
  runKey,
  findPoint,
  findTrip,
  findVanPoint,
} from "./config.js";
import { useBookings, BACKEND } from "./store.js";
import { S, GLOBAL_CSS } from "./styles.js";

const TOTAL_SEATS = POINTS.reduce(
  (n, p) => n + p.vans.length * TRIPS.length * SEATS_PER_RUN,
  0
);

export default function App() {
  const store = useBookings();
  const [view, setView] = useState("book"); // book | manage | admin

  return (
    <div style={S.page}>
      <style>{GLOBAL_CSS}</style>
      <div style={S.frame}>
        <Header />
        <Nav view={view} setView={setView} />

        {view === "book" && <BookFlow store={store} />}
        {view === "manage" && <ManageView store={store} />}
        {view === "admin" && <AdminView store={store} />}

        <Footer />
      </div>
    </div>
  );
}

/* ---------- Booking flow (pick point → van → form → done) ---------- */

function BookFlow({ store }) {
  const [step, setStep] = useState("point"); // point | van | form | done
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [selectedRun, setSelectedRun] = useState(null); // { vanId, vanName, tripId }
  const [names, setNames] = useState([""]);
  const [booker, setBooker] = useState({ name: "", phone: "", email: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState(null);

  const point = useMemo(() => findPoint(selectedPoint), [selectedPoint]);
  const filledNames = names.map((n) => n.trim()).filter(Boolean);

  function resetToStart() {
    setStep("point");
    setSelectedPoint(null);
    setSelectedRun(null);
    setNames([""]);
    setBooker({ name: "", phone: "", email: "" });
    setError("");
    setConfirmation(null);
  }

  function chooseRun(vanId, vanName, tripId) {
    if (store.seatsLeft(vanId, tripId) <= 0) return;
    setSelectedRun({ vanId, vanName, tripId });
    setNames([""]);
    setError("");
    setStep("form");
  }

  async function submitBooking() {
    setError("");
    const { vanId, tripId } = selectedRun;
    const clean = names.map((n) => n.trim()).filter(Boolean);

    const err = validateBooking(booker, clean);
    if (err) return setError(err);

    setBusy(true);
    const res = await store.createBooking({
      runId: runKey(vanId, tripId),
      bookerName: booker.name.trim(),
      bookerPhone: booker.phone.trim(),
      bookerEmail: booker.email.trim(),
      passengers: clean,
    });
    setBusy(false);

    if (!res.ok) return setError(bookingErrorMessage(res));

    const trip = findTrip(tripId);
    setConfirmation({
      ref: res.booking.ref,
      van: selectedRun.vanName,
      point: point.name,
      pointNote: point.note,
      trip: trip.label,
      time: trip.time,
      names: clean,
      booker: { ...booker },
    });
    setStep("done");
  }

  return (
    <>
      {step === "point" && (
        <PointStep
          loading={store.loading}
          onPick={(id) => {
            setSelectedPoint(id);
            setStep("van");
          }}
          seatsLeft={store.seatsLeft}
        />
      )}

      {step === "van" && point && (
        <VanStep
          point={point}
          seatsLeft={store.seatsLeft}
          onBack={() => {
            setStep("point");
            setSelectedPoint(null);
          }}
          onChoose={chooseRun}
        />
      )}

      {step === "form" && selectedRun && (
        <FormStep
          heading="Passenger details"
          point={point}
          run={selectedRun}
          names={names}
          setNames={setNames}
          booker={booker}
          setBooker={setBooker}
          seatsLeft={store.seatsLeft(selectedRun.vanId, selectedRun.tripId)}
          filledCount={filledNames.length}
          error={error}
          busy={busy}
          onBack={() => {
            setStep("van");
            setSelectedRun(null);
            setError("");
          }}
          onSubmit={submitBooking}
          submitVerb="Reserve"
        />
      )}

      {step === "done" && confirmation && (
        <DoneStep confirmation={confirmation} onAgain={resetToStart} />
      )}
    </>
  );
}

/* ---------- Manage a booking (look up by reference → edit / cancel) ---------- */

function ManageView({ store }) {
  const [refInput, setRefInput] = useState("");
  const [found, setFound] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [editing, setEditing] = useState(false);
  const [names, setNames] = useState([""]);
  const [booker, setBooker] = useState({ name: "", phone: "", email: "" });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function doLookup() {
    setMessage("");
    setEditing(false);
    setBusy(true);
    const b = await store.findByRef(refInput);
    setBusy(false);
    setFound(b);
    setNotFound(!b);
  }

  function startEdit() {
    setError("");
    setNames(found.passengers.length ? [...found.passengers] : [""]);
    setBooker({
      name: found.bookerName,
      phone: found.bookerPhone,
      email: found.bookerEmail || "",
    });
    setEditing(true);
  }

  async function saveEdit() {
    setError("");
    const clean = names.map((n) => n.trim()).filter(Boolean);
    const err = validateBooking(booker, clean);
    if (err) return setError(err);

    setBusy(true);
    const res = await store.updateBooking(found.ref, {
      bookerName: booker.name.trim(),
      bookerPhone: booker.phone.trim(),
      bookerEmail: booker.email.trim(),
      passengers: clean,
    });
    setBusy(false);
    if (!res.ok) return setError(bookingErrorMessage(res));

    setFound(res.booking);
    setEditing(false);
    setMessage("Your booking has been updated.");
  }

  async function cancel() {
    if (!window.confirm("Cancel this booking? This frees the seats for others."))
      return;
    setBusy(true);
    const res = await store.cancelBooking(found.ref);
    setBusy(false);
    if (!res.ok) return setError(bookingErrorMessage(res));
    setFound(null);
    setRefInput("");
    setMessage("Your booking has been cancelled. The seats are now free again.");
  }

  const vp = found ? findVanPoint(found.runId.split("-")[0]) : null;
  const trip = found ? findTrip(found.runId.split("-")[1]) : null;
  // When editing, the booking's own seats are still counted in seatsLeft,
  // so add them back to get the true room available for the edit.
  const editSeatsLeft =
    found && vp && trip
      ? store.seatsLeft(vp.van.id, trip.id) + found.seats
      : 0;

  return (
    <section>
      <StepLabel n="✎">Manage a booking</StepLabel>
      <p style={S.noteText}>
        Enter the booking reference from your confirmation (e.g.{" "}
        <strong>VAN-7QK2A</strong>) to edit passenger names or cancel.
      </p>

      <div style={S.toolbar}>
        <input
          style={{ ...S.input, marginBottom: 0, flex: 1, minWidth: 180 }}
          placeholder="Booking reference"
          value={refInput}
          onChange={(e) => setRefInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && doLookup()}
        />
        <button style={S.secondaryBtn} onClick={doLookup} disabled={busy}>
          {busy ? "…" : "Find"}
        </button>
      </div>

      {message && <div style={{ ...S.summaryBox, marginTop: 4 }}>{message}</div>}
      {notFound && (
        <div style={S.error}>
          No booking found for that reference. Check the code and try again.
        </div>
      )}

      {found && !editing && vp && trip && (
        <>
          <div style={{ ...S.refPill, marginTop: 8 }}>{found.ref}</div>
          <div style={S.ticket}>
            <div style={S.ticketRow}>
              <span>Van</span>
              <strong>{vp.van.name}</strong>
            </div>
            <div style={S.ticketRow}>
              <span>Pickup</span>
              <strong>
                {vp.point.name} ({vp.point.note})
              </strong>
            </div>
            <div style={S.ticketRow}>
              <span>Departure</span>
              <strong>
                {trip.label} · {trip.time}
              </strong>
            </div>
            <div style={S.ticketDivider} />
            <div style={S.ticketRow}>
              <span>Booked by</span>
              <strong>{found.bookerName}</strong>
            </div>
            <div style={S.ticketRow}>
              <span>Contact</span>
              <strong>
                {found.bookerPhone}
                {found.bookerEmail ? ` · ${found.bookerEmail}` : ""}
              </strong>
            </div>
            <div style={{ ...S.ticketRow, alignItems: "flex-start" }}>
              <span>Passengers</span>
              <strong style={{ textAlign: "right" }}>
                {found.passengers.map((n, i) => (
                  <div key={i}>{n}</div>
                ))}
              </strong>
            </div>
          </div>
          <div style={S.toolbar}>
            <button style={S.secondaryBtn} onClick={startEdit} disabled={busy}>
              Edit passengers
            </button>
            <button style={S.dangerBtn} onClick={cancel} disabled={busy}>
              Cancel booking
            </button>
          </div>
        </>
      )}

      {found && editing && vp && trip && (
        <FormStep
          heading="Edit your booking"
          point={vp.point}
          run={{ vanId: vp.van.id, vanName: vp.van.name, tripId: trip.id }}
          names={names}
          setNames={setNames}
          booker={booker}
          setBooker={setBooker}
          seatsLeft={editSeatsLeft}
          filledCount={names.map((n) => n.trim()).filter(Boolean).length}
          error={error}
          busy={busy}
          onBack={() => setEditing(false)}
          onSubmit={saveEdit}
          submitVerb="Save"
        />
      )}
    </section>
  );
}

/* ---------- Admin (organizer view of every booking) ---------- */

function AdminView({ store }) {
  const needsPasscode = BACKEND === "supabase";
  const [passcode, setPasscode] = useState("");
  const [rows, setRows] = useState(needsPasscode ? null : []); // null = not loaded
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load(pass) {
    setError("");
    setBusy(true);
    const res = await store.listBookings(pass);
    setBusy(false);
    if (!res.ok) {
      setRows(null);
      setError(
        res.code === "FORBIDDEN"
          ? "That passcode is not correct."
          : "Could not load bookings. Please try again."
      );
      return;
    }
    setRows(res.bookings);
  }

  // Local (memory) backend: no passcode, load on mount + keep in sync.
  useEffect(() => {
    if (!needsPasscode) load("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsPasscode, store]);

  const bookedSeats =
    TOTAL_SEATS -
    Object.values(store.seatsMap).reduce((s, left) => s + left, 0);

  const grouped = useMemo(() => groupByRun(rows || []), [rows]);

  async function cancelOne(ref) {
    if (!window.confirm(`Cancel ${ref}?`)) return;
    const res = await store.cancelBooking(ref);
    if (res.ok) load(needsPasscode ? passcode : "");
  }

  return (
    <section>
      <StepLabel n="♦">Bookings</StepLabel>
      <p style={S.noteText}>
        Organizer view of every booking.
        {needsPasscode
          ? " Protected by a passcode so guest contact details aren't public."
          : " Local demo — resets on refresh."}
      </p>

      {needsPasscode && rows === null && (
        <div style={S.toolbar}>
          <input
            style={{ ...S.input, marginBottom: 0, flex: 1, minWidth: 180 }}
            type="password"
            placeholder="Organizer passcode"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load(passcode)}
          />
          <button style={S.secondaryBtn} onClick={() => load(passcode)} disabled={busy}>
            {busy ? "…" : "View bookings"}
          </button>
        </div>
      )}

      {error && <div style={S.error}>{error}</div>}

      {rows !== null && (
        <>
          <div style={S.statRow}>
            <span>
              <strong>{bookedSeats}</strong> / {TOTAL_SEATS} seats booked
            </span>
            <span>
              <strong>{rows.length}</strong> booking{rows.length === 1 ? "" : "s"}
            </span>
          </div>

          <div style={S.toolbar}>
            <button
              style={S.secondaryBtn}
              onClick={() => exportCsv(rows)}
              disabled={rows.length === 0}
            >
              Export CSV
            </button>
            <button
              style={S.secondaryBtn}
              onClick={() => load(needsPasscode ? passcode : "")}
              disabled={busy}
            >
              Refresh
            </button>
          </div>

          {rows.length === 0 && <div style={S.emptyState}>No bookings yet.</div>}

          {grouped.map((r) => {
            const taken = r.list.reduce((n, b) => n + b.seats, 0);
            return (
              <div key={r.id} style={S.runGroup}>
                <div style={S.runGroupHead}>
                  <span>
                    {r.van.name} · {r.trip.label}
                  </span>
                  <span style={{ fontSize: 14, color: "#a4562a" }}>
                    {taken}/{SEATS_PER_RUN} seats
                  </span>
                </div>
                <div style={{ fontSize: 13, color: "#8a7150", marginTop: -6 }}>
                  {r.point.name} — {r.point.note} · {r.trip.time}
                </div>
                {r.list.map((b) => (
                  <div key={b.ref} style={S.bookingCard}>
                    <div style={S.bookingHeadRow}>
                      <div>
                        <strong>{b.bookerName}</strong>{" "}
                        <span style={{ color: "#a4562a" }}>({b.ref})</span>
                        <div style={S.meta}>
                          {b.bookerPhone}
                          {b.bookerEmail ? ` · ${b.bookerEmail}` : ""} · {b.seats}{" "}
                          seat{b.seats === 1 ? "" : "s"}
                        </div>
                        <div style={S.meta}>{b.passengers.join(", ")}</div>
                      </div>
                      <button style={S.dangerBtn} onClick={() => cancelOne(b.ref)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </>
      )}
    </section>
  );
}

// Group a flat booking list into the run rows the admin panel renders.
function groupByRun(list) {
  const map = new Map();
  for (const b of list) {
    if (!map.has(b.runId)) {
      const vp = findVanPoint(b.runId.split("-")[0]);
      const trip = findTrip(b.runId.split("-")[1]);
      map.set(b.runId, {
        id: b.runId,
        point: vp?.point ?? { name: "?", note: "" },
        van: vp?.van ?? { name: "?" },
        trip: trip ?? { label: "?", time: "" },
        list: [],
      });
    }
    map.get(b.runId).list.push(b);
  }
  return [...map.values()];
}

/* ---------- Shared sub-components ---------- */

function Header() {
  return (
    <header style={S.header}>
      <div style={S.sprig}>❧</div>
      <p style={S.eyebrow}>The wedding of</p>
      <p style={S.coupleNames}>{COUPLE}</p>
      <p style={S.eventMeta}>
        {VENUE}
        {EVENT_DATE ? ` · ${EVENT_DATE}` : ""}
      </p>
      <h1 style={S.title}>Reserve Your Ride</h1>
      <p style={S.subtitle}>
        Kindly save your seat on one of our shuttle vans. Two pickup points, two
        departure times — choose what suits you best.
      </p>
    </header>
  );
}

function Nav({ view, setView }) {
  const tabs = [
    { id: "book", label: "Book a seat" },
    { id: "manage", label: "Manage booking" },
    { id: "admin", label: "View bookings" },
  ];
  return (
    <nav style={S.nav}>
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => setView(t.id)}
          style={{ ...S.navBtn, ...(view === t.id ? S.navBtnActive : null) }}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}

function StepLabel({ n, children }) {
  return (
    <div style={S.stepLabel}>
      <span style={S.stepNum}>{n}</span>
      <span>{children}</span>
    </div>
  );
}

function PointStep({ onPick, seatsLeft, loading }) {
  return (
    <section>
      <StepLabel n="1">Choose your pickup point</StepLabel>
      {loading && <p style={S.noteText}>Loading live seat counts…</p>}
      <div style={S.cardGrid}>
        {POINTS.map((p) => {
          const total = p.vans.reduce(
            (sum, v) => sum + TRIPS.reduce((s, t) => s + seatsLeft(v.id, t.id), 0),
            0
          );
          return (
            <button
              key={p.id}
              style={S.pointCard}
              onClick={() => onPick(p.id)}
              className="rustic-card"
            >
              <div style={S.pointName}>{p.name}</div>
              <div style={S.pointNote}>{p.note}</div>
              <div style={S.divider} />
              <div style={S.pointMeta}>
                {p.vans.length} vans · {total} seats available
              </div>
              <div style={S.chooseHint}>Select →</div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function seatTone(left) {
  if (left <= 0) return { bg: "#e7ddd0", fg: "#8a7d6b", label: "Full" };
  if (left <= 3) return { bg: "#f3e2cf", fg: "#a4562a", label: `${left} left` };
  return { bg: "#e4ead9", fg: "#4f6135", label: `${left} left` };
}

function VanStep({ point, seatsLeft, onBack, onChoose }) {
  return (
    <section>
      <button style={S.back} onClick={onBack}>
        ← Change pickup point
      </button>
      <StepLabel n="2">Choose a van &amp; departure — {point.name}</StepLabel>

      <div style={S.vanList}>
        {point.vans.map((v) => (
          <div key={v.id} style={S.vanCard}>
            <div style={S.vanHead}>{v.name}</div>
            <div style={S.tripRow}>
              {TRIPS.map((t) => {
                const left = seatsLeft(v.id, t.id);
                const tone = seatTone(left);
                const full = left <= 0;
                return (
                  <button
                    key={t.id}
                    disabled={full}
                    onClick={() => onChoose(v.id, v.name, t.id)}
                    className={full ? "" : "rustic-card"}
                    style={{
                      ...S.tripBtn,
                      opacity: full ? 0.55 : 1,
                      cursor: full ? "not-allowed" : "pointer",
                    }}
                  >
                    <div style={S.tripLabel}>{t.label}</div>
                    <div style={S.tripTime}>{t.time}</div>
                    <span
                      style={{ ...S.seatBadge, background: tone.bg, color: tone.fg }}
                    >
                      {tone.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function FormStep({
  heading,
  point,
  run,
  names,
  setNames,
  booker,
  setBooker,
  seatsLeft,
  filledCount,
  error,
  busy,
  onBack,
  onSubmit,
  submitVerb,
}) {
  const trip = findTrip(run.tripId);

  function updateName(i, val) {
    const next = [...names];
    next[i] = val;
    setNames(next);
  }
  function addName() {
    setNames([...names, ""]);
  }
  function removeName(i) {
    if (names.length === 1) return;
    setNames(names.filter((_, idx) => idx !== i));
  }

  const capReached = filledCount >= seatsLeft && names.length >= seatsLeft;

  return (
    <section>
      <button style={S.back} onClick={onBack}>
        ← Back
      </button>
      <StepLabel n="3">{heading}</StepLabel>

      <div style={S.summaryBox}>
        <div>
          <strong>{run.vanName}</strong> · {point.name}{" "}
          <span style={S.summaryNote}>({point.note})</span>
        </div>
        <div style={S.summaryTrip}>
          {trip.label} — {trip.time}
        </div>
        <div style={S.summarySeats}>
          {seatsLeft} seat{seatsLeft === 1 ? "" : "s"} available · booking{" "}
          {filledCount || 0}
        </div>
      </div>

      <label style={S.fieldLabel}>Booker's name</label>
      <input
        style={S.input}
        placeholder="Your full name"
        value={booker.name}
        onChange={(e) => setBooker({ ...booker, name: e.target.value })}
      />
      <label style={S.fieldLabel}>Contact number</label>
      <input
        style={S.input}
        placeholder="e.g. 0917 000 0000"
        value={booker.phone}
        onChange={(e) => setBooker({ ...booker, phone: e.target.value })}
      />
      <label style={S.fieldLabel}>Email (optional — for your confirmation)</label>
      <input
        style={S.input}
        type="email"
        placeholder="you@example.com"
        value={booker.email}
        onChange={(e) => setBooker({ ...booker, email: e.target.value })}
      />

      <label style={{ ...S.fieldLabel, marginTop: 18 }}>Passenger name(s)</label>
      {names.map((n, i) => (
        <div key={i} style={S.nameRow}>
          <input
            style={{ ...S.input, marginBottom: 0 }}
            placeholder={`Passenger ${i + 1}`}
            value={n}
            onChange={(e) => updateName(i, e.target.value)}
          />
          {names.length > 1 && (
            <button
              style={S.removeBtn}
              onClick={() => removeName(i)}
              aria-label="Remove"
            >
              ×
            </button>
          )}
        </div>
      ))}

      <button style={S.addBtn} onClick={addName} disabled={capReached}>
        + Add another passenger
      </button>

      {error && <div style={S.error}>{error}</div>}

      <button
        style={{ ...S.submit, opacity: busy ? 0.7 : 1 }}
        onClick={onSubmit}
        className="rustic-submit"
        disabled={busy}
      >
        {busy
          ? "Working…"
          : `${submitVerb} ${
              filledCount > 0
                ? `${filledCount} seat${filledCount === 1 ? "" : "s"}`
                : "seat"
            }`}
      </button>
    </section>
  );
}

function DoneStep({ confirmation, onAgain }) {
  return (
    <section style={{ textAlign: "center" }}>
      <div style={S.checkMark}>✓</div>
      <h2 style={S.doneTitle}>You're all set!</h2>
      <p style={S.doneSub}>Your seats are reserved. We can't wait to see you.</p>

      <div style={S.refPill}>{confirmation.ref}</div>
      <p style={{ ...S.noteText, marginTop: -8 }}>
        Keep this reference to edit or cancel your booking later.
      </p>

      <div style={S.ticket}>
        <div style={S.ticketRow}>
          <span>Pickup</span>
          <strong>{confirmation.point}</strong>
        </div>
        <div style={S.ticketRow}>
          <span>Where</span>
          <strong>{confirmation.pointNote}</strong>
        </div>
        <div style={S.ticketRow}>
          <span>Van</span>
          <strong>{confirmation.van}</strong>
        </div>
        <div style={S.ticketRow}>
          <span>Departure</span>
          <strong>
            {confirmation.trip} · {confirmation.time}
          </strong>
        </div>
        <div style={S.ticketDivider} />
        <div style={S.ticketRow}>
          <span>Booked by</span>
          <strong>{confirmation.booker.name}</strong>
        </div>
        <div style={{ ...S.ticketRow, alignItems: "flex-start" }}>
          <span>Passengers</span>
          <strong style={{ textAlign: "right" }}>
            {confirmation.names.map((n, i) => (
              <div key={i}>{n}</div>
            ))}
          </strong>
        </div>
      </div>

      <button style={S.addBtn} onClick={onAgain}>
        Make another reservation
      </button>
    </section>
  );
}

function Footer() {
  return (
    <footer style={S.footer}>
      <div style={S.footerRule} />
      <p style={S.footerText}>
        {BACKEND === "supabase"
          ? "Live · seats sync automatically"
          : "Demo preview · bookings reset on refresh"}
      </p>
    </footer>
  );
}

/* ---------- Shared validation + helpers ---------- */

function validateBooking(booker, cleanNames) {
  if (!booker.name.trim()) return "Please enter the booker's name.";
  if (!booker.phone.trim()) return "Please enter a contact number.";
  if (booker.email.trim() && !booker.email.includes("@"))
    return "That email doesn't look right — please check it.";
  if (cleanNames.length === 0) return "Please enter at least one passenger name.";
  return null;
}

function bookingErrorMessage(res) {
  if (res.code === "NOT_ENOUGH_SEATS")
    return `Only ${res.left} seat${res.left === 1 ? "" : "s"} left on this run — please remove a name or pick another van.`;
  if (res.code === "OVER_BOOKER_CAP")
    return `You can book at most ${res.cap ?? "the run's"} seats per van.`;
  if (res.code === "NO_PASSENGERS")
    return "Please enter at least one passenger name.";
  if (res.code === "NOT_FOUND")
    return "That booking could not be found — it may have been cancelled.";
  return "Something went wrong. Please try again.";
}

function exportCsv(bookings) {
  const header = [
    "reference",
    "van",
    "pickup_point",
    "pickup_note",
    "trip",
    "trip_time",
    "booker_name",
    "booker_phone",
    "booker_email",
    "seats",
    "passengers",
    "booked_at",
  ];
  const rows = bookings.map((b) => {
    const vp = findVanPoint(b.runId.split("-")[0]);
    const trip = findTrip(b.runId.split("-")[1]);
    return [
      b.ref,
      vp?.van.name ?? "",
      vp?.point.name ?? "",
      vp?.point.note ?? "",
      trip?.label ?? "",
      trip?.time ?? "",
      b.bookerName,
      b.bookerPhone,
      b.bookerEmail ?? "",
      b.seats,
      b.passengers.join("; "),
      b.createdAt,
    ];
  });
  const csv = [header, ...rows]
    .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "van-bookings.csv";
  a.click();
  URL.revokeObjectURL(url);
}
