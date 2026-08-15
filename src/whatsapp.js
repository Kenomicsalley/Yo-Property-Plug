const axios = require('axios');

const GRAPH_VERSION = 'v21.0';

function apiUrl() {
  return `https://graph.facebook.com/${GRAPH_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
}

async function sendText(to, body) {
  await axios.post(
    apiUrl(),
    {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body },
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }
  );
}

// Extracts the first inbound text message from a webhook payload, or
// null if this payload isn't a user text message (e.g. a delivery
// status update, which Meta also sends to the same webhook).
function extractInboundMessage(body) {
  try {
    const entry = body.entry && body.entry[0];
    const change = entry && entry.changes && entry.changes[0];
    const value = change && change.value;
    const message = value && value.messages && value.messages[0];
    if (!message) return null;

    return {
      from: message.from, // sender's WhatsApp number, no '+'
      text: message.text ? message.text.body : null,
      type: message.type,
    };
  } catch (err) {
    return null;
  }
}

module.exports = { sendText, extractInboundMessage };
