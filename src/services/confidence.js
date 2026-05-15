const CHANNEL_TRUST = {
  whatsapp: 1.0,
  direct: 1.0,
  booking_com: 0.95,
  airbnb: 0.95,
  instagram: 0.80,
};

/**
 * Calculate a confidence score for a drafted reply.
 *
 * @param {object} params
 * @param {string} params.queryType    - Classified query type
 * @param {object} params.scores       - Raw classifier scores per category
 * @param {object|null} params.property - Property context (null if not found)
 * @param {string} params.messageText  - Original message
 * @param {string} params.source       - Inbound channel
 * @returns {{ score: number, action: string, breakdown: object }}
 */
function computeConfidence({ queryType, scores, property, messageText, source }) {
  // ── 1. Complaint hard cap ─────────────────────────────────────────────────
  if (queryType === "complaint") {
    return {
      score: 0.40,
      action: "escalate",
      breakdown: { reason: "complaint_hard_cap" },
    };
  }

  // ── 2. Query clarity ──────────────────────────────────────────────────────
  const scoreValues = Object.values(scores);
  const maxScore = Math.max(...scoreValues);
  const totalScore = scoreValues.reduce((a, b) => a + b, 0);
  // If total is 0 (no keywords matched), clarity is low
  const clarityRaw = totalScore === 0 ? 0.3 : maxScore / totalScore;
  // Normalize: a perfect winner gets 1.0; complete tie among 6 gets ~0.17
  const clarityNorm = Math.min(clarityRaw * 2.5, 1.0);

  // ── 3. Context completeness ───────────────────────────────────────────────
  const contextScore = property ? 1.0 : 0.2;

  // ── 4. Message complexity ─────────────────────────────────────────────────
  // Proxy: count question marks + sentence count; more = more complex
  const questionCount = (messageText.match(/\?/g) || []).length;
  const wordCount = messageText.split(/\s+/).length;
  // Simple heuristic: ≤1 question, ≤20 words → complexity low → score high
  const complexityScore = Math.max(0, 1 - (questionCount - 1) * 0.1 - (wordCount / 200));

  // ── 5. Channel trust ──────────────────────────────────────────────────────
  const channelScore = CHANNEL_TRUST[source] ?? 0.85;

  // ── Weighted average ──────────────────────────────────────────────────────
  const score =
    clarityNorm    * 0.35 +
    contextScore   * 0.30 +
    complexityScore * 0.20 +
    channelScore   * 0.15;

  const finalScore = Math.round(Math.min(Math.max(score, 0), 1) * 100) / 100;

  // ── Action threshold ──────────────────────────────────────────────────────
  let action;
  if (finalScore >= 0.85) action = "auto_send";
  else if (finalScore >= 0.60) action = "agent_review";
  else action = "escalate";

  return {
    score: finalScore,
    action,
    breakdown: {
      query_clarity: Math.round(clarityNorm * 100) / 100,
      context_completeness: contextScore,
      message_complexity: Math.round(complexityScore * 100) / 100,
      channel_trust: channelScore,
    },
  };
}

module.exports = { computeConfidence };
