require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');

const { sendText, extractInboundMessage } = require('./whatsapp');
const { runTurn } = require('./ai');
const {
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
} = require('./db');
const path = require('path');

const app = express();
app.use(bodyParser.json());
app.use('/admin', express.static(path.join(__dirname, '..', 'public')));

// ---- Health check (useful for Railway) ----
app.get('/', (req, res) => res.send('Yo Property Plug is running.'));

// ---- WhatsApp webhook verification (Meta calls this once when you ----
// ---- subscribe the webhook in the developer console) ----
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// ---- Inbound WhatsApp messages land here ----
app.post('/webhook', async (req, res) => {
  // Always 200 immediately - Meta retries aggressively on non-200s and
  // we don't want duplicate processing while we're doing AI + DB work.
  res.sendStatus(200);

  const inbound = extractInboundMessage(req.body);
  if (!inbound || !inbound.text) return; // ignore statuses, non-text messages, etc.

  const { from, text } = inbound;

  try {
    const convo = await getConversation(from);
    const messages = [...convo.messages, { role: 'user', content: text }];
    const extraInstructions = await getSetting('extra_instructions');

    const { replyText, need } = await runTurn(messages, extraInstructions);

    let finalReply = replyText;

    if (need) {
      const contacts = await findMatchingContacts(need);
      if (contacts.length === 0) {
        finalReply +=
          "\n\nI don't have a verified contact for that specific match yet - I'll keep it in mind. Want to tell me more about what you need in the meantime?";
      } else {
        const lines = contacts.map((c, i) => {
          const areaList = c.areas && c.areas.length ? ` | Areas: ${c.areas.join(', ')}` : '';
          return `${i + 1}. ${c.profession} - ${c.name}${areaList}${c.speciality ? `\n   ${c.speciality}` : ''}`;
        });
        finalReply +=
          `\n\nHere's who I'd suggest from the trusted network:\n\n${lines.join('\n\n')}` +
          `\n\nWant me to share any of their contact details?`;
        // Log the top match as the handoff candidate.
        await logHandoff(from, contacts[0].id, need);
      }
    }

    messages.push({ role: 'assistant', content: finalReply });
    await saveConversation(from, messages, need || convo.last_summary);

    await sendText(from, finalReply);
  } catch (err) {
    console.error('Error handling inbound message:', err);
    try {
      await sendText(
        from,
        "Sorry, something went wrong on my end. Please try again in a moment."
      );
    } catch (sendErr) {
      console.error('Also failed to send error reply:', sendErr);
    }
  }
});

// ---- Admin API ----
// Everything under /admin/api requires the x-admin-key header to match
// ADMIN_API_KEY. The static admin panel at /admin asks for this key and
// sends it with every request - nothing is stored server-side beyond env.
function requireAdmin(req, res, next) {
  const key = req.header('x-admin-key');
  if (!process.env.ADMIN_API_KEY || key !== process.env.ADMIN_API_KEY) {
    return res.sendStatus(401);
  }
  next();
}
app.use('/admin/api', requireAdmin);

app.get('/admin/api/contacts', async (req, res) => {
  try {
    res.json(await listContacts());
  } catch (err) {
    console.error('Failed to list contacts:', err);
    res.status(500).json({ error: 'Failed to list contacts.' });
  }
});

app.post('/admin/api/contacts', async (req, res) => {
  const { name, profession, phone, areas, speciality, purpose_tags, verified, verification_notes } =
    req.body || {};
  if (!name || !profession || !phone) {
    return res.status(400).json({ error: 'name, profession, and phone are required.' });
  }
  try {
    const id = await addTrustedContact({
      name, profession, phone, areas, speciality, purpose_tags, verified, verification_notes,
    });
    res.status(201).json({ id });
  } catch (err) {
    console.error('Failed to add contact:', err);
    res.status(500).json({ error: 'Failed to add contact.' });
  }
});

app.patch('/admin/api/contacts/:id', async (req, res) => {
  try {
    await updateContact(req.params.id, req.body || {});
    res.sendStatus(204);
  } catch (err) {
    console.error('Failed to update contact:', err);
    res.status(500).json({ error: 'Failed to update contact.' });
  }
});

app.get('/admin/api/settings', async (req, res) => {
  try {
    res.json(await getAllSettings());
  } catch (err) {
    console.error('Failed to load settings:', err);
    res.status(500).json({ error: 'Failed to load settings.' });
  }
});

app.put('/admin/api/settings/:key', async (req, res) => {
  const { value } = req.body || {};
  if (typeof value !== 'string') {
    return res.status(400).json({ error: 'value (string) is required.' });
  }
  try {
    await setSetting(req.params.key, value);
    res.sendStatus(204);
  } catch (err) {
    console.error('Failed to save setting:', err);
    res.status(500).json({ error: 'Failed to save setting.' });
  }
});

app.get('/admin/api/handoffs', async (req, res) => {
  try {
    res.json(await recentHandoffs());
  } catch (err) {
    console.error('Failed to load handoffs:', err);
    res.status(500).json({ error: 'Failed to load handoffs.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Yo Property Plug listening on port ${PORT}`));
