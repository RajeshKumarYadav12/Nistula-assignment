// src/services/classifier.js
// Rule-based query classifier with keyword scoring.
// Design choice: keep classification local (fast, free, deterministic) rather
// than burning a Claude call on it. Each category carries a set of keyword
// signals weighted by specificity. The category with the highest cumulative
// score wins; ties fall to 'general_enquiry'.

const QUERY_TYPES = {
  complaint: {
    keywords: [
      "not working", "broken", "unacceptable", "unhappy", "disappointed",
      "refund", "complain", "complaint", "terrible", "awful", "disgusting",
      "no hot water", "no water", "no power", "no electricity", "no ac",
      "ac not", "wifi not", "disgusted", "worst", "horrible", "issue",
      "problem", "fault", "damaged", "dirty", "filthy", "bug", "pest",
      "cockroach", "rat", "mice", "mold", "mould", "leak", "flooded",
      "noise", "loud", "smell", "stink", "rude", "staff", "unclean",
    ],
    weight: 2, // complaints get priority weighting
  },
  pre_sales_availability: {
    keywords: [
      "available", "availability", "book", "booking", "dates", "check availability",
      "free", "open", "vacant", "can we stay", "is it available", "do you have",
      "nights", "days", "from", "to", "april", "may", "june", "july", "august",
      "september", "october", "november", "december", "january", "february", "march",
      "weekend", "week", "holiday",
    ],
    weight: 1,
  },
  pre_sales_pricing: {
    keywords: [
      "rate", "price", "pricing", "cost", "how much", "charges", "fee",
      "per night", "total", "quote", "estimate", "budget", "inr", "usd",
      "rupee", "payment", "deposit", "adults", "guests", "people", "persons",
      "2 adults", "3 adults", "4 guests", "family",
    ],
    weight: 1,
  },
  post_sales_checkin: {
    keywords: [
      "check in", "check-in", "checkin", "check out", "check-out", "checkout",
      "wifi", "wi-fi", "password", "arrive", "arrival", "key", "access",
      "address", "directions", "how to get", "location", "parking", "car",
      "early check", "late check", "time", "when can we", "what time",
    ],
    weight: 1,
  },
  special_request: {
    keywords: [
      "early check", "late check", "airport", "transfer", "pickup", "taxi",
      "cab", "arrange", "request", "special", "birthday", "anniversary",
      "decoration", "flowers", "cake", "chef", "cook", "meal", "food",
      "breakfast", "lunch", "dinner", "diet", "vegetarian", "vegan",
      "extra bed", "crib", "baby", "wheelchair", "accessibility",
    ],
    weight: 1,
  },
  general_enquiry: {
    keywords: [
      "pet", "dog", "cat", "animal", "smoking", "smoke", "party", "event",
      "noise", "quiet", "neighbour", "pool", "swimming", "beach", "nearby",
      "restaurant", "market", "atm", "hospital", "doctor", "pharmacy",
      "laundry", "iron", "kitchen", "bbq", "barbecue", "towel", "linen",
      "how many", "what is", "do you", "can we", "is there", "facilities",
    ],
    weight: 1,
  },
};

/**
 * Classifies a message into one of the defined query types.
 * Returns { queryType, scores } where scores can be logged for debugging.
 *
 * @param {string} messageText
 * @returns {{ queryType: string, scores: object }}
 */
function classifyQuery(messageText) {
  const text = messageText.toLowerCase();
  const scores = {};

  for (const [type, config] of Object.entries(QUERY_TYPES)) {
    let score = 0;
    for (const keyword of config.keywords) {
      if (text.includes(keyword)) {
        score += config.weight;
      }
    }
    scores[type] = score;
  }

  // Pick the type with the highest score; default to general_enquiry
  const winner = Object.entries(scores).reduce(
    (best, [type, score]) => (score > best.score ? { type, score } : best),
    { type: "general_enquiry", score: 0 }
  );

  return {
    queryType: winner.type,
    scores,
  };
}

module.exports = { classifyQuery };
