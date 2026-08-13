// The venue block shows a static map image rather than an embed: one request,
// no third-party script, no interactivity to wire up for something a TM only
// glances at before tapping through. REE-178.

const STATIC_MAP_ZOOM = 15
const STATIC_MAP_SIZE = '600x300'

export function staticMapUrl(lat: number, lng: number): string {
  const center = `${lat},${lng}`
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? ''
  return (
    `https://maps.googleapis.com/maps/api/staticmap?center=${center}` +
    `&zoom=${STATIC_MAP_ZOOM}&size=${STATIC_MAP_SIZE}` +
    `&markers=color:red%7C${center}&key=${key}`
  )
}

export function googleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
}
