-- Yo Property Plug - core schema

CREATE TABLE IF NOT EXISTS trusted_contacts (
  id             SERIAL PRIMARY KEY,
  name           TEXT NOT NULL,
  profession     TEXT NOT NULL,           -- e.g. 'Agent', 'Lawyer', 'Valuer', 'Surveyor', 'Developer', 'Mortgage/Finance'
  phone          TEXT NOT NULL,           -- WhatsApp-reachable number, include country code
  areas          TEXT[] NOT NULL DEFAULT '{}',  -- e.g. {'Gwarinpa','Jahi','Wuse'}
  speciality     TEXT,                    -- free text: 'Rentals & residential sales'
  purpose_tags   TEXT[] NOT NULL DEFAULT '{}',  -- e.g. {'rent','buy','land','commercial','investment'}
  verified       BOOLEAN NOT NULL DEFAULT FALSE,
  date_verified  DATE,
  verification_notes TEXT,                -- what you checked (ID, CAC, referrals, etc.)
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per WhatsApp user. `messages` holds the running conversation
-- so the AI has memory across turns (WhatsApp webhooks are stateless).
CREATE TABLE IF NOT EXISTS conversations (
  phone          TEXT PRIMARY KEY,
  messages       JSONB NOT NULL DEFAULT '[]',  -- [{role, content}, ...]
  last_summary   JSONB,                        -- last structured need extracted by the AI
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Simple log of every contact handoff, so you can see what's converting.
CREATE TABLE IF NOT EXISTS handoffs (
  id             SERIAL PRIMARY KEY,
  user_phone     TEXT NOT NULL,
  contact_id     INTEGER REFERENCES trusted_contacts(id),
  need_summary   JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Editable knobs - lets you change AI behaviour/guardrails from the
-- admin panel without touching code or redeploying.
CREATE TABLE IF NOT EXISTS settings (
  key            TEXT PRIMARY KEY,
  value          TEXT NOT NULL DEFAULT '',
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO settings (key, value) VALUES
  ('extra_instructions', ''),
  ('greeting_message', 'Yo 👋🏾 I''m Property Plug. Tell me what you''re looking for - rent, buy, land, or just some advice on a deal - and I''ll help you figure it out.')
ON CONFLICT (key) DO NOTHING;
