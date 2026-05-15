-- =============================================================================
-- NISTULA UNIFIED MESSAGING PLATFORM — PostgreSQL Schema
-- =============================================================================
-- Design philosophy:
--   • One guest profile per real person, unified across all channels
--   • All messages from all channels live in one table (messages)
--   • Conversations are the grouping unit: one conversation per guest per stay
--   • Full AI audit trail: every inbound message stores confidence, query type,
--     drafted reply, edit history, and final send status
--   • Channel identity records allow one guest to message via multiple platforms
--     without creating duplicate guest profiles
-- =============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. PROPERTIES
--    Master record for each villa / property. Source of truth for context data
--    that currently lives in propertyContext.js.
-- -----------------------------------------------------------------------------
CREATE TABLE properties (
    id              TEXT PRIMARY KEY,               -- e.g. 'villa-b1'
    display_name    TEXT NOT NULL,
    location        TEXT NOT NULL,
    bedrooms        SMALLINT NOT NULL,
    max_guests      SMALLINT NOT NULL,
    has_pool        BOOLEAN NOT NULL DEFAULT FALSE,
    check_in_time   TIME NOT NULL DEFAULT '14:00',
    check_out_time  TIME NOT NULL DEFAULT '11:00',
    base_rate_inr   NUMERIC(10,2) NOT NULL,
    extra_guest_inr NUMERIC(10,2) NOT NULL DEFAULT 0,
    caretaker_phone TEXT,
    wifi_password   TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE properties IS
    'Master property records. Extended attributes (amenities, availability) '
    'live in separate child tables to avoid wide rows and allow easier querying.';

-- -----------------------------------------------------------------------------
-- 2. GUEST PROFILES
--    One row per real-world guest. We unify across channels using email or phone
--    as the canonical identifier. A guest may have multiple channel_identities.
-- -----------------------------------------------------------------------------
CREATE TABLE guests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name       TEXT NOT NULL,
    -- At least one of email / phone should be non-null (enforced via CHECK below)
    email           TEXT UNIQUE,
    phone           TEXT UNIQUE,
    preferred_name  TEXT,                           -- "Rahul" even if full_name is "Rahul Sharma"
    language        TEXT NOT NULL DEFAULT 'en',
    notes           TEXT,                           -- internal CRM notes
    is_vip          BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT guests_contact_check
        CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

COMMENT ON TABLE guests IS
    'Unified guest identity. One row per real person, regardless of how many '
    'channels they use. Deduplication happens via email or phone at insert time.';

-- -----------------------------------------------------------------------------
-- 3. CHANNEL IDENTITIES
--    Maps external platform identifiers to internal guest profiles.
--    E.g. guest_id X has WhatsApp ID "+919xxxxxxxxx" and Airbnb ID "airbnb_abc123".
-- -----------------------------------------------------------------------------
CREATE TYPE channel_source AS ENUM (
    'whatsapp', 'booking_com', 'airbnb', 'instagram', 'direct'
);

CREATE TABLE channel_identities (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guest_id            UUID NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
    source              channel_source NOT NULL,
    external_id         TEXT NOT NULL,              -- platform-specific user ID
    display_name        TEXT,                       -- name as shown on that platform
    is_verified         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (source, external_id)                    -- one identity per platform per guest
);

COMMENT ON TABLE channel_identities IS
    'Links platform-specific IDs (WhatsApp number, Airbnb user ID, etc.) to a '
    'unified guest profile. Allows the same guest to message from multiple channels.';

-- -----------------------------------------------------------------------------
-- 4. RESERVATIONS
--    A booking/stay record linked to a guest and a property.
-- -----------------------------------------------------------------------------
CREATE TYPE reservation_status AS ENUM (
    'enquiry', 'confirmed', 'checked_in', 'checked_out', 'cancelled'
);

CREATE TABLE reservations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_ref     TEXT UNIQUE NOT NULL,           -- e.g. 'NIS-2024-0891'
    guest_id        UUID NOT NULL REFERENCES guests(id),
    property_id     TEXT NOT NULL REFERENCES properties(id),
    check_in_date   DATE NOT NULL,
    check_out_date  DATE NOT NULL,
    num_guests      SMALLINT NOT NULL,
    total_inr       NUMERIC(12,2),
    status          reservation_status NOT NULL DEFAULT 'enquiry',
    source          channel_source,                 -- which channel the booking came from
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT reservation_dates_check
        CHECK (check_out_date > check_in_date)
);

CREATE INDEX idx_reservations_guest        ON reservations(guest_id);
CREATE INDEX idx_reservations_property     ON reservations(property_id);
CREATE INDEX idx_reservations_booking_ref  ON reservations(booking_ref);
CREATE INDEX idx_reservations_dates        ON reservations(check_in_date, check_out_date);

-- -----------------------------------------------------------------------------
-- 5. CONVERSATIONS
--    A conversation groups all messages for one guest across one stay.
--    New conversation = new booking / new context window.
--    Design decision: one conversation per reservation, not per session,
--    so agents always see the full history for a guest's stay in one thread.
-- -----------------------------------------------------------------------------
CREATE TYPE conversation_status AS ENUM (
    'open', 'resolved', 'escalated', 'archived'
);

CREATE TABLE conversations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guest_id        UUID NOT NULL REFERENCES guests(id),
    reservation_id  UUID REFERENCES reservations(id),  -- nullable: pre-booking conversations
    property_id     TEXT NOT NULL REFERENCES properties(id),
    status          conversation_status NOT NULL DEFAULT 'open',
    opened_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at     TIMESTAMPTZ,
    assigned_agent  TEXT,                              -- agent email / ID if escalated
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conversations_guest        ON conversations(guest_id);
CREATE INDEX idx_conversations_reservation  ON conversations(reservation_id);
CREATE INDEX idx_conversations_status       ON conversations(status);

COMMENT ON TABLE conversations IS
    'Groups all messages for a guest stay. One conversation per reservation. '
    'Pre-booking conversations have reservation_id = NULL.';

-- -----------------------------------------------------------------------------
-- 6. MESSAGES
--    The core table. Every inbound and outbound message from every channel.
--    Inbound messages carry AI metadata; outbound messages carry send status.
-- -----------------------------------------------------------------------------
CREATE TYPE message_direction AS ENUM ('inbound', 'outbound');

CREATE TYPE query_type AS ENUM (
    'pre_sales_availability',
    'pre_sales_pricing',
    'post_sales_checkin',
    'special_request',
    'complaint',
    'general_enquiry'
);

CREATE TYPE send_status AS ENUM (
    'ai_drafted',       -- AI wrote it, not yet reviewed
    'agent_edited',     -- Human edited the AI draft
    'auto_sent',        -- Sent automatically (confidence >= 0.85)
    'agent_sent',       -- Agent reviewed and sent
    'escalated',        -- Handed off, no reply sent yet
    'failed'            -- Delivery failed
);

CREATE TABLE messages (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id     UUID NOT NULL REFERENCES conversations(id),
    guest_id            UUID NOT NULL REFERENCES guests(id),
    direction           message_direction NOT NULL,
    source              channel_source NOT NULL,
    property_id         TEXT NOT NULL REFERENCES properties(id),

    -- Message content
    body                TEXT NOT NULL,
    sent_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Inbound only: AI classification
    query_type          query_type,
    ai_confidence_score NUMERIC(4,3) CHECK (ai_confidence_score BETWEEN 0 AND 1),

    -- Outbound / reply tracking
    drafted_reply       TEXT,                       -- AI-drafted text
    final_reply         TEXT,                       -- text actually sent (may differ if agent edited)
    send_status         send_status,
    action_taken        TEXT,                       -- 'auto_send' | 'agent_review' | 'escalate'
    sent_by_agent       TEXT,                       -- agent ID if human sent
    sent_at_outbound    TIMESTAMPTZ,

    -- Linking inbound → outbound reply
    reply_to_message_id UUID REFERENCES messages(id),

    -- Metadata
    raw_payload         JSONB,                      -- original webhook payload for debugging
    booking_ref         TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation   ON messages(conversation_id);
CREATE INDEX idx_messages_guest          ON messages(guest_id);
CREATE INDEX idx_messages_property       ON messages(property_id);
CREATE INDEX idx_messages_direction      ON messages(direction);
CREATE INDEX idx_messages_query_type     ON messages(query_type);
CREATE INDEX idx_messages_send_status    ON messages(send_status);
CREATE INDEX idx_messages_sent_at        ON messages(sent_at DESC);
CREATE INDEX idx_messages_confidence     ON messages(ai_confidence_score);

COMMENT ON TABLE messages IS
    'All inbound and outbound messages across all channels. Inbound messages '
    'carry AI classification metadata. Outbound messages carry the full audit '
    'trail: what AI drafted, what was actually sent, and who sent it.';

-- -----------------------------------------------------------------------------
-- 7. MESSAGE EDIT HISTORY
--    Immutable log of every edit to a drafted AI reply.
--    Required for auditing: regulators and dispute resolution may need to
--    know exactly what the AI said vs what the agent changed.
-- -----------------------------------------------------------------------------
CREATE TABLE message_edit_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id      UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    edited_by       TEXT NOT NULL,                 -- agent ID / email
    previous_body   TEXT NOT NULL,
    new_body        TEXT NOT NULL,
    edit_reason     TEXT,
    edited_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_edit_history_message ON message_edit_history(message_id);

-- -----------------------------------------------------------------------------
-- 8. COMPLAINT PATTERNS
--    Aggregated view / materialised data for repeat issue detection.
--    Tracks recurring complaint topics per property to trigger proactive ops.
-- -----------------------------------------------------------------------------
CREATE TABLE complaint_patterns (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id     TEXT NOT NULL REFERENCES properties(id),
    topic           TEXT NOT NULL,                  -- e.g. 'hot_water', 'ac', 'wifi'
    occurrence_count INT NOT NULL DEFAULT 1,
    first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    alert_triggered BOOLEAN NOT NULL DEFAULT FALSE,
    alert_sent_at   TIMESTAMPTZ,
    resolved        BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_at     TIMESTAMPTZ,
    notes           TEXT,

    UNIQUE (property_id, topic)
);

CREATE INDEX idx_complaint_patterns_property ON complaint_patterns(property_id);
CREATE INDEX idx_complaint_patterns_topic    ON complaint_patterns(topic);

COMMENT ON TABLE complaint_patterns IS
    'Aggregated complaint topic tracking per property. When occurrence_count '
    'crosses a threshold (e.g. 3), the platform triggers a proactive ops alert. '
    'This powers the "hot water at Villa B1" pattern detection in Part 3C.';

-- -----------------------------------------------------------------------------
-- 9. ESCALATIONS
--    Tracks the lifecycle of escalated conversations: who was notified,
--    when they responded, and what the resolution was.
-- -----------------------------------------------------------------------------
CREATE TABLE escalations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id     UUID NOT NULL REFERENCES conversations(id),
    message_id          UUID NOT NULL REFERENCES messages(id),
    triggered_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reason              TEXT NOT NULL,              -- why it was escalated
    notified_agents     TEXT[],                     -- array of agent emails / IDs
    first_response_at   TIMESTAMPTZ,
    resolved_at         TIMESTAMPTZ,
    resolution_notes    TEXT,
    -- SLA tracking
    sla_deadline        TIMESTAMPTZ,               -- e.g. triggered_at + 30 minutes
    sla_breached        BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_escalations_conversation ON escalations(conversation_id);
CREATE INDEX idx_escalations_triggered    ON escalations(triggered_at DESC);
CREATE INDEX idx_escalations_sla_breached ON escalations(sla_breached) WHERE sla_breached = TRUE;

-- =============================================================================
-- DESIGN DECISIONS
-- =============================================================================
--
-- Q: Why is `query_type` nullable on messages?
--    A: It only applies to inbound messages. Outbound (drafted/sent) replies
--       don't need a query type. Making it nullable avoids a separate table
--       while keeping the schema honest.
--
-- Q: Why not split inbound and outbound into separate tables?
--    A: A single messages table with a direction enum keeps conversation
--       threading simple: SELECT * FROM messages WHERE conversation_id = X
--       ORDER BY sent_at gives the full thread in one query. Splitting would
--       require UNIONs or views everywhere agents look at a conversation.
--
-- Q: Why store both drafted_reply and final_reply?
--    A: The AI draft and what was actually sent may differ. Storing both
--       allows us to measure how often agents edit AI replies (a quality
--       signal for the AI system) and provides a full audit trail.
--
-- Q: Why channel_identities as a separate table?
--    A: A guest may contact via WhatsApp before booking and then via
--       Airbnb after. Without this table we'd create duplicate guest rows.
--       The separate table lets us merge identities when we discover they're
--       the same person (via email match on a booking reference, for example).
--
-- Q: What was the HARDEST design decision?
--    See thinking.md — but in brief: deciding how to link conversations to
--    reservations when a guest might start messaging before they have a
--    booking reference. The solution is making reservation_id nullable on
--    conversations, then retroactively linking it when a booking ref appears
--    in a subsequent message. This requires a background job to backfill
--    the FK, which adds operational complexity — but the alternative
--    (splitting pre-sales and post-sales into separate conversation tables)
--    would have destroyed the unified message history that makes the platform
--    valuable for agents.
-- =============================================================================
