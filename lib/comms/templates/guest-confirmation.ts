import { passTypeLabel, pickupLabel } from '@/lib/guest-list/vocabulary'

// The email a guest gets once the TM has put their name on the door. Brief 52,
// step 9 (REE-136). A plain, branded note: where to collect, when doors are,
// nothing more. Pure and unit tested; lib/guest-list/send-confirmations.ts
// assembles the data from the show and its doors day_item and hands it here.
//
// No AI, no template call: this is copy, the same zero-model shape as the other
// crew-facing templates. No em-dashes anywhere in this file.
//
// The doors line is present only when doors is a real time. A guest list email
// that says "Doors: TBC" is worse than one that does not mention doors: it reads
// as information when it is the absence of it, so the line is dropped entirely
// (brief decision). Address and credential follow the same rule.

export interface GuestConfirmationData {
  guestName: string
  venueName: string
  // Already formatted ("Friday 14 June") by the producer, so this file stays
  // free of any timezone reasoning: it is copy, not date maths.
  showDate: string
  // Wall-clock doors time in the tour timezone ("19:30"), or null when there is
  // no doors day_item on the show. Null means no doors line at all, never "TBC".
  doorsTime: string | null
  // The venue address, or null when the show has none recorded yet.
  address: string | null
  // How many are in the guest's name, counting them.
  numTickets: number
  // The stored pass_type value. 'ticket' is a plain ticket and is not spelled
  // out; anything else names the credential the guest collects.
  passType: string
  passTypeDetail: string | null
  // The stored pickup value and its detail line, or null when the TM has not set
  // a collection point. A null pickup falls back to the box office in copy.
  pickup: string | null
  pickupDetail: string | null
  // The artist whose list this is, for the greeting. Null falls back to a
  // generic line rather than naming nobody.
  artistName: string | null
}

function ticketPhrase(n: number): string {
  return `${n} ${n === 1 ? 'ticket' : 'tickets'}`
}

// The credential the guest collects, when it is not a plain ticket. 'Guest
// laminate' becomes "Guest laminate (Mick's crew)" when a detail is set.
function credentialLine(data: GuestConfirmationData): string | null {
  if (data.passType === 'ticket') return null
  const label = passTypeLabel(data.passType)
  const detail = data.passTypeDetail?.trim()
  return detail ? `Collect a ${label} (${detail}).` : `Collect a ${label}.`
}

// Where to collect, always present. A null pickup is the common case (crew rarely
// set it), and the box office is the safe default rather than a blank line.
function collectionLine(data: GuestConfirmationData): string {
  const point = data.pickup ? pickupLabel(data.pickup) : 'Box office'
  const detail = data.pickup === 'other' && data.pickupDetail?.trim()
  const where = detail ? `${point} (${data.pickupDetail!.trim()})` : point
  return `Collect from the ${where.toLowerCase()}. Bring photo ID in the name ${data.guestName}.`
}

// The body as an ordered list of lines. Exposed for the HTML renderer and for a
// unit test that asserts the doors line is absent when doors is null. Each line
// is one sentence; the renderer wraps them as paragraphs.
export function guestConfirmationLines(data: GuestConfirmationData): string[] {
  const lines: string[] = []

  const artist = data.artistName ? `${data.artistName} at ${data.venueName}` : data.venueName
  lines.push(`You are on the guest list for ${artist}, ${data.showDate}.`)

  // Doors only when it is a real time. This is the line the unit test pins: no
  // doors day_item means no doors line, never "Doors: TBC".
  if (data.doorsTime) lines.push(`Doors ${data.doorsTime}.`)

  if (data.address) lines.push(data.address)

  lines.push(`You have ${ticketPhrase(data.numTickets)} in your name.`)

  const credential = credentialLine(data)
  if (credential) lines.push(credential)

  lines.push(collectionLine(data))

  return lines
}

export function guestConfirmationSubject(data: GuestConfirmationData): string {
  return `You are on the guest list, ${data.venueName}`
}

// A simple inline-styled card, the morning-message-email shape: no external CSS
// so it renders in every inbox, no hardcoded copy beyond the lines above.
export function guestConfirmationHtml(data: GuestConfirmationData): string {
  const [lead, ...rest] = guestConfirmationLines(data)
  const body = rest
    .map(
      (line) =>
        `<p style="margin:0 0 12px;color:#1c1917;font-size:14px;">${escapeHtml(line)}</p>`,
    )
    .join('')

  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#fafaf9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e7e5e4;border-radius:12px;">
      <tr>
        <td style="padding:24px;">
          <p style="margin:0 0 16px;color:#1c1917;font-size:16px;font-weight:600;">${escapeHtml(lead)}</p>
          ${body}
          <p style="margin:20px 0 0;color:#78716c;font-size:13px;">
            See you there. Reply to this email if anything is wrong.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

// A guest name is TM-entered free text, so it reaches the HTML unescaped
// otherwise. The rest of the fields are controlled vocabularies or formatted
// dates, but escaping every line is simpler than reasoning about which is safe.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
