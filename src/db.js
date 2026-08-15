const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('railway')
    ? { rejectUnauthorized: false }
    : undefined,
});

async function getConversation(phone) {
  const { rows } = await pool.query(
    'SELECT phone, messages, last_summary FROM conversations WHERE phone = $1',
    [phone]
  );
  if (rows.length === 0) {
    return { phone, messages: [], last_summary: null };
  }
  return rows[0];
}

async function saveConversation(phone, messages, lastSummary) {
  await pool.query(
    `INSERT INTO conversations (phone, messages, last_summary, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (phone)
     DO UPDATE SET messages = $2, last_summary = $3, updated_at = now()`,
    [phone, JSON.stringify(messages), lastSummary ? JSON.stringify(lastSummary) : null]
  );
}

// Matches trusted contacts against a structured need the AI extracted,
// e.g. { purpose: 'buy', property_type: 'land', areas: ['Lugbe'], professions: ['Agent','Lawyer'] }
async function findMatchingContacts(need) {
  const professions = need.professions && need.professions.length ? need.professions : null;
  const areas = need.areas && need.areas.length ? need.areas : null;
  const purpose = need.purpose || null;

  const { rows } = await pool.query(
    `SELECT id, name, profession, phone, areas, speciality, purpose_tags, verified
     FROM trusted_contacts
     WHERE active = TRUE
       AND ($1::text[] IS NULL OR profession = ANY($1))
       AND ($2::text[] IS NULL OR areas && $2)
       AND ($3::text IS NULL OR $3 = ANY(purpose_tags))
     ORDER BY verified DESC, id ASC
     LIMIT 5`,
    [professions, areas, purpose]
  );
  return rows;
}

async function logHandoff(userPhone, contactId, needSummary) {
  await pool.query(
    `INSERT INTO handoffs (user_phone, contact_id, need_summary) VALUES ($1, $2, $3)`,
    [userPhone, contactId, needSummary ? JSON.stringify(needSummary) : null]
  );
}

async function addTrustedContact(contact) {
  const { rows } = await pool.query(
    `INSERT INTO trusted_contacts
      (name, profession, phone, areas, speciality, purpose_tags, verified, date_verified, verification_notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7, CASE WHEN $7 THEN now() ELSE NULL END, $8)
     RETURNING id`,
    [
      contact.name,
      contact.profession,
      contact.phone,
      contact.areas || [],
      contact.speciality || null,
      contact.purpose_tags || [],
      !!contact.verified,
      contact.verification_notes || null,
    ]
  );
  return rows[0].id;
}

async function listContacts() {
  const { rows } = await pool.query(
    `SELECT id, name, profession, phone, areas, speciality, purpose_tags,
            verified, date_verified, verification_notes, active, created_at
     FROM trusted_contacts ORDER BY active DESC, created_at DESC`
  );
  return rows;
}

async function updateContact(id, fields) {
  const allowed = ['name', 'profession', 'phone', 'areas', 'speciality', 'purpose_tags', 'verified', 'verification_notes', 'active'];
  const sets = [];
  const values = [];
  let i = 1;
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      sets.push(`${key} = $${i}`);
      values.push(fields[key]);
      i += 1;
    }
  }
  if (fields.verified === true) {
    sets.push(`date_verified = now()`);
  }
  if (sets.length === 0) return;
  values.push(id);
  await pool.query(`UPDATE trusted_contacts SET ${sets.join(', ')} WHERE id = $${i}`, values);
}

async function getSetting(key) {
  const { rows } = await pool.query('SELECT value FROM settings WHERE key = $1', [key]);
  return rows.length ? rows[0].value : '';
}

async function getAllSettings() {
  const { rows } = await pool.query('SELECT key, value FROM settings');
  const out = {};
  for (const row of rows) out[row.key] = row.value;
  return out;
}

async function setSetting(key, value) {
  await pool.query(
    `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`,
    [key, value]
  );
}

async function recentHandoffs(limit = 25) {
  const { rows } = await pool.query(
    `SELECT h.id, h.user_phone, h.need_summary, h.created_at,
            c.name AS contact_name, c.profession
     FROM handoffs h
     LEFT JOIN trusted_contacts c ON c.id = h.contact_id
     ORDER BY h.created_at DESC LIMIT $1`,
    [limit]
  );
  return rows;
}

module.exports = {
  pool,
  getConversation,
  saveConversation,
  findMatchingContacts,
  logHandoff,
  addTrustedContact,
  listContacts,
  updateContact,
  getSetting,
  getAllSettings,
  setSetting,
  recentHandoffs,
};
