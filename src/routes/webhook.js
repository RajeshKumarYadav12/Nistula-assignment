// src/routes/webhook.js
// POST /webhook/message — main entry point for all inbound guest messages.

const { Router } = require("express");
const { body, validationResult } = require("express-validator");

const { normalise, VALID_SOURCES } = require("../services/normaliser");
const { classifyQuery } = require("../services/classifier");
const { draftReply } = require("../services/claudeService");
const { computeConfidence } = require("../services/confidence");
const { getPropertyContext, formatPropertyForPrompt } = require("../utils/propertyContext");
const logger = require("../utils/logger");

const router = Router();

// ── Input validation rules ────────────────────────────────────────────────────
const messageValidation = [
  body("source")
    .trim()
    .toLowerCase()
    .isIn(VALID_SOURCES)
    .withMessage(`source must be one of: ${VALID_SOURCES.join(", ")}`),
  body("guest_name")
    .trim()
    .notEmpty()
    .withMessage("guest_name is required")
    .isLength({ max: 200 })
    .withMessage("guest_name must be under 200 characters"),
  body("message")
    .trim()
    .notEmpty()
    .withMessage("message is required")
    .isLength({ max: 5000 })
    .withMessage("message must be under 5000 characters"),
  body("property_id")
    .trim()
    .notEmpty()
    .withMessage("property_id is required"),
  body("timestamp")
    .optional()
    .isISO8601()
    .withMessage("timestamp must be a valid ISO 8601 date string"),
  body("booking_ref")
    .optional()
    .isString()
    .isLength({ max: 100 })
    .withMessage("booking_ref must be a string under 100 characters"),
];

// ── POST /webhook/message ─────────────────────────────────────────────────────
router.post("/message", messageValidation, async (req, res) => {
  const startTime = Date.now();

  // ── 1. Validate request ───────────────────────────────────────────────────
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.warn("Webhook validation failed", { errors: errors.array(), body: req.body });
    return res.status(400).json({
      error: "Validation failed",
      details: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }

  try {
    // ── 2. Normalise ──────────────────────────────────────────────────────────
    const normalised = normalise(req.body);
    logger.info("Message normalised", { message_id: normalised.message_id, source: normalised.source });

    // ── 3. Classify query type ────────────────────────────────────────────────
    const { queryType, scores } = classifyQuery(normalised.message_text);
    normalised.query_type = queryType;
    logger.info("Query classified", { message_id: normalised.message_id, queryType, scores });

    // ── 4. Fetch property context ─────────────────────────────────────────────
    const property = getPropertyContext(normalised.property_id);
    if (!property) {
      logger.warn("Property not found", { property_id: normalised.property_id });
    }
    const propertyContext = formatPropertyForPrompt(property);

    // ── 5. Draft reply via Claude ─────────────────────────────────────────────
    const drafted_reply = await draftReply({
      normalised,
      propertyContext,
      queryType,
      source: normalised.source,
    });

    // ── 6. Compute confidence score ───────────────────────────────────────────
    const { score: confidence_score, action, breakdown } = computeConfidence({
      queryType,
      scores,
      property,
      messageText: normalised.message_text,
      source: normalised.source,
    });

    const processingMs = Date.now() - startTime;
    logger.info("Webhook processed successfully", {
      message_id: normalised.message_id,
      queryType,
      confidence_score,
      action,
      processingMs,
    });

    // ── 7. Return response ────────────────────────────────────────────────────
    return res.status(200).json({
      message_id: normalised.message_id,
      query_type: queryType,
      drafted_reply,
      confidence_score,
      action,
      // Include breakdown and normalised schema in response for transparency
      // In production you might remove these from the public response
      _debug: {
        confidence_breakdown: breakdown,
        normalised_message: normalised,
        processing_ms: processingMs,
      },
    });
  } catch (err) {
    const processingMs = Date.now() - startTime;
    logger.error("Webhook processing failed", {
      error: err.message,
      stack: err.stack,
      body: req.body,
      processingMs,
    });

    // Don't expose internal error details in production
    const isProduction = process.env.NODE_ENV === "production";
    return res.status(500).json({
      error: "Failed to process message",
      ...(isProduction ? {} : { detail: err.message }),
    });
  }
});

// ── Health check ──────────────────────────────────────────────────────────────
router.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

module.exports = router;
