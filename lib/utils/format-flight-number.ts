// "CX150" -> "CX 150", matching the reference app's spacing. Shared by the
// schedule timeline card and the flight edit panel. Falls back to the raw
// string if it doesn't match the expected airline-code-plus-digits shape.
export function formatFlightNumber(vehicleOrFlightNo: string | null): string {
  if (!vehicleOrFlightNo) return ''
  const match = vehicleOrFlightNo.match(/^([A-Za-z]{2,3})(\d+)$/)
  return match ? `${match[1]} ${match[2]}` : vehicleOrFlightNo
}
