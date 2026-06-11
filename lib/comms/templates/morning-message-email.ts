import type { MorningMessageData } from '@/lib/comms/templates/morning-message'

// Email rendering of the morning message. Same content as the WhatsApp version,
// laid out for an inbox: a simple, inline-styled card that renders everywhere.
// No external CSS, no em-dashes.

function formatTime(iso: string | null, tz: string): string {
  if (!iso) return 'TBC'
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: tz,
  })
}

function row(label: string, value: string): string {
  return `<tr>
    <td style="padding:4px 16px 4px 0;color:#78716c;font-size:14px;">${label}</td>
    <td style="padding:4px 0;color:#1c1917;font-size:14px;font-weight:600;">${value}</td>
  </tr>`
}

export function renderMorningMessageEmail(data: MorningMessageData): string {
  const tz = data.timezone

  const scheduleRows = [
    row('Load in', formatTime(data.load_in, tz)),
    data.soundcheck ? row('Soundcheck', formatTime(data.soundcheck, tz)) : '',
    row('Doors', formatTime(data.doors, tz)),
    row('On stage', formatTime(data.headliner_on, tz)),
    row('Curfew', formatTime(data.curfew, tz)),
  ].join('')

  const hotelBlock =
    data.hotel_name && data.hotel_checkout
      ? `<p style="margin:0 0 16px;color:#1c1917;font-size:14px;">
           Hotel checkout: <strong>${data.hotel_checkout}</strong> (${data.hotel_name})
         </p>`
      : ''

  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#fafaf9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e7e5e4;border-radius:12px;">
      <tr>
        <td style="padding:24px;">
          <p style="margin:0 0 16px;color:#1c1917;font-size:16px;">Good morning ${data.person_first_name}.</p>
          <h1 style="margin:0 0 4px;color:#1c1917;font-size:20px;">${data.venue_name}</h1>
          <p style="margin:0 0 20px;color:#78716c;font-size:14px;">${data.show_date}</p>
          ${hotelBlock}
          <table role="presentation" cellpadding="0" cellspacing="0">${scheduleRows}</table>
          <p style="margin:24px 0 0;color:#78716c;font-size:13px;">
            Need anything, reply to this email or message your tour manager.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`
}
