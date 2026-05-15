# Nistula Guest Message Handler

A production-ready backend system that receives inbound guest messages from multiple channels, normalises them into a unified schema, drafts contextual replies via the Claude AI API, and returns a confidence-scored response with a recommended action.

## Tech Stack

| Layer       | Choice                                        | Why                                                         |
| ----------- | --------------------------------------------- | ----------------------------------------------------------- |
| Runtime     | Node.js 18+                                   | Async I/O is a natural fit for webhook → external API flows |
| Framework   | Express                                       | Minimal, widely understood, fast to build on                |
| AI          | Anthropic Claude (`claude-sonnet-4-20250514`) | Best-in-class instruction following for guest-facing prose  |
| Validation  | `express-validator`                           | Declarative, composable, produces clean error messages      |
| Logging     | Winston                                       | Structured JSON in production; readable dev format          |
| Security    | Helmet + express-rate-limit                   | Baseline protection for a public webhook endpoint           |
| DB (schema) | PostgreSQL                                    | Best relational DB for structured messaging data at scale   |

## Project Structure

nistula-assessment/
├── src/
│ ├── index.js # Express app entry point
│ ├── routes/
│ │ └── webhook.js # POST /webhook/message handler
│ ├── services/
│ │ ├── normaliser.js # Webhook payload → unified schema
│ │ ├── classifier.js # Rule-based query type classification
│ │ ├── claudeService.js # Claude API integration + prompt builder
│ │ └── confidence.js # Confidence score computation
│ └── utils/
│ ├── logger.js # Winston logger
│ └── propertyContext.js # Mock property data store
├── schema.sql # Part 2 — PostgreSQL schema
├── thinking.md # Part 3 — Written answers
├── .env.example # Environment variable template
└── package.json

````



## Setup

### Prerequisites

- Node.js 18 or later
- An Anthropic API key

### Installation

```bash
git clone https://github.com/YOUR_USERNAME/nistula-technical-assessment.git
cd nistula-technical-assessment

npm install

cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY
````

### Environment Variables

ANTHROPIC_API_KEY=sk-ant-api03-... # Required
PORT=3000 # Optional, default 3000
NODE_ENV=development # Optional
RATE_LIMIT_MAX=100 # Optional, requests per 15 min per IP

````

### Running the server

```bash
# Development (auto-restart on file changes)
npm run dev

# Production
npm start
````

### Running tests

With the server running in one terminal:

```bash
# In a second terminal:
npm test

# Or against a different URL:
node src/test.js https://your-server.com
```

## API Reference

### `POST /webhook/message`

Accepts an inbound guest message and returns an AI-drafted reply with metadata.

**Request body:**

```json
{
  "source": "whatsapp",
  "guest_name": "Rahul Sharma",
  "message": "Is the villa available from April 20 to 24? What is the rate for 2 adults?",
  "timestamp": "2026-05-05T10:30:00Z",
  "booking_ref": "NIS-2024-0891",
  "property_id": "villa-b1"
}
```

| Field         | Type     | Required | Description                                                |
| ------------- | -------- | -------- | ---------------------------------------------------------- |
| `source`      | string   | ✓        | `whatsapp`, `booking_com`, `airbnb`, `instagram`, `direct` |
| `guest_name`  | string   | ✓        | Guest's full name                                          |
| `message`     | string   | ✓        | The guest's message text                                   |
| `timestamp`   | ISO 8601 | —        | Message timestamp; defaults to now                         |
| `booking_ref` | string   | —        | Nistula booking reference                                  |
| `property_id` | string   | ✓        | Property identifier (e.g. `villa-b1`)                      |

**Response (200):**

```json
{
  "message_id": "550e8400-e29b-41d4-a716-446655440000",
  "query_type": "pre_sales_availability",
  "drafted_reply": "Hi Rahul! Great news — Villa B1 is available from April 20 to 24...",
  "confidence_score": 0.91,
  "action": "auto_send",
  "_debug": {
    "confidence_breakdown": { ... },
    "normalised_message": { ... },
    "processing_ms": 1240
  }
}
```

**Action values:**

| Action         | Confidence          | Meaning                                |
| -------------- | ------------------- | -------------------------------------- |
| `auto_send`    | ≥ 0.85              | Reply can be sent without human review |
| `agent_review` | 0.60–0.84           | An agent should review before sending  |
| `escalate`     | < 0.60 or complaint | Route to human agent immediately       |

### `GET /webhook/health`

Returns `{ "status": "ok", "timestamp": "..." }`.

## Confidence Scoring Logic

The confidence score (0–1) is a weighted average of four signals. It answers the question: _"How much should we trust this AI reply to be sent without human review?"_

### Signal 1 — Query Clarity (35% weight)

Measures how unambiguous the query classification was. The rule-based classifier scores every category; a clear winner (one category with 70%+ of total score) signals high clarity. A near-tie between categories (the guest asked something spanning multiple topics) signals low clarity.

clarity = max_score / total_score, normalised to [0, 1]

```

### Signal 2 — Context Completeness (30% weight)

Did we have rich property data to give Claude?

- Known property with full context → `1.0`
- Unknown property (no context) → `0.2` — Claude will have to improvise, so we should review

### Signal 3 — Message Complexity (20% weight)

A proxy for how difficult the message is to answer correctly:


complexity_score = 1 - (question_count - 1) * 0.1 - (word_count / 200)
```

A single clear question gets a high score; a long multi-part message with several unknowns scores lower.

### Signal 4 — Channel Trust (15% weight)

Some channels provide more reliable identity verification than others:

| Channel             | Trust score |
| ------------------- | ----------- |
| WhatsApp, Direct    | 1.00        |
| Booking.com, Airbnb | 0.95        |
| Instagram           | 0.80        |

### Hard rules

- **Complaints always escalate** — regardless of score, `query_type = complaint` forces `action = escalate` and `score = 0.40`. We never auto-send a reply to an unhappy guest.

## Query Classification

## Submission Checklist

This repository contains everything required by the Nistula technical assessment brief:

- [x] **README.md** — Setup, API docs, confidence scoring logic, and checklist
- [x] **/src** — All backend code (webhook, normaliser, classifier, Claude integration, confidence, utils)
- [x] **schema.sql** — PostgreSQL schema with comments and design rationale
- [x] **thinking.md** — Written answers to all Part 3 questions
- [x] **.env.example** — Template for required environment variables (no secrets)
- [x] **test.js** — Manual integration tests for all query types and actions

## How to Submit

1. Push this repository to GitHub as `nistula-technical-assessment` (public)
2. Double-check `.env` is **not** committed (see `.gitignore`)
3. Reply to the assessment email with your GitHub repo link
4. Done!

Classification is rule-based (no extra API call). Each category holds a list of keyword signals; the category with the highest cumulative hit count wins. Complaints get a 2× weight multiplier to ensure they're never missed.

| Query Type               | Example                                       |
| ------------------------ | --------------------------------------------- |
| `pre_sales_availability` | "Is the villa free April 20–24?"              |
| `pre_sales_pricing`      | "What's the rate for 2 adults 3 nights?"      |
| `post_sales_checkin`     | "What time can we check in? What's the WiFi?" |
| `special_request`        | "Can you arrange a birthday cake and chef?"   |
| `complaint`              | "The AC isn't working. This is unacceptable." |
| `general_enquiry`        | "Do you allow pets? Is there parking?"        |

## Design Decisions & Trade-offs

**Why local classification instead of a Claude call?**
Rule-based classification is fast (< 1ms vs 1–2s), free, and deterministic — easy to debug and audit. For a production system, a fine-tuned classifier or a lightweight embedding model would be more accurate, but keyword scoring is good enough for 6 clearly-differentiated categories and avoids burning API budget on every message.

**Why Express over FastAPI?**
The team is assessed on thinking, not framework preference. Node.js suits this use case (async I/O, JSON-native) and Express is maximally readable for any backend developer reviewing the code.

**Why not store messages to a database in this implementation?**
To keep the assessment focused on the core pipeline. The schema.sql defines exactly how persistence would work. Adding a PostgreSQL connection is a straightforward next step using `pg` or `prisma`.

## What I'd Add With More Time

1. **PostgreSQL persistence** — wire up the schema to actually store every message and reply
2. **Webhook signature verification** — validate HMAC signatures from Booking.com / Airbnb
3. **Conversation threading** — pass recent conversation history into the Claude prompt for context
4. **Async queue** — use a message queue (e.g. BullMQ + Redis) so the webhook returns immediately and Claude processing happens asynchronously
5. **Fine-tuned classifier** — replace keyword matching with a small embedding model
6. **Agent dashboard** — a simple UI to review and send `agent_review` messages
