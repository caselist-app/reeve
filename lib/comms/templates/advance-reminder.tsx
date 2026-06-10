// HTML email template for advance document reminder sends.
// Tone is a short, professional nudge. No Reeve branding in the body.
// No em-dashes anywhere in this file.

export type AdvanceReminderParams = {
  recipientName: string
  artistName: string
  documentTitle: string
  showDate: string   // e.g. "12 July 2026"
  venueName: string
  shareUrl: string
  reminderIndex: number  // 1 = first reminder, 2+ = follow-ups
}

export function renderAdvanceReminderEmail(params: AdvanceReminderParams): string {
  const { recipientName, artistName, documentTitle, showDate, venueName, shareUrl, reminderIndex } = params

  // Soften the language slightly on the first reminder vs follow-ups.
  const opening = reminderIndex === 1
    ? `Quick reminder that we haven't received acknowledgement of the advance documents for the ${escapeHtml(venueName)} show on ${escapeHtml(showDate)}.`
    : `We still haven't received acknowledgement of the advance documents for the ${escapeHtml(venueName)} show on ${escapeHtml(showDate)}.`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reminder: ${escapeHtml(documentTitle)}</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;padding:40px;">
          <tr>
            <td>
              <p style="font-size:13px;font-weight:600;color:#6b7280;letter-spacing:0.05em;text-transform:uppercase;margin:0 0 24px;">
                ${escapeHtml(artistName)}
              </p>
              <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 16px;">
                Reminder: ${escapeHtml(documentTitle)}
              </h1>
              <p style="font-size:15px;color:#374151;margin:0 0 24px;">
                Hi ${escapeHtml(recipientName)}, ${opening}
              </p>
              <table cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
                <tr>
                  <td style="background:#111827;border-radius:6px;">
                    <a href="${escapeHtml(shareUrl)}"
                       style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">
                      View document
                    </a>
                  </td>
                </tr>
              </table>
              <p style="font-size:13px;color:#9ca3af;margin:0;">
                Please click the acknowledge button inside the document once reviewed.
              </p>
            </td>
          </tr>
        </table>
        <p style="font-size:12px;color:#9ca3af;margin:16px 0 0;">Sent via Reeve</p>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
