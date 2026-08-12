// E.164: + followed by country code (1 non-zero digit) and 6-14 more digits.
export const E164_REGEX = /^\+[1-9]\d{6,14}$/

// Cleans up the two copy-paste artefacts a TM's WhatsApp number most often
// arrives with: gaps between digit groups, and a leading 0 in place of the
// country code's +. It does not invent a missing country code beyond that
// leading digit swap, so a number typed as a local 0-prefixed number without
// its country code still fails E164_REGEX afterwards, which is intentional:
// this fixes formatting, not an incomplete number.
export function normalizeWhatsappNumber(raw: string): string {
  const stripped = raw.replace(/\s+/g, '')
  return stripped.startsWith('0') ? `+${stripped.slice(1)}` : stripped
}
