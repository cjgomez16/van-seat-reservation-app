// Supabase Edge Function: send-booking-email
// ---------------------------------------------------------------------------
// Sends transactional emails via Resend when a booking is created, updated, or
// cancelled. Invoked by a Supabase Database Webhook on the `bookings` table
// (INSERT / UPDATE / DELETE). See EMAIL_SETUP.md for the full setup.
//
// Secrets it expects (set with `supabase secrets set` or in the dashboard):
//   RESEND_API_KEY   - your Resend API key (re_...)
//   FROM_EMAIL       - e.g. "Candy & Jonas <events@sgcoordination.com>"
//   WEBHOOK_SECRET   - shared secret; the webhook must send it as a header
// Auto-provided by Supabase: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// The email's human-readable labels (van, point, time) come from the `van_runs`
// table, so keep van_runs in sync with src/config.js (migration 0003 does the
// current sync). Van plate numbers are intentionally NOT included — confirmations
// go out at booking time, well before plates are assigned.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL = Deno.env.get("FROM_EMAIL")!;
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Keep in sync with BOARDING_NOTE in src/config.js.
const BOARDING_NOTE =
  "Please be at your pickup point 10–15 minutes before departure.";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

type Booking = {
  ref: string;
  run_id: string;
  booker_name: string;
  booker_email: string | null;
  passengers: string[];
  seats: number;
};

Deno.serve(async (req) => {
  // Authorize: the webhook must present the shared secret, in either the
  // Authorization: Bearer header (deploy with JWT verification off) or an
  // x-webhook-secret header (if you keep JWT verification on).
  const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const headerSecret = (req.headers.get("x-webhook-secret") ?? "").trim();
  const authorized =
    !!WEBHOOK_SECRET && (bearer === WEBHOOK_SECRET || headerSecret === WEBHOOK_SECRET);
  if (!authorized) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: { type: string; table: string; record: Booking | null; old_record: Booking | null };
  try {
    payload = await req.json();
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  if (payload.table !== "bookings") {
    return json({ skipped: "not the bookings table" });
  }

  // Pick the booking + email kind based on the change type.
  const kind = payload.type; // INSERT | UPDATE | DELETE
  const booking = kind === "DELETE" ? payload.old_record : payload.record;
  if (!booking) return json({ skipped: "no record" });

  const to = booking.booker_email?.trim();
  if (!to) return json({ skipped: "no email on booking" });

  // Look up the human-readable run details.
  const { data: run } = await admin
    .from("van_runs")
    .select("point_name, point_note, van_name, trip_label, trip_time")
    .eq("id", booking.run_id)
    .single();

  const isAfterparty = booking.run_id.startsWith("a");
  const serviceLabel = isAfterparty ? "After-party departure" : "Arrival to the venue";
  const pointRole = isAfterparty ? "Drop-off" : "Pickup";

  const details = {
    ref: booking.ref,
    serviceLabel,
    pointRole,
    point: run?.point_name ?? "",
    pointNote: run?.point_note ?? "",
    van: run?.van_name ?? "",
    departure: run ? `${run.trip_label} · ${run.trip_time}` : "",
    passengers: booking.passengers ?? [],
    bookerName: booking.booker_name,
  };

  const { subject, lead } = messageFor(kind, details.serviceLabel);
  const html = renderEmail({ ...details, lead, showBoarding: kind !== "DELETE" });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Resend error", res.status, err);
    return new Response("Email send failed", { status: 502 });
  }
  return json({ sent: to, kind });
});

function messageFor(kind: string, serviceLabel: string) {
  if (kind === "DELETE") {
    return {
      subject: "Your shuttle booking was cancelled",
      lead: `Your booking for the ${serviceLabel.toLowerCase()} has been cancelled and the seats released. If this wasn't you, please book again or get in touch.`,
    };
  }
  if (kind === "UPDATE") {
    return {
      subject: "Your shuttle booking was updated",
      lead: `Here are the latest details for your ${serviceLabel.toLowerCase()} booking.`,
    };
  }
  return {
    subject: "Your shuttle seat is reserved 🚐",
    lead: `You're all set! Here are the details for your ${serviceLabel.toLowerCase()} booking.`,
  };
}

function renderEmail(d: {
  ref: string;
  serviceLabel: string;
  pointRole: string;
  point: string;
  pointNote: string;
  van: string;
  departure: string;
  passengers: string[];
  bookerName: string;
  lead: string;
  showBoarding: boolean;
}) {
  const row = (label: string, value: string) => `
    <tr>
      <td style="padding:7px 0;color:#8a7150;font-size:14px;">${label}</td>
      <td style="padding:7px 0;color:#4a3723;font-size:14px;text-align:right;font-weight:600;">${value}</td>
    </tr>`;
  const passengers = d.passengers.map((p) => escapeHtml(p)).join("<br>");
  return `
  <div style="background:#f1e7d5;padding:28px 16px;font-family:Georgia,'Times New Roman',serif;">
    <div style="max-width:520px;margin:0 auto;background:#fffdf8;border:1px solid #e0d0b5;border-radius:6px;padding:28px 26px;">
      <p style="margin:0 0 4px;color:#a4562a;font-style:italic;font-size:15px;">Candy &amp; Jonas · October 1, 2026</p>
      <h1 style="margin:0 0 12px;color:#4a3723;font-size:26px;">Reserve Your Ride</h1>
      <p style="margin:0 0 18px;color:#6b563d;font-size:15px;line-height:1.5;">${escapeHtml(d.lead)}</p>

      <div style="display:inline-block;background:#efe4d2;border:1px dashed #cbb794;border-radius:4px;padding:8px 14px;font-size:18px;letter-spacing:.08em;color:#4a3723;margin-bottom:16px;">
        ${escapeHtml(d.ref)}
      </div>

      <table style="width:100%;border-collapse:collapse;">
        ${row("Shuttle", escapeHtml(d.serviceLabel))}
        ${row(escapeHtml(d.pointRole), escapeHtml(d.point))}
        ${row("Where", escapeHtml(d.pointNote))}
        ${row("Van", escapeHtml(d.van))}
        ${row("Departure", escapeHtml(d.departure))}
        ${row("Booked by", escapeHtml(d.bookerName))}
        <tr>
          <td style="padding:7px 0;color:#8a7150;font-size:14px;vertical-align:top;">Passengers</td>
          <td style="padding:7px 0;color:#4a3723;font-size:14px;text-align:right;font-weight:600;">${passengers}</td>
        </tr>
      </table>

      ${
        d.showBoarding
          ? `<p style="margin:16px 0 0;color:#8a7150;font-style:italic;font-size:13px;">⏱ ${escapeHtml(
              BOARDING_NOTE
            )}</p>`
          : ""
      }
      <p style="margin:16px 0 0;color:#8a7150;font-size:13px;">Keep your reference <b>${escapeHtml(
        d.ref
      )}</b> to edit or cancel your booking.</p>

      <hr style="border:none;border-top:1px solid #e6d8bf;margin:22px 0 12px;">
      <p style="margin:0;color:#a99a83;font-size:12px;">
        SG Coordination — every detail, beautifully handled.
        <a href="https://sgcoordination.com" style="color:#a4562a;">sgcoordination.com</a>
      </p>
    </div>
  </div>`;
}

function escapeHtml(s: string) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
  });
}
