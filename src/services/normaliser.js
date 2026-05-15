const { v4: uuidv4 } = require("uuid");

// Valid source channels
const VALID_SOURCES = ["whatsapp", "booking_com", "airbnb", "instagram", "direct"];

/**
 * Normalises an inbound payload into the unified message schema.
 * Throws if required fields are missing or source is unknown.
 *
 * @param {object} raw - Raw webhook payload
 * @returns {object} Normalised message
 */
function normalise(raw) {
  const { source, guest_name, message, timestamp, booking_ref, property_id } = raw;

  // ── Validation ─────────────────────────────────────────────────────────────
  if (!source || !VALID_SOURCES.includes(source.toLowerCase())) {
    throw new Error(
      `Invalid or missing source. Must be one of: ${VALID_SOURCES.join(", ")}`
    );
  }
  if (!guest_name || typeof guest_name !== "string" || !guest_name.trim()) {
    throw new Error("guest_name is required and must be a non-empty string.");
  }
  if (!message || typeof message !== "string" || !message.trim()) {
    throw new Error("message is required and must be a non-empty string.");
  }
  if (!property_id || typeof property_id !== "string" || !property_id.trim()) {
    throw new Error("property_id is required.");
  }

  // ── Timestamp handling ─────────────────────────────────────────────────────
  // Accept provided timestamp or fall back to now
  let parsedTimestamp;
  if (timestamp) {
    parsedTimestamp = new Date(timestamp);
    if (isNaN(parsedTimestamp.getTime())) {
      throw new Error("timestamp must be a valid ISO 8601 date string.");
    }
    parsedTimestamp = parsedTimestamp.toISOString();
  } else {
    parsedTimestamp = new Date().toISOString();
  }

  // ── Channel-specific normalisation ─────────────────────────────────────────
  // Each adapter can clean/transform source-specific quirks.
  // booking_com and airbnb sometimes prefix messages with booking IDs.
  const normalisedMessage = channelAdapter(source.toLowerCase(), message.trim());

  return {
    message_id: uuidv4(),
    source: source.toLowerCase(),
    guest_name: guest_name.trim(),
    message_text: normalisedMessage,
    timestamp: parsedTimestamp,
    booking_ref: booking_ref?.trim() || null,
    property_id: property_id.toLowerCase().trim(),
    // query_type is added by the classifier after normalisation
  };
}

/**
 * Channel-specific message cleaning.
 * Extend this as you learn each platform's quirks.
 */
function channelAdapter(source, message) {
  switch (source) {
    case "booking_com":
      // Booking.com sometimes prepends "Message from guest: "
      return message.replace(/^message from guest:\s*/i, "").trim();

    case "airbnb":
      // Airbnb sometimes appends automated footers
      return message.split(/---\s*Sent via Airbnb/i)[0].trim();

    case "instagram":
      // Strip common Instagram emoji spam at the start
      return message.replace(/^[\u{1F300}-\u{1FFFF}\s]+/u, "").trim() || message;

    case "whatsapp":
    case "direct":
    default:
      return message;
  }
}

module.exports = { normalise, VALID_SOURCES };
