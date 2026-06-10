// HTML email template for rider and advance document sends.
// No Reeve branding in the body. Artist name is the sender identity.
// "Sent via Reeve" appears only in the footer.
// No em-dashes anywhere in this file.

export type RiderEmailParams = {
  recipientName: string
  artistName: string
  documentTitle: string
  // Optional short note from the TM, shown above the button.
  note?: string | null
  shareUrl: string
}

export function renderRiderEmail(params: RiderEmailParams): string {
  const { recipientName, artistName, documentTitle, note, shareUrl } = params

  const noteHtml = note
    ? `<p style="color:#374151;margin:0 0 24px;">${escapeHtml(note)}</p>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(documentTitle)}</title>
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
              <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">
                ${escapeHtml(documentTitle)}
              </h1>
              <p style="font-size:15px;color:#6b7280;margin:0 0 24px;">
                Hi ${escapeHtml(recipientName)}, please review the advance document below.
              </p>
              ${noteHtml}
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
                Once you have reviewed it, please click the acknowledge button inside the document.
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

// Minimal HTML escaping to prevent injection via user-supplied strings.
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
