require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");

const webhookRouter = require("./routes/webhook");
const logger = require("./utils/logger");

const app = express();
const PORT = process.env.PORT || 3000;

// ── Security middleware ───────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));

// ── Rate limiting — prevent API abuse ────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX || "100"),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});
app.use("/webhook", limiter);

// ── Request parsing ───────────────────────────────────────────────────────────
app.use(express.json({ limit: "50kb" }));
app.use(express.urlencoded({ extended: false }));

// ── HTTP request logging ──────────────────────────────────────────────────────
app.use(
  morgan("combined", {
    stream: { write: (msg) => logger.info(msg.trim()) },
    skip: (_req, res) => res.statusCode < 400, // only log errors in production
  }),
);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/webhook", webhookRouter);

// Root health check
app.get("/", (_req, res) => {
  res.json({
    service: "Nistula Guest Message Handler",
    version: "1.0.0",
    status: "running",
    endpoints: {
      webhook: "POST /webhook/message",
      health: "GET /webhook/health",
    },
  });
});

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  logger.error("Unhandled error", { error: err.message, stack: err.stack });
  res.status(500).json({ error: "Internal server error" });
});

// ── Start server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info(`Nistula Guest Message Handler running on port ${PORT}`, {
    env: process.env.NODE_ENV || "development",
    port: PORT,
  });
});

module.exports = app; // export for testing
