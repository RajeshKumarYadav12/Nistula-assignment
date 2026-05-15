# Part 3 — Thinking Questions

---

## Question A — The Immediate Response

**The AI message sent at 3am:**

> Hi James, I'm really sorry — this is not the experience we want for you at all. I've just escalated this to our caretaker right now and they'll be at the villa within the next 30 minutes to fix the hot water. I'll also make sure our team follows up with you first thing in the morning about the refund request. Please bear with us — we're on it.

**Why this wording:**
The message leads with a genuine apology (not a hollow "sorry for the inconvenience"), immediately states a concrete action with a time commitment (30 minutes), and acknowledges the refund request without making an unilateral commitment the AI isn't authorised to grant. The tone is warm and urgent, not corporate. Guests at 3am need to feel heard and helped in under 10 seconds of reading.

---

## Question B — The System Design

Beyond sending the message, the platform should trigger the following cascade:

**Immediate (< 60 seconds):**
- Flag the message as `complaint` → force `action = escalate` regardless of AI confidence score
- Create an escalation record with `sla_deadline = triggered_at + 30 minutes`
- Send a high-priority push notification + SMS to the on-call caretaker for Villa B1 with the guest name, booking reference, and complaint summary
- Send a Slack / WhatsApp alert to the ops duty manager with the full message and escalation ID
- Log the incident in the `complaint_patterns` table under topic `hot_water` for Villa B1

**Within 5 minutes:**
- Send an internal ticket to the property ops team with: guest name, booking ref, complaint text, caretaker notification status, and a link to the conversation thread
- Record the AI drafted reply and mark the message as `escalated` — no auto-send

**SLA monitoring (30-minute window):**
- If no human has responded within 30 minutes, the escalation is marked `sla_breached = true`
- Trigger a second alert to the senior duty manager / property owner
- Send a follow-up message to the guest: *"Hi James, I wanted to check in — our caretaker should be with you by now. If you haven't heard from them yet, please call [caretaker number] directly. We're on it."*

**Morning:**
- Flag the reservation for a finance review regarding the refund request
- Assign the conversation to a senior agent to respond to the refund ask with authority

---

## Question C — The Learning

If hot water complaints at Villa B1 have happened three times in two months, the system has failed operationally — not just in guest communication.

**What the system should do:**
The `complaint_patterns` table tracks `(property_id, topic, occurrence_count)`. On the third occurrence of `hot_water` at `villa-b1`, the platform should:

1. **Alert the property operations team** — not just the on-call caretaker, but the person responsible for preventive maintenance. The message should include: dates of all three incidents, booking references, guest names, and the cost of each incident (refunds, comp nights, reputational damage).

2. **Freeze new bookings** (optional, configurable) — or at minimum, flag the property in the booking pipeline so the reservations team can proactively warn guests while the issue is investigated.

3. **Create a maintenance work order** — if integrated with a property management system, auto-raise a ticket: "Inspect and service water heater — 3 guest complaints in 60 days."

**What I would build to prevent the fourth complaint:**

A proactive pre-arrival check system. 48 hours before each check-in, the platform sends an automated checklist to the caretaker: confirm WiFi works, AC works, hot water works, pool is clean. The caretaker responds with a simple thumbs-up or flags an issue. If they flag hot water, the ops team fixes it before the guest arrives — not at 3am.

This turns the platform from a reactive complaint handler into a proactive quality system. The data to build it is already in the schema: `reservations.check_in_date`, `properties.caretaker_phone`, and the `complaint_patterns` table provide everything needed to run pre-arrival checks targeted specifically at known problem areas per property.

The goal is that by the time a guest sends a WhatsApp message at 3am, the system has already failed twice — once when the issue wasn't caught pre-arrival, and once when the caretaker check wasn't done. Building those two earlier catch points eliminates most of the 3am scenarios entirely.
