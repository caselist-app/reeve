// Fallback for every tour-level route other than /tours/[id]/schedule
// (people, settings, individual shows, transport, hotels, etc). Belt-and-
// braces alongside the top-level @secondaryPanel/default.tsx so there is no
// gap in Next.js's slot resolution at this intermediate segment.
export default function Default() {
  return null
}
