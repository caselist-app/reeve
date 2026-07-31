// Strips the trailing "(BNE)" and "Airport"/"International Airport" suffix
// AirLabs-derived origin/destination strings carry (see add-flight-form.tsx's
// commit step, e.g. "Brisbane Airport (BNE)") down to a plain place name
// ("Brisbane") for compact route display. Falls back to the IATA code if the
// stored string is empty. Shared by the schedule timeline card and the
// flight edit panel.
export function placeName(full: string | null, iata: string | null): string {
  if (!full) return iata ?? ''
  const stripped = full
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/\s+(International\s+)?Airport$/i, '')
    .trim()
  return stripped || iata || full
}
