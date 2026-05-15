require("dotenv").config();

const Anthropic = require("@anthropic-ai/sdk");
const logger = require("../utils/logger");

let client;

// ── Initialize Claude client ────────────────────────────────────────────────
function getClient() {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;

    console.log("Loaded API Key:", apiKey);

    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is missing in .env");
    }

    client = new Anthropic({
      apiKey: apiKey,
    });
  }

  return client;
}

// ── System prompt ───────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `
You are a warm, professional guest relations assistant for Nistula, a premium villa hospitality company in Goa, India.

Your replies should be:
- Friendly
- Concise
- Accurate
- Professional

Never invent information.
`;

// ── Draft reply function ────────────────────────────────────────────────────
async function draftReply({ normalised, propertyContext, queryType, source }) {
  try {
    const anthropic = getClient();

    const userPrompt = `
Guest Name: ${normalised.guest_name}
Channel: ${source}
Message: ${normalised.message_text}

Property Context:
${propertyContext}

Query Type:
${queryType}

Draft a professional reply.
`;

    logger.info("Calling Claude API", {
      messageId: normalised.message_id,
    });

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: userPrompt,
        },
      ],
    });

    console.log("Claude Response:", response);

    const reply =
      response.content?.[0]?.text ||
      "Unable to generate response at the moment.";

    return reply;
  } catch (error) {
    console.error("Claude API Error:", error.message);

    // Fallback response
    return `Hi ${normalised.guest_name}, thank you for reaching out. Our team is checking your request and will get back to you shortly.`;
  }
}

module.exports = {
  draftReply,
};
