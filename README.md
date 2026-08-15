# Yo Property Plug

WhatsApp-based AI real estate assistant. Talks to users, understands what
they need, and hands them off to a vetted human contact (agent, lawyer,
valuer, etc.) when they're ready to move forward. Standalone project - not
linked to the Kenomicsalley codebase.

## What's in here

```
src/server.js   Express app - webhook, message loop, admin endpoint
src/whatsapp.js Send/receive helpers for WhatsApp Cloud API
src/ai.js       Claude system prompt + conversation turn logic
src/db.js       Postgres access - conversations, contacts, handoffs
db/schema.sql   Table definitions
db/migrate.js   Run once to create tables
db/seed.js      Adds 2 placeholder trusted contacts for testing
```

## 1. Push to GitHub, then deploy to Railway

1. Create a new empty repo on GitHub (don't initialize it with a README).
2. From this folder:
   ```bash
   git init
   git add .
   git commit -m "Initial commit - Yo Property Plug MVP"
   git branch -M main
   git remote add origin https://github.com/<you>/yo-property-plug.git
   git push -u origin main
   ```
   (`.env` is already git-ignored, so your secrets won't get pushed.)
3. In Railway: **New Project → Deploy from GitHub repo** → pick this
   repo. Railway auto-detects Node and uses the `Procfile`/`npm start`.
4. Add a **Postgres** plugin to the same project. Railway injects
   `DATABASE_URL` into your app automatically.
5. In your service's **Variables** tab, add everything from
   `.env.example` except `DATABASE_URL` and `PORT` (Railway sets both).
6. Every future `git push` to `main` auto-redeploys — that's the whole
   workflow going forward, no manual redeploy step.
7. Once deployed, run the migration once (Railway → your service →
   **Settings → one-off command**, or via the Railway CLI locally with
   `railway run npm run migrate`):
   ```
   npm run migrate
   npm run seed   # optional - adds 2 fake contacts so you can test matching
   ```

## 2. The admin panel

Once deployed, go to `https://<your-railway-domain>/admin`. It'll ask
for your `ADMIN_API_KEY` (set that in Railway's Variables tab — make up
any password you like) and then gives you three tabs:

- **Trusted Contacts** — add/deactivate/verify contacts without touching
  the database directly. This replaces the `curl` command from earlier.
- **Guardrails & Greeting** — a free-text box that gets appended to the
  AI's system prompt on every message, as strict operator rules. Use it
  for things like *"never quote specific mortgage rates"*, *"always warn
  about document verification before land payments"*, or *"keep replies
  under 5 sentences"* — no redeploy needed, it's read from the database
  live. There's also a greeting-message field for the tone of the
  opening message.
- **Handoffs Log** — every time the AI surfaces a contact to a user,
  it's logged here with the phone number and what they were looking
  for, so you can see what's actually converting.

The admin key is sent as a header on every request and never stored
anywhere but your browser's session — don't share the key over
unencrypted channels, and rotate it in Railway's Variables tab if you
ever suspect it's leaked.

## 3. Set up the WhatsApp side (Meta)

1. Go to [developers.facebook.com](https://developers.facebook.com) →
   create an app → add the **WhatsApp** product.
2. In API Setup, you get a **temporary access token** and a **test phone
   number** for free - good enough for development. Copy the phone
   number ID and token into your Railway env vars
   (`WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TOKEN`).
3. Make up any string for `WHATSAPP_VERIFY_TOKEN` and put the same value
   in Railway's env vars.
4. In the app's **Webhook** config, set the callback URL to
   `https://<your-railway-domain>/webhook` and the verify token to the
   same string. Meta will hit `GET /webhook` once to confirm - this repo
   already handles that.
5. Subscribe the webhook to the `messages` field.
6. Add your own phone as a test recipient (required while the app is in
   development mode), then message your WhatsApp test number to try it.

**Note on cost:** the temporary token expires in ~24 hours - fine for
testing, but you'll want a permanent System User token before showing
this to real users. Also see the note below on WhatsApp pricing changes.

## 4. Add real trusted contacts

Once you're ready to move past the 2 placeholder contacts from
`seed.js`, add real ones through the **admin panel at `/admin`** (see
above) — no `curl` needed day-to-day. The API endpoint is still there
if you ever want to script it:

```bash
curl -X POST https://<your-railway-domain>/admin/contacts \
  -H "Content-Type: application/json" \
  -H "x-admin-key: <your ADMIN_API_KEY>" \
  -d '{
    "name": "Real Agent Name",
    "profession": "Agent",
    "phone": "234XXXXXXXXXX",
    "areas": ["Jahi", "Gwarinpa"],
    "speciality": "Rentals & residential sales",
    "purpose_tags": ["rent", "buy"],
    "verified": true,
    "verification_notes": "Verified via ID + 2 client referrals, 14 Aug 2026"
  }'
```

## 5. A cost note (read before you launch to real users)

WhatsApp replies sent within 24 hours of a user messaging you are
currently free. **That changes October 1, 2026** - Meta starts charging
for these too, though there's likely to still be a monthly free
allotment of service conversations per WhatsApp Business Account. Check
Meta's official pricing page again closer to that date before assuming
this stays fully free at scale. At low test volume the cost either way
will be negligible.

## 6. What to test before adding anything else

Don't build the property-listings phase yet. Get 5-10 real people to try
the conversation + handoff flow first and see if the trust angle alone
is compelling enough. If it is, that's your signal to invest in a
listings database next.
