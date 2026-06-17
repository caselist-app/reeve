import { redirect } from 'next/navigation'

// Old per-date route — redirect to the unified schedule view with the date as a query param.
export default async function LegacyDatePage({
  params,
}: {
  params: Promise<{ id: string; date: string }>
}) {
  const { id, date } = await params
  redirect(`/tours/${id}/schedule?date=${date}`)
}
