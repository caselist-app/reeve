// The Telegram message a TM gets when guest requests are still waiting close
// to doors. Brief 52, step 10 (REE-137). Pure and unit tested the same way as
// guest-request-notification.ts: trigger/jobs/guest-list-nudge.ts assembles
// the data and hands the rendered payload to notifyAccount directly.
//
// showDate is already formatted ("Friday 14 June") by the job, so this stays
// free of any timezone reasoning, same rule as guest-request-notification.ts.

export interface DoorsNudgeData {
  venueName: string | null
  showDate: string
  waitingCount: number
}

function requestPhrase(n: number): string {
  return `${n} ${n === 1 ? 'request' : 'requests'}`
}

export function doorsNudgeBody(data: DoorsNudgeData): string {
  return [
    `${requestPhrase(data.waitingCount)} still waiting on the guest list.`,
    `${data.venueName ?? 'The show'}, ${data.showDate}. Doors soon.`,
  ].join('\n')
}
