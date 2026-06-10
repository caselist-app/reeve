// Change-alert message templates.
// Each function returns a ready-to-send WhatsApp/SMS string.
// The "was" value must always be included when available so the recipient
// can confirm they have received the right update.
// No em-dashes anywhere in this file.

export type ChangeAlertParams = {
  changeType: 'transport_segment' | 'hotel_stay' | 'show' | 'day_sheet'
  // Human-readable label for the thing that changed.
  // e.g. "Flight IB1234" | "Bus leg" | "Load-in at Brixton Academy" | "Hotel check-in"
  label: string
  // The new value as a human-readable string.
  newValue: string
  // The previous value if known. Omit when not available (e.g. first edit).
  previousValue?: string | null
  // Free-text note the TM appended. Added below the auto-generated line.
  customMessage?: string | null
}

export function buildChangeMessage(params: ChangeAlertParams): string {
  const { label, newValue, previousValue, customMessage, changeType } = params

  const wasPart = previousValue ? ` (was ${previousValue})` : ''
  const body = `Update: ${label} is now ${newValue}${wasPart}.`

  const hint = changeType === 'transport_segment'
    ? 'Reply /travel for your full travel details.'
    : changeType === 'hotel_stay'
    ? 'Reply /hotel for your room details.'
    : 'Reply /itinerary for the full day sheet.'

  const parts = [body, hint]
  if (customMessage?.trim()) {
    parts.push('', customMessage.trim())
  }

  return parts.join('\n')
}

// Convenience builders for each change type.
// The caller is responsible for formatting times and addresses.

export function buildTransportChangeMessage(params: {
  carrier: string | null
  flightOrVehicleNo: string | null
  date: string
  newDepartTime: string
  previousDepartTime?: string | null
  customMessage?: string | null
}): string {
  const ref = [params.carrier, params.flightOrVehicleNo].filter(Boolean).join(' ')
  const label = ref ? `your ${ref} on ${params.date}` : `your travel on ${params.date}`
  return buildChangeMessage({
    changeType: 'transport_segment',
    label,
    newValue: `${params.newDepartTime} departure`,
    previousValue: params.previousDepartTime ?? null,
    customMessage: params.customMessage,
  })
}

export function buildHotelChangeMessage(params: {
  hotelName: string | null
  date: string
  newCheckInTime: string
  previousCheckInTime?: string | null
  customMessage?: string | null
}): string {
  const name = params.hotelName ?? 'your hotel'
  return buildChangeMessage({
    changeType: 'hotel_stay',
    label: `${name} check-in on ${params.date}`,
    newValue: params.newCheckInTime,
    previousValue: params.previousCheckInTime ?? null,
    customMessage: params.customMessage,
  })
}

export function buildShowLoadInChangeMessage(params: {
  venueName: string
  date: string
  newLoadIn: string
  previousLoadIn?: string | null
  customMessage?: string | null
}): string {
  return buildChangeMessage({
    changeType: 'show',
    label: `load-in at ${params.venueName} on ${params.date}`,
    newValue: params.newLoadIn,
    previousValue: params.previousLoadIn ?? null,
    customMessage: params.customMessage,
  })
}

export function buildShowAddressChangeMessage(params: {
  venueName: string
  newAddress: string
  customMessage?: string | null
}): string {
  return buildChangeMessage({
    changeType: 'show',
    label: params.venueName,
    newValue: `moved to ${params.newAddress}`,
    previousValue: null,
    customMessage: params.customMessage,
  })
}

export function buildDaySheetChangeMessage(params: {
  venueName: string
  date: string
  newLoadIn?: string | null
  previousLoadIn?: string | null
  customMessage?: string | null
}): string {
  if (params.newLoadIn) {
    return buildChangeMessage({
      changeType: 'day_sheet',
      label: `load-in at ${params.venueName} on ${params.date}`,
      newValue: params.newLoadIn,
      previousValue: params.previousLoadIn ?? null,
      customMessage: params.customMessage,
    })
  }
  // Generic day sheet update when no specific time is available.
  return buildChangeMessage({
    changeType: 'day_sheet',
    label: `the day sheet for ${params.venueName} on ${params.date}`,
    newValue: 'updated',
    previousValue: null,
    customMessage: params.customMessage,
  })
}
