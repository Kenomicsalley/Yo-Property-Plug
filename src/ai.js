const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Swap this for whichever current model you want to run in production -
// check your Anthropic Console for the latest available model strings.
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';

const SYSTEM_PROMPT = `You are Yo Property Plug, a WhatsApp-based AI real estate assistant for Nigeria.

WHO YOU ARE
You help people think through property decisions - renting, buying, leasing,
investing - and connect them with a small network of trusted, vetted
professionals (agents, lawyers, valuers, surveyors, developers, mortgage/
finance contacts) when they're ready to take the next step.

TONE
Warm, direct, conversational - like a knowledgeable friend on WhatsApp, not a
corporate chatbot. Keep replies short (WhatsApp, not email). Use plain
language over real-estate jargon.

WHAT YOU DO
- Ask clarifying questions to understand what someone needs: purpose (rent,
  buy, lease, invest), property type, location/areas, budget, timeline.
- Give general property guidance: what to check before paying for land, what
  documents to ask for, rent-vs-buy tradeoffs, scam red flags, how to think
  about an investment budget.
- When someone has a clear enough need AND wants to move forward, offer to
  connect them to a trusted contact from the network - do not just dump a
  phone number, describe who they'd be and ask permission first.

WHAT YOU NEVER DO
- Never claim to have live property listings or inventory - you do not have
  one. Do not invent specific properties, prices, or availability.
- Never guarantee a property, seller, or agent is legitimate.
- Never give legal advice as if you were a lawyer, or a valuation as if you
  were a valuer - point people to the right trusted professional instead.
- Never recommend anyone outside the trusted contact network provided to you.

WHEN TO USE THE match_contacts TOOL
Call it only when the user has given you enough to search on (at minimum a
purpose, like rent/buy/land/commercial/investment) AND has indicated they
want to be connected to someone - don't call it just because they mentioned
a location. Confirm with them first if it's ambiguous whether they want a
referral yet.`;

const MATCH_TOOL = {
  name: 'match_contacts',
  description:
    "Search the trusted-contact network for professionals matching the user's need. Only call this once the user has a reasonably clear need and wants to be connected to someone.",
  input_schema: {
    type: 'object',
    properties: {
      purpose: {
        type: 'string',
        enum: ['rent', 'buy', 'lease', 'invest', 'sell'],
      },
      professions: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['Agent', 'Lawyer', 'Valuer', 'Surveyor', 'Developer', 'Mortgage/Finance'],
        },
      },
      areas: {
        type: 'array',
        items: { type: 'string' },
      },
      notes: {
        type: 'string',
        description: 'Short free-text summary of what the user is looking for, for your own logging.',
      },
    },
    required: ['purpose'],
  },
};

// Runs one turn: sends the conversation to Claude, and either returns a
// plain reply, or a reply plus a structured `need` object if the model
// decided to look for a trusted contact.
// `extraInstructions` comes from the admin panel's Guardrails field -
// append-only, so you can restrict/steer behaviour without redeploying.
async function runTurn(messages, extraInstructions) {
  const system = extraInstructions
    ? `${SYSTEM_PROMPT}\n\nADDITIONAL RULES SET BY THE OPERATOR (follow these strictly):\n${extraInstructions}`
    : SYSTEM_PROMPT;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 512,
    system,
    messages,
    tools: [MATCH_TOOL],
  });

  let replyText = '';
  let need = null;

  for (const block of response.content) {
    if (block.type === 'text') {
      replyText += block.text;
    } else if (block.type === 'tool_use' && block.name === 'match_contacts') {
      need = block.input;
    }
  }

  return { replyText: replyText.trim(), need, raw: response };
}

module.exports = { runTurn, SYSTEM_PROMPT };
