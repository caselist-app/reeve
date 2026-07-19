// Render functions for the four show-day WhatsApp block templates.
// Each function returns bodyParams[] matching the approved template's variable
// positions. All time values are pre-formatted HH:MM strings in the tour's
// local timezone by the caller.
//
// Template bodies (for submission to WhatsApp Manager):
//   opener:                  "Good morning, {{1}}.\n\n{{2}} @ {{3}}, {{4}}."
//   show_info_full:          "Load in: {{1}}\nSoundcheck: {{2}}\nChangeover: {{3}}\nShow: {{4}}."
//   show_info_no_soundcheck: "Load in: {{1}}\nChangeover: {{2}}\nShow: {{3}}."
//   show_info_no_changeover: "Load in: {{1}}\nSoundcheck: {{2}}\nShow: {{3}}."
//   show_info_minimal:       "Load in: {{1}}\nShow: {{2}}."
//   catering_full:           "Breakfast: {{1}}\nLunch: {{2}}\nDinner: {{3}}."
//   catering_no_breakfast:   "Lunch: {{1}}\nDinner: {{2}}."
//   catering_buyout:         "Today's show is a buyout. Sort your own food, keep receipts if needed."
//   wrap_travel:             "Curfew: {{1}}\n\nOnward: {{2}} to {{3}}, departing {{4}}."
//   wrap_static:             "Curfew: {{1}}."

import type { ShowInfoVariant, CateringVariant, WrapVariant, WrapOnwardLeg } from '@/lib/comms/blocks/select'

// Shared time formatter used by all block renderers.
// Accepts a UTC ISO string and returns HH:MM in the given IANA timezone.
export function formatBlockTime(iso: string | null, tz: string): string {
  if (!iso) return 'TBC'
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: tz,
  })
}

// Formats a time range as "HH:MM-HH:MM". Meta variables cannot contain
// newlines, so the range is a single string.
function timeRange(start: string | null, end: string | null, tz: string): string {
  const s = formatBlockTime(start, tz)
  const e = end ? formatBlockTime(end, tz) : ''
  return e ? `${s}-${e}` : s
}

// --- Opener ---

export type OpenerData = {
  personId: string
  person_first_name: string
  artist_name: string
  venue_name: string
  show_date: string  // YYYY-MM-DD display string
}

export function openerTemplateName(): string {
  return process.env.WHATSAPP_TEMPLATE_OPENER ?? ''
}

export function openerBodyParams(d: OpenerData): string[] {
  return [d.person_first_name, d.artist_name, d.venue_name, d.show_date]
}

// --- Show information ---

export type ShowInfoData = {
  personId: string
  variant: ShowInfoVariant
  load_in: string | null
  soundcheck: string | null
  changeover: string | null
  headliner_on: string | null
  timezone: string
}

export function showInfoTemplateName(variant: ShowInfoVariant): string {
  const map: Record<ShowInfoVariant, string | undefined> = {
    full: process.env.WHATSAPP_TEMPLATE_SHOW_INFO_FULL,
    no_soundcheck: process.env.WHATSAPP_TEMPLATE_SHOW_INFO_NO_SOUNDCHECK,
    no_changeover: process.env.WHATSAPP_TEMPLATE_SHOW_INFO_NO_CHANGEOVER,
    minimal: process.env.WHATSAPP_TEMPLATE_SHOW_INFO_MINIMAL,
  }
  return map[variant] ?? ''
}

export function showInfoBodyParams(d: ShowInfoData): string[] {
  const tz = d.timezone
  const t = (iso: string | null) => formatBlockTime(iso, tz)
  switch (d.variant) {
    case 'full':
      return [t(d.load_in), t(d.soundcheck), t(d.changeover), t(d.headliner_on)]
    case 'no_soundcheck':
      return [t(d.load_in), t(d.changeover), t(d.headliner_on)]
    case 'no_changeover':
      return [t(d.load_in), t(d.soundcheck), t(d.headliner_on)]
    case 'minimal':
      return [t(d.load_in), t(d.headliner_on)]
  }
}

// --- Catering ---

export type CateringData = {
  personId: string
  variant: CateringVariant
  catering_breakfast_start: string | null
  catering_breakfast_end: string | null
  catering_lunch_start: string | null
  catering_lunch_end: string | null
  catering_dinner_start: string | null
  catering_dinner_end: string | null
  timezone: string
}

export function cateringTemplateName(variant: CateringVariant): string {
  const map: Record<CateringVariant, string | undefined> = {
    full: process.env.WHATSAPP_TEMPLATE_CATERING_FULL,
    no_breakfast: process.env.WHATSAPP_TEMPLATE_CATERING_NO_BREAKFAST,
    buyout: process.env.WHATSAPP_TEMPLATE_CATERING_BUYOUT,
  }
  return map[variant] ?? ''
}

export function cateringBodyParams(d: CateringData): string[] {
  const tz = d.timezone
  const r = (start: string | null, end: string | null) => timeRange(start, end, tz)
  switch (d.variant) {
    case 'full':
      return [
        r(d.catering_breakfast_start, d.catering_breakfast_end),
        r(d.catering_lunch_start, d.catering_lunch_end),
        r(d.catering_dinner_start, d.catering_dinner_end),
      ]
    case 'no_breakfast':
      return [
        r(d.catering_lunch_start, d.catering_lunch_end),
        r(d.catering_dinner_start, d.catering_dinner_end),
      ]
    case 'buyout':
      return []  // catering_buyout has no variables
  }
}

// --- Wrap ---

export type WrapData = {
  personId: string
  variant: WrapVariant
  curfew: string | null
  onwardLeg: WrapOnwardLeg | null
  timezone: string
}

export function wrapTemplateName(variant: WrapVariant): string {
  const map: Record<WrapVariant, string | undefined> = {
    travel: process.env.WHATSAPP_TEMPLATE_WRAP_TRAVEL,
    static: process.env.WHATSAPP_TEMPLATE_WRAP_STATIC,
  }
  return map[variant] ?? ''
}

export function wrapBodyParams(d: WrapData): string[] {
  const tz = d.timezone
  const curfew = formatBlockTime(d.curfew, tz)
  switch (d.variant) {
    case 'travel': {
      const leg = d.onwardLeg!
      const mode = leg.mode.charAt(0).toUpperCase() + leg.mode.slice(1)
      return [curfew, mode, leg.destination ?? 'TBC', formatBlockTime(leg.depart_at, tz)]
    }
    case 'static':
      return [curfew]
  }
}
