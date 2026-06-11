'use client'

import { useRouter } from 'next/navigation'
import { useSidePanel } from '@/stores/side-panel-store'
import { PanelShell } from '@/components/layout/panel-shell'
import { ShowForm } from '@/components/shows/show-form'

interface Props {
  tourId: string
  onSuccess: (showId: string) => void
}

export function AddShowPanel({ tourId, onSuccess }: Props) {
  const { close } = useSidePanel()
  const router = useRouter()

  return (
    <PanelShell title="Add show">
      <ShowForm
        tourId={tourId}
        onSuccess={(showId) => {
          close()
          onSuccess(showId)
          router.push(`/tours/${tourId}/shows/${showId}`)
        }}
      />
    </PanelShell>
  )
}
