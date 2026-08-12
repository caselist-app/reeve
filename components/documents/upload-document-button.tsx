'use client'

import { useRouter } from 'next/navigation'
import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSidePanel } from '@/stores/side-panel-store'

interface Props {
  tourId: string
}

export function UploadDocumentButton({ tourId }: Props) {
  const { open } = useSidePanel()
  const router = useRouter()

  return (
    <Button
      size="sm"
      onClick={() =>
        open({
          type: 'upload-document',
          tourId,
          onSuccess: () => router.refresh(),
        })
      }
    >
      <Upload className="mr-1.5 h-3.5 w-3.5" />
      Upload
    </Button>
  )
}
