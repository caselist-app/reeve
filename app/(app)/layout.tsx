import { requireUser } from '@/lib/auth/helpers'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser()

  return (
    <div className="flex min-h-screen flex-col">
      {children}
    </div>
  )
}
