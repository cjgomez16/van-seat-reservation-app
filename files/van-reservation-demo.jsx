import React, { useState, useMemo } from "react";

/*
  WEDDING VAN SEAT RESERVATION — FRONT-END DEMO
  ---------------------------------------------
  This is a UI/UX demo with IN-MEMORY state only.
  No persistence, no backend — refreshing resets all seats.
  The handoff file (VAN-RESERVATION-HANDOFF.md) explains how to
  wire this to Supabase for real, atomic, multi-user bookings.

  Structure:
    Point A → Van 1, Van 2
    Point B → Van 3, Van 4
    Each van runs TWO trips: 11:15–11:30 AM (Trip 1), 12:15–12:30 PM (Trip 2)
    Each van-run = 10 seats.  8 runs total = 80 seats.

  Flow: pick point → see that point's 2 vans (both trips, live seats) →
        pick a van+trip → enter N passenger names + booker contact → confirm.
*/

const TRIPS = [
  { id: "t1", label: "First Trip", time: "11:15 – 11:30 AM" },
  { id: "t2", label: "Second Trip", time: "12:15 – 12:30 PM" },
];

const POINTS = [
  {
    id: "A",
    name: "Pickup Point A",
    note: "Hotel Lobby",
    vans: [
      { id: "v1", name: "Van 1" },
      { id: "v2", name: "Van 2" },
    ],
  },
  {
    id: "B",
    name: "Pickup Point B",
    note: "Church Courtyard",
    vans: [
      { id: "v3", name: "Van 3" },
      { id: "v4", name: "Van 4" },
    ],
  },
];

const SEATS_PER_RUN = 10;

// key for a van-run: `${vanId}-${tripId}`
function runKey(vanId, tripId) {
  return `${vanId}-${tripId}`;
}

// Build initial booked-count map (all zero). Demo seeds a couple for realism.
function initialBooked() {
  return {
    "v1-t1": 7,
    "v2-t2": 10, // full, to show the "full" state
    "v3-t1": 3,
  };
}

export default function App() {
  const [booked, setBooked] = useState(initialBooked);
  const [step, setStep] = useState("point"); // point | van | form | done
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [selectedRun, setSelectedRun] = useState(null); // { vanId, vanName, tripId }
  const [names, setNames] = useState([""]);
  const [booker, setBooker] = useState({ name: "", phone: "" });
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState(null);

  const seatsLeft = (vanId, tripId) =>
    SEATS_PER_RUN - (booked[runKey(vanId, tripId)] || 0);

  const point = useMemo(
    () => POINTS.find((p) => p.id === selectedPoint) || null,
    [selectedPoint]
  );

  const filledNames = names.map((n) => n.trim()).filter(Boolean);

  function resetToStart() {
    setStep("point");
    setSelectedPoint(null);
    setSelectedRun(null);
    setNames([""]);
    setBooker({ name: "", phone: "" });
    setError("");
    setConfirmation(null);
  }

  function chooseRun(vanId, vanName, tripId) {
    if (seatsLeft(vanId, tripId) <= 0) return;
    setSelectedRun({ vanId, vanName, tripId });
    setNames([""]);
    setError("");
    setStep("form");
  }

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

  function submitBooking() {
    setError("");
    const { vanId, tripId } = selectedRun;
    const clean = names.map((n) => n.trim()).filter(Boolean);

    if (!booker.name.trim()) return setError("Please enter the booker's name.");
    if (!booker.phone.trim()) return setError("Please enter a contact number.");
    if (clean.length === 0)
      return setError("Please enter at least one passenger name.");

    const left = seatsLeft(vanId, tripId);
    if (clean.length > left)
      return setError(
        `Only ${left} seat${left === 1 ? "" : "s"} left on this run — you entered ${clean.length} name${clean.length === 1 ? "" : "s"}.`
      );

    // In-memory "atomic" update (real version does this server-side).
    setBooked((prev) => ({
      ...prev,
      [runKey(vanId, tripId)]: (prev[runKey(vanId, tripId)] || 0) + clean.length,
    }));

    const trip = TRIPS.find((t) => t.id === tripId);
    setConfirmation({
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
    <div style={S.page}>
      <style>{GLOBAL_CSS}</style>

      <div style={S.frame}>
        <Header />

        {step === "point" && (
          <PointStep onPick={(id) => { setSelectedPoint(id); setStep("van"); }} seatsLeft={seatsLeft} />
        )}

        {step === "van" && point && (
          <VanStep
            point={point}
            seatsLeft={seatsLeft}
            onBack={() => { setStep("point"); setSelectedPoint(null); }}
            onChoose={chooseRun}
          />
        )}

        {step === "form" && selectedRun && (
          <FormStep
            point={point}
            run={selectedRun}
            names={names}
            booker={booker}
            setBooker={setBooker}
            seatsLeft={seatsLeft(selectedRun.vanId, selectedRun.tripId)}
            filledCount={filledNames.length}
            error={error}
            onUpdateName={updateName}
            onAddName={addName}
            onRemoveName={removeName}
            onBack={() => { setStep("van"); setSelectedRun(null); setError(""); }}
            onSubmit={submitBooking}
          />
        )}

        {step === "done" && confirmation && (
          <DoneStep confirmation={confirmation} onAgain={resetToStart} />
        )}

        <Footer />
      </div>
    </div>
  );
}

/* ---------- Sub-components ---------- */

function Header() {
  return (
    <header style={S.header}>
      <div style={S.sprig}>❧</div>
      <p style={S.eyebrow}>With love & gratitude</p>
      <h1 style={S.title}>Reserve Your Ride</h1>
      <p style={S.subtitle}>
        Kindly save your seat on one of our shuttle vans. Two pickup points,
        two departure times — choose what suits you best.
      </p>
    </header>
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

function PointStep({ onPick, seatsLeft }) {
  return (
    <section>
      <StepLabel n="1">Choose your pickup point</StepLabel>
      <div style={S.cardGrid}>
        {POINTS.map((p) => {
          const total = p.vans.reduce(
            (sum, v) => sum + TRIPS.reduce((s, t) => s + seatsLeft(v.id, t.id), 0),
            0
          );
          return (
            <button key={p.id} style={S.pointCard} onClick={() => onPick(p.id)} className="rustic-card">
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
      <button style={S.back} onClick={onBack}>← Change pickup point</button>
      <StepLabel n="2">Choose a van & departure — {point.name}</StepLabel>

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
                    style={{ ...S.tripBtn, opacity: full ? 0.55 : 1, cursor: full ? "not-allowed" : "pointer" }}
                  >
                    <div style={S.tripLabel}>{t.label}</div>
                    <div style={S.tripTime}>{t.time}</div>
                    <span style={{ ...S.seatBadge, background: tone.bg, color: tone.fg }}>
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
  point, run, names, booker, setBooker, seatsLeft, filledCount,
  error, onUpdateName, onAddName, onRemoveName, onBack, onSubmit,
}) {
  const trip = TRIPS.find((t) => t.id === run.tripId);
  return (
    <section>
      <button style={S.back} onClick={onBack}>← Back to vans</button>
      <StepLabel n="3">Passenger details</StepLabel>

      <div style={S.summaryBox}>
        <div><strong>{run.vanName}</strong> · {point.name} <span style={S.summaryNote}>({point.note})</span></div>
        <div style={S.summaryTrip}>{trip.label} — {trip.time}</div>
        <div style={S.summarySeats}>
          {seatsLeft} seat{seatsLeft === 1 ? "" : "s"} available · booking {filledCount || 0}
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

      <label style={{ ...S.fieldLabel, marginTop: 18 }}>Passenger name(s)</label>
      {names.map((n, i) => (
        <div key={i} style={S.nameRow}>
          <input
            style={{ ...S.input, marginBottom: 0 }}
            placeholder={`Passenger ${i + 1}`}
            value={n}
            onChange={(e) => onUpdateName(i, e.target.value)}
          />
          {names.length > 1 && (
            <button style={S.removeBtn} onClick={() => onRemoveName(i)} aria-label="Remove">×</button>
          )}
        </div>
      ))}

      <button
        style={S.addBtn}
        onClick={onAddName}
        disabled={filledCount >= seatsLeft && names.length >= seatsLeft}
      >
        + Add another passenger
      </button>

      {error && <div style={S.error}>{error}</div>}

      <button style={S.submit} onClick={onSubmit} className="rustic-submit">
        Reserve {filledCount > 0 ? `${filledCount} seat${filledCount === 1 ? "" : "s"}` : "seat"}
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

      <div style={S.ticket}>
        <div style={S.ticketRow}><span>Pickup</span><strong>{confirmation.point}</strong></div>
        <div style={S.ticketRow}><span>Where</span><strong>{confirmation.pointNote}</strong></div>
        <div style={S.ticketRow}><span>Van</span><strong>{confirmation.van}</strong></div>
        <div style={S.ticketRow}><span>Departure</span><strong>{confirmation.trip} · {confirmation.time}</strong></div>
        <div style={S.ticketDivider} />
        <div style={S.ticketRow}><span>Booked by</span><strong>{confirmation.booker.name}</strong></div>
        <div style={{ ...S.ticketRow, alignItems: "flex-start" }}>
          <span>Passengers</span>
          <strong style={{ textAlign: "right" }}>
            {confirmation.names.map((n, i) => <div key={i}>{n}</div>)}
          </strong>
        </div>
      </div>

      <button style={S.addBtn} onClick={onAgain}>Make another reservation</button>
    </section>
  );
}

function Footer() {
  return (
    <footer style={S.footer}>
      <div style={S.footerRule} />
      <p style={S.footerText}>Demo preview · seats reset on refresh</p>
    </footer>
  );
}

/* ---------- Styling (rustic / kraft-paper editorial) ---------- */

const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=EB+Garamond:ital,wght@0,400;0,500;1,400&display=swap');
  .rustic-card { transition: transform .18s ease, box-shadow .18s ease; }
  .rustic-card:hover { transform: translateY(-3px); box-shadow: 0 10px 28px rgba(74,55,35,.16); }
  .rustic-submit { transition: transform .12s ease, background .2s ease; }
  .rustic-submit:hover { transform: translateY(-1px); }
  input::placeholder { color: #b3a48f; }
`;

const serif = "'Cormorant Garamond', Georgia, serif";
const body = "'EB Garamond', Georgia, serif";
const ink = "#4a3723";
const cream = "#f7f1e6";
const kraft = "#efe4d2";

const S = {
  page: {
    minHeight: "100vh",
    background: "radial-gradient(1200px 600px at 50% -10%, #fbf6ec 0%, #f1e7d5 55%, #e9dcc6 100%)",
    padding: "32px 16px 48px",
    fontFamily: body,
    color: ink,
  },
  frame: {
    maxWidth: 620,
    margin: "0 auto",
    background: cream,
    border: "1px solid #ddceb4",
    borderRadius: 4,
    boxShadow: "0 20px 60px rgba(74,55,35,.14)",
    padding: "36px 30px 26px",
    position: "relative",
  },
  header: { textAlign: "center", marginBottom: 26 },
  sprig: { fontSize: 26, color: "#a4562a", marginBottom: 6 },
  eyebrow: {
    fontFamily: body, fontStyle: "italic", letterSpacing: ".04em",
    color: "#9a7d55", margin: 0, fontSize: 15,
  },
  title: {
    fontFamily: serif, fontWeight: 700, fontSize: 42, lineHeight: 1.05,
    margin: "4px 0 10px", color: ink, letterSpacing: ".01em",
  },
  subtitle: { fontSize: 16, lineHeight: 1.5, color: "#6b563d", maxWidth: 460, margin: "0 auto" },

  stepLabel: {
    display: "flex", alignItems: "center", gap: 10, marginBottom: 16,
    fontFamily: serif, fontSize: 21, fontWeight: 600, color: ink,
  },
  stepNum: {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    width: 28, height: 28, borderRadius: "50%", background: "#a4562a",
    color: cream, fontSize: 15, fontFamily: body, flexShrink: 0,
  },

  cardGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 },
  pointCard: {
    textAlign: "left", background: "#fffdf8", border: "1px solid #e0d0b5",
    borderRadius: 4, padding: "20px 18px", cursor: "pointer", color: ink, font: "inherit",
  },
  pointName: { fontFamily: serif, fontSize: 22, fontWeight: 700 },
  pointNote: { fontStyle: "italic", color: "#8a7150", fontSize: 15, marginTop: 2 },
  divider: { height: 1, background: "#e6d8bf", margin: "14px 0" },
  pointMeta: { fontSize: 14, color: "#6b563d" },
  chooseHint: { marginTop: 12, color: "#a4562a", fontSize: 15, fontFamily: serif },

  back: {
    background: "none", border: "none", color: "#9a7d55", cursor: "pointer",
    font: "inherit", fontSize: 15, padding: 0, marginBottom: 14, fontStyle: "italic",
  },
  vanList: { display: "flex", flexDirection: "column", gap: 16 },
  vanCard: { background: "#fffdf8", border: "1px solid #e0d0b5", borderRadius: 4, padding: "16px 16px 18px" },
  vanHead: { fontFamily: serif, fontSize: 22, fontWeight: 700, marginBottom: 12 },
  tripRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  tripBtn: {
    background: cream, border: "1px solid #e0d0b5", borderRadius: 4,
    padding: "14px 12px", textAlign: "left", color: ink, font: "inherit",
  },
  tripLabel: { fontFamily: serif, fontSize: 18, fontWeight: 600 },
  tripTime: { fontSize: 14, color: "#6b563d", margin: "2px 0 10px" },
  seatBadge: {
    display: "inline-block", padding: "3px 10px", borderRadius: 999,
    fontSize: 13, letterSpacing: ".02em",
  },

  summaryBox: {
    background: kraft, border: "1px dashed #cbb794", borderRadius: 4,
    padding: "14px 16px", marginBottom: 20, fontSize: 16,
  },
  summaryNote: { fontStyle: "italic", color: "#8a7150" },
  summaryTrip: { marginTop: 4, color: "#6b563d" },
  summarySeats: { marginTop: 8, fontSize: 14, color: "#a4562a" },

  fieldLabel: { display: "block", fontSize: 15, color: "#6b563d", marginBottom: 6, fontStyle: "italic" },
  input: {
    width: "100%", boxSizing: "border-box", padding: "11px 13px",
    border: "1px solid #d8c6a8", borderRadius: 4, background: "#fffdf8",
    font: "inherit", fontSize: 16, color: ink, marginBottom: 14, outline: "none",
  },
  nameRow: { display: "flex", gap: 8, alignItems: "center", marginBottom: 10 },
  removeBtn: {
    width: 38, height: 38, flexShrink: 0, border: "1px solid #d8c6a8",
    background: "#fffdf8", borderRadius: 4, cursor: "pointer", fontSize: 20,
    color: "#a4562a", lineHeight: 1,
  },
  addBtn: {
    background: "none", color: "#a4562a",
    borderRadius: 4, padding: "9px 14px", cursor: "pointer", font: "inherit",
    fontSize: 15, marginTop: 4, borderColor: "#cbb794", borderStyle: "dashed", borderWidth: 1,
  },
  error: {
    background: "#f6e4dc", border: "1px solid #dcae97", color: "#9c3d1c",
    padding: "10px 13px", borderRadius: 4, marginTop: 14, fontSize: 15,
  },
  submit: {
    width: "100%", marginTop: 20, padding: "14px", background: "#a4562a",
    color: cream, border: "none", borderRadius: 4, cursor: "pointer",
    fontFamily: serif, fontSize: 20, fontWeight: 600, letterSpacing: ".02em",
  },

  checkMark: {
    width: 64, height: 64, borderRadius: "50%", background: "#e4ead9",
    color: "#4f6135", fontSize: 34, display: "flex", alignItems: "center",
    justifyContent: "center", margin: "6px auto 14px",
  },
  doneTitle: { fontFamily: serif, fontSize: 34, fontWeight: 700, margin: "0 0 6px" },
  doneSub: { color: "#6b563d", fontSize: 16, marginBottom: 22 },
  ticket: {
    background: "#fffdf8", border: "1px solid #e0d0b5", borderRadius: 4,
    padding: "18px 20px", textAlign: "left", marginBottom: 20,
  },
  ticketRow: {
    display: "flex", justifyContent: "space-between", gap: 16,
    padding: "7px 0", fontSize: 16, color: "#6b563d",
  },
  ticketDivider: { height: 1, background: "#e6d8bf", margin: "8px 0" },

  footer: { marginTop: 28, textAlign: "center" },
  footerRule: { height: 1, background: "#e6d8bf", margin: "0 auto 10px", maxWidth: 200 },
  footerText: { fontSize: 13, color: "#a99a83", fontStyle: "italic", margin: 0 },
};
