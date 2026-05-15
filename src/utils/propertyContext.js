// src/utils/propertyContext.js
// Mock property context store — in production this would be a DB / CMS lookup

const PROPERTIES = {
  "villa-b1": {
    name: "Villa B1",
    location: "Assagao, North Goa",
    bedrooms: 3,
    max_guests: 6,
    private_pool: true,
    check_in_time: "2:00 PM",
    check_out_time: "11:00 AM",
    base_rate_inr: 18000,
    base_rate_covers_guests: 4,
    extra_guest_rate_inr: 2000,
    wifi_password: "Nistula@2024",
    caretaker_hours: "8:00 AM – 10:00 PM",
    chef_on_call: true,
    chef_note: "Pre-booking required",
    cancellation_policy: "Free cancellation up to 7 days before check-in",
    availability: {
      // Keyed by date range strings for simplicity; production would query a calendar API
      "2026-04-20_2026-04-24": true,
    },
    amenities: ["Private pool", "Chef on call", "Caretaker", "WiFi", "AC"],
    emergency_contact: "+91-XXXXXXXXXX", // Caretaker / ops number
  },
};

/**
 * Returns property context object or null if not found.
 * @param {string} propertyId
 */
function getPropertyContext(propertyId) {
  return PROPERTIES[propertyId] || null;
}

/**
 * Serialises property context into a readable string for the Claude prompt.
 * @param {object} property
 */
function formatPropertyForPrompt(property) {
  if (!property) return "No property context available.";

  return `
PROPERTY DETAILS:
- Name: ${property.name}, ${property.location}
- Bedrooms: ${property.bedrooms} | Max Guests: ${property.max_guests}
- Private Pool: ${property.private_pool ? "Yes" : "No"}
- Check-in: ${property.check_in_time} | Check-out: ${property.check_out_time}
- Base Rate: INR ${property.base_rate_inr.toLocaleString("en-IN")} per night (up to ${property.base_rate_covers_guests} guests)
- Extra Guest Rate: INR ${property.extra_guest_rate_inr.toLocaleString("en-IN")} per night per person
- WiFi Password: ${property.wifi_password}
- Caretaker: Available ${property.caretaker_hours}
- Chef On Call: ${property.chef_on_call ? `Yes — ${property.chef_note}` : "No"}
- Cancellation Policy: ${property.cancellation_policy}
- Amenities: ${property.amenities.join(", ")}
- April 20–24 2026 Availability: Available
`.trim();
}

module.exports = { getPropertyContext, formatPropertyForPrompt };
