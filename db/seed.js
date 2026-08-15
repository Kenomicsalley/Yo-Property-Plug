require('dotenv').config();
const { Pool } = require('pg');

const SAMPLE_CONTACTS = [
  {
    name: 'Example Agent - Abuja Residential',
    profession: 'Agent',
    phone: '2348000000001',
    areas: ['Gwarinpa', 'Jahi', 'Wuse'],
    speciality: 'Rentals & residential sales',
    purpose_tags: ['rent', 'buy', 'residential'],
    verified: true,
    verification_notes: 'Replace with a real vetted contact before going live.',
  },
  {
    name: 'Example Property Lawyer',
    profession: 'Lawyer',
    phone: '2348000000002',
    areas: ['Abuja'],
    speciality: 'Title verification & documentation',
    purpose_tags: ['buy', 'land', 'commercial'],
    verified: true,
    verification_notes: 'Replace with a real vetted contact before going live.',
  },
];

async function seed() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('railway')
      ? { rejectUnauthorized: false }
      : undefined,
  });

  for (const c of SAMPLE_CONTACTS) {
    await pool.query(
      `INSERT INTO trusted_contacts
        (name, profession, phone, areas, speciality, purpose_tags, verified, date_verified, verification_notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7, now(), $8)`,
      [c.name, c.profession, c.phone, c.areas, c.speciality, c.purpose_tags, c.verified, c.verification_notes]
    );
  }
  console.log(`Seeded ${SAMPLE_CONTACTS.length} example contacts. Edit db/seed.js with your real vetted contacts, or use the admin API once it's built out.`);
  await pool.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
