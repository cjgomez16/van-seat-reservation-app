# Email confirmations — setup

Sends a branded email when a booking is **created**, **updated**, or
**cancelled** (only if the booker entered an email). Uses **Resend** for
delivery and a **Supabase Edge Function** triggered by a **Database Webhook** on
the `bookings` table. The email key stays server-side — never in the browser.

Steps that need **you** (account / DNS / deploy) are marked 🧑. The rest is
already in the repo.

---

## 1. 🧑 Resend account + verify sgcoordination.com

1. Sign up at [resend.com](https://resend.com).
2. **Domains → Add Domain →** `sgcoordination.com`.
3. Resend shows a few DNS records (SPF + DKIM, sometimes a return-path CNAME).
   Add them in the DNS panel for sgcoordination.com (wherever the domain is
   managed). Click **Verify** — it can take a few minutes to a few hours.
4. Once verified, sending from `events@sgcoordination.com` will work and land in
   inboxes rather than spam.
5. **API Keys → Create API Key** (Sending access). Copy it (`re_...`).

> To try it before DNS is ready, Resend lets you send from `onboarding@resend.dev`
> **only to your own account email**. Fine for a first smoke test; switch to
> `events@sgcoordination.com` for real guests.

## 2. Deploy the Edge Function

The function is in `supabase/functions/send-booking-email/index.ts`.

**Option A — Supabase CLI (recommended)**

```bash
# one-time: install CLI and link the project
brew install supabase/tap/supabase
supabase link --project-ref uxtoimnshdnommbbdwwf

# set secrets (pick any strong WEBHOOK_SECRET string)
supabase secrets set RESEND_API_KEY=re_your_key_here
supabase secrets set FROM_EMAIL="Candy & Jonas <events@sgcoordination.com>"
supabase secrets set WEBHOOK_SECRET=choose-a-long-random-string

# deploy WITH JWT verification off (the webhook authenticates via WEBHOOK_SECRET)
supabase functions deploy send-booking-email --no-verify-jwt
```

**Option B — Dashboard**: Edge Functions → Create → name it exactly
`send-booking-email` → paste the file's contents → **turn OFF "Verify JWT"** →
Deploy. Then Edge Functions → Secrets → add the three secrets above.

> Why JWT off: Supabase otherwise requires a valid JWT in the `Authorization`
> header, but the webhook sends the `WEBHOOK_SECRET` there. With JWT off, the
> function's own secret check is what protects it. (If you'd rather keep JWT on,
> send the secret in an `x-webhook-secret` header instead — the function accepts
> either.)

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically.

The function URL will be:
`https://uxtoimnshdnommbbdwwf.functions.supabase.co/send-booking-email`

## 3. 🧑 Create the Database Webhook

Supabase dashboard → **Database → Webhooks → Create a new hook**:

- **Table:** `bookings`
- **Events:** ✅ Insert ✅ Update ✅ Delete
- **Type:** HTTP Request → **POST** to the function URL above
- **HTTP Headers:** add
  `Authorization: Bearer <the WEBHOOK_SECRET you chose>`

Save. Now every booking change POSTs to the function, which verifies the secret
and emails the booker.

## 4. Sync the trip times (one SQL run)

The email reads van/time labels from `van_runs`, so run
`supabase/migrations/0003_sync_trip_times.sql` in the SQL editor once (updates
the arrival trip times to the single "11:30 AM" / "12:30 PM" form). The app is
unaffected — it reads times from `config.js`.

## 5. Test

1. Make a booking on the site with your own email → you should receive the
   confirmation within seconds.
2. Cancel it from **Manage booking** → you should receive the cancellation.
3. If nothing arrives: Edge Functions → **Logs** shows each invocation and any
   Resend error; Resend → **Emails** shows delivery status.

---

## Notes

- **What's included:** reference, shuttle, pickup/drop-off, van, departure time,
  passengers, and the boarding note. **Plate numbers are not included** —
  confirmations go out at booking time, before plates are assigned.
- **Keep in sync:** if you rename vans/points or change times in `config.js`,
  update `van_runs` too (that's what the email reads).
- **Abuse note:** the booking form is public, so in theory someone could submit
  bookings with other people's emails to send them confirmations. Content is
  benign (a wedding confirmation) and Resend has sending limits, so this is low
  risk for a private guest list — but if it ever matters, we can add a simple
  rate limit or a light CAPTCHA.
