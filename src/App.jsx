import React, { useState, useMemo, useEffect } from "react";
import {
  SERVICES,
  ALL_RUNS,
  EVENT_DATE,
  COUPLE,
  VENUE,
  BOARDING_NOTE,
  findRunContext,
  assignableVans,
} from "./config.js";
import { useBookings, BACKEND } from "./store.js";
import { S, GLOBAL_CSS } from "./styles.js";

const TOTAL_SEATS = ALL_RUNS.reduce((n, r) => n + r.capacity, 0);

// "Van 1" or "Van 1 · ABC 1234" when a plate is set.
function vanLabel(name, plate) {
  return plate ? `${name} · ${plate}` : name;
}

function serviceSeatsLeft(service, seatsLeftByRun) {
  if (service.model === "slots")
    return service.slots.reduce((n, s) => n + seatsLeftByRun(s.id), 0);
  return service.departures.reduce((n, d) => n + seatsLeftByRun(d.id), 0);
}

// Display fields for a booking's run (used in tickets / manage / admin).
function runDisplay(ctx, booking) {
  const s = ctx.service;
  if (ctx.slot) {
    return {
      serviceLabel: s.label,
      locationRole: s.locationRole,
      locationValue: booking?.pickupLocation || "—",
      locationNote: "",
      van: booking?.assignedVan || "To be assigned by your driver",
      departure: `${ctx.slot.label} · ${ctx.slot.time}`,
    };
  }
  return {
    serviceLabel: s.label,
    locationRole: s.locationRole,
    locationValue: ctx.point.name,
    locationNote: ctx.point.note,
    van: vanLabel(ctx.van.name, ctx.van.plate),
    departure: ctx.departure.time,
  };
}

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

/* ---------- Booking flow ---------- */
// arrival (slots):   service → pick time → form (+ pickup location)
// afterparty (list): service → pick departure time → form

function BookFlow({ store }) {
  const [step, setStep] = useState("service"); // service | slot | departure | form | done
  const [service, setService] = useState(null);
  const [selectedRun, setSelectedRun] = useState(null);
  const [names, setNames] = useState([""]);
  const [booker, setBooker] = useState({ name: "", phone: "", email: "" });
  const [pickupLocation, setPickupLocation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState(null);

  const filledNames = names.map((n) => n.trim()).filter(Boolean);
  const isArrival = service?.model === "slots";

  function resetToStart() {
    setStep("service");
    setService(null);
    setSelectedRun(null);
    setNames([""]);
    setBooker({ name: "", phone: "", email: "" });
    setPickupLocation("");
    setError("");
    setConfirmation(null);
  }

  function chooseService(s) {
    setService(s);
    setError("");
    setStep(s.model === "slots" ? "slot" : "departure");
  }

  function chooseSlot(slot) {
    if (store.seatsLeftByRun(slot.id) <= 0) return;
    setSelectedRun({
      runId: slot.id,
      kind: "slot",
      slotLabel: slot.label,
      time: slot.time,
    });
    setNames([""]);
    setPickupLocation("");
    setError("");
    setStep("form");
  }

  function chooseDeparture(dep) {
    if (store.seatsLeftByRun(dep.id) <= 0) return;
    setSelectedRun({
      runId: dep.id,
      kind: "departure",
      time: dep.time,
      van: { name: dep.van, plate: service.vanPlates?.[dep.van] ?? null },
      point: service.dropoff,
    });
    setNames([""]);
    setError("");
    setStep("form");
  }

  async function submitBooking() {
    setError("");
    const clean = names.map((n) => n.trim()).filter(Boolean);

    const err = validateBooking(booker, clean, {
      requireLocation: isArrival,
      pickupLocation,
    });
    if (err) return setError(err);

    setBusy(true);
    const res = await store.createBooking({
      runId: selectedRun.runId,
      bookerName: booker.name.trim(),
      bookerPhone: booker.phone.trim(),
      bookerEmail: booker.email.trim(),
      pickupLocation: isArrival ? pickupLocation.trim() : null,
      passengers: clean,
    });
    setBusy(false);
    if (!res.ok) return setError(bookingErrorMessage(res));

    setConfirmation({
      ref: res.booking.ref,
      serviceLabel: service.label,
      locationRole: service.locationRole,
      locationValue: isArrival ? pickupLocation.trim() : selectedRun.point.name,
      locationNote: isArrival ? "" : selectedRun.point.note,
      van: isArrival
        ? "To be assigned by your driver"
        : vanLabel(selectedRun.van.name, selectedRun.van.plate),
      departure: isArrival
        ? `${selectedRun.slotLabel} · ${selectedRun.time}`
        : selectedRun.time,
      names: clean,
      booker: { ...booker },
    });
    setStep("done");
  }

  return (
    <>
      {step === "service" && (
        <ServiceStep
          loading={store.loading}
          seatsLeftByRun={store.seatsLeftByRun}
          onPick={chooseService}
        />
      )}

      {step === "slot" && service && (
        <SlotStep
          service={service}
          seatsLeftByRun={store.seatsLeftByRun}
          onBack={() => {
            setStep("service");
            setService(null);
          }}
          onPick={chooseSlot}
        />
      )}

      {step === "departure" && service && (
        <DepartureStep
          service={service}
          seatsLeftByRun={store.seatsLeftByRun}
          onBack={() => {
            setStep("service");
            setService(null);
          }}
          onPick={chooseDeparture}
        />
      )}

      {step === "form" && service && selectedRun && (
        <FormStep
          heading="Passenger details"
          service={service}
          run={selectedRun}
          isArrival={isArrival}
          names={names}
          setNames={setNames}
          booker={booker}
          setBooker={setBooker}
          pickupLocation={pickupLocation}
          setPickupLocation={setPickupLocation}
          seatsLeft={store.seatsLeftByRun(selectedRun.runId)}
          filledCount={filledNames.length}
          error={error}
          busy={busy}
          onBack={() => {
            setStep(isArrival ? "slot" : "departure");
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
  const [pickupLocation, setPickupLocation] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const ctx = found ? findRunContext(found.runId) : null;
  const isArrival = ctx?.slot != null;
  const disp = ctx ? runDisplay(ctx, found) : null;

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
    setPickupLocation(found.pickupLocation || "");
    setEditing(true);
  }

  async function saveEdit() {
    setError("");
    const clean = names.map((n) => n.trim()).filter(Boolean);
    const err = validateBooking(booker, clean, {
      requireLocation: isArrival,
      pickupLocation,
    });
    if (err) return setError(err);

    setBusy(true);
    const res = await store.updateBooking(found.ref, {
      bookerName: booker.name.trim(),
      bookerPhone: booker.phone.trim(),
      bookerEmail: booker.email.trim(),
      pickupLocation: isArrival ? pickupLocation.trim() : undefined,
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

  const editRun =
    ctx && isArrival
      ? { kind: "slot", slotLabel: ctx.slot.label, time: ctx.slot.time }
      : ctx
        ? { kind: "departure", time: ctx.departure.time, van: ctx.van, point: ctx.point }
        : null;
  const editSeatsLeft =
    ctx && found ? store.seatsLeftByRun(found.runId) + found.seats : 0;

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

      {found && !editing && disp && (
        <>
          <div style={{ ...S.refPill, marginTop: 8 }}>{found.ref}</div>
          <div style={S.ticket}>
            <div style={S.ticketRow}>
              <span>Shuttle</span>
              <strong>{disp.serviceLabel}</strong>
            </div>
            <div style={S.ticketRow}>
              <span>{disp.locationRole}</span>
              <strong>
                {disp.locationValue}
                {disp.locationNote ? ` (${disp.locationNote})` : ""}
              </strong>
            </div>
            <div style={S.ticketRow}>
              <span>Van</span>
              <strong>{disp.van}</strong>
            </div>
            <div style={S.ticketRow}>
              <span>Departure</span>
              <strong>{disp.departure}</strong>
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
              Edit details
            </button>
            <button style={S.dangerBtn} onClick={cancel} disabled={busy}>
              Cancel booking
            </button>
          </div>
        </>
      )}

      {found && editing && editRun && (
        <FormStep
          heading="Edit your booking"
          service={ctx.service}
          run={editRun}
          isArrival={isArrival}
          names={names}
          setNames={setNames}
          booker={booker}
          setBooker={setBooker}
          pickupLocation={pickupLocation}
          setPickupLocation={setPickupLocation}
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

/* ---------- Admin (organizer + head-driver tooling) ---------- */

function AdminView({ store }) {
  const needsPasscode = BACKEND === "supabase";
  const [passcode, setPasscode] = useState("");
  const [rows, setRows] = useState(needsPasscode ? null : []);
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

  useEffect(() => {
    if (!needsPasscode) load("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsPasscode, store]);

  const bookedSeats =
    TOTAL_SEATS - Object.values(store.seatsMap).reduce((s, left) => s + left, 0);

  const sections = useMemo(() => groupForAdmin(rows || []), [rows]);

  async function cancelOne(ref) {
    if (!window.confirm(`Cancel ${ref}?`)) return;
    const res = await store.cancelBooking(ref);
    if (res.ok) load(needsPasscode ? passcode : "");
  }

  async function assign(ref, van) {
    const res = await store.assignVan(ref, van || null, needsPasscode ? passcode : "");
    if (res.ok) {
      setRows((prev) =>
        prev.map((b) => (b.ref === ref ? { ...b, assignedVan: van || null } : b))
      );
    } else {
      setError(
        res.code === "FORBIDDEN"
          ? "Passcode not accepted for van assignment."
          : "Could not assign the van. Please try again."
      );
    }
  }

  return (
    <section>
      <StepLabel n="♦">Bookings</StepLabel>
      <p style={S.noteText}>
        Organizer + head-driver view.
        {needsPasscode
          ? " Passcode-protected so guest details aren't public."
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
              Export run sheet (CSV)
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

          {sections.map((sec) =>
            sec.ctx?.slot ? (
              <ArrivalSlotSection
                key={sec.runId}
                sec={sec}
                onAssign={assign}
                onCancel={cancelOne}
              />
            ) : (
              <DepartureSection key={sec.runId} sec={sec} onCancel={cancelOne} />
            )
          )}
        </>
      )}
    </section>
  );
}

// Arrival slot: pickup locations + per-van assignment.
function ArrivalSlotSection({ sec, onAssign, onCancel }) {
  const { service, slot, capacity } = sec.ctx;
  const vans = assignableVans(service);
  const list = [...sec.list].sort((a, b) =>
    (a.pickupLocation || "").localeCompare(b.pickupLocation || "")
  );
  const taken = sec.list.reduce((n, b) => n + b.seats, 0);
  const tally = {};
  for (const v of vans) tally[v] = 0;
  let unassigned = 0;
  for (const b of sec.list) {
    if (b.assignedVan && b.assignedVan in tally) tally[b.assignedVan] += b.seats;
    else unassigned += b.seats;
  }

  return (
    <div style={S.runGroup}>
      <div style={S.runGroupHead}>
        <span>
          {slot.label} · {slot.time}
        </span>
        <span style={{ fontSize: 14, color: "#a4562a" }}>
          {taken}/{capacity} seats
        </span>
      </div>
      <div style={{ fontSize: 13, color: "#8a7150", marginTop: -6, marginBottom: 8 }}>
        {service.label} · assign each group to a van
      </div>

      <div style={S.tallyRow}>
        {vans.map((v) => (
          <span
            key={v}
            style={{ ...S.tallyChip, ...(tally[v] > 10 ? S.tallyChipOver : null) }}
          >
            {v}: {tally[v]}/10
          </span>
        ))}
        {unassigned > 0 && (
          <span style={{ ...S.tallyChip, ...S.tallyChipUnassigned }}>
            Unassigned: {unassigned}
          </span>
        )}
      </div>

      {list.map((b) => (
        <div key={b.ref} style={S.bookingCard}>
          <div style={S.bookingHeadRow}>
            <div>
              <strong>📍 {b.pickupLocation || "(no location given)"}</strong>
              <div style={S.meta}>
                {b.bookerName} · {b.bookerPhone} · {b.seats} seat
                {b.seats === 1 ? "" : "s"}{" "}
                <span style={{ color: "#a4562a" }}>({b.ref})</span>
              </div>
              <div style={S.meta}>{b.passengers.join(", ")}</div>
              <div style={{ marginTop: 6 }}>
                <select
                  style={S.assignSelect}
                  value={b.assignedVan || ""}
                  onChange={(e) => onAssign(b.ref, e.target.value)}
                >
                  <option value="">— Assign van —</option>
                  {vans.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button style={S.dangerBtn} onClick={() => onCancel(b.ref)}>
              Cancel
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// After-party departure: one van at a fixed time.
function DepartureSection({ sec, onCancel }) {
  const { service, van, departure, point } = sec.ctx;
  const taken = sec.list.reduce((n, b) => n + b.seats, 0);
  return (
    <div style={S.runGroup}>
      <div style={S.runGroupHead}>
        <span>
          {departure.time} · {vanLabel(van.name, van.plate)}
        </span>
        <span style={{ fontSize: 14, color: "#a4562a" }}>{taken}/10 seats</span>
      </div>
      <div style={{ fontSize: 13, color: "#8a7150", marginTop: -6 }}>
        {service.label} · {point.name} — {point.note}
      </div>
      {sec.list.map((b) => (
        <div key={b.ref} style={S.bookingCard}>
          <div style={S.bookingHeadRow}>
            <div>
              <strong>{b.bookerName}</strong>{" "}
              <span style={{ color: "#a4562a" }}>({b.ref})</span>
              <div style={S.meta}>
                {b.bookerPhone}
                {b.bookerEmail ? ` · ${b.bookerEmail}` : ""} · {b.seats} seat
                {b.seats === 1 ? "" : "s"}
              </div>
              <div style={S.meta}>{b.passengers.join(", ")}</div>
            </div>
            <button style={S.dangerBtn} onClick={() => onCancel(b.ref)}>
              Cancel
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// Group bookings into ordered sections (by the ALL_RUNS order).
function groupForAdmin(rows) {
  const map = new Map();
  for (const b of rows) {
    if (!map.has(b.runId)) {
      map.set(b.runId, { runId: b.runId, ctx: findRunContext(b.runId), list: [] });
    }
    map.get(b.runId).list.push(b);
  }
  const order = ALL_RUNS.map((r) => r.runId);
  return [...map.values()].sort(
    (a, b) => order.indexOf(a.runId) - order.indexOf(b.runId)
  );
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
        Kindly save your seat on our wedding shuttle vans — the ride to the
        venue and the after-party ride out.
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

function ServiceStep({ onPick, seatsLeftByRun, loading }) {
  return (
    <section>
      <StepLabel n="1">Choose your shuttle</StepLabel>
      {loading && <p style={S.noteText}>Loading live seat counts…</p>}
      <div className="rustic-grid-2">
        {SERVICES.map((s) => {
          const total = serviceSeatsLeft(s, seatsLeftByRun);
          const count =
            s.model === "slots" ? s.slots.length : s.departures.length;
          const unit = s.model === "slots" ? "pickup times" : "departure times";
          return (
            <button
              key={s.id}
              style={S.pointCard}
              onClick={() => onPick(s)}
              className="rustic-card"
            >
              <div style={S.serviceIcon}>{s.icon}</div>
              <div style={S.pointName}>{s.label}</div>
              <div style={S.pointNote}>{s.blurb}</div>
              <div style={S.divider} />
              <div style={S.pointMeta}>
                {count} {unit} · {total} seats available
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
  if (left <= 5) return { bg: "#f3e2cf", fg: "#a4562a", label: `${left} left` };
  return { bg: "#e4ead9", fg: "#4f6135", label: `${left} left` };
}

// Generic time-card picker used by both arrival slots and after-party departures.
function TimeCard({ title, subtitle, left, onPick }) {
  const tone = seatTone(left);
  const full = left <= 0;
  return (
    <button
      disabled={full}
      onClick={onPick}
      className={full ? "" : "rustic-card"}
      style={{
        ...S.pointCard,
        opacity: full ? 0.55 : 1,
        cursor: full ? "not-allowed" : "pointer",
      }}
    >
      <div style={S.pointName}>{title}</div>
      {subtitle && <div style={S.pointNote}>{subtitle}</div>}
      <div style={S.divider} />
      <div style={S.pointMeta}>
        <span style={{ ...S.seatBadge, background: tone.bg, color: tone.fg }}>
          {tone.label}
        </span>
      </div>
      {!full && <div style={S.chooseHint}>Select →</div>}
    </button>
  );
}

function SlotStep({ service, seatsLeftByRun, onBack, onPick }) {
  return (
    <section>
      <button style={S.back} onClick={onBack}>
        ← Change shuttle
      </button>
      <StepLabel n="2">Choose your pickup time</StepLabel>
      <div className="rustic-grid-2">
        {service.slots.map((slot) => (
          <TimeCard
            key={slot.id}
            title={slot.label}
            subtitle={slot.time}
            left={seatsLeftByRun(slot.id)}
            onPick={() => onPick(slot)}
          />
        ))}
      </div>
      {BOARDING_NOTE && <p style={S.boardingNote}>⏱ {BOARDING_NOTE}</p>}
    </section>
  );
}

function DepartureStep({ service, seatsLeftByRun, onBack, onPick }) {
  return (
    <section>
      <button style={S.back} onClick={onBack}>
        ← Change shuttle
      </button>
      <StepLabel n="2">Choose your departure time</StepLabel>
      <p style={{ ...S.noteText, marginTop: -6 }}>{service.blurb}</p>
      <div className="rustic-grid-2">
        {service.departures.map((dep) => (
          <TimeCard
            key={dep.id}
            title={dep.time}
            left={seatsLeftByRun(dep.id)}
            onPick={() => onPick(dep)}
          />
        ))}
      </div>
      {BOARDING_NOTE && <p style={S.boardingNote}>⏱ {BOARDING_NOTE}</p>}
    </section>
  );
}

function FormStep({
  heading,
  service,
  run,
  isArrival,
  names,
  setNames,
  booker,
  setBooker,
  pickupLocation,
  setPickupLocation,
  seatsLeft,
  filledCount,
  error,
  busy,
  onBack,
  onSubmit,
  submitVerb,
}) {
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
        <div style={S.summaryEyebrow}>{service.label}</div>
        {isArrival ? (
          <>
            <div>
              <strong>{run.slotLabel}</strong> — {run.time}
            </div>
            <div style={S.summaryTrip}>
              We'll pick you up at the location you enter below.
            </div>
          </>
        ) : (
          <>
            <div>
              <strong>Departure · {run.time}</strong>
            </div>
            <div style={S.summaryTrip}>
              {vanLabel(run.van.name, run.van.plate)} · {service.locationRole}:{" "}
              {run.point.name}{" "}
              <span style={S.summaryNote}>({run.point.note})</span>
            </div>
          </>
        )}
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

      {isArrival && (
        <>
          <label style={S.fieldLabel}>
            Pickup location{" "}
            <span style={{ color: "#a4562a", fontStyle: "normal" }}>
              (where should we get you?)
            </span>
          </label>
          <input
            style={S.input}
            placeholder="Hotel, address, or landmark in town"
            value={pickupLocation}
            onChange={(e) => setPickupLocation(e.target.value)}
          />
        </>
      )}

      <label style={{ ...S.fieldLabel, marginTop: 18 }}>Passenger name(s)</label>
      {names.map((nm, i) => (
        <div key={i} style={S.nameRow}>
          <input
            style={{ ...S.input, marginBottom: 0 }}
            placeholder={`Passenger ${i + 1}`}
            value={nm}
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
          <span>Shuttle</span>
          <strong>{confirmation.serviceLabel}</strong>
        </div>
        <div style={S.ticketRow}>
          <span>{confirmation.locationRole}</span>
          <strong>{confirmation.locationValue}</strong>
        </div>
        {confirmation.locationNote && (
          <div style={S.ticketRow}>
            <span>Where</span>
            <strong>{confirmation.locationNote}</strong>
          </div>
        )}
        <div style={S.ticketRow}>
          <span>Van</span>
          <strong>{confirmation.van}</strong>
        </div>
        <div style={S.ticketRow}>
          <span>Departure</span>
          <strong>{confirmation.departure}</strong>
        </div>
        <div style={S.ticketDivider} />
        <div style={S.ticketRow}>
          <span>Booked by</span>
          <strong>{confirmation.booker.name}</strong>
        </div>
        <div style={{ ...S.ticketRow, alignItems: "flex-start" }}>
          <span>Passengers</span>
          <strong style={{ textAlign: "right" }}>
            {confirmation.names.map((nm, i) => (
              <div key={i}>{nm}</div>
            ))}
          </strong>
        </div>
      </div>

      {BOARDING_NOTE && (
        <p style={{ ...S.boardingNote, textAlign: "center" }}>⏱ {BOARDING_NOTE}</p>
      )}

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
      <p style={S.colophon}>
        <span style={S.colophonBrand}>SG Coordination</span> — every detail,
        beautifully handled. Plan yours at{" "}
        <a
          className="colophon-link"
          href="https://sgcoordination.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          sgcoordination.com
        </a>
      </p>
    </footer>
  );
}

/* ---------- Shared validation + helpers ---------- */

function validateBooking(booker, cleanNames, { requireLocation, pickupLocation } = {}) {
  if (!booker.name.trim()) return "Please enter the booker's name.";
  if (!booker.phone.trim()) return "Please enter a contact number.";
  if (booker.email.trim() && !booker.email.includes("@"))
    return "That email doesn't look right — please check it.";
  if (requireLocation && !(pickupLocation || "").trim())
    return "Please enter your pickup location.";
  if (cleanNames.length === 0) return "Please enter at least one passenger name.";
  return null;
}

function bookingErrorMessage(res) {
  if (res.code === "NOT_ENOUGH_SEATS")
    return `Only ${res.left} seat${res.left === 1 ? "" : "s"} left — please remove a name or pick another time.`;
  if (res.code === "OVER_BOOKER_CAP")
    return `You can book at most ${res.cap ?? "a van's worth of"} seats at once.`;
  if (res.code === "NO_PASSENGERS")
    return "Please enter at least one passenger name.";
  if (res.code === "RUN_NOT_FOUND")
    return "This shuttle isn't available yet — please try another, or check back soon.";
  if (res.code === "NOT_FOUND")
    return "That booking could not be found — it may have been cancelled.";
  return "Something went wrong. Please try again.";
}

function exportCsv(bookings) {
  const header = [
    "reference",
    "shuttle",
    "when",
    "pickup_or_dropoff",
    "van",
    "booker_name",
    "booker_phone",
    "booker_email",
    "seats",
    "passengers",
    "booked_at",
  ];
  const rows = bookings.map((b) => {
    const ctx = findRunContext(b.runId);
    const when = ctx?.slot
      ? `${ctx.slot.label} ${ctx.slot.time}`
      : ctx?.departure
        ? ctx.departure.time
        : "";
    const loc = ctx?.slot ? b.pickupLocation : ctx?.point?.name ?? "";
    const van = ctx?.slot ? (b.assignedVan ?? "") : (ctx?.van?.name ?? "");
    return [
      b.ref,
      ctx?.service?.label ?? "",
      when,
      loc,
      van,
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
