// src/test.js
// Manual integration test runner — tests 5 different inputs against
// the live server. Run AFTER `npm start` in another terminal.
//
// Usage: node src/test.js [base_url]
// Default base_url: http://localhost:3000

const BASE_URL = process.argv[2] || "http://localhost:3000";

const TEST_CASES = [
  // ── Test 1: Pre-sales availability + pricing (from brief) ─────────────────
  {
    name: "T1 — WhatsApp: availability + pricing query",
    payload: {
      source: "whatsapp",
      guest_name: "Rahul Sharma",
      message: "Is the villa available from April 20 to 24? What is the rate for 2 adults?",
      timestamp: "2026-05-05T10:30:00Z",
      booking_ref: "NIS-2024-0891",
      property_id: "villa-b1",
    },
    expectQueryType: "pre_sales_availability",
  },

  // ── Test 2: Post-sales check-in query ─────────────────────────────────────
  {
    name: "T2 — Airbnb: check-in time + WiFi password",
    payload: {
      source: "airbnb",
      guest_name: "Priya Menon",
      message: "Hi! What time can we check in tomorrow? Also, what is the WiFi password?",
      timestamp: "2026-04-19T14:00:00Z",
      booking_ref: "NIS-2024-1042",
      property_id: "villa-b1",
    },
    expectQueryType: "post_sales_checkin",
  },

  // ── Test 3: Complaint ─────────────────────────────────────────────────────
  {
    name: "T3 — WhatsApp: 3am complaint (no hot water)",
    payload: {
      source: "whatsapp",
      guest_name: "James Harrington",
      message: "There is no hot water and we have guests arriving for breakfast in 4 hours. This is unacceptable. I want a refund for tonight.",
      timestamp: "2026-04-21T03:00:00Z",
      booking_ref: "NIS-2024-1089",
      property_id: "villa-b1",
    },
    expectQueryType: "complaint",
    expectAction: "escalate",
  },

  // ── Test 4: Special request ───────────────────────────────────────────────
  {
    name: "T4 — Booking.com: anniversary decoration + chef",
    payload: {
      source: "booking_com",
      guest_name: "Ananya Krishnan",
      message: "We are celebrating our anniversary. Can you arrange flowers and a cake? Also need a chef for dinner on the first evening.",
      timestamp: "2026-04-15T09:00:00Z",
      booking_ref: "NIS-2024-0977",
      property_id: "villa-b1",
    },
    expectQueryType: "special_request",
  },

  // ── Test 5: General enquiry (Instagram) ──────────────────────────────────
  {
    name: "T5 — Instagram: pet policy",
    payload: {
      source: "instagram",
      guest_name: "Meera Iyer",
      message: "Hi! Do you allow pets? We have a small dog.",
      property_id: "villa-b1",
    },
    expectQueryType: "general_enquiry",
  },
];

async function runTests() {
  console.log(`\n${"═".repeat(60)}`);
  console.log("  NISTULA — WEBHOOK INTEGRATION TESTS");
  console.log(`  Target: ${BASE_URL}`);
  console.log(`${"═".repeat(60)}\n`);

  let passed = 0;
  let failed = 0;

  for (const tc of TEST_CASES) {
    console.log(`▸ ${tc.name}`);
    try {
      const res = await fetch(`${BASE_URL}/webhook/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tc.payload),
      });

      const data = await res.json();

      if (!res.ok) {
        console.log(`  ✗ HTTP ${res.status}: ${JSON.stringify(data)}\n`);
        failed++;
        continue;
      }

      // Assertions
      const issues = [];
      if (!data.message_id) issues.push("missing message_id");
      if (!data.drafted_reply) issues.push("missing drafted_reply");
      if (typeof data.confidence_score !== "number") issues.push("missing confidence_score");
      if (!["auto_send", "agent_review", "escalate"].includes(data.action)) issues.push("invalid action");
      if (tc.expectQueryType && data.query_type !== tc.expectQueryType) {
        issues.push(`expected query_type=${tc.expectQueryType}, got=${data.query_type}`);
      }
      if (tc.expectAction && data.action !== tc.expectAction) {
        issues.push(`expected action=${tc.expectAction}, got=${data.action}`);
      }

      if (issues.length > 0) {
        console.log(`  ✗ FAILED: ${issues.join("; ")}`);
        failed++;
      } else {
        console.log(`  ✓ PASSED`);
        console.log(`    query_type:       ${data.query_type}`);
        console.log(`    confidence_score: ${data.confidence_score}`);
        console.log(`    action:           ${data.action}`);
        console.log(`    reply preview:    "${data.drafted_reply.slice(0, 100)}..."`);
        passed++;
      }
    } catch (err) {
      console.log(`  ✗ ERROR: ${err.message}`);
      console.log(`  (Is the server running at ${BASE_URL}?)`);
      failed++;
    }
    console.log();
  }

  console.log(`${"─".repeat(60)}`);
  console.log(`  Results: ${passed} passed / ${failed} failed / ${TEST_CASES.length} total`);
  console.log(`${"─".repeat(60)}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
